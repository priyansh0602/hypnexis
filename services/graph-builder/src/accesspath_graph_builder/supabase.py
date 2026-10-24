"""Small PostgREST client for idempotent graph uploads.

The graph builder uses WKT strings because Postgres' geometry input type accepts
WKT and this avoids adding a Supabase SDK just for bulk inserts. The service-role
key is read from the local environment and is never printed.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from collections.abc import Iterable
from typing import Any

from .geometry import CrosswalkLink, FootpathSegment, linestring_wkt, project_to_wgs84


class SupabaseUploadError(RuntimeError):
    """Raised when a PostgREST upload fails."""


def _env_value(*names: str) -> str:
    for name in names:
        value = os.environ.get(name)
        if value:
            return value
    raise SupabaseUploadError(f'missing required environment variable: {" or ".join(names)}')


def _postgrest_request(path: str, payload: list[dict[str, Any]]) -> None:
    base_url = _env_value('SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL').rstrip('/')
    key = _env_value('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY')
    body = json.dumps(payload).encode('utf-8')
    request = urllib.request.Request(
        f'{base_url}/rest/v1/{path}',
        data=body,
        method='POST',
        headers={
            'apikey': key,
            'Authorization': f'Bearer {key}',
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=minimal',
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            if response.status not in (200, 201, 204):
                raise SupabaseUploadError(f'{path} returned HTTP {response.status}')
    except urllib.error.HTTPError as error:
        detail = error.read().decode('utf-8', errors='replace')[:500]
        raise SupabaseUploadError(f'{path} returned HTTP {error.code}: {detail}') from error


def _chunks(values: list[dict[str, Any]], size: int = 500) -> Iterable[list[dict[str, Any]]]:
    for start in range(0, len(values), size):
        yield values[start:start + size]


def upload_graph(
    roads: list[dict[str, Any]],
    segments: list[FootpathSegment],
    links: list[CrosswalkLink],
    transformer: Any,
) -> None:
    road_payload = []
    for road in roads:
        geometry = project_to_wgs84(road['geometry_projected'], transformer)
        road_payload.append({
            'id': road['id'],
            'osm_id': road['osm_id'],
            'name': road['name'],
            'highway_type': road['highway_type'],
            'geometry': geometry.wkt,
            'metadata': road['metadata'],
        })

    segment_payload = []
    for segment in segments:
        geometry = project_to_wgs84(segment.geometry_projected, transformer)
        segment_payload.append({
            'id': segment.id,
            'road_id': segment.road_id,
            'side': segment.side,
            'segment_index': segment.segment_index,
            'geometry': geometry.wkt,
            'length_m': segment.length_m,
            'status': 'grey',
            'difficulty_score': 25,
        })

    link_payload = []
    for link in links:
        geometry = project_to_wgs84(link.geometry_projected, transformer)
        link_payload.append({
            'id': link.id,
            'from_segment_id': link.from_segment_id,
            'to_segment_id': link.to_segment_id,
            'geometry': geometry.wkt,
            'ramp_flag': link.ramp_flag,
            'crossing_type': link.crossing_type,
            'metadata': link.metadata,
        })

    for chunk in _chunks(road_payload):
        _postgrest_request('roads?on_conflict=id', chunk)
    for chunk in _chunks(segment_payload):
        _postgrest_request('footpath_segments?on_conflict=id', chunk)
    for chunk in _chunks(link_payload):
        _postgrest_request('crosswalk_links?on_conflict=id', chunk)
