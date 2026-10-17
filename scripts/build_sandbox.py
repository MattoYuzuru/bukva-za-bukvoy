#!/usr/bin/env python3
"""Собрать неизменённую официальную Android-песочницу закреплённой ревизии."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent.parent
SOURCE_URL = "https://github.com/vveidi/sber-hse-hackathon-2026-android.git"
SOURCE_PIN = "1ba091d72e9e0917af70d88319de51522a54f207"


def run(args: list[object], cwd: Path, env: dict[str, str] | None = None, capture: bool = False) -> str:
    result = subprocess.run([str(arg) for arg in args], cwd=cwd, env=env, check=True, text=True,
                            stdout=subprocess.PIPE if capture else None)
    return result.stdout.strip() if capture else ""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdk", type=Path, default=Path(os.environ.get("ANDROID_HOME", ROOT / ".work/android-sdk")))
    parser.add_argument("--java-home", type=Path, default=Path(os.environ["JAVA_HOME"]) if "JAVA_HOME" in os.environ else None)
    args = parser.parse_args()
    sdk = args.sdk.expanduser().resolve()
    if not (sdk / "platforms/android-36.1/android.jar").is_file():
        raise SystemExit("Для официальной песочницы нужен platforms;android-36.1. См. docs/Сборка.md.")
    source = ROOT / ".work/official-android"
    source.parent.mkdir(parents=True, exist_ok=True)
    if not source.exists():
        run(["git", "clone", "--no-checkout", SOURCE_URL, source], ROOT)
        run(["git", "checkout", "--detach", SOURCE_PIN], source)
    head = run(["git", "rev-parse", "HEAD"], source, capture=True)
    if head != SOURCE_PIN:
        raise SystemExit(f"Песочница имеет другую ревизию: {head}. Существующие исходники не изменены.")
    if run(["git", "status", "--porcelain"], source, capture=True):
        raise SystemExit("Исходники официальной песочницы изменены. Сборка остановлена.")
    env = os.environ.copy()
    env["ANDROID_HOME"] = str(sdk)
    env["ANDROID_SDK_ROOT"] = str(sdk)
    env["GRADLE_USER_HOME"] = str(ROOT / ".work/official-gradle")
    android_user = ROOT / ".work/official-android-user"
    android_user.mkdir(parents=True, exist_ok=True)
    env["ANDROID_USER_HOME"] = str(android_user)
    if args.java_home:
        java_home = args.java_home.expanduser().resolve()
        env["JAVA_HOME"] = str(java_home)
        env["PATH"] = str(java_home / "bin") + os.pathsep + env.get("PATH", "")
    run(["/bin/sh", source / "gradlew", "--no-daemon", "--max-workers=2", ":app:assembleDebug"], source, env)
    if run(["git", "status", "--porcelain"], source, capture=True):
        raise SystemExit("После сборки обнаружено изменение официальных исходников; APK не скопирован.")
    target = ROOT / "artifacts/official-sandbox-android.apk"
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source / "app/build/outputs/apk/debug/app-debug.apk", target)
    run([sdk / "build-tools/36.0.0/apksigner", "verify", "--verbose", target], source, env)
    metadata = {"source": SOURCE_URL, "gitHead": SOURCE_PIN, "unchangedSource": True,
                "sha256": hashlib.sha256(target.read_bytes()).hexdigest(), "bytes": target.stat().st_size,
                "note": "Официальная песочница, игра открывается по URL, исходники не изменены"}
    target.with_suffix(".json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Готово: {target}\nSHA-256: {metadata['sha256']}")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.returncode)
