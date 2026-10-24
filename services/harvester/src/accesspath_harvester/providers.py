"""Mapillary and KartaView metadata clients.

Mapillary is queried by bounding-box tiles and cursor pagination. KartaView's
public API is provider-limited, so its adapter queries a bounded tile center
with a radius and records that limitation in metadata.
"""

from __future__ import annotations

import math
import os
from datetime import datetime, timezone
from typing import Any, Iterator, Protocol

import requests

from .config import BoundingBox
from .models import ImageRecord


class ProviderError(RuntimeError):
    """Raised when an imagery provider cannot return usable metadata."""


class HttpSession(Protocol):
    headers: Any

    def get(self, url: str, params: dict[str, Any] | None = None, timeout: int = 60) -> Any:
        ...


def _parse_timestamp(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError:
            return None
    return None


def _float_or_none(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _geometry_point(item: dict[str, Any]) -> tuple[float, float] | None:
    for key in ('computed_geometry', 'geometry'):
        geometry = item.get(key)
        if not isinstance(geometry, dict):
            continue
        coordinates = geometry.get('coordinates')
        if isinstance(coordinates, list) and len(coordinates) >= 2:
            return float(coordinates[0]), float(coordinates[1])
    return None


def _creator_attribution(item: dict[str, Any]) -> dict[str, Any]:
    creator = item.get('creator') or {}
    if not isinstance(creator, dict):
        creator = {}
    return {
        'provider': 'Mapillary',
        'license': 'CC BY-SA 4.0',
        'attribution_required': True,
        'creator_id': creator.get('id'),
        'creator_username': creator.get('username'),
        'creator_name': creator.get('name'),
        'source_url': f"https://www.mapillary.com/app/?pKey={item.get('id')}",
    }


class MapillaryClient:
    endpoint = 'https://graph.mapillary.com/images'

    def __init__(self, token: str | None = None, session: HttpSession | None = None) -> None:
        self.token = token or os.getenv('MAPILLARY_ACCESS_TOKEN')
        if not self.token:
            raise ProviderError('MAPILLARY_ACCESS_TOKEN is required for Mapillary harvesting')
        self.session = session or requests.Session()
        self.session.headers.update(
            {
                'Authorization': f'OAuth {self.token}',
                'User-Agent': 'AccessPath/0.1 (open accessibility pilot)',
            }
        )

    @staticmethod
    def _tiles(bbox: BoundingBox, max_area: float) -> Iterator[BoundingBox]:
        width = bbox.east - bbox.west
        height = bbox.north - bbox.south
        tile_width = min(width, math.sqrt(max_area))
        tile_height = min(height, math.sqrt(max_area))
        columns = max(1, math.ceil(width / tile_width))
        rows = max(1, math.ceil(height / tile_height))
        for row in range(rows):
            south = bbox.south + height * row / rows
            north = bbox.south + height * (row + 1) / rows
            for column in range(columns):
                west = bbox.west + width * column / columns
                east = bbox.west + width * (column + 1) / columns
                yield BoundingBox(south=south, west=west, north=north, east=east)

    def iter_images(
        self,
        bbox: BoundingBox,
        max_images: int,
        page_size: int = 2000,
        tile_area_degrees_squared: float = 0.001,
    ) -> Iterator[ImageRecord]:
        seen: set[str] = set()
        for tile in self._tiles(bbox, tile_area_degrees_squared):
            cursor: str | None = None
            while len(seen) < max_images:
                params = {
                    'bbox': tile.as_mapillary(),
                    'fields': ','.join(
                        [
                            'id',
                            'geometry',
                            'computed_geometry',
                            'captured_at',
                            'compass_angle',
                            'computed_compass_angle',
                            'creator',
                            'sequence',
                            'thumb_1024_url',
                            'thumb_2048_url',
                        ]
                    ),
                    'limit': min(page_size, 2000),
                }
                if cursor:
                    params['after'] = cursor
                response = self.session.get(self.endpoint, params=params, timeout=60)
                if not response.ok:
                    raise ProviderError(f'Mapillary HTTP {response.status_code}: {response.text[:400]}')
                payload = response.json()
                data = payload.get('data', [])
                if not data:
                    break
                for item in data:
                    image_id = str(item.get('id', ''))
                    point = _geometry_point(item)
                    if not image_id or point is None or image_id in seen:
                        continue
                    seen.add(image_id)
                    yield ImageRecord(
                        provider='mapillary',
                        image_id=image_id,
                        longitude=point[0],
                        latitude=point[1],
                        captured_at=_parse_timestamp(item.get('captured_at')),
                        heading_degrees=_float_or_none(
                            item.get('computed_compass_angle', item.get('compass_angle'))
                        ),
                        camera_side=None,
                        thumbnail_url=item.get('thumb_2048_url') or item.get('thumb_1024_url'),
                        attribution=_creator_attribution(item),
                        metadata={
                            'sequence': item.get('sequence'),
                            'provider_license': 'CC BY-SA 4.0',
                            'raw_provider': item,
                        },
                    )
                    if len(seen) >= max_images:
                        break
                cursor = (payload.get('paging') or {}).get('cursors', {}).get('after')
                if not cursor or len(data) < page_size:
                    break


class KartaViewClient:
    endpoint = 'https://api.kartaview.org/2.0/photo/'

    def __init__(self, base_url: str | None = None, session: HttpSession | None = None) -> None:
        self.endpoint = (base_url or os.getenv('KARTAVIEW_API_BASE_URL') or self.endpoint).rstrip('/') + '/'
        self.session = session or requests.Session()
        self.session.headers.update({'User-Agent': 'AccessPath/0.1 (open accessibility pilot)'})

    def iter_images(self, bbox: BoundingBox, max_images: int) -> Iterator[ImageRecord]:
        seen: set[str] = set()
        # KartaView's public v2 endpoint accepts a center/radius query with a
        # maximum radius of 500 m, unlike Mapillary's bbox/cursor API. Tile the
        # pilot area into bounded center queries and filter returned points back
        # to the requested bbox.
        width_m = max(1.0, (bbox.east - bbox.west) * 111_000)
        height_m = max(1.0, (bbox.north - bbox.south) * 111_000)
        columns = max(1, math.ceil(width_m / 800))
        rows_count = max(1, math.ceil(height_m / 800))
        for row_index in range(rows_count):
            center_lat = bbox.south + (row_index + 0.5) * (bbox.north - bbox.south) / rows_count
            for column_index in range(columns):
                center_lng = bbox.west + (column_index + 0.5) * (bbox.east - bbox.west) / columns
                params = {'lat': center_lat, 'lng': center_lng, 'radius': 500}
                response = self.session.get(self.endpoint, params=params, timeout=60)
                if not response.ok:
                    raise ProviderError(
                        f'KartaView HTTP {response.status_code}: {response.text[:400]}'
                    )
                payload = response.json()
                rows = payload.get('result', {}).get('data', payload.get('data', []))
                if not isinstance(rows, list):
                    raise ProviderError('KartaView response did not contain an image list')
                for item in rows:
                    if not isinstance(item, dict):
                        continue
                    image_id = str(item.get('id') or item.get('photo_id') or '')
                    longitude = _float_or_none(item.get('lng', item.get('longitude')))
                    latitude = _float_or_none(item.get('lat', item.get('latitude')))
                    if (
                        not image_id
                        or image_id in seen
                        or longitude is None
                        or latitude is None
                        or not (bbox.west <= longitude <= bbox.east)
                        or not (bbox.south <= latitude <= bbox.north)
                    ):
                        continue
                    seen.add(image_id)
                    yield ImageRecord(
                        provider='kartaview',
                        image_id=image_id,
                        longitude=longitude,
                        latitude=latitude,
                        captured_at=_parse_timestamp(item.get('shotDate') or item.get('captured_at')),
                        heading_degrees=_float_or_none(item.get('heading')),
                        camera_side=None,
                        thumbnail_url=item.get('imageThUrl') or item.get('fileurlTh'),
                        attribution={
                            'provider': 'KartaView',
                            'license': 'KartaView terms/licence; verify attribution at release time',
                            'attribution_required': True,
                            'source_url': f"https://kartaview.org/details/{item.get('id')}",
                        },
                        metadata={
                            'provider_query': 'tiled bounded center/radius',
                            'provider_license': 'KartaView terms/licence; verify before publication',
                            'raw_provider': item,
                        },
                    )
                    if len(seen) >= max_images:
                        return
