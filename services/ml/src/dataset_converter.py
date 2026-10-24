"""
Dataset Converter & Validator for AccessPath Obstacle Detection.

Converts zero-shot auto-labeled detections (OWLv2 / Grounding DINO / Mapillary)
into standard YOLO and COCO detection formats with train/validation splits
and dataset integrity checks.
"""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Tuple
import numpy as np

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Canonical obstacle classes adhering to permissive schema
OBSTACLE_CLASSES = [
    "steps",
    "pole",
    "parked_vehicle",
    "vendor_cart",
    "garbage_rubble",
    "construction_material",
    "missing_kerb_ramp",
]

CLASS_TO_IDX = {name: idx for idx, name in enumerate(OBSTACLE_CLASSES)}


class DatasetConverter:
    """Validates and converts auto-labeled annotations to training datasets."""

    def __init__(self, class_list: List[str] = OBSTACLE_CLASSES):
        self.class_list = class_list
        self.class_to_idx = {name: idx for idx, name in enumerate(class_list)}

    def validate_annotation(self, ann: Dict[str, Any]) -> Tuple[bool, str]:
        """Validates that a single bounding box annotation conforms to format requirements."""
        if "label" not in ann or ann["label"] not in self.class_to_idx:
            return False, f"Unknown label '{ann.get('label')}'"

        bbox = ann.get("bbox")
        if not bbox or len(bbox) != 4:
            return False, f"Invalid bbox format {bbox}"

        ymin, xmin, ymax, xmax = bbox
        if not (0.0 <= xmin <= xmax <= 1.0 and 0.0 <= ymin <= ymax <= 1.0):
            return False, f"Bbox values outside [0, 1] range: {bbox}"

        confidence = ann.get("confidence", 1.0)
        if not (0.0 <= confidence <= 1.0):
            return False, f"Confidence outside [0, 1]: {confidence}"

        return True, "Valid"

    def convert_to_yolo_txt(
        self,
        annotations: List[Dict[str, Any]],
        confidence_threshold: float = 0.35,
    ) -> List[str]:
        """
        Converts normalized [ymin, xmin, ymax, xmax] annotations to YOLO format lines:
        <class_idx> <x_center> <y_center> <width> <height>
        """
        lines = []
        for ann in annotations:
            if ann.get("confidence", 1.0) < confidence_threshold:
                continue

            valid, reason = self.validate_annotation(ann)
            if not valid:
                logger.warning(f"Skipping invalid annotation: {reason}")
                continue

            class_idx = self.class_to_idx[ann["label"]]
            ymin, xmin, ymax, xmax = ann["bbox"]

            x_center = (xmin + xmax) / 2.0
            y_center = (ymin + ymax) / 2.0
            width = xmax - xmin
            height = ymax - ymin

            lines.append(
                f"{class_idx} {x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f}"
            )
        return lines

    def convert_to_coco_format(
        self,
        samples: List[Dict[str, Any]],
        image_dir: str = "images",
    ) -> Dict[str, Any]:
        """
        Converts a collection of labeled samples into standard COCO JSON format.
        """
        categories = [
            {"id": idx, "name": name, "supercategory": "obstacle"}
            for idx, name in enumerate(self.class_list)
        ]

        images = []
        coco_annotations = []
        ann_id = 1

        for img_idx, sample in enumerate(samples, start=1):
            file_name = sample.get("file_name", f"image_{img_idx:06d}.jpg")
            img_w = sample.get("width", 1920)
            img_h = sample.get("height", 1080)

            images.append(
                {
                    "id": img_idx,
                    "file_name": file_name,
                    "width": img_w,
                    "height": img_h,
                }
            )

            for ann in sample.get("annotations", []):
                valid, _ = self.validate_annotation(ann)
                if not valid:
                    continue

                ymin, xmin, ymax, xmax = ann["bbox"]
                px_x = xmin * img_w
                px_y = ymin * img_h
                px_w = (xmax - xmin) * img_w
                px_h = (ymax - ymin) * img_h
                area = px_w * px_h

                coco_annotations.append(
                    {
                        "id": ann_id,
                        "image_id": img_idx,
                        "category_id": self.class_to_idx[ann["label"]],
                        "bbox": [round(px_x, 2), round(px_y, 2), round(px_w, 2), round(px_h, 2)],
                        "area": round(area, 2),
                        "score": ann.get("confidence", 1.0),
                        "iscrowd": 0,
                    }
                )
                ann_id += 1

        return {
            "info": {
                "description": "AccessPath Sidewalk Obstacle Detection Dataset",
                "year": 2026,
                "version": "1.0",
                "license": "CC-BY-4.0",
            },
            "categories": categories,
            "images": images,
            "annotations": coco_annotations,
        }

    def split_dataset(
        self,
        samples: List[Dict[str, Any]],
        val_ratio: float = 0.2,
        seed: int = 42,
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Partitions samples into train and validation sets with reproducible seed."""
        rng = np.random.default_rng(seed)
        shuffled = list(samples)
        rng.shuffle(shuffled)

        val_size = max(1, int(len(shuffled) * val_ratio))
        val_samples = shuffled[:val_size]
        train_samples = shuffled[val_size:]
        return train_samples, val_samples


def main():
    parser = argparse.ArgumentParser(description="Convert AccessPath auto-labeled data to standard formats.")
    parser.add_argument("--input", type=str, required=True, help="Input JSON file with auto-labeled detections")
    parser.add_argument("--output-dir", type=str, default="data/processed", help="Output directory")
    parser.add_argument("--format", choices=["yolo", "coco"], default="coco")
    parser.add_argument("--val-ratio", type=float, default=0.2)
    args = parser.parse_args()

    with open(args.input, "r", encoding="utf-8") as f:
        data = json.load(f)

    samples = data if isinstance(data, list) else data.get("samples", [])
    converter = DatasetConverter()

    train, val = converter.split_dataset(samples, val_ratio=args.val_ratio)
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.format == "coco":
        train_coco = converter.convert_to_coco_format(train)
        val_coco = converter.convert_to_coco_format(val)

        with open(out_dir / "instances_train.json", "w", encoding="utf-8") as f:
            json.dump(train_coco, f, indent=2)

        with open(out_dir / "instances_val.json", "w", encoding="utf-8") as f:
            json.dump(val_coco, f, indent=2)

        logger.info(f"COCO dataset saved to {out_dir}: {len(train)} train, {len(val)} val samples.")


if __name__ == "__main__":
    main()
