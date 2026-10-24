"""Provider-neutral imagery records and projected observation payloads."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class ImageRecord:
    provider: str
    image_id: str
    longitude: float
    latitude: float
    captured_at: datetime | None
    heading_degrees: float | None
    camera_side: str | None
    thumbnail_url: str | None
    attribution: dict[str, Any]
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_json(self) -> dict[str, Any]:
        return {
            'provider': self.provider,
            'image_id': self.image_id,
            'longitude': self.longitude,
            'latitude': self.latitude,
            'captured_at': self.captured_at.isoformat() if self.captured_at else None,
            'heading_degrees': self.heading_degrees,
            'camera_side': self.camera_side,
            'thumbnail_url': self.thumbnail_url,
            'attribution': self.attribution,
            'metadata': self.metadata,
        }


@dataclass(frozen=True)
class SegmentRecord:
    segment_id: str
    side: str
    coordinates: tuple[tuple[float, float], ...]
    properties: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Projection:
    segment_id: str
    side: str
    distance_m: float
    heading_delta_degrees: float | None
    confidence: float


@dataclass(frozen=True)
class ProjectedObservation:
    image: ImageRecord
    projection: Projection

    def to_supabase_row(self) -> dict[str, Any]:
        obstacle_type = self.image.metadata.get('obstacle_type')
        is_clear = bool(self.image.metadata.get('is_clear', False))
        if obstacle_type is None and not is_clear:
            raise ValueError(
                'an observation upload needs a reviewed obstacle_type or explicit is_clear=true; '
                'raw imagery metadata must not create a false clear observation'
            )
        return {
            'segment_id': self.projection.segment_id,
            'obstacle_type': obstacle_type,
            'confidence': self.projection.confidence,
            'source': 'harvester',
            'reporter_id': None,
            'photo_url': self.image.thumbnail_url,
            'attribution': self.image.attribution,
            'captured_at': self.image.captured_at.isoformat()
            if self.image.captured_at
            else datetime.now().astimezone().isoformat(),
            'heading_degrees': self.image.heading_degrees,
            'camera_side': self.image.camera_side,
            'projection_confidence': self.projection.confidence,
            'geom': f'POINT({self.image.longitude} {self.image.latitude})',
            'is_clear': is_clear,
            'metadata': {
                'provider': self.image.provider,
                'image_id': self.image.image_id,
                'projection_distance_m': self.projection.distance_m,
                'heading_delta_degrees': self.projection.heading_delta_degrees,
                **self.image.metadata,
            },
        }
