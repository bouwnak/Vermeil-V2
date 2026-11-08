"""videoedit.py - the back half of Media's video editor (ui/videoedit.js): reading clips, playing them to the preview
and rendering the timeline into an .mp4 with ffmpeg.

- The preview plays through a tiny web server on this PC only (127.0.0.1, a random secret in every address) that
  serves just the files you picked. It supports seeking.
- A project is plain data: clips one after another, text on top, music underneath. build_command() turns it into one
  ffmpeg command, so what's on the timeline is what's rendered.
- Text is drawn with Pillow into a see-through picture and laid over the video, so fonts and odd characters can't break
  the command.
"""
import base64
import http.server
import json
import math
import os
import re
import secrets
import shutil
import socketserver
import subprocess
import tempfile
import threading
import time
import uuid

from paths import data_file

PROJECT_FILE = data_file("video_project.json")
VIDEO = (".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v")
IMAGE = (".png", ".jpg", ".jpeg", ".webp", ".bmp")
AUDIO = (".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac")
TRANSITIONS = {"fade": "fade", "dissolve": "dissolve", "slide": "slideleft", "wipe": "wipeleft"}
SIZES = {"16:9": {"720": (1280, 720), "1080": (1920, 1080)}, "9:16": {"720": (720, 1280), "1080": (1080, 1920)},
         "1:1": {"720": (720, 720), "1080": (1080, 1080)}}
MAX_CLIPS = 60                                       # Windows limits how long one command can be
FPS = 30
_files = {}                                          # id -> real path: all the preview server will ever serve
_procs = {}                                          # job -> the running ffmpeg
_server = None
_secret = secrets.token_urlsafe(18)
_NO_WINDOW = 0x08000000 if os.name == "nt" else 0


def ffmpeg():
    """the ffmpeg to use: on the PATH, in Packages/, or the copy that comes with moviepy"""
    found = shutil.which("ffmpeg")
    if found:
        return found
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    packed = os.path.join(root, "Packages", "ffmpeg-8.0-full_build", "bin", "ffmpeg.exe")
    if os.path.isfile(packed):
        return packed
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001
        raise RuntimeError("ffmpeg wasn't found. Install the Media plugin in Settings → Plugins first.") from None


def _run(args, **kw):
    return subprocess.run([ffmpeg(), *args], capture_output=True, creationflags=_NO_WINDOW, timeout=60, **kw)


def kind_of(path):
    e = os.path.splitext(path)[1].lower()
    return "video" if e in VIDEO else "image" if e in IMAGE else "audio" if e in AUDIO else None


def probe(path):
    """{duration, w, h, has_audio} read from what ffmpeg prints about the file"""
    text = _run(["-hide_banner", "-i", path]).stderr.decode("utf-8", "replace")
    m = re.search(r"Duration: (\d+):(\d+):(\d+(?:\.\d+)?)", text)
    d = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3]) if m else 0.0
    size = re.search(r"Stream #.*Video:.*?(\d{2,5})x(\d{2,5})", text)
    return {"duration": round(d, 3), "w": int(size[1]) if size else 0, "h": int(size[2]) if size else 0,
            "has_audio": bool(re.search(r"Stream #.*Audio:", text))}


def thumb(path, at=0.5):
    """a small jpeg data URL of a video frame or picture, or ''"""
    out = _run(["-hide_banner", "-loglevel", "error", "-ss", f"{at:.2f}", "-i", path, "-frames:v", "1", "-vf", "scale=240:-2",
                "-f", "image2pipe", "-c:v", "mjpeg", "pipe:1"]).stdout
    return "data:image/jpeg;base64," + base64.b64encode(out).decode() if out else ""


def add_file(path):
    """let the editor use this file -> what the panel needs to know about it, or {"error"}"""
    full = os.path.realpath(str(path or ""))
    kind = kind_of(full)
    if not kind or not os.path.isfile(full):
        return {"error": f"{os.path.basename(full) or 'That file'} isn't a video, picture or sound file I can use."}
    info = probe(full)
    if kind != "image" and not info["duration"]:
        return {"error": f"Couldn't read {os.path.basename(full)}. The file may be damaged."}
    fid = next((i for i, p in _files.items() if p == full), None) or uuid.uuid4().hex[:12]
    _files[fid] = full
    return {"id": fid, "path": full, "name": os.path.basename(full), "kind": kind, **info, "url": f"{server_url()}/{fid}",
            "thumb": thumb(full, min(0.5, info["duration"] / 2)) if kind != "audio" else ""}


