"""Media: the free-token guard (skills/seedance.py) and the video editor's renderer (skills/videoedit.py).
Nothing here talks to BytePlus; the renderer tests run the real ffmpeg on tiny made-up clips."""
import os
import subprocess
import sys
import tempfile
import unittest
import urllib.request
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for sub in ("", "skills", "brain"):
    sys.path.insert(0, os.path.join(ROOT, sub))

import seedance
import videoedit


class FakeResponse:
    def __init__(self, status=200, data=None):
        self.status_code, self._data, self.ok = status, data or {}, status < 400

    def json(self):
        return self._data


class TokenGuardTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="vermeil-tokens-")
        self.patches = [mock.patch.object(seedance, "USAGE_FILE", os.path.join(self.tmp, "t.json")), mock.patch.dict(os.environ, {"ARK_API_KEY": "k" * 30}),
                        mock.patch.object(seedance, "_download", lambda url, path: path)]
        for p in self.patches:
            p.start()
        seedance._held.clear()

    def tearDown(self):
        for p in self.patches:
            p.stop()

    def _answers(self, *answers):
        return mock.patch("requests.request", side_effect=list(answers))

    def test_the_estimate_matches_byteplus_own_example(self):
        self.assertAlmostEqual(seedance.video_tokens("720p", "16:9", 5), 108900, delta=2500)
        self.assertLess(seedance.video_tokens("480p", "16:9", 5), seedance.video_tokens("720p", "16:9", 5))

    def test_a_clip_counts_what_byteplus_reports(self):
        with self._answers(FakeResponse(data={"id": "t1"}), FakeResponse(data={"status": "succeeded", "usage": {"total_tokens": 50000}, "content": {"video_url": "http://x/v.mp4"}})) as req:
            r = seedance.make_video("a cat", os.path.join(self.tmp, "v.mp4"))
        self.assertEqual(r["tokens"], 50000)
        self.assertEqual(seedance.used(seedance.video_model()), 50000)
        body = req.call_args_list[0].kwargs["json"]
        self.assertEqual(body["model"], seedance.video_model())
        self.assertFalse(body["watermark"])

    def test_nothing_is_sent_when_it_would_not_fit(self):
        seedance._add(seedance.video_model(), seedance.FREE_LIMIT - 1000)
        with self._answers() as req:
            with self.assertRaises(seedance.FreeLimit):
                seedance.make_video("a cat", os.path.join(self.tmp, "v.mp4"))
        req.assert_not_called()

    def test_two_jobs_cannot_both_spend_the_same_tokens(self):
        need = seedance.video_tokens("480p", "16:9", 5)
        seedance._add(seedance.video_model(), seedance.FREE_LIMIT - need - 10)
        seedance._hold(seedance.video_model(), need, "first")
        with self.assertRaises(seedance.FreeLimit):
            seedance._hold(seedance.video_model(), need, "second")
        seedance._release(seedance.video_model(), need)
        self.assertEqual(seedance.left(seedance.video_model()), need + 10)

    def test_byteplus_saying_the_limit_is_reached_stops_that_model(self):
        with self._answers(FakeResponse(429, {"error": {"code": "SetLimitExceeded", "message": "paused"}})):
            with self.assertRaises(seedance.FreeLimit):
                seedance.make_video("a cat", os.path.join(self.tmp, "v.mp4"))
        self.assertEqual(seedance.left(seedance.video_model()), 0)
        self.assertTrue(seedance.status()["video"]["out"])
        self.assertGreater(seedance.left(seedance.image_model()), 0)          # each model has its own free tokens

    def test_a_failed_video_spends_nothing_and_frees_the_hold(self):
        with self._answers(FakeResponse(data={"id": "t1"}), FakeResponse(data={"status": "failed", "error": {"message": "blocked prompt"}})):
            with self.assertRaisesRegex(seedance.ArkError, "blocked prompt"):
                seedance.make_video("x", os.path.join(self.tmp, "v.mp4"))
        self.assertEqual(seedance.used(seedance.video_model()), 0)
        self.assertEqual(seedance.left(seedance.video_model()), seedance.FREE_LIMIT)

    def test_no_key_and_the_status_never_shows_the_key(self):
        secret = "k" * 30
        self.assertNotIn(secret, str(seedance.status()))
        self.assertTrue(seedance.status()["has_key"])
        with mock.patch.dict(os.environ, {"ARK_API_KEY": "your_byteplus_ark_key_here"}):
            self.assertFalse(seedance.status()["has_key"])
            with self.assertRaisesRegex(seedance.ArkError, "API key"):
                seedance.make_video("x", os.path.join(self.tmp, "v.mp4"))

    def test_a_bad_key_message_is_plain(self):
        with self._answers(FakeResponse(401, {"error": {"code": "AuthenticationError"}})):
            with self.assertRaisesRegex(seedance.ArkError, "refused the API key"):
                seedance.make_video("x", os.path.join(self.tmp, "v.mp4"))

    def test_seedream_pictures_stop_at_the_limit_and_keep_what_was_made(self):
        import generator
        from PIL import Image
        with mock.patch.object(generator, "OUT_DIR", self.tmp), mock.patch.object(
                seedance, "make_picture", side_effect=[(Image.new("RGB", (8, 8)), 100), seedance.FreeLimit("no more")]):
            r = generator.seedream_pictures("a dog", 3)
        self.assertEqual(len(r["files"]), 1)
        self.assertIn("Stopped after 1", r["note"])
        with mock.patch.object(generator, "OUT_DIR", self.tmp), mock.patch.object(seedance, "make_picture", side_effect=seedance.FreeLimit("no more")):
            with self.assertRaises(seedance.FreeLimit):
                generator.seedream_pictures("a dog", 3)


