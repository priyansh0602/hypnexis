"""
Unit tests for DatasetConverter and ModelPackaging scripts.
"""

from pathlib import Path
import tempfile
import pytest
from dataset_converter import DatasetConverter
from package_model import package_model, ModelMetrics


def test_dataset_converter_validation():
    converter = DatasetConverter()

    # Valid annotation
    valid_ann = {
        "label": "pole",
        "bbox": [0.2, 0.3, 0.8, 0.4],
        "confidence": 0.85,
    }
    is_valid, msg = converter.validate_annotation(valid_ann)
    assert is_valid is True

    # Invalid coordinates (> 1.0)
    invalid_ann = {
        "label": "steps",
        "bbox": [0.2, 0.3, 1.2, 0.4],
        "confidence": 0.9,
    }
    is_valid, msg = converter.validate_annotation(invalid_ann)
    assert is_valid is False

    # Unknown class
    unknown_ann = {
        "label": "flying_carpet",
        "bbox": [0.1, 0.1, 0.5, 0.5],
        "confidence": 0.9,
    }
    is_valid, msg = converter.validate_annotation(unknown_ann)
    assert is_valid is False


def test_yolo_conversion():
    converter = DatasetConverter()
    annotations = [
        {"label": "pole", "bbox": [0.2, 0.3, 0.8, 0.5], "confidence": 0.9},
        {"label": "steps", "bbox": [0.5, 0.2, 0.9, 0.8], "confidence": 0.8},
    ]

    lines = converter.convert_to_yolo_txt(annotations)
    assert len(lines) == 2
    # Verify line format: class_idx x_center y_center width height
    parts = lines[0].split()
    assert len(parts) == 5
    assert float(parts[1]) == pytest.approx(0.4)  # (0.3 + 0.5) / 2
    assert float(parts[2]) == pytest.approx(0.5)  # (0.2 + 0.8) / 2


def test_model_packaging_permissive_license():
    with tempfile.NamedTemporaryFile(suffix=".tflite", delete=False) as tmp:
        tmp.write(b"MOCK_TFLITE_BYTES_FOR_UNIT_TESTING_1234567890")
        tmp_path = Path(tmp.name)

    try:
        record = package_model(
            model_file=tmp_path,
            model_name="accesspath-detector-nano",
            version="1.0.0",
            artifact_url_or_path="models/detector.tflite",
            model_license="Apache-2.0",
            weights_license="Apache-2.0",
        )

        assert record.model_name == "accesspath-detector-nano"
        assert len(record.sha256) == 64
        assert record.is_active is True
        assert record.metrics["quantization"] == "INT8"
    finally:
        tmp_path.unlink(missing_ok=True)


def test_model_packaging_rejects_agpl():
    with tempfile.NamedTemporaryFile(suffix=".tflite", delete=False) as tmp:
        tmp.write(b"MOCK")
        tmp_path = Path(tmp.name)

    try:
        with pytest.raises(ValueError, match="License violation"):
            package_model(
                model_file=tmp_path,
                model_name="test-model",
                version="0.0.1",
                artifact_url_or_path="models/test.tflite",
                model_license="AGPL-3.0",
            )
    finally:
        tmp_path.unlink(missing_ok=True)
