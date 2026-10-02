import pytest
from fastapi import HTTPException

from app.core.ai_logger import check_json_nesting_depth, validate_ai_prompt


def test_validate_ai_prompt_valid() -> None:
    prompt = "   Please analyze this invoice text.   "
    cleaned = validate_ai_prompt(prompt)
    assert cleaned == "Please analyze this invoice text."


def test_validate_ai_prompt_empty() -> None:
    with pytest.raises(HTTPException) as exc_info:
        validate_ai_prompt("    ")
    assert exc_info.value.status_code == 400
    assert "empty" in exc_info.value.detail.lower()


def test_validate_ai_prompt_oversized() -> None:
    large_prompt = "A" * 10001
    with pytest.raises(HTTPException) as exc_info:
        validate_ai_prompt(large_prompt)
    assert exc_info.value.status_code == 400
    assert "length" in exc_info.value.detail.lower() or "limit" in exc_info.value.detail.lower()


def test_check_json_nesting_depth() -> None:
    safe_data = {"a": {"b": {"c": "ok"}}}
    check_json_nesting_depth(safe_data, max_depth=5)

    deep_data: dict = {}
    curr = deep_data
    for i in range(12):
        curr[f"key_{i}"] = {}
        curr = curr[f"key_{i}"]

    with pytest.raises(HTTPException) as exc_info:
        check_json_nesting_depth(deep_data, max_depth=10)
    assert exc_info.value.status_code == 400
    assert "nesting" in exc_info.value.detail.lower()