def save_project(project):
    """keep the timeline between runs (the window's own storage doesn't survive closing the app)"""
    text = json.dumps(project if isinstance(project, dict) else {})
    if len(text) > 20_000_000:
        return False
    os.makedirs(os.path.dirname(PROJECT_FILE), exist_ok=True)
    with open(PROJECT_FILE + ".tmp", "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(PROJECT_FILE + ".tmp", PROJECT_FILE)
    return True


def load_project():
    try:
        with open(PROJECT_FILE, encoding="utf-8") as f:
            p = json.load(f)
        return p if isinstance(p, dict) else None
    except (OSError, ValueError):
        return None


# ---------------------------------------------------------------- the preview's little server
class _Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        parts = self.path.split("?")[0].strip("/").split("/")
        path = _files.get(parts[1]) if len(parts) == 2 and parts[0] == _secret else None
        if not path or not os.path.isfile(path):
            self.send_error(404)
            return
        size = os.path.getsize(path)
        start, end = 0, size - 1
        m = re.match(r"bytes=(\d*)-(\d*)", self.headers.get("Range", ""))
        if m and (m[1] or m[2]):
            start = int(m[1]) if m[1] else max(0, size - int(m[2]))
            end = min(end, int(m[2])) if m[1] and m[2] else end
        if start >= size:
            self.send_error(416)
            return
        import mimetypes
        self.send_response(206 if m else 200)
        self.send_header("Content-Type", mimetypes.guess_type(path)[0] or "application/octet-stream")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        if m:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        try:
            with open(path, "rb") as f:
                f.seek(start)
                todo = end - start + 1
                while todo > 0:
                    chunk = f.read(min(1 << 16, todo))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    todo -= len(chunk)
        except (ConnectionError, OSError):
            pass                                     # the video element jumped elsewhere: normal


class _Threaded(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


def server_url():
    global _server
    if _server is None:
        _server = _Threaded(("127.0.0.1", 0), _Handler)
        threading.Thread(target=_server.serve_forever, daemon=True, name="videoedit-preview").start()
    return f"http://127.0.0.1:{_server.server_address[1]}/{_secret}"


# ---------------------------------------------------------------- project -> ffmpeg
def _num(v, low, high, default):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return default
    return default if math.isnan(v) else max(low, min(high, v))


def clean_project(p):
    """only what the editor may ask for: known files and sane numbers"""
    p = p if isinstance(p, dict) else {}
    allowed = {os.path.normcase(x) for x in _files.values()}
    usable = lambda path: os.path.normcase(os.path.realpath(str(path or ""))) in allowed
    clips = []
    for c in (p.get("clips") or []):
        if not isinstance(c, dict) or not usable(c.get("path")):
            raise ValueError("A clip on the timeline isn't available any more. Remove it or import it again.")
        kind = "image" if c.get("kind") == "image" else "video"
        a = _num(c.get("in"), 0, 86400, 0)
        b = _num(c.get("out"), a + 0.05, 86400, a + 3)
        clips.append({"path": os.path.realpath(c["path"]), "kind": kind, "in": a, "out": b, "speed": _num(c.get("speed"), 0.25, 4, 1),
                      "volume": _num(c.get("volume"), 0, 2, 1), "mute": bool(c.get("mute")), "has_audio": bool(c.get("has_audio")) and kind == "video",
                      "bright": _num(c.get("bright"), -0.5, 0.5, 0), "contrast": _num(c.get("contrast"), 0.5, 2, 1), "sat": _num(c.get("sat"), 0, 3, 1),
                      "trans": c.get("trans") if c.get("trans") in TRANSITIONS else "none", "trans_dur": _num(c.get("trans_dur"), 0.1, 3, 0.5)})
    if not clips:
        raise ValueError("Add a clip to the timeline first.")
    if len(clips) > MAX_CLIPS:
        raise ValueError(f"A timeline can hold {MAX_CLIPS} clips. Export part of it first, then bring that in as one clip.")
    texts = [{"text": str(t.get("text") or "")[:400], "start": _num(t.get("start"), 0, 86400, 0), "dur": _num(t.get("dur"), 0.1, 86400, 3),
              "x": _num(t.get("x"), 0, 1, 0.5), "y": _num(t.get("y"), 0, 1, 0.85), "size": _num(t.get("size"), 1, 40, 7),
              "color": t.get("color") if re.fullmatch(r"#[0-9a-fA-F]{6}", str(t.get("color"))) else "#ffffff"}
             for t in (p.get("texts") or []) if isinstance(t, dict) and str(t.get("text") or "").strip()]
    music = []
    for m in (p.get("music") or []):
        if not isinstance(m, dict):
            continue
        if not usable(m.get("path")):
            raise ValueError("A sound on the timeline isn't available any more. Remove it or import it again.")
        a = _num(m.get("in"), 0, 86400, 0)
        music.append({"path": os.path.realpath(m["path"]), "in": a, "out": _num(m.get("out"), a + 0.05, 86400, a + 3), "start": _num(m.get("start"), 0, 86400, 0),
                      "volume": _num(m.get("volume"), 0, 2, 1), "fade_in": _num(m.get("fade_in"), 0, 30, 0), "fade_out": _num(m.get("fade_out"), 0, 30, 0)})
    ratio = p.get("ratio") if p.get("ratio") in SIZES else "16:9"
    quality = str(p.get("quality")) if str(p.get("quality")) in ("720", "1080") else "1080"
    return {"clips": clips, "texts": texts, "music": music, "ratio": ratio, "quality": quality, "name": str(p.get("name") or "Edited video")[:60]}


def timeline(clips):
    """(the start of each clip, the total length); a transition overlaps a clip with the one before it"""
    starts, t = [], 0.0
    for i, c in enumerate(clips):
        length = (c["out"] - c["in"]) / c["speed"]
        c["_len"] = length
        if i and c["trans"] != "none":
            c["_overlap"] = min(c["trans_dur"], length / 2, clips[i - 1]["_len"] / 2)
            t -= c["_overlap"]
        else:
            c["_overlap"] = 0.0
        starts.append(t)
        t += length
    return starts, t


def _atempo(speed):
    """ffmpeg's atempo takes 0.5-2 at a time"""
    parts = []
    while speed > 2:
        parts.append("atempo=2")
        speed /= 2
    while speed < 0.5:
        parts.append("atempo=0.5")
        speed /= 0.5
    parts.append(f"atempo={speed:.4f}")
    return ",".join(parts)


def text_picture(t, W, H, path):
    from PIL import Image, ImageDraw
    from generator import _font
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    f = _font(max(10, int(H * t["size"] / 100)), bold=True)
    ImageDraw.Draw(img).multiline_text((W * t["x"], H * t["y"]), t["text"], font=f, fill=t["color"], anchor="mm", align="center",
                                       stroke_width=max(1, f.size // 14), stroke_fill=(0, 0, 0))
    img.save(path)


def build_command(project, out_path, tmp):
    """-> (ffmpeg arguments, total seconds). `project` has been through clean_project()."""
    clips, W, H = project["clips"], *SIZES[project["ratio"]][project["quality"]]
    starts, total = timeline(clips)
    args, fx, n = ["-hide_banner", "-y", "-nostats", "-progress", "pipe:1"], [], 0
    for c in clips:
        if c["kind"] == "image":
            args += ["-loop", "1", "-framerate", str(FPS), "-t", f"{c['out'] - c['in']:.3f}", "-i", c["path"]]
        else:
            args += ["-ss", f"{c['in']:.3f}", "-t", f"{c['out'] - c['in']:.3f}", "-i", c["path"]]
    n = len(clips)
    for i, c in enumerate(clips):
        look = [f"setpts=(PTS-STARTPTS)/{c['speed']:.4f}", f"scale={W}:{H}:force_original_aspect_ratio=decrease",
                f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:black", "setsar=1", f"fps={FPS}", "format=yuv420p"]
        if c["bright"] or c["contrast"] != 1 or c["sat"] != 1:
            look.append(f"eq=brightness={c['bright']:.3f}:contrast={c['contrast']:.3f}:saturation={c['sat']:.3f}")
        fx.append(f"[{i}:v]{','.join(look)}[v{i}]")
        if c["has_audio"] and not c["mute"] and c["volume"] > 0:
            fx.append(f"[{i}:a]asetpts=PTS-STARTPTS,{_atempo(c['speed'])},volume={c['volume']:.3f},aresample=48000,"
                      f"aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=0:{c['_len']:.3f}[a{i}]")
        else:
            fx.append(f"aevalsrc=0:c=stereo:s=48000:d={c['_len']:.3f},aformat=sample_fmts=fltp:channel_layouts=stereo[a{i}]")
    v, a = "v0", "a0"
    for i in range(1, len(clips)):
        c = clips[i]
        if c["trans"] != "none":
            fx.append(f"[{v}][v{i}]xfade=transition={TRANSITIONS[c['trans']]}:duration={c['_overlap']:.3f}:offset={starts[i]:.3f}[vj{i}]")
            fx.append(f"[{a}][a{i}]acrossfade=d={c['_overlap']:.3f}[aj{i}]")
        else:
            fx.append(f"[{v}][v{i}]concat=n=2:v=1:a=0,settb=1/{FPS},fps={FPS}[vj{i}]")      # xfade needs the time base kept
            fx.append(f"[{a}][a{i}]concat=n=2:v=0:a=1[aj{i}]")
        v, a = f"vj{i}", f"aj{i}"
    for k, t in enumerate(project["texts"]):
        png = os.path.join(tmp, f"text{k}.png")
        text_picture(t, W, H, png)
        args += ["-loop", "1", "-framerate", str(FPS), "-t", f"{total:.3f}", "-i", png]
        fx.append(f"[{v}][{n}:v]overlay=0:0:enable='between(t,{t['start']:.3f},{t['start'] + t['dur']:.3f})':eof_action=pass[vt{k}]")
        v, n = f"vt{k}", n + 1
    mix = [f"[{a}]"]
    for k, m in enumerate(project["music"]):
        if m["start"] >= total:
            continue
        length = m["out"] - m["in"]
        args += ["-ss", f"{m['in']:.3f}", "-t", f"{length:.3f}", "-i", m["path"]]
        chain = [f"asetpts=PTS-STARTPTS", f"volume={m['volume']:.3f}", "aresample=48000", "aformat=sample_fmts=fltp:channel_layouts=stereo"]
        if m["fade_in"]:
            chain.append(f"afade=t=in:d={m['fade_in']:.3f}")
        if m["fade_out"]:
            chain.append(f"afade=t=out:st={max(0.0, length - m['fade_out']):.3f}:d={m['fade_out']:.3f}")
        chain.append(f"adelay={int(m['start'] * 1000)}:all=1")
        fx.append(f"[{n}:a]{','.join(chain)}[m{k}]")
        mix.append(f"[m{k}]")
        n += 1
    if len(mix) > 1:
        fx.append(f"{''.join(mix)}amix=inputs={len(mix)}:duration=first:normalize=0[aout]")
        a = "aout"
    args += ["-filter_complex", ";".join(fx), "-map", f"[{v}]", "-map", f"[{a}]", "-t", f"{total:.3f}", "-r", str(FPS),
             "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out_path]
    return args, total


def render(project, out_path, on_progress=None, job=None):
    """make the .mp4 -> {"file", "seconds"}"""
    say = on_progress or (lambda *_: None)
    with tempfile.TemporaryDirectory(prefix="vermeil-edit-") as tmp:
        args, total = build_command(project, out_path, tmp)
        log = os.path.join(tmp, "ffmpeg.log")
        with open(log, "wb") as err:
            proc = subprocess.Popen([ffmpeg(), *args], stdout=subprocess.PIPE, stderr=err, creationflags=_NO_WINDOW)
            if job:
                _procs[job] = proc
            try:
                for raw in proc.stdout:
                    m = re.match(rb"out_time_(?:us|ms)=(\d+)", raw)
                    if m:
                        say(min(0.99, int(m[1]) / 1e6 / max(total, 0.01)), "Rendering your video…")
                code = proc.wait()
            finally:
                if job:
                    _procs.pop(job, None)
        if code != 0:
            with open(log, encoding="utf-8", errors="replace") as f:
                tail = f.read()[-1500:]
            print(f"[videoedit] ffmpeg failed ({code}):\n{tail}")
            try:
                os.remove(out_path)
            except OSError:
                pass
            if code in (1, -9, 15) and job and job in _cancelled:
                _cancelled.discard(job)
                raise RuntimeError("Export cancelled.")
            raise RuntimeError("The video couldn't be rendered. One of the clips may be damaged; try removing clips to find it.")
    return {"file": out_path, "seconds": round(total, 1)}


_cancelled = set()


def cancel(job):
    proc = _procs.get(job)
    if not proc:
        return False
    _cancelled.add(job)
    proc.kill()
    return True
