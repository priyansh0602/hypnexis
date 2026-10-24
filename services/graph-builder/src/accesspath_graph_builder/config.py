"""Validated configuration for a repeatable pilot graph build."""

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

    @property
    def as_osmnx(self) -> tuple[float, float, float, float]:
        """Return OSMnx 2.x order: west, south, east, north."""

        return self.west, self.south, self.east, self.north

    def as_dict(self) -> dict[str, float]:
        return {
            'south': self.south,
            'west': self.west,
            'north': self.north,
            'east': self.east,
        }


@dataclass(frozen=True)
class GraphConfig:
    name: str
    bbox: BoundingBox
    segment_length_metres: float = 10.0
    footpath_offset_metres: float = 1.5
    road_filter: str = (
        '["highway"~"primary|secondary|tertiary|unclassified|residential|living_street|service|pedestrian"]'
    )
    city: str | None = None
    state: str | None = None
    country: str = 'India'

    def validate(self) -> None:
        if not self.name.strip():
            raise ValueError('pilot name must not be empty')
        self.bbox.validate()
        if self.segment_length_metres <= 0:
            raise ValueError('segment_length_metres must be greater than zero')
        if self.footpath_offset_metres <= 0:
            raise ValueError('footpath_offset_metres must be greater than zero')
        if not self.road_filter.strip():
            raise ValueError('road_filter must not be empty')

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> 'GraphConfig':
        bbox_raw = raw.get('bbox')
        if not isinstance(bbox_raw, dict):
            raise ValueError('config.bbox must be an object')

        config = cls(
            name=str(raw.get('name', '')),
            city=raw.get('city'),
            state=raw.get('state'),
            country=str(raw.get('country', 'India')),
            bbox=BoundingBox(
                south=float(bbox_raw['south']),
                west=float(bbox_raw['west']),
                north=float(bbox_raw['north']),
                east=float(bbox_raw['east']),
            ),
            segment_length_metres=float(raw.get('segment_length_metres', 10.0)),
            footpath_offset_metres=float(raw.get('footpath_offset_metres', 1.5)),
            road_filter=str(raw.get('road_filter', cls.road_filter)),
        )
        config.validate()
        return config

    @classmethod
    def from_json(cls, path: Path) -> 'GraphConfig':
        with path.open('r', encoding='utf-8') as handle:
            raw = json.load(handle)
        if not isinstance(raw, dict):
            raise ValueError('configuration root must be a JSON object')
        return cls.from_dict(raw)
