"""Unit tests for the translator system prompt builder."""

from __future__ import annotations

from app.pipeline.translator import build_system_prompt


def test_glossary_pairs_are_inlined() -> None:
    pairs = [
        ("GMOグローバルスタジオ", "GMO Global Studio"),
        ("ONAiR", "ONAiR"),
    ]
    prompt = build_system_prompt("en", max_chars=80, glossary_pairs=pairs)
    assert "English" in prompt
    assert '"GMOグローバルスタジオ" -> "GMO Global Studio"' in prompt
    assert '"ONAiR" -> "ONAiR"' in prompt
    assert "80-character" in prompt


def test_empty_glossary_emits_none_marker() -> None:
    prompt = build_system_prompt("vi", max_chars=70, glossary_pairs=[])
    assert "(none)" in prompt
    assert "Vietnamese" in prompt


def test_unknown_lang_falls_back_to_code() -> None:
    prompt = build_system_prompt("xx-XX", max_chars=60, glossary_pairs=[])
    assert "xx-XX" in prompt
