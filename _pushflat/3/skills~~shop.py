"""shop.py - the Characters Workshop: find 3D models on Sketchfab and voice clones on voice-models.com, download them
and hand them to the app's own importers (skills/modelimport.py for models, senses/rvc.py for voices).

3D models (Sketchfab, https://sketchfab.com)
  - Searching is free and needs no account. Every model that can be downloaded is shown (any pose); the ones that say
    they're in a T-pose or A-pose are marked, since those rig and animate best.
  - Downloading needs your own free Sketchfab API token (sketchfab.com -> Settings -> Password & API ->
    "API token"). It's saved in the project's env file as SKETCHFAB_API_TOKEN and never shown again.
  - Every model keeps its author's licence (most are CC Attribution: credit the author if you share it).

Voices (voice-models.com)
  - The site's own search; each result is a .zip (usually on Hugging Face) with an RVC .pth and its .index.
  - Hugging Face, Google Drive, pixeldrain and plain .zip/.pth links download; others (mega...) say so.

search_models(q, cursor) / download_model(uid, progress) -> a .glb path
search_voices(q, page) / download_voice(url, progress) -> (pth, index) in a temp folder
"""
import html
import json
import os
import re
import shutil
import struct
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile

from paths import data_file

API = "https://api.sketchfab.com/v3"
VOICES = "https://voice-models.com"
SAMPLES = ("https://s3.us-west-000.backblazeb2.com/bbvoe3/samples/", "https://s3.us-west-000.backblazeb2.com/bbvoe3/samples2/")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Vermeil/1.0"
TPOSE = re.compile(r"(?<![a-z])(?:t|a)[\s_-]?pose(?![a-z])|\btpose\b|\bapose\b|\bt-pos\b", re.I)
MAX_FACES = 600_000                  # heavier models make the room slow
LIBRARY = data_file("shop.json")     # what came from the shop: name, author, licence, link


class NeedToken(Exception):
    pass


def _req(url, data=None, headers=None, timeout=30):
    r = urllib.request.Request(url, data=data, headers={"User-Agent": UA, **(headers or {})})
    return urllib.request.urlopen(r, timeout=timeout)


def _json(url, **kw):
    with _req(url, **kw) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


# ------------------------------------------------------------------ your Sketchfab token (env file)
def token():
    return os.environ.get("SKETCHFAB_API_TOKEN", "").strip()


def save_token(value):
    """Write SKETCHFAB_API_TOKEN into the env file (other lines are kept). The value is never sent back."""
    import spotify                                       # the same env file and the same way of writing it
    value = (value or "").strip()
    if not re.fullmatch(r"[0-9a-fA-F]{32}", value):
        raise ValueError("That token doesn't look right: it's 32 letters and numbers from sketchfab.com → Settings → Password & API.")
    path = spotify.env_path()
    lines = []
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            lines = f.read().splitlines()
    for i, line in enumerate(lines):
        if re.match(r"\s*SKETCHFAB_API_TOKEN\s*=", line):
            lines[i] = f"SKETCHFAB_API_TOKEN={value}"
            break
    else:
        lines.append(f"SKETCHFAB_API_TOKEN={value}")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    os.environ["SKETCHFAB_API_TOKEN"] = value
    return True


# ------------------------------------------------------------------ 3D models
def looks_tposed(m):
    """does the model say it's in a T-pose / A-pose (its name, tags or description)?"""
    tags = {(t.get("name") or "").lower() for t in m.get("tags") or []}
    if tags & {"tpose", "t-pose", "t_pose", "apose", "a-pose", "a_pose"} or {"t", "pose"} <= tags:
        return True
    return bool(TPOSE.search(f"{m.get('name') or ''} {(m.get('description') or '')[:600]}"))


def _thumb(m, want=360):
    imgs = sorted((m.get("thumbnails") or {}).get("images") or [], key=lambda i: i.get("width") or 0)
    pick = next((i for i in imgs if (i.get("width") or 0) >= want), imgs[-1] if imgs else None)
    return pick.get("url") if pick else ""


