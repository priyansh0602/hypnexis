"""Pure geometry and stable-ID functions used by the graph builder."""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from typing import Any, Iterable

from shapely.geometry import LineString, Point
from shapely.ops import linemerge, substring, transform


@dataclass(frozen=True)
class FootpathSegment:
    id: str
    road_id: str
    road_key: str
    side: str
    segment_index: int
    geometry_projected: LineString
    length_m: float
    metadata: dict[str, Any]


@dataclass(frozen=True)
class CrosswalkLink:
    id: str
    from_segment_id: str
    to_segment_id: str
    geometry_projected: LineString
    ramp_flag: bool
    crossing_type: str
    metadata: dict[str, Any]


def deterministic_uuid(value: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f'https://accesspath.app/id/{value}'))


def stable_hash(value: str, length: int = 16) -> str:
    return hashlib.sha256(value.encode('utf-8')).hexdigest()[:length]


def canonical_line(line: LineString) -> LineString:
    """Orient a line deterministically so left/right do not flip between runs."""

    coordinates = list(line.coords)
    if len(coordinates) < 2:
        raise ValueError('a road geometry must contain at least two coordinates')

    first = (round(coordinates[0][0], 6), round(coordinates[0][1], 6))
    last = (round(coordinates[-1][0], 6), round(coordinates[-1][1], 6))
    if first <= last:
        return LineString(coordinates)
    return LineString(reversed(coordinates))


def choose_longest_line(geometry: Any) -> LineString:
    if geometry is None or geometry.is_empty:
        raise ValueError('cannot offset an empty geometry')
    if isinstance(geometry, LineString):
        return geometry
    if geometry.geom_type == 'MultiLineString':
        longest = max(geometry.geoms, key=lambda candidate: candidate.length)
        return LineString(longest.coords)
    merged = linemerge(geometry)
    if isinstance(merged, LineString):
        return merged
    if merged.geom_type == 'MultiLineString':
        longest = max(merged.geoms, key=lambda candidate: candidate.length)
        return LineString(longest.coords)
    raise ValueError(f'expected a line geometry, got {geometry.geom_type}')


def offset_line(line: LineString, distance_m: float) -> LineString:
    offset_curve = getattr(line, 'offset_curve', None)
    if offset_curve is not None:
        return choose_longest_line(offset_curve(distance_m, join_style=2))
    return choose_longest_line(line.parallel_offset(abs(distance_m), 'left' if distance_m >= 0 else 'right'))


def split_line(line: LineString, target_length_m: float) -> list[LineString]:
    """Split a projected line into stable, non-empty pieces near the target length."""

    if target_length_m <= 0:
        raise ValueError('target_length_m must be greater than zero')
    if line.length <= 0:
        return []

    count = max(1, int(-(-line.length // target_length_m)))
    step = line.length / count
    pieces: list[LineString] = []
    for index in range(count):
        start = index * step
        end = line.length if index == count - 1 else (index + 1) * step
        piece = choose_longest_line(substring(line, start, end))
        if piece.length > 0:
            pieces.append(piece)
    return pieces


def road_key(
    osm_ids: Iterable[int],
    start: Point,
    end: Point,
) -> str:
    identifiers = ','.join(str(value) for value in sorted(set(osm_ids))) or 'unknown'
    endpoints = sorted(
        (
            f'{start.x:.3f},{start.y:.3f}',
            f'{end.x:.3f},{end.y:.3f}',
        )
    )
    return f'osm:{identifiers}|endpoints:{endpoints[0]}:{endpoints[1]}'


def segment_id(road_key_value: str, side: str, index: int) -> str:
    return f'seg-{stable_hash(road_key_value)}-{side}-{index:04d}'


def project_to_wgs84(geometry: LineString, transformer: Any) -> LineString:
    return transform(transformer.transform, geometry)


def linestring_wkt(geometry: LineString) -> str:
    return geometry.wkt


def linestring_geojson(geometry: LineString) -> dict[str, Any]:
    return {
        'type': 'LineString',
        'coordinates': [[float(x), float(y)] for x, y, *_ in geometry.coords],
    }


def segment_feature(segment: FootpathSegment, transformer: Any) -> dict[str, Any]:
    geometry = project_to_wgs84(segment.geometry_projected, transformer)
    return {
        'type': 'Feature',
        'id': segment.id,
        'properties': {
            'id': segment.id,
            'road_id': segment.road_id,
            'side': segment.side,
            'segment_index': segment.segment_index,
            'length_m': round(segment.length_m, 3),
            'status': 'grey',
            **segment.metadata,
        },
        'geometry': linestring_geojson(geometry),
    }
