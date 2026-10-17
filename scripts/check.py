#!/usr/bin/env python3
"""Единая локальная проверка исходников без установки зависимостей."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
commands = [
    ["node", "--test", *[str(path.relative_to(ROOT)) for path in sorted((ROOT / "tests").glob("*.test.js"))]],
    ["python3", "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"],
    ["node", "scripts/validate.mjs"],
]
for command in commands:
    subprocess.run(command, cwd=ROOT, check=True)