def tidy_model(m):
    glb = (m.get("archives") or {}).get("glb") or {}
    return {"uid": m.get("uid"), "name": (m.get("name") or "Model")[:80], "thumb": _thumb(m),
            "author": ((m.get("user") or {}).get("displayName") or (m.get("user") or {}).get("username") or "")[:60],
            "license": ((m.get("license") or {}).get("label") or "")[:60], "faces": m.get("faceCount") or 0,
            "animated": bool(m.get("animationCount")), "size": glb.get("size") or 0,
            "url": m.get("viewerUrl") or f"https://sketchfab.com/3d-models/{m.get('uid')}", "tpose": looks_tposed(m)}


def keep_model(m):
    """downloadable, not age-restricted, and light enough for the room (any pose)"""
    return bool(m.get("isDownloadable")) and not m.get("isAgeRestricted") and 0 < (m.get("faceCount") or 1) <= MAX_FACES


def search_models(q, cursor=None, fetch=_json):
    """downloadable models for a search, in any pose -> {"results": [...], "cursor": next page or None}.
    An empty search shows the most liked downloadable models."""
    q = re.sub(r"\s+", " ", str(q or "")).strip()[:80]
    params = {"type": "models", "downloadable": "true", "q": q, "count": 24, "sort_by": "-likeCount" if not q else ""}
    if cursor:
        params["cursor"] = str(cursor)
    out, nxt, pages = [], None, 0
    while len(out) < 12 and pages < 3:                  # filtered pages can be thin: look a little further
        data = fetch(f"{API}/search?{urllib.parse.urlencode({k: v for k, v in params.items() if v != ''})}")
        out += [tidy_model(m) for m in data.get("results") or [] if keep_model(m)]
        nxt = data.get("next")
        pages += 1
        if not nxt:
            break
        params["cursor"] = (urllib.parse.parse_qs(urllib.parse.urlparse(nxt).query).get("cursor") or [""])[0]
    return {"results": out, "cursor": params["cursor"] if nxt else None}


def _download(url, dest, progress, start=0.0, end=1.0, text="Downloading", headers=None):
    with _req(url, headers=headers, timeout=60) as r:
        total = int(r.headers.get("Content-Length") or 0)
        done = 0
        with open(dest, "wb") as f:
            while True:
                chunk = r.read(1 << 18)
                if not chunk:
                    break
                f.write(chunk)
                done += len(chunk)
                pct = start + (end - start) * (done / total if total else 0.5)
                progress(pct, f"{text} ({done >> 20} MB{f' of {total >> 20} MB' if total else ''})")
    return dest


def download_model(uid, progress=lambda pct, text: None, work=None):
    """the model's .glb (Sketchfab's own glTF zip packed into one .glb when there's no .glb) -> path in `work`"""
    if not re.fullmatch(r"[0-9a-f]{32}", str(uid or "")):
        raise ValueError("That isn't a Sketchfab model.")
    if not token():
        raise NeedToken("Add your Sketchfab API token first (free): sketchfab.com → Settings → Password & API.")
    work = work or tempfile.mkdtemp(prefix="vermeil_shop_")
    progress(0.02, "Asking Sketchfab for the download…")
    try:
        links = _json(f"{API}/models/{uid}/download", headers={"Authorization": f"Token {token()}"})
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise NeedToken("Sketchfab didn't accept your API token. Copy it again from sketchfab.com → Settings → Password & API.")
        if e.code == 429:
            raise ValueError("Sketchfab says too many downloads for now. Try again in a few minutes.")
        raise ValueError(f"Sketchfab couldn't give that model ({e.code}).")
    if (links.get("glb") or {}).get("url"):
        return _download(links["glb"]["url"], os.path.join(work, f"{uid}.glb"), progress, 0.05, 0.85, "Downloading the model")
    if (links.get("gltf") or {}).get("url"):
        z = _download(links["gltf"]["url"], os.path.join(work, f"{uid}.zip"), progress, 0.05, 0.8, "Downloading the model")
        progress(0.82, "Packing it into one file…")
        return pack_gltf_zip(z, os.path.join(work, f"{uid}.glb"))
    raise ValueError("Sketchfab has no glTF download for that model.")


