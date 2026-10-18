#!/usr/bin/env python3
"""Готовит автономный WWW только для iOS, не изменяя каноническую игру."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import tempfile


class PreparationError(ValueError):
    pass


MODULES = ("engine.js", "content.js", "icons.js", "bridge.js", "app.js")
EXPORTS = {
    "engine.js": {"ALPHABET", "VISIBLE_ROWS", "STATUS", "normalizeWord", "isRussianWord", "evaluateGuess", "keyboardKnowledge", "Round", "explainCell", "challengeCode", "normalizeChallenge", "findChallenge", "formatGuesses"},
    "content.js": {"FALLBACK_CONTENT", "validateContent", "loadContent"},
    "icons.js": {"icon"}, "bridge.js": {"createBridge"}, "app.js": set(),
}
IMPORT = re.compile(r"^import \{ ([A-Za-z0-9_, ]+) \} from '\./([a-z]+\.js)';$", re.MULTILINE)
EXPORT = re.compile(r"^export (?:(?:async )?function|const|let|class) ([A-Za-z_$][A-Za-z0-9_$]*)", re.MULTILINE)
FETCH = re.compile(r"const response = await fetch\(new URL\('\.\./data/words\.json', import\.meta\.url\), \{\s*signal: controller\.signal,\s*\}\);")
MARKER = ".bukva-ios-generated"


def fingerprints(source):
    result = {}
    for file in sorted(source.rglob("*")):
        if file.is_symlink():
            raise PreparationError("Символические ссылки в игре не допускаются")
        if file.is_file():
            result[file.relative_to(source).as_posix()] = hashlib.sha256(file.read_bytes()).hexdigest()
    return result


def pack_module(name, text, available, words):
    if "__BUKVA_IOS_" in text:
        raise PreparationError("Зарезервированное имя iOS найдено в модуле")
    imports = []
    def imported(match):
        symbols = [item.strip() for item in match.group(1).split(",")]
        dependency = match.group(2)
        if dependency not in available or any(not re.fullmatch(r"[A-Za-z_$][A-Za-z0-9_$]*", item) or item not in EXPORTS[dependency] for item in symbols):
            raise PreparationError("Неподдерживаемая зависимость или именованный импорт: " + name)
        imports.append(dependency)
        return "const { " + ", ".join(symbols) + " } = __BUKVA_IOS_MODULES[" + json.dumps(dependency) + "];"
    text = IMPORT.sub(imported, text)
    if name == "content.js":
        # Единственная транспортная адаптация: тот же validateContent получает полный JSON из APK-подобного bundle.
        replacement = "const response = { ok: true, json: async () => (" + words + ") };"
        text, count = FETCH.subn(lambda match: replacement, text)
        if count != 1:
            raise PreparationError("Изменился поддерживаемый контракт загрузки словаря")
    names = EXPORT.findall(text)
    if len(names) != len(set(names)) or set(names) != EXPORTS[name]:
        raise PreparationError("Изменились именованные экспорты модуля: " + name)
    text = EXPORT.sub(lambda match: match.group(0).replace("export ", "", 1), text)
    # Не пытаемся угадывать новое устройство ES-модулей: при другой форме сборка явно останавливается.
    if re.search(r"\bimport\s*(?:[({*'\"]|\.)|(?m:^\s*import\b)|(?m:^\s*export\b)", text):
        raise PreparationError("Обнаружен неподдерживаемый import/export: " + name)
    available.add(name)
    exports = ", ".join(sorted(names))
    return "__BUKVA_IOS_MODULES[" + json.dumps(name) + "] = (function () {\n'use strict';\n" + text + "\nreturn Object.freeze({ " + exports + " });\n})();\n"


def prepare(source, output):
    source, output = Path(source).resolve(), Path(output).resolve()
    if output.name != "WWW" or source == output or source in output.parents or output in source.parents:
        raise PreparationError("Выход должен быть отдельным каталогом WWW вне game/")
    before = fingerprints(source)
    raw = json.loads((source / "data/words.json").read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or not isinstance(raw.get("words"), list) or not isinstance(raw.get("accepted"), list):
        raise PreparationError("Некорректный полный словарь")
    encoded = json.dumps(raw, ensure_ascii=False, separators=(",", ":")).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    chunks = ["// Сгенерировано только для iOS. Источник — неизменённый game/.\n(function () {\n'use strict';\nconst __BUKVA_IOS_MODULES = Object.create(null);\n"]
    available = set()
    for name in MODULES:
        chunks.append(pack_module(name, (source / "js" / name).read_text(encoding="utf-8"), available, encoded))
    chunks.append("})();\n")
    html = (source / "index.html").read_text(encoding="utf-8")
    old = '<script type="module" src="./js/app.js"></script>'
    if html.count(old) != 1 or html.count("connect-src 'self'") != 1:
        raise PreparationError("Изменился поддерживаемый контракт HTML/CSP")
    html = html.replace(old, '<script defer src="./ios-bundle.js"></script>').replace("connect-src 'self'", "connect-src 'none'")
    if output.exists() and any(output.iterdir()) and not (output / MARKER).is_file():
        raise PreparationError("Каталог WWW не принадлежит генератору; существующие файлы сохранены")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix="WWW-prepare-", dir=output.parent))
    try:
        (temporary / MARKER).write_text("Буква за буквой: автономный iOS bundle\n", encoding="utf-8")
        (temporary / "index.html").write_text(html, encoding="utf-8")
        (temporary / "ios-bundle.js").write_text("".join(chunks), encoding="utf-8")
        shutil.copyfile(source / "styles.css", temporary / "styles.css")
        shutil.copytree(source / "assets", temporary / "assets")
        dictionary_license = source / "data/dictionary-license.json"
        if dictionary_license.is_file():
            shutil.copyfile(dictionary_license, temporary / "dictionary-license.json")
        manifest = {"format": "classic-iife-embedded-content", "canonicalFilesSha256": before,
                    "words": len(raw["words"]), "accepted": len(raw["accepted"])}
        (temporary / "ios-build.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if fingerprints(source) != before:
            raise PreparationError("Каноническая игра изменилась во время подготовки")
        if output.exists():
            shutil.rmtree(output)
        temporary.rename(output)
        return manifest
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parent.parent / "game")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = prepare(args.source, args.output)
    except (PreparationError, OSError, json.JSONDecodeError) as error:
        raise SystemExit("Подготовка iOS остановлена: " + str(error))
    print("WWW готов: %s ответов, %s допустимых догадок" % (result["words"], result["accepted"]))


if __name__ == "__main__":
    main()