class ProjectFileTests(unittest.TestCase):
    def test_project_survives_a_restart_and_bad_files_are_ignored(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "sub", "video_project.json")
            with mock.patch.object(videoedit, "PROJECT_FILE", path):
                self.assertIsNone(videoedit.load_project())
                self.assertTrue(videoedit.save_project({"clips": [{"in": 1.5}], "name": "Trip"}))
                self.assertEqual(videoedit.load_project(), {"clips": [{"in": 1.5}], "name": "Trip"})
                with open(path, "w", encoding="utf-8") as f:
                    f.write("not json")
                self.assertIsNone(videoedit.load_project())


class RendererTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            cls.ff = videoedit.ffmpeg()
        except RuntimeError:
            raise unittest.SkipTest("no ffmpeg on this PC")
        cls.tmp = tempfile.mkdtemp(prefix="vermeil-edit-test-")
        run = lambda *a: subprocess.run([cls.ff, "-hide_banner", "-loglevel", "error", "-y", *a], check=True)
        cls.a = os.path.join(cls.tmp, "a.mp4")
        run("-f", "lavfi", "-i", "testsrc=s=320x240:r=30:d=3", "-f", "lavfi", "-i", "sine=f=440:d=3", "-shortest", cls.a)
        cls.silent = os.path.join(cls.tmp, "silent.mp4")
        run("-f", "lavfi", "-i", "color=c=blue:s=240x320:r=25:d=2", cls.silent)
        cls.png = os.path.join(cls.tmp, "p.png")
        run("-f", "lavfi", "-i", "color=c=green:s=200x200", "-frames:v", "1", cls.png)
        cls.mp3 = os.path.join(cls.tmp, "m.wav")
        run("-f", "lavfi", "-i", "sine=f=220:d=5", cls.mp3)
        cls.files = {k: videoedit.add_file(v) for k, v in {"a": cls.a, "s": cls.silent, "p": cls.png, "m": cls.mp3}.items()}

    def _clip(self, f, a=0.0, b=None, **kw):
        f = self.files[f]
        return {"path": f["path"], "kind": f["kind"], "has_audio": f["has_audio"], "in": a, "out": b if b is not None else (f["duration"] or 2), **kw}

    def _render(self, **p):
        out = os.path.join(self.tmp, f"out{len(os.listdir(self.tmp))}.mp4")
        videoedit.render(videoedit.clean_project({"quality": "720", **p}), out)
        return videoedit.probe(out)

    def test_reading_a_file(self):
        f = self.files["a"]
        self.assertEqual((f["kind"], f["w"], f["h"], f["has_audio"]), ("video", 320, 240, True))
        self.assertAlmostEqual(f["duration"], 3, delta=0.15)
        self.assertTrue(f["thumb"].startswith("data:image/jpeg"))
        self.assertFalse(self.files["s"]["has_audio"])
        self.assertEqual(self.files["m"]["kind"], "audio")
        self.assertIn("error", videoedit.add_file(__file__))

    def test_trims_cuts_a_silent_clip_and_a_picture(self):
        r = self._render(clips=[self._clip("a", 1, 2.5), self._clip("s"), self._clip("p", 0, 1)])
        self.assertAlmostEqual(r["duration"], 1.5 + 2 + 1, delta=0.2)
        self.assertEqual((r["w"], r["h"]), (1280, 720))
        self.assertTrue(r["has_audio"])

    def test_speed_changes_the_length(self):
        r = self._render(clips=[self._clip("a", 0, 3, speed=2), self._clip("a", 0, 1, speed=0.5)])
        self.assertAlmostEqual(r["duration"], 1.5 + 2, delta=0.2)

    def test_every_transition_overlaps_the_clips(self):
        for trans in videoedit.TRANSITIONS:
            r = self._render(clips=[self._clip("a"), self._clip("s", trans=trans, trans_dur=0.5)])
            self.assertAlmostEqual(r["duration"], 3 + 2 - 0.5, delta=0.2, msg=trans)

    def test_a_cut_then_a_transition(self):
        r = self._render(clips=[self._clip("a", 0, 1), self._clip("s", 0, 1), self._clip("a", 0, 1, trans="fade", trans_dur=0.4)])
        self.assertAlmostEqual(r["duration"], 2.6, delta=0.2)

    def test_text_music_look_and_tall_format(self):
        r = self._render(ratio="9:16", clips=[self._clip("a", bright=0.1, contrast=1.2, sat=1.5, volume=0.5)],
                         texts=[{"text": "Hello: 'world', 100%\nline two", "start": 0.5, "dur": 1, "color": "#ff0000", "y": 0.2}],
                         music=[{"path": self.mp3, "in": 0, "out": 5, "start": 1, "volume": 0.4, "fade_in": 0.5, "fade_out": 1}])
        self.assertAlmostEqual(r["duration"], 3, delta=0.2)                    # the music doesn't make it longer
        self.assertEqual((r["w"], r["h"]), (720, 1280))
        self.assertTrue(r["has_audio"])

    def test_timeline_starts_match_the_overlap(self):
        clips = videoedit.clean_project({"clips": [self._clip("a"), self._clip("s", trans="fade", trans_dur=0.5)]})["clips"]
        starts, total = videoedit.timeline(clips)
        self.assertAlmostEqual(starts[1], clips[0]["out"] - 0.5, places=3)
        self.assertAlmostEqual(total, clips[0]["out"] + 2 - 0.5, delta=0.05)

    def test_only_files_you_picked_can_be_used_or_served(self):
        with self.assertRaisesRegex(ValueError, "isn't available"):
            videoedit.clean_project({"clips": [{"path": os.path.join(ROOT, "env"), "in": 0, "out": 1}]})
        with self.assertRaisesRegex(ValueError, "Add a clip"):
            videoedit.clean_project({"clips": []})
        base = videoedit.server_url()
        for bad in (base + "/nope", base.rsplit("/", 1)[0] + "/wrongsecret/" + self.files["a"]["id"]):
            with self.assertRaises(urllib.error.HTTPError):
                urllib.request.urlopen(bad, timeout=5)

    def test_the_preview_server_can_seek(self):
        f = self.files["a"]
        with urllib.request.urlopen(urllib.request.Request(f["url"], headers={"Range": "bytes=10-19"}), timeout=5) as r:
            self.assertEqual(r.status, 206)
            self.assertEqual(len(r.read()), 10)
        self.assertTrue(f["url"].startswith("http://127.0.0.1:"))


if __name__ == "__main__":
    unittest.main()
