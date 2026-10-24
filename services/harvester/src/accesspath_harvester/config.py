"""Validated harvester configuration."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class BoundingBox:
    south: float
    west: float
    north: float
    east: float

    def validate(self) -> None:
        if not -90 <= self.south < self.north <= 90:
            raise ValueError('bbox latitude values must satisfy -90 <= south < north <= 90')
        if not -180 <= self.west < self.east <= 180:
            raise ValueError('bbox longitude values must satisfy -180 <= west < east <= 180')

    def as_mapillary(self) -> str:
        return f'{self.west},{self.south},{self.east},{self.north}'

    def as_dict(self) -> dict[str, float]:
        return {
            'south': self.south,
            'west': self.west,
            'north': self.north,
            'east': self.east,
        }


@dataclass(frozen=True)
class HarvesterConfig:
    name: str
    bbox: BoundingBox
    max_images: int = 1000
    request_page_size: int = 2000
    mapillary_tile_area_degrees_squared: float = 0.001
    projection_radius_m: float = 25.0
    heading_weight: float = 0.25

    def validate(self) -> None:
        if not self.name.strip():
            raise ValueError('harvester name must not be empty')
        self.bbox.validate()
        if self.max_images <= 0:
            raise ValueError('max_images must be greater than zero')
        if not 1 <= self.request_page_size <= 2000:
            raise ValueError('request_page_size must be between 1 and 2000')
        if self.mapillary_tile_area_degrees_squared <= 0:
            raise ValueError('mapillary_tile_area_degrees_squared must be greater than zero')
        if self.projection_radius_m <= 0:
            raise ValueError('projection_radius_m must be greater than zero')
        if self.heading_weight < 0:
            raise ValueError('heading_weight must not be negative')

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> 'HarvesterConfig':
        bbox_raw = raw.get('bbox')
        if not isinstance(bbox_raw, dict):
            raise ValueError('config.bbox must be an object')
        config = cls(
            name=str(raw.get('name', '')),
            bbox=BoundingBox(
                south=float(bbox_raw['south']),
                west=float(bbox_raw['west']),
                north=float(bbox_raw['north']),
                east=float(bbox_raw['east']),
            ),
            max_images=int(raw.get('max_images', 1000)),
            request_page_size=int(raw.get('request_page_size', 2000)),
            mapillary_tile_area_degrees_squared=float(
                raw.get('mapillary_tile_area_degrees_squared', 0.001)
            ),
            projection_radius_m=float(raw.get('projection_radius_m', 25.0)),
            heading_weight=float(raw.get('heading_weight', 0.25)),
        )
        config.validate()
        return config

    @classmethod
    def from_json(cls, path: Path) -> 'HarvesterConfig':
        with path.open('r', encoding='utf-8') as handle:
            raw = json.load(handle)
        if not isinstance(raw, dict):
            raise ValueError('configuration root must be a JSON object')
        return cls.from_dict(raw)
