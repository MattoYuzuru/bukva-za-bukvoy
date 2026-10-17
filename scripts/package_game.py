#!/usr/bin/env python3
"""Пакует только сдаваемые статические файлы, без SDK, ключей и документов."""
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "game"


def main():
    paths = sorted(path for path in GAME.rglob("*") if path.is_file())
    snapshots = {path.relative_to(GAME).as_posix(): path.read_bytes() for path in paths}
    subprocess.run(["node", "scripts/validate.mjs"], cwd=ROOT, check=True)
    validated = {path.relative_to(GAME).as_posix(): path.read_bytes() for path in GAME.rglob("*") if path.is_file()}
    if validated != snapshots:
        raise RuntimeError("Файлы игры изменились во время проверки")
    artifact = ROOT / "artifacts" / "bukva-za-bukvoy-game.zip"
    artifact.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(artifact, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in snapshots.items():
            info = zipfile.ZipInfo(name, (2026, 10, 17, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    current = {path.relative_to(GAME).as_posix(): path.read_bytes() for path in GAME.rglob("*") if path.is_file()}
    if current != snapshots:
        artifact.unlink()
        raise RuntimeError("Файлы игры изменились во время упаковки")
    metadata = {
        "gitHead": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
        "bytes": artifact.stat().st_size,
        "files": {name: hashlib.sha256(data).hexdigest() for name, data in snapshots.items()},
    }
    artifact.with_suffix(".json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    print(f"Готово: {artifact} ({metadata['bytes']} байт)")


if __name__ == "__main__":
    main()
