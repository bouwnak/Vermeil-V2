"""Game Night with Vermeil (skills/gamenight.py): the library and weekly tournament, puzzle of the day with a streak,
trivia, word games, typing words, escape rooms, the drawing game and song tempos (the AI is faked)."""
import os, sys, tempfile, unittest
from datetime import date, timedelta
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import folders  # noqa: E402,F401
import sandbox  # noqa: E402,F401
import gamenight  # noqa: E402

MON = date(2026, 10, 26)


class _Tmp(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="vermeil-gamenight-")
        p = mock.patch.object(gamenight, "FILE", os.path.join(self.tmp, "gamenight.json"))
        p.start()
        self.addCleanup(p.stop)


class LibraryTests(_Tmp):
    def test_hours_favourites_and_tournament_points(self):
        gamenight.record("chess", 1800, "win", MON)
        gamenight.record("trivia", 600, "draw", MON)
        r = gamenight.record("uno", 300, "loss", MON + timedelta(days=1))
        t = r["tournament"]
        self.assertEqual((t["you"], t["her"]), (4, 4))
        self.assertEqual(len(t["games"]), 3)
        lib = gamenight.toggle_fav("trivia")
        self.assertEqual(lib["games"][0]["id"], "trivia")                       # favourites first
        chess = next(g for g in lib["games"] if g["id"] == "chess")
        self.assertEqual((chess["minutes"], chess["win"]), (30, 1))
        gamenight.record("retro", 7200)                                          # time only, no result
        self.assertEqual(next(g for g in gamenight.library(everything=True)["games"] if g["id"] == "retro")["hours"], 2.0)
        ids = {g["id"] for g in gamenight.library()["games"]}                   # Adventure and retro have their own place
        self.assertFalse({"retro", "adventure"} & ids)
        self.assertIn("chess", ids)

    def test_new_week_gives_the_trophy(self):
        gamenight.record("chess", 60, "win", MON)
        t = gamenight.tournament(MON + timedelta(days=7))
        self.assertEqual((t["you"], t["her"]), (0, 0))
        self.assertEqual(t["trophies"][0]["winner"], "you")
        self.assertEqual(t["won"], 1)


class AskTests(_Tmp):
    def test_song_bpm_cached_and_folded(self):
        self.assertEqual(gamenight.song_bpm("Slow", ask=lambda p: {"bpm": 60})["bpm"], 120)
        self.assertEqual(gamenight.song_bpm("Slow", ask=lambda p: {"bpm": 999})["bpm"], 120)     # cached
        self.assertEqual(gamenight.song_bpm("Unknown", ask=lambda p: {})["bpm"], 104)


if __name__ == "__main__":
    unittest.main()
