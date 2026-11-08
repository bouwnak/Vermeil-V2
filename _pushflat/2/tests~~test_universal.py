"""Universal update: low-end PC mode, practice partner, sharing characters, Mac/Linux bits."""
import io, json, os, sys, tempfile, threading, unittest, urllib.request, urllib.error, wave, zipfile
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import folders  # noqa: E402,F401  (finds brain/, senses/, skills/, scripts/)
import sandbox  # noqa: E402,F401  (keeps the tests away from your real logins, keys and installs)

import machine, partner, charshare  # noqa: E402
import voice_commands as vc  # noqa: E402


class MachineTests(unittest.TestCase):
    def test_tiers(self):
        self.assertEqual(machine.tier({"ram_gb": 4, "cores": 4, "gpu": ""}), "low")
        self.assertEqual(machine.tier({"ram_gb": 8, "cores": 2, "gpu": ""}), "low")
        self.assertEqual(machine.tier({"ram_gb": 7.8, "cores": 4, "gpu": "Intel UHD"}), "low")
        self.assertEqual(machine.tier({"ram_gb": 7.8, "cores": 4, "gpu": "NVIDIA GeForce GTX 1650", "vram_gb": 4}), "normal")
        self.assertEqual(machine.tier({"ram_gb": 16, "cores": 8, "gpu": "Intel Iris"}), "normal")
        self.assertEqual(machine.tier({"ram_gb": 15.7, "cores": 6, "gpu": "NVIDIA GeForce RTX 3050 Laptop GPU", "vram_gb": 4}), "high")
        self.assertEqual(machine.tier({"ram_gb": 16, "cores": 8, "gpu": "Apple Silicon"}), "high")

    def test_battery_and_forced_modes(self):
        info = {"ram_gb": 16, "cores": 8, "gpu": "Apple Silicon", "tier": "high", "battery": 15, "plugged": False}
        self.assertEqual(machine.choose("auto", info), "low")
        self.assertIn("Battery at 15%", machine.why("auto", info))
        self.assertEqual(machine.choose("auto", {**info, "plugged": True}), "high")
        self.assertEqual(machine.choose("normal", info), "normal")

    def test_scan_never_crashes(self):
        info = machine.scan()
        self.assertIn(info["tier"], ("low", "normal", "high"))
        self.assertTrue(info["system"])


class PartnerTests(unittest.TestCase):
    def test_split_reply(self):
        fix, talk = partner.split_reply("✏️ **Corrections:** 私は → 私が (ga marks the subject)\n\nいいですね！週末は何をしましたか？")
        self.assertIn("私が", fix)
        self.assertTrue(talk.startswith("いいですね"))
        self.assertEqual(partner.split_reply("こんにちは！"), ("", "こんにちは！"))

    def test_spoken_correction_has_no_foreign_script(self):
        said = partner.spoken_correction("**watashi wa** (私は) → **watashi ga** (私が): ga marks the subject")
        self.assertNotIn("私", said)
        self.assertNotIn("*", said)
        self.assertIn("should be", said)

    def test_stop_words(self):
        for t in ("stop practice", "end the conversation", "i'm done", "bye"):
            self.assertTrue(partner.STOP.search(t), t)
        self.assertFalse(partner.STOP.search("I stop at the station before practice"))

    def test_voice_turns_and_quiet_end(self):
        said, emitted = [], []
        heard = iter(["konnichiwa", None, None, None, None])
        p = partner.Partner(emitted.append, lambda: next(heard, None), lambda t: said.append(("native", t)),
                            lambda t, lang: said.append((lang, t)))
        fake_mind = mock.MagicMock()
        fake_mind.practice_start.return_value = {"id": "s1", "messages": [{"role": "assistant", "content": "こんにちは！"}]}
        fake_mind.practice_reply.return_value = {"id": "s1", "messages": [{"role": "assistant",
                                                 "content": "✏️ Corrections: konnichiwa → こんにちは\n\nげんきですか？"}]}
        fake_mind.practice_finish.return_value = {"score": "7/10"}
        fake_sensei = mock.MagicMock(LANGS={"ja": "Japanese"})
        fake_sensei._state.return_value = {"language": "ja", "level": 2}
        with mock.patch.dict(sys.modules, {"mind": fake_mind, "sensei": fake_sensei}):
            out = p.start("ja", 2, "", by_voice=False)
            self.assertEqual(out["name"], "Japanese")
            p._loop("こんにちは！")
        self.assertFalse(p.active)
        self.assertIn(("ja", "こんにちは！"), said)
        self.assertIn(("ja", "げんきですか？"), said)
        self.assertTrue(any(w == "native" and "Small fix" in t for w, t in said))
        self.assertEqual([e["event"] for e in emitted if e.get("type") == "partner"], ["start", "turn", "stop"])


class ShareTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.models = os.path.join(self.tmp, "models")
        os.makedirs(self.models)
        with open(os.path.join(self.models, "Robo.glb"), "wb") as f:
            f.write(b"glTF" + b"\0" * 60)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_roundtrip(self):
        char = {"id": "x1", "name": "Robo", "prompt": "Beep.", "voice": "piper:en_US-amy-medium", "model": "Robo.glb",
                "memory_key": "secret-memory", "rvc": None}
        out = os.path.join(self.tmp, charshare.file_name(char))
        res = charshare.export_character(char, out, self.models)
        self.assertTrue(res["has_model"])
        with zipfile.ZipFile(out) as z:
            data = json.loads(z.read(charshare.MANIFEST))
        self.assertNotIn("memory_key", data["character"])        # its memories of you never leave this PC
        self.assertNotIn("id", data["character"])
        friend = os.path.join(self.tmp, "friend_models")
        got = charshare.import_character(out, friend)
        self.assertEqual(got["name"], "Robo")
        self.assertEqual(got["model"], "Robo.glb")
        self.assertTrue(os.path.isfile(os.path.join(friend, "Robo.glb")))
        self.assertEqual(got["notes"], ["3D model"])

    def test_rejects_fake_model_and_paths(self):
        bad = os.path.join(self.tmp, "bad.vermeil")
        with zipfile.ZipFile(bad, "w") as z:
            z.writestr(charshare.MANIFEST, json.dumps({"format": 1, "character": {"name": "Evil", "model": "../../evil.glb"}}))
            z.writestr("model/evil.glb", b"MZ not a model")
            z.writestr("../../escape.txt", b"x")
        with self.assertRaises(ValueError):
            charshare.import_character(bad, os.path.join(self.tmp, "m2"))
        self.assertFalse(os.path.exists(os.path.join(self.tmp, "..", "escape.txt")))
        with self.assertRaises(ValueError):
            charshare.import_character(os.path.join(self.models, "Robo.glb"), self.models)


class VoiceCommandTests(unittest.TestCase):
    def test_new_commands(self):
        cases = {"let's practice japanese": "partner_start", "talk to me in korean": "partner_start",
                 "stop practice": "partner_stop", "low power mode": "power_low", "full power": "power_full",
                 "scan my pc": "scan",
                 "share this character": "share_character", "import a character": "import_character"}
        for said, want in cases.items():
            hit = vc.parse(said)
            self.assertIsNotNone(hit, said)
            self.assertEqual(hit[0], want, said)
        self.assertEqual(vc.language_in("let's practice japanese"), "ja")

    def test_help_lists_the_new_features(self):
        ids = {f["id"] for f in vc.catalogue(lambda _: True)}
        self.assertIn("performance", ids)
        self.assertNotIn("phone", ids)


class CrossPlatformTests(unittest.TestCase):
    def test_open_path_uses_the_system_opener(self):
        import paths
        with mock.patch.object(paths.sys, "platform", "darwin"), mock.patch.object(paths.subprocess, "Popen") as po:
            paths.open_path("/tmp/x")
        self.assertEqual(po.call_args[0][0], ["open", "/tmp/x"])
        with mock.patch.object(paths.sys, "platform", "linux"), mock.patch.object(paths.subprocess, "Popen") as po:
            paths.open_path("/tmp/x")
        self.assertEqual(po.call_args[0][0], ["xdg-open", "/tmp/x"])

    def test_installers_exist_with_unix_endings(self):
        for f in ("INSTALL Mac.command", "INSTALL Linux.sh", "scripts/install.sh"):
            with open(os.path.join(ROOT, f), "rb") as fh:
                data = fh.read()
            self.assertTrue(data.startswith(b"#!"), f)
            self.assertNotIn(b"\r\n", data, f)
        with open(os.path.join(ROOT, "scripts", "install.sh"), encoding="utf-8") as fh:
            sh = fh.read()
        for win_only in ("pycaw", "winotify", "comtypes"):
            self.assertNotIn(win_only, sh)

if __name__ == "__main__":
    unittest.main()
