#!/usr/bin/env python3
"""Собирает Xcode-проект без аккаунта Apple и упаковывает .app с метаданными."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import plistlib
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
PROJECT = ROOT / "ios/BukvaZaBukvoy.xcodeproj"
SCHEME = "BukvaZaBukvoy"


def run(args, env, capture=False):
    result = subprocess.run([str(item) for item in args], cwd=ROOT, env=env, check=True,
                            text=True, stdout=subprocess.PIPE if capture else None)
    return result.stdout.strip() if capture else ""


def tree_hash(folder):
    digest = hashlib.sha256()
    for file in sorted(folder.rglob("*")):
        if "xcuserdata" in file.parts or file.suffix == ".xcuserstate":
            continue
        if file.is_symlink():
            raise SystemExit("Символическая ссылка в исходниках не допускается: " + str(file))
        if file.is_file() and "__pycache__" not in file.parts:
            digest.update(file.relative_to(folder).as_posix().encode("utf-8"))
            digest.update(b"\0")
            digest.update(file.read_bytes())
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", choices=("simulator", "device-unsigned"), default="simulator")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--developer-dir", type=Path, default=Path(os.environ.get("DEVELOPER_DIR", "/Applications/Xcode.app/Contents/Developer")))
    parser.add_argument("--simulator-archs", choices=("universal", "native"), default="universal")
    args = parser.parse_args()
    output = (args.output or ROOT / "artifacts" / ("bukva-za-bukvoy-ios-" + args.target + ".zip")).expanduser().resolve()
    if output.suffix != ".zip":
        raise SystemExit("Выход сборки должен иметь расширение .zip")
    for destination in (output, output.with_suffix(".json").resolve()):
        if any(destination == ROOT / name or ROOT / name in destination.parents for name in ("game", "ios")):
            raise SystemExit("Артефакты нельзя записывать внутрь game/ или ios/; исходники сохранены.")
    if platform.system() != "Darwin":
        raise SystemExit("Для сборки iOS нужен Mac с Xcode. См. docs/Установка iOS.md.")
    developer = args.developer_dir.resolve()
    if not (developer / "usr/bin/xcodebuild").is_file():
        raise SystemExit("Не найден Xcode в выбранном DEVELOPER_DIR: " + str(developer))
    env = os.environ.copy()
    env["DEVELOPER_DIR"] = str(developer)
    version = run(["/usr/bin/xcodebuild", "-version"], env, True)
    run(["/usr/bin/xcodebuild", "-checkFirstLaunchStatus"], env)
    before_game, before_ios = tree_hash(ROOT / "game"), tree_hash(ROOT / "ios")
    target = args.target
    simulator = target == "simulator"
    configuration = "Debug" if simulator else "Release"
    directory = ROOT / ".work/ios-build" / ("simulator" if simulator else "device")
    native_arch = "arm64" if platform.machine() in ("arm64", "aarch64") else "x86_64"
    architectures = "arm64 x86_64" if simulator and args.simulator_archs == "universal" else native_arch if simulator else "arm64"
    sdk = "iphonesimulator" if simulator else "iphoneos"
    print("Xcode: %s\nНазначение: %s; архитектуры: %s" % (version.replace("\n", "; "), target, architectures), flush=True)
    run(["/usr/bin/xcodebuild", "-project", PROJECT, "-scheme", SCHEME, "-configuration", configuration,
         "-sdk", sdk, "-destination", "generic/platform=iOS Simulator" if simulator else "generic/platform=iOS",
         "-derivedDataPath", directory, "-parallelizeTargets", "-jobs", "2", "CODE_SIGNING_ALLOWED=NO",
         "CODE_SIGNING_REQUIRED=NO", "CODE_SIGN_IDENTITY=", "ONLY_ACTIVE_ARCH=NO", "ARCHS=" + architectures, "build"], env)
    app = directory / "Build/Products" / (configuration + "-" + sdk) / "BukvaZaBukvoy.app"
    if not app.is_dir():
        raise SystemExit("Xcode не создал ожидаемое приложение: " + str(app))
    actual_archs = run(["/usr/bin/xcrun", "lipo", "-archs", app / "BukvaZaBukvoy"], env, True).split()
    if set(actual_archs) != set(architectures.split()):
        raise SystemExit("Архитектуры приложения не совпали с запрошенными: " + " ".join(actual_archs))
    info = plistlib.loads((app / "Info.plist").read_bytes())
    web = json.loads((app / "WWW/ios-build.json").read_text(encoding="utf-8"))
    if before_game != tree_hash(ROOT / "game") or before_ios != tree_hash(ROOT / "ios"):
        raise SystemExit("Исходники изменились во время сборки. ZIP не создан; повторите в спокойной фазе.")
    head = run(["git", "rev-parse", "HEAD"], env, True)
    metadata = {
        "name": "Буква за буквой", "bundleIdentifier": info["CFBundleIdentifier"],
        "version": info["CFBundleShortVersionString"], "build": info["CFBundleVersion"],
        "minimumIOS": info["MinimumOSVersion"], "target": target, "architectures": actual_archs,
        "xcode": version, "developerDir": str(developer), "gitHead": head,
        "gameSha256": before_game, "iosSha256": before_ios, "appSha256": tree_hash(app),
        "createdAtUtc": datetime.now(timezone.utc).isoformat(), "web": web,
        "appPath": str(app), "signedForDevice": False,
        "note": "Для Simulator, не устанавливается на iPhone" if simulator else "Неподписанная сборка для проверки компиляции; не устанавливается на iPhone",
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    handle, name = tempfile.mkstemp(prefix="ios-package-", suffix=".zip", dir=output.parent)
    os.close(handle)
    temporary = Path(name)
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for file in sorted(app.rglob("*")):
                if file.is_symlink():
                    raise SystemExit("Неожиданная символическая ссылка в .app: " + str(file))
                if file.is_file():
                    archive.write(file, "BukvaZaBukvoy.app/" + file.relative_to(app).as_posix())
            archive.writestr("metadata.json", json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
    metadata["zipSha256"] = hashlib.sha256(output.read_bytes()).hexdigest()
    metadata["bytes"] = output.stat().st_size
    output.with_suffix(".json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Готово: %s\nПриложение: %s\nРазмер ZIP: %s байт\nSHA-256: %s" % (output, app, metadata["bytes"], metadata["zipSha256"]), flush=True)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.returncode)
