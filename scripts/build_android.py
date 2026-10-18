#!/usr/bin/env python3
"""Сборка автономного APK официальными инструментами SDK, без Gradle и библиотек."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parent.parent
BUILD_TOOLS = "36.0.0"
PLATFORM = "android-36"


def run(args: list[object], *, env: dict[str, str] | None = None, capture: bool = False) -> str:
    result = subprocess.run([str(arg) for arg in args], cwd=ROOT, env=env, check=True,
                            text=True, stdout=subprocess.PIPE if capture else None)
    return result.stdout.strip() if capture else ""


def digest_tree(path: Path) -> str:
    digest = hashlib.sha256()
    for source in sorted(path.rglob("*")):
        if source.is_symlink():
            raise SystemExit(f"Символические ссылки не допускаются в ресурсах: {source}")
        if source.is_file():
            digest.update(source.relative_to(path).as_posix().encode())
            digest.update(b"\0")
            digest.update(source.read_bytes())
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdk", type=Path, default=Path(os.environ.get("ANDROID_HOME", ROOT / ".work/android-sdk")))
    parser.add_argument("--java-home", type=Path, default=Path(os.environ["JAVA_HOME"]) if "JAVA_HOME" in os.environ else None)
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/bukva-za-bukvoy-android.apk")
    parser.add_argument("--check-tools", action="store_true", help="Проверить инструменты, не собирать")
    args = parser.parse_args()
    sdk = args.sdk.expanduser().resolve()
    java_home = args.java_home.expanduser().resolve() if args.java_home else None
    tools = sdk / "build-tools" / BUILD_TOOLS
    android_jar = sdk / "platforms" / PLATFORM / "android.jar"
    java = java_home / "bin/java" if java_home else Path(shutil.which("java") or "/missing-java")
    javac = java_home / "bin/javac" if java_home else Path(shutil.which("javac") or "/missing-javac")
    keytool = java_home / "bin/keytool" if java_home else Path(shutil.which("keytool") or "/missing-keytool")
    required = [java, javac, keytool, android_jar, tools / "aapt2", tools / "d8", tools / "zipalign", tools / "apksigner"]
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise SystemExit("Не найдены инструменты. См. docs/Сборка.md:\n" + "\n".join(missing))
    env = os.environ.copy()
    if java_home:
        env["JAVA_HOME"] = str(java_home)
        env["PATH"] = str(java_home / "bin") + os.pathsep + env.get("PATH", "")
    version = subprocess.run([str(java), "-version"], env=env, text=True, capture_output=True, check=True)
    if not re.search(r'version "21(?:\.|\")', version.stderr + version.stdout):
        raise SystemExit("Нужен JDK 21. Выберите его через --java-home или JAVA_HOME, без смены глобального JDK.")
    print(f"SDK: {sdk}\nBuild Tools: {BUILD_TOOLS}; API: 36; JDK: 21", flush=True)
    run([tools / "aapt2", "version"], env=env)
    if args.check_tools:
        return
    if not (ROOT / "game/index.html").is_file():
        raise SystemExit("Нет game/index.html: сначала подготовьте веб-игру.")
    initial_game_hash = digest_tree(ROOT / "game")
    initial_android_hash = digest_tree(ROOT / "android")
    build = ROOT / ".work/android-build"
    if build.exists():
        shutil.rmtree(build)
    build.mkdir(parents=True)
    classes = build / "classes"
    generated = build / "generated"
    dex = build / "dex"
    for directory in (classes, generated, dex):
        directory.mkdir()
    compiled_resources = build / "resources.zip"
    run([tools / "aapt2", "compile", "--dir", ROOT / "android/res", "-o", compiled_resources], env=env)
    unsigned = build / "unsigned.apk"
    run([tools / "aapt2", "link", "-o", unsigned, "--manifest", ROOT / "android/AndroidManifest.xml",
         "-I", android_jar, "--java", generated, "--min-sdk-version", "26", "--target-sdk-version", "36",
         "--version-code", "3", "--version-name", "1.3.0", "-A", ROOT / "game", compiled_resources], env=env)
    sources = sorted((ROOT / "android/src").rglob("*.java")) + sorted(generated.rglob("*.java"))
    # --release даёт полный Java-8 API компилятору (включая LambdaMetafactory),
    # android.jar остаётся источником Android API, d8 переносит lambda в dex.
    run([javac, "-encoding", "UTF-8", "--release", "8",
         "-classpath", android_jar, "-d", classes, *sources], env=env)
    run([tools / "d8", "--lib", android_jar, "--min-api", "26", "--output", dex,
         *sorted(classes.rglob("*.class"))], env=env)
    with zipfile.ZipFile(unsigned, "a", compression=zipfile.ZIP_DEFLATED) as apk:
        for source in sorted(dex.glob("*.dex")):
            apk.write(source, source.name)
    aligned = build / "aligned.apk"
    run([tools / "zipalign", "-f", "-p", "4", unsigned, aligned], env=env)

    # Отдельный локальный ключ. Пароль передаётся через окружение, значения не печатаются.
    signing = ROOT / ".work/android-signing"
    signing.mkdir(mode=0o700, exist_ok=True)
    password_file = signing / "password"
    key = signing / "development.jks"
    if not password_file.exists():
        if key.exists():
            raise SystemExit("Пароль существующего ключа отсутствует; ключ не перезаписан.")
        password_file.write_text(secrets.token_urlsafe(32), encoding="ascii")
        password_file.chmod(0o600)
    env["BUKVA_KEYSTORE_PASSWORD"] = password_file.read_text(encoding="ascii").strip()
    if not key.exists():
        run([keytool, "-genkeypair", "-keystore", key, "-storetype", "JKS", "-alias", "bukva-dev",
             "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000",
             "-storepass:env", "BUKVA_KEYSTORE_PASSWORD", "-keypass:env", "BUKVA_KEYSTORE_PASSWORD",
             "-dname", "CN=Bukva Development, O=Bukva za bukvoy, C=RU"], env=env)
        key.chmod(0o600)
    output = args.output.expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    run([tools / "apksigner", "sign", "--ks", key, "--ks-key-alias", "bukva-dev",
         "--ks-pass", "env:BUKVA_KEYSTORE_PASSWORD", "--key-pass", "env:BUKVA_KEYSTORE_PASSWORD",
         "--out", output, aligned], env=env)
    run([tools / "apksigner", "verify", "--verbose", output], env=env)
    run([tools / "zipalign", "-c", "-p", "4", output], env=env)
    if initial_game_hash != digest_tree(ROOT / "game") or initial_android_hash != digest_tree(ROOT / "android"):
        output.unlink(missing_ok=True)
        raise SystemExit("Исходники изменились во время сборки. APK удалён; повторите сборку в спокойной фазе.")
    source_head = run(["git", "rev-parse", "HEAD"], capture=True)
    metadata = {
        "applicationId": "ru.bukvazabukvoy.game", "name": "Буква за буквой",
        "versionName": "1.3.0", "versionCode": 3, "minSdk": 26, "targetSdk": 36,
        "buildTools": BUILD_TOOLS, "java": 21, "gitHead": source_head,
        "gameSha256": initial_game_hash, "androidSha256": initial_android_hash,
        "apkSha256": hashlib.sha256(output.read_bytes()).hexdigest(), "bytes": output.stat().st_size,
        "officialSandbox": False, "signing": "Локальный ключ разработки, вне Git"
    }
    output.with_suffix(".json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Готово: {output}\nРазмер: {metadata['bytes']} байт\nSHA-256: {metadata['apkSha256']}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        print(f"Сборка остановлена: код {error.returncode}, инструмент {Path(str(error.cmd[0])).name}", file=sys.stderr)
        raise SystemExit(error.returncode)