def pack_gltf_zip(zpath, dest):
    """a glTF zip (scene.gltf + scene.bin + textures/) -> one .glb with everything inside"""
    folder = tempfile.mkdtemp(prefix="vermeil_gltf_")
    try:
        with zipfile.ZipFile(zpath) as z:
            for n in z.namelist():
                target = os.path.realpath(os.path.join(folder, n))
                if not target.startswith(os.path.realpath(folder) + os.sep):
                    raise ValueError("That download has a bad file inside.")
            z.extractall(folder)
        gltf = next((os.path.join(r, f) for r, _, fs in os.walk(folder) for f in fs if f.lower().endswith(".gltf")), None)
        if not gltf:
            raise ValueError("No .gltf inside the download.")
        base = os.path.dirname(gltf)
        with open(gltf, encoding="utf-8") as f:
            doc = json.load(f)
        blob = bytearray()

        def add(data):
            while len(blob) % 4:
                blob.append(0)
            at = len(blob)
            blob.extend(data)
            return at

        def read_uri(uri):
            if uri.startswith("data:"):
                import base64
                return base64.b64decode(uri.split(",", 1)[1])
            path = os.path.realpath(os.path.join(base, urllib.parse.unquote(uri)))
            if not path.startswith(os.path.realpath(folder) + os.sep):
                raise ValueError("That download points outside itself.")
            with open(path, "rb") as fh:
                return fh.read()
        offsets = [add(read_uri(b["uri"])) if b.get("uri") else 0 for b in doc.get("buffers") or []]
        for v in doc.get("bufferViews") or []:
            v["byteOffset"] = v.get("byteOffset", 0) + offsets[v.get("buffer", 0)]
            v["buffer"] = 0
        views = doc.setdefault("bufferViews", [])
        for img in doc.get("images") or []:
            if img.get("uri"):
                data = read_uri(img.pop("uri"))
                views.append({"buffer": 0, "byteOffset": add(data), "byteLength": len(data)})
                img["bufferView"] = len(views) - 1
                img.setdefault("mimeType", "image/png" if data[:4] == b"\x89PNG" else "image/jpeg")
        while len(blob) % 4:
            blob.append(0)
        doc["buffers"] = [{"byteLength": len(blob)}]
        js = json.dumps(doc, separators=(",", ":")).encode()
        js += b" " * (-len(js) % 4)
        with open(dest, "wb") as f:
            f.write(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(js) + 8 + len(blob)))
            f.write(struct.pack("<I4s", len(js), b"JSON") + js)
            f.write(struct.pack("<I4s", len(blob), b"BIN\x00") + bytes(blob))
        return dest
    finally:
        shutil.rmtree(folder, ignore_errors=True)


# ------------------------------------------------------------------ voices
def _strip(text):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", text or ""))).strip()


def parse_voices(table):
    """voice-models.com's result rows -> [{name, size, url, sample}]"""
    out = []
    for row in re.findall(r"<tr>(.*?)</tr>", table or "", re.S):
        name = re.search(r"<a href='/model/[^']+'[^>]*>(.*?)</a>", row, re.S)
        url = re.search(r"data-clipboard-text='([^']+)'", row)
        if not name or not url:
            continue
        size = re.search(r"badge bg-secondary[^>]*>([^<]+)<", row)
        sample = re.search(r"data-sample-name='([^']*)'", row)
        ready = re.search(r"data-sample-ready='1'", row)
        link = html.unescape(url.group(1))
        out.append({"name": _strip(name.group(1))[:200], "size": (size.group(1).strip() if size else ""), "url": link,
                    "host": urllib.parse.urlparse(link).netloc.replace("www.", ""), "can_get": can_download(link),
                    "samples": [b + urllib.parse.quote(sample.group(1)) + ".mp3" for b in SAMPLES] if sample and ready else []})
    return out


def search_voices(q, page=1, post=None):
    q = re.sub(r"\s+", " ", str(q or "")).strip()[:80]
    body = urllib.parse.urlencode({"page": max(1, int(page or 1)), "search": q}).encode()
    if post is None:
        with _req(f"{VOICES}/fetch_data.php", data=body, headers={"Content-Type": "application/x-www-form-urlencoded",
                                                                   "X-Requested-With": "XMLHttpRequest"}) as r:
            data = json.loads(r.read().decode("utf-8", "replace"))
    else:
        data = post(body)
    more = f"fetchData({int(page or 1) + 1}," in (data.get("pagination") or "")
    return {"results": parse_voices(data.get("table") or ""), "page": int(page or 1), "more": more}


def can_download(url):
    host = urllib.parse.urlparse(url or "").netloc.lower()
    return any(h in host for h in ("huggingface.co", "drive.google.com", "pixeldrain.com")) or \
        bool(re.search(r"\.(zip|pth)(\?|$)", url or "", re.I))


