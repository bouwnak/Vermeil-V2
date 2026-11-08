"""seedance.py - AI video (Seedance) and AI pictures (Seedream) through BytePlus ModelArk, on the free tokens only.

Seedance only makes video; ModelArk's picture model is Seedream, so Media uses both with one key (ARK_API_KEY).

The free limit is guarded twice:
 1. This file counts every token ModelArk reports, per model, and refuses a request that wouldn't fit in what's left.
    ModelArk gives each model its own 500,000 free tokens. The count only knows what this PC spent.
 2. ModelArk's own "Free Tokens Only" switch (in the BytePlus console) is what truly guarantees no charge: it stops
    the account when the free tokens run out and answers HTTP 429 SetLimitExceeded, which is handled here.
"""
import json
import os
import re
import threading
import time

from paths import data_file

API = "https://ark.ap-southeast.bytepluses.com/api/v3"
CONSOLE = "https://console.byteplus.com/ark/"
FREE_LIMIT = 500_000
USAGE_FILE = data_file("media_tokens.json")
RATIOS = ("16:9", "9:16", "1:1")
RESOLUTIONS = {"480p": {"16:9": (864, 496), "9:16": (496, 864), "1:1": (640, 640)},
               "720p": {"16:9": (1280, 720), "9:16": (720, 1280), "1:1": (960, 960)},
               "1080p": {"16:9": (1920, 1088), "9:16": (1088, 1920), "1:1": (1440, 1440)}}
PICTURE_SIZES = {"landscape": (2560, 1440), "portrait": (1440, 2560), "square": (2048, 2048)}
_lock = threading.Lock()
_held = {}                                          # model -> tokens that running jobs may still spend


class FreeLimit(Exception):
    """The next request wouldn't fit in the free tokens, so it was not sent."""


class ArkError(Exception):
    """ModelArk said no (the message is safe to show)."""


def video_model():
    return os.environ.get("SEEDANCE_MODEL", "").strip() or "dreamina-seedance-2-5-260628"


def image_model():
    return os.environ.get("SEEDREAM_MODEL", "").strip() or "dola-seedream-5-0-pro-260628"


def key():
    k = os.environ.get("ARK_API_KEY", "").strip()
    return "" if k.startswith("your_") else k


def save_key(value):
    """Write ARK_API_KEY into the env file (other lines are kept as they are)."""
    from spotify import env_path
    value = (value or "").strip()
    if not re.fullmatch(r"[\w\-.]{16,200}", value):
        raise ValueError("That key doesn't look right. Copy the whole API key from the BytePlus console.")
    path = env_path()
    lines = []
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            lines = f.read().splitlines()
    for i, line in enumerate(lines):
        if re.match(r"\s*ARK_API_KEY\s*=", line):
            lines[i] = f"ARK_API_KEY={value}"
            break
    else:
        lines.append(f"ARK_API_KEY={value}")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    os.environ["ARK_API_KEY"] = value
    return path


