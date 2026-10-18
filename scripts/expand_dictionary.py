#!/usr/bin/env python3
"""Расширяет только список допустимых догадок проверенным списком существительных."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
WORDS_PATH = ROOT / "game/data/words.json"
SOURCE_URL = (
    "https://raw.githubusercontent.com/Harrix/Russian-Nouns/"
    "e7d14d32cbf31e01ee195d0c599233d8f6e6af57/dist/russian_nouns.txt"
)
SOURCE_SHA256 = "661949699919aa968dd0033f7bdd8abbe4db09d161b565f3f0181283fd0d0da7"
WORD_RE = re.compile(r"^[А-ЯЁ]{4,7}$")

# Простое внешнее исключение очевидной ненормативной лексики и грубых ругательств.
# Это не возрастная экспертиза списка.
BLOCKED_PARTS = (
    "бляд", "блят", "еба", "ебл", "ебн", "ебу", "пизд", "хуй", "хуе",
    "херн", "херов", "мудак", "мудил", "мудозв", "гандон", "залуп", "сука",
    "говн", "дерьм", "жоп", "срат", "ссак", "педик", "шлюх", "уеб",
)


def fetch_source() -> bytes:
    request = Request(SOURCE_URL, headers={"User-Agent": "bukva-za-bukvoy-dictionary-builder"})
    with urlopen(request, timeout=30) as response:
        source = response.read()
    digest = hashlib.sha256(source).hexdigest()
    if digest != SOURCE_SHA256:
        raise SystemExit(f"SHA-256 источника не совпадает: {digest}")
    return source


def accepted_from(source: bytes) -> list[str]:
    try:
        lines = source.decode("utf-8").splitlines()
    except UnicodeDecodeError as error:
        raise SystemExit(f"Источник не является UTF-8: {error}") from error

    result: set[str] = set()
    for line in lines:
        candidate = line.strip().upper()
        if not WORD_RE.fullmatch(candidate):
            continue
        if is_blocked(candidate):
            continue
        result.add(candidate)
        # Принимаем ввод с Е, сохраняя нормативное написание с Ё в словаре.
        if "Ё" in candidate:
            result.add(candidate.replace("Ё", "Е"))
    return sorted(result)


def is_blocked(word: str) -> bool:
    normalized = word.lower().replace("ё", "е")
    return any(fragment in normalized for fragment in BLOCKED_PARTS) or normalized in {"хер", "мудила"}


def main() -> None:
    source = fetch_source()
    additions = accepted_from(source)
    data = json.loads(WORDS_PATH.read_text(encoding="utf-8"))
    if not isinstance(data.get("words"), list) or not isinstance(data.get("accepted"), list):
        raise SystemExit("Ожидается JSON со списками words и accepted")

    primary_snapshot = json.dumps(data["words"], ensure_ascii=False, separators=(",", ":"))
    primary_words = [entry["word"] for entry in data["words"]]
    old_accepted = [word for word in data["accepted"] if not is_blocked(word)]
    merged = list(dict.fromkeys([*old_accepted, *additions, *primary_words]))
    if not set(primary_words).issubset(merged):
        raise SystemExit("Основные ответы должны оставаться в accepted")

    data["accepted"] = merged
    if json.dumps(data["words"], ensure_ascii=False, separators=(",", ":")) != primary_snapshot:
        raise SystemExit("Изменение основного набора ответов запрещено")
    WORDS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    counts = {length: sum(len(word) == length for word in merged) for length in range(4, 8)}
    print(json.dumps({
        "source_url": SOURCE_URL,
        "source_sha256": SOURCE_SHA256,
        "source_lines": len(source.splitlines()),
        "source_candidates": len(additions),
        "accepted_total": len(merged),
        "accepted_by_length": counts,
        "primary_answers": len(primary_words),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
