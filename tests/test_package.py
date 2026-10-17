"""Упаковка не должна незаметно подхватить правки из общего checkout."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

SPEC = importlib.util.spec_from_file_location("package_game", Path(__file__).resolve().parents[1] / "scripts/package_game.py")
PACKAGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PACKAGE)


class PackageTest(unittest.TestCase):
    def test_mutation_during_validation_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            game = root / "game"
            game.mkdir()
            source = game / "index.html"
            source.write_text("проверенная версия")
            with patch.object(PACKAGE, "ROOT", root), patch.object(PACKAGE, "GAME", game), patch.object(PACKAGE.subprocess, "run", side_effect=lambda *args, **kwargs: source.write_text("другая версия")):
                with self.assertRaisesRegex(RuntimeError, "изменились во время проверки"):
                    PACKAGE.main()
            self.assertFalse((root / "artifacts/bukva-za-bukvoy-game.zip").exists())

    def test_zip_contains_only_game_root_and_has_stable_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            game = root / "game"
            (game / "js").mkdir(parents=True)
            (game / "index.html").write_bytes(b"index")
            (game / "js/app.js").write_bytes(b"app")
            (root / "private.jks").write_bytes(b"not for delivery")
            with patch.object(PACKAGE, "ROOT", root), patch.object(PACKAGE, "GAME", game), patch.object(PACKAGE.subprocess, "run"), patch.object(PACKAGE.subprocess, "check_output", return_value="test-head\n"):
                PACKAGE.main()
                output = root / "artifacts/bukva-za-bukvoy-game.zip"
                first = output.read_bytes()
                PACKAGE.main()
                self.assertEqual(first, output.read_bytes())
                with zipfile.ZipFile(output) as archive:
                    self.assertEqual(archive.namelist(), ["index.html", "js/app.js"])
                    self.assertEqual(archive.read("js/app.js"), b"app")


if __name__ == "__main__":
    unittest.main()