# ---------------------------------------------------------------- the count
def _read():
    try:
        with open(USAGE_FILE, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _write(d):
    os.makedirs(os.path.dirname(USAGE_FILE), exist_ok=True)
    with open(USAGE_FILE, "w", encoding="utf-8") as f:
        json.dump(d, f)


def used(model):
    return int((_read().get(model) or {}).get("used") or 0)


def left(model):
    """free tokens not yet spent or held by a running job; 0 once ModelArk itself said the limit is reached"""
    m = _read().get(model) or {}
    if m.get("out"):
        return 0
    return max(0, FREE_LIMIT - int(m.get("used") or 0) - _held.get(model, 0))


def _add(model, tokens):
    with _lock:
        d = _read()
        m = d.setdefault(model, {})
        m["used"] = int(m.get("used") or 0) + max(0, int(tokens or 0))
        _write(d)


def _mark_out(model):
    with _lock:
        d = _read()
        d.setdefault(model, {})["out"] = True
        _write(d)


def _hold(model, tokens, what):
    """keep these tokens aside for one request, or refuse it before anything is sent"""
    with _lock:
        have = left(model)
        if tokens > have:
            raise FreeLimit(f"{what} needs about {tokens:,} tokens, and only {have:,} free tokens are left for this model. "
                            "Nothing was sent, so nothing was charged.")
        _held[model] = _held.get(model, 0) + tokens


def _release(model, tokens):
    with _lock:
        _held[model] = max(0, _held.get(model, 0) - tokens)


def status():
    v, i = video_model(), image_model()
    side = lambda m: {"model": m, "used": used(m), "left": left(m), "limit": FREE_LIMIT, "out": bool((_read().get(m) or {}).get("out"))}
    return {"has_key": bool(key()), "video": side(v), "image": side(i), "console": CONSOLE,
            "estimates": {r: {s: video_tokens(r, "16:9", s) for s in (5, 8, 10)} for r in RESOLUTIONS}}


def video_tokens(resolution, ratio, seconds, fps=24):
    """what a clip should cost: width x height x frames / 1024 (ModelArk's own example: 5 s of 720p = 108,900 tokens)"""
    w, h = RESOLUTIONS.get(resolution, RESOLUTIONS["480p"]).get(ratio, (864, 496))
    return int(w * h * fps * float(seconds) / 1024 * 1.02)


def picture_tokens(size):
    w, h = PICTURE_SIZES.get(size, PICTURE_SIZES["landscape"])
    return int(w * h / 256)


# ---------------------------------------------------------------- talking to ModelArk
def _call(method, path, model, body=None):
    import requests
    if not key():
        raise ArkError("Add your BytePlus API key first (Media → Generate shows how).")
    try:
        r = requests.request(method, API + path, json=body, timeout=120,
                             headers={"Authorization": f"Bearer {key()}", "Content-Type": "application/json"})
    except requests.RequestException as e:
        raise ArkError(f"Couldn't reach BytePlus ({e.__class__.__name__}). Check the internet.") from None
    try:
        data = r.json()
    except ValueError:
        data = {}
    if r.ok:
        return data
    err = data.get("error") if isinstance(data.get("error"), dict) else {}
    code, msg = str(err.get("code") or ""), str(err.get("message") or "")[:300]
    if code == "SetLimitExceeded":
        _mark_out(model)
        raise FreeLimit("The free tokens for this model have run out, so BytePlus stopped it. Nothing more can be charged "
                        "while Free Tokens Only is on.")
    if r.status_code == 401:
        raise ArkError("BytePlus refused the API key. Check it in Media → Generate.")
    if r.status_code == 429:
        raise ArkError(f"BytePlus is busy or limited this request ({code or 'too many requests'}). Try again in a minute.")
    if "ModelNotOpen" in code or r.status_code == 404:
        raise ArkError(f"This model isn't turned on in your BytePlus account ({model}). Turn it on under Model activation.")
    raise ArkError(msg or f"BytePlus answered {r.status_code}.")


def _download(url, path):
    import requests
    with requests.get(url, stream=True, timeout=300) as r:
        r.raise_for_status()
        with open(path, "wb") as f:
            for chunk in r.iter_content(1 << 16):
                f.write(chunk)
    return path


# ---------------------------------------------------------------- video
def make_video(prompt, out_path, ratio="16:9", duration=5, resolution="480p", audio=True, on_progress=None, poll=5, patience=1200):
    """one clip -> {"file", "tokens", "seconds"}. Refused before sending if it wouldn't fit in the free tokens."""
    prompt = str(prompt or "").strip()
    if not prompt:
        raise ArkError("Describe the video first.")
    ratio = ratio if ratio in RATIOS else "16:9"
    resolution = resolution if resolution in RESOLUTIONS else "480p"
    duration = max(4, min(15, int(duration or 5)))
    model, need = video_model(), video_tokens(resolution, ratio, duration)
    say = on_progress or (lambda *_: None)
    _hold(model, need, f"A {duration} s {resolution} clip")
    try:
        task = _call("POST", "/contents/generations/tasks", model, {
            "model": model, "content": [{"type": "text", "text": prompt[:2000]}], "resolution": resolution, "ratio": ratio,
            "duration": duration, "generate_audio": bool(audio), "watermark": False})
        tid = task.get("id")
        if not tid:
            raise ArkError("BytePlus didn't start the video. Try again.")
        end = time.time() + patience
        while True:
            t = _call("GET", f"/contents/generations/tasks/{tid}", model)
            state = t.get("status")
            if state == "succeeded":
                break
            if state in ("failed", "cancelled", "expired"):
                raise ArkError(str((t.get("error") or {}).get("message") or f"The video {state}.")[:300])
            if time.time() > end:
                raise ArkError("BytePlus is taking too long with this video. It may still finish: check your BytePlus console.")
            say(0.1 + 0.75 * (1 - (end - time.time()) / patience), "BytePlus is queuing the video…" if state == "queued" else "Seedance is making the video…")
            time.sleep(poll)
        spent = int((t.get("usage") or {}).get("total_tokens") or need)
        _add(model, spent)
        url = (t.get("content") or {}).get("video_url")
        if not url:
            raise ArkError("BytePlus finished but gave no video link.")
        say(0.9, "Downloading your video…")
        _download(url, out_path)                     # their link only lasts 24 hours, so it's saved right away
        return {"file": out_path, "tokens": spent, "seconds": duration}
    finally:
        _release(model, need)


# ---------------------------------------------------------------- pictures
def make_picture(prompt, size="landscape"):
    """one picture -> (PIL image, tokens). Refused before sending if it wouldn't fit in the free tokens."""
    import io
    import requests
    from PIL import Image
    model, need = image_model(), picture_tokens(size)
    w, h = PICTURE_SIZES.get(size, PICTURE_SIZES["landscape"])
    _hold(model, need, "A picture")
    try:
        d = _call("POST", "/images/generations", model, {"model": model, "prompt": str(prompt)[:2000], "size": f"{w}x{h}",
                                                         "response_format": "url", "watermark": False, "stream": False})
        spent = int((d.get("usage") or {}).get("total_tokens") or need)
        _add(model, spent)
        items = d.get("data") or []
        url = (items[0] if items else {}).get("url")
        if not url:
            raise ArkError(str((items[0] if items else {}).get("error", {}).get("message") or "BytePlus returned no picture.")[:300])
        r = requests.get(url, timeout=120)
        r.raise_for_status()
        return Image.open(io.BytesIO(r.content)).convert("RGB"), spent
    finally:
        _release(model, need)