def _direct(url):
    """the link a voice page gives -> a link that downloads the file itself"""
    u = urllib.parse.urlparse(url)
    host = u.netloc.lower()
    if "huggingface.co" in host:
        return url.replace("/blob/", "/resolve/")
    if "drive.google.com" in host:
        m = re.search(r"/d/([\w-]+)", u.path) or re.search(r"[?&]id=([\w-]+)", url)
        if m:
            return f"https://drive.usercontent.google.com/download?id={m.group(1)}&export=download&confirm=t"
    if "pixeldrain.com" in host:
        m = re.search(r"/u/(\w+)", u.path)
        if m:
            return f"https://pixeldrain.com/api/file/{m.group(1)}?download"
    if re.search(r"\.(zip|pth)(\?|$)", url, re.I) and u.scheme == "https":
        return url
    return None


def download_voice(url, progress=lambda pct, text: None, work=None):
    """-> (pth, index or None, folder). The .zip is unpacked in a temp folder; the caller imports and cleans up."""
    link = _direct(url)
    if not link:
        raise ValueError("That voice is on a site the app can't download from. Open it in your browser, download it, "
                         "then use “Import a voice (.pth + .index)…”.")
    work = work or tempfile.mkdtemp(prefix="vermeil_voice_")
    is_pth = re.search(r"\.pth(\?|$)", link, re.I)
    path = _download(link, os.path.join(work, "voice.pth" if is_pth else "voice.zip"), progress, 0.02, 0.8, "Downloading the voice")
    with open(path, "rb") as f:
        head = f.read(512)
    if head.lstrip().lower().startswith((b"<!doctype", b"<html")):
        raise ValueError("The site sent a web page instead of the voice (it may need a sign-in). Download it in your "
                         "browser, then use “Import a voice (.pth + .index)…”.")
    if is_pth:
        return path, None, work
    progress(0.82, "Unpacking…")
    out = os.path.join(work, "files")
    with zipfile.ZipFile(path) as z:
        for info in z.infolist():
            name = info.filename.replace("\\", "/")
            if not name.lower().endswith((".pth", ".index")) or info.file_size > 2 << 30:
                continue
            target = os.path.realpath(os.path.join(out, name))
            if not target.startswith(os.path.realpath(out) + os.sep):
                continue
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with z.open(info) as src, open(target, "wb") as dst:
                shutil.copyfileobj(src, dst)
    pth, index = pick_voice_files(out)
    if not pth:
        raise ValueError("No RVC voice (.pth) inside that download.")
    return pth, index, work


def pick_voice_files(folder):
    """the voice's .pth (not a G_/D_ training checkpoint) and its 'added_' .index"""
    files = [os.path.join(r, f) for r, _, fs in os.walk(folder) for f in fs]
    pths = [f for f in files if f.lower().endswith(".pth") and not re.match(r"[GD]_\d+", os.path.basename(f))]
    pths.sort(key=os.path.getsize)                     # the small one is the voice; big ones are checkpoints
    idx = [f for f in files if f.lower().endswith(".index") and "trained_" not in os.path.basename(f).lower()]
    idx.sort(key=lambda f: (not os.path.basename(f).lower().startswith("added"), -os.path.getsize(f)))
    return (pths[0] if pths else None), (idx[0] if idx else None)


def voice_name(title):
    """'GoJo JJK (EN Dub) (RVC v2), 411 epochs' -> 'GoJo JJK'"""
    t = re.sub(r"\[[^\]]*\]|\([^)]*\)|,?\s*\d+\s*epochs?|rvc\s*v?\d|\bv\d\b", " ", title or "", flags=re.I)
    t = re.sub(r"[\[(][^\])]*$", " ", t)                   # a bracket cut off at the end
    return re.sub(r"\s+", " ", re.sub(r"[^\w .'-]+", " ", t)).strip(" .-")[:40] or "Voice"


# ------------------------------------------------------------------ what came from the shop
def library():
    try:
        with open(LIBRARY, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def remember(kind, name, info):
    d = library()
    d.setdefault(kind, {})[name] = info
    tmp = LIBRARY + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(d, f, indent=1)
    os.replace(tmp, LIBRARY)
    return d
