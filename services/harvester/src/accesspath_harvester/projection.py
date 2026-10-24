"""Project image locations/headings onto the nearest left/right segment."""

from __future__ import annotations

import json
import math
from numbers import Integral
from pathlib import Path
from typing import Any

from pyproj import Transformer
from shapely.geometry import LineString, Point, shape
from shapely.strtree import STRtree

from .models import ImageRecord, Projection, SegmentRecord


def _angle_delta(first: float | None, second: float | None) -> float | None:
    if first is None or second is None:
        return None
    return abs((first - second + 180) % 360 - 180)


def _bearing_degrees(line: LineString, distance: float) -> float:
    epsilon = min(2.0, max(0.25, line.length / 20))
    start = line.interpolate(max(0, distance - epsilon))
    end = line.interpolate(min(line.length, distance + epsilon))
    return math.degrees(math.atan2(end.x - start.x, end.y - start.y)) % 360


def _confidence(distance_m: float, heading_delta: float | None, radius_m: float) -> float:
    distance_score = max(0.0, 1.0 - distance_m / radius_m)
    heading_score = 1.0 if heading_delta is None else max(0.0, 1.0 - heading_delta / 180)
    return round(max(0.0, min(1.0, 0.75 * distance_score + 0.25 * heading_score)), 4)


class SegmentProjector:
    def __init__(self, segments: list[SegmentRecord], radius_m: float = 25.0) -> None:
        if not segments:
            raise ValueError('at least one segment is required')
        self.segments = segments
        self.radius_m = radius_m
        self.transformer = Transformer.from_crs('EPSG:4326', 'EPSG:3857', always_xy=True)
        self.inverse_transformer = Transformer.from_crs('EPSG:3857', 'EPSG:4326', always_xy=True)
        self.projected_geometries = [
            LineString([self.transformer.transform(lon, lat) for lon, lat in segment.coordinates])
            for segment in segments
        ]
        self.tree = STRtree(self.projected_geometries)

    @classmethod
    def from_geojson(cls, path: Path, radius_m: float = 25.0) -> 'SegmentProjector':
        payload = json.loads(path.read_text(encoding='utf-8'))
        segments: list[SegmentRecord] = []
        for feature in payload.get('features', []):
            properties = feature.get('properties') or {}
            if properties.get('side') not in {'L', 'R'}:
                continue
            geometry = shape(feature.get('geometry'))
            if geometry.geom_type != 'LineString':
                continue
            segments.append(
                SegmentRecord(
                    segment_id=str(properties['id']),
                    side=str(properties['side']),
                    coordinates=tuple((float(x), float(y)) for x, y in geometry.coords),
                    properties=properties,
                )
            )
        return cls(segments, radius_m)

    def project(self, image: ImageRecord) -> Projection | None:
        point = Point(self.transformer.transform(image.longitude, image.latitude))
        nearest_index = self.tree.nearest(point)
        candidate_indices: list[int]
        if isinstance(nearest_index, Integral):
            candidate_indices = [int(nearest_index)]
        else:
            candidate_indices = [int(nearest_index)]

        # Check nearby candidates as well so heading can disambiguate parallel
        # left/right paths around the same road.
        nearby = self.tree.query(point.buffer(self.radius_m))
        for item in nearby:
            index = int(item) if isinstance(item, Integral) else self.projected_geometries.index(item)
            if index not in candidate_indices:
                candidate_indices.append(index)

        scored: list[tuple[float, int, float, float | None]] = []
        for index in candidate_indices:
            line = self.projected_geometries[index]
            distance_m = point.distance(line)
            if distance_m > self.radius_m:
                continue
            projected_distance = line.project(point)
            segment_heading = _bearing_degrees(line, projected_distance)
            heading_delta = _angle_delta(image.heading_degrees, segment_heading)
            score = distance_m + (heading_delta or 0) * 0.05
            scored.append((score, index, distance_m, heading_delta))
        if not scored:
            return None
        _, index, distance_m, heading_delta = min(scored)
        segment = self.segments[index]
        return Projection(
            segment_id=segment.segment_id,
            side=segment.side,
            distance_m=round(distance_m, 3),
            heading_delta_degrees=round(heading_delta, 3) if heading_delta is not None else None,
            confidence=_confidence(distance_m, heading_delta, self.radius_m),
        )
