"""Поведение офлайн-поставки: полный контент, неизменность источника и отказ от нового синтаксиса."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("ios_prepare", ROOT / "ios/prepare_web.py")
PACKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PACKER)


class IOSPreparationTests(unittest.TestCase):
    def test_full_content_is_available_without_fetch_and_source_is_unchanged(self):
        source = ROOT / "game"
        before = PACKER.fingerprints(source)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "WWW"
            manifest = PACKER.prepare(source, output)
            html = (output / "index.html").read_text()
            javascript = (output / "ios-bundle.js").read_text()
            self.assertIn("connect-src 'none'", html)
            self.assertNotIn('type="module"', html)
            self.assertNotIn("import.meta", javascript)
            self.assertNotIn("await fetch(", javascript)
            subprocess.run(["node", "--check", str(output / "ios-bundle.js")], check=True, capture_output=True)
            raw = json.loads((source / "data/words.json").read_text())
            available = set()
            chunks = ["const __BUKVA_IOS_MODULES = Object.create(null); globalThis.fetch = () => { throw new Error('Сеть запрещена'); };\n"]
            words = json.dumps(raw, ensure_ascii=False)
            for name in ("engine.js", "content.js"):
                chunks.append(PACKER.pack_module(name, (source / "js" / name).read_text(), available, words))
            chunks.append("__BUKVA_IOS_MODULES['content.js'].loadContent().then(c => console.log(JSON.stringify({words:c.words.length, accepted:c.accepted.size, fallback:c.fallback})));\n")
            result = subprocess.run(["node", "--input-type=commonjs"], input="".join(chunks),
                                    check=True, text=True, capture_output=True)
            loaded = json.loads(result.stdout)
            self.assertEqual(loaded, {"words": len(raw["words"]), "accepted": len(set(raw["accepted"])), "fallback": False})
            self.assertEqual(manifest["canonicalFilesSha256"], before)
        self.assertEqual(PACKER.fingerprints(source), before)

    def test_unsupported_module_forms_fail_explicitly(self):
        cases = (
            "import * as engine from './engine.js';",
            "import { ALPHABET as letters } from './engine.js';",
            "import {\n ALPHABET\n} from './engine.js';",
            "const module = import('./engine.js');",
            "export default function game() {}",
            "export { value } from './engine.js';",
        )
        for text in cases:
            with self.subTest(text=text), self.assertRaises(PACKER.PreparationError):
                PACKER.pack_module("app.js", text, {"engine.js"}, "{}")

    def test_owned_output_is_required_and_existing_files_are_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "WWW"
            output.mkdir()
            important = output / "existing.txt"
            important.write_text("Сохранить этот файл")
            with self.assertRaises(PACKER.PreparationError):
                PACKER.prepare(ROOT / "game", output)
            self.assertEqual(important.read_text(), "Сохранить этот файл")

    def test_symlinked_resources_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "game"
            shutil.copytree(ROOT / "game", source)
            (source / "assets/escape.svg").symlink_to(ROOT / "game/assets/logo.svg")
            with self.assertRaises(PACKER.PreparationError):
                PACKER.prepare(source, Path(directory) / "WWW")


if __name__ == "__main__":
    unittest.main()
