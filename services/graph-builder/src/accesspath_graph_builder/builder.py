"""Build deterministic left/right footpath segments from a projected OSM graph."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

import networkx as nx
import osmnx as ox
from pyproj import Transformer
from shapely.geometry import LineString, Point

from .config import GraphConfig
from .geometry import (
    CrosswalkLink,
    FootpathSegment,
    canonical_line,
    choose_longest_line,
    deterministic_uuid,
    offset_line,
    road_key,
    segment_id,
    split_line,
)


def _as_osm_ids(value: Any) -> list[int]:
    values = value if isinstance(value, (list, tuple, set)) else [value]
    result: list[int] = []
    for candidate in values:
        try:
            if candidate is not None:
                result.append(int(candidate))
        except (TypeError, ValueError):
            continue
    return result


def _edge_line(row: Any, node_points: dict[Any, Point]) -> LineString:
    geometry = row.get('geometry')
    if geometry is not None:
        return choose_longest_line(geometry)
    return LineString([node_points[row['u']], node_points[row['v']]])


def _road_name(row: Any) -> str | None:
    value = row.get('name')
    if isinstance(value, (list, tuple)):
        return str(value[0]) if value else None
    return str(value) if value is not None else None


def _highway_type(row: Any) -> str | None:
    value = row.get('highway')
    if isinstance(value, (list, tuple)):
        return str(value[0]) if value else None
    return str(value) if value is not None else None


def _canonical_edges(graph: nx.MultiDiGraph) -> tuple[Any, list[dict[str, Any]], dict[Any, Point]]:
    nodes_projected, edges_projected = ox.graph_to_gdfs(
        graph,
        nodes=True,
        edges=True,
        fill_edge_geometry=True,
    )
    node_points = {
        node_id: Point(float(row.geometry.x), float(row.geometry.y))
        for node_id, row in nodes_projected.iterrows()
    }
    seen: set[str] = set()
    rows: list[dict[str, Any]] = []
    for raw_row in edges_projected.reset_index().to_dict('records'):
        line = canonical_line(_edge_line(raw_row, node_points))
        osm_ids = _as_osm_ids(raw_row.get('osmid'))
        key = road_key(osm_ids, Point(*line.coords[0]), Point(*line.coords[-1]))
        if key in seen:
            continue
        seen.add(key)
        rows.append({
            'row': raw_row,
            'line': line,
            'road_key': key,
            'osm_ids': osm_ids,
        })
    return graph.graph.get('crs'), rows, node_points


def build_segments(
    graph_projected: nx.MultiDiGraph,
    config: GraphConfig,
) -> tuple[list[dict[str, Any]], list[FootpathSegment], dict[str, Any]]:
    """Return road payloads, segment records, and build statistics."""

    projected_crs, edges, _ = _canonical_edges(graph_projected)
    if projected_crs is None:
        raise ValueError('projected graph is missing a CRS')

    roads: list[dict[str, Any]] = []
    segments: list[FootpathSegment] = []
    transformer = Transformer.from_crs(projected_crs, 'EPSG:4326', always_xy=True)

    for edge in edges:
        raw_row = edge['row']
        line = edge['line']
        key = edge['road_key']
        osm_ids = edge['osm_ids']
        road_id = deterministic_uuid(f'road:{key}')
        roads.append({
            'id': road_id,
            'osm_id': osm_ids[0] if osm_ids else None,
            'name': _road_name(raw_row),
            'highway_type': _highway_type(raw_row),
            'geometry_projected': line,
            'geometry_transformer': transformer,
            'metadata': {
                'source': 'OpenStreetMap',
                'license': 'ODbL',
                'osm_ids': osm_ids,
                'road_key': key,
                'pilot': config.name,
            },
        })

        for side, signed_offset in (('L', config.footpath_offset_metres), ('R', -config.footpath_offset_metres)):
            offset = offset_line(line, signed_offset)
            pieces = split_line(offset, config.segment_length_metres)
            for index, piece in enumerate(pieces):
                segments.append(
                    FootpathSegment(
                        id=segment_id(key, side, index),
                        road_id=road_id,
                        road_key=key,
                        side=side,
                        segment_index=index,
                        geometry_projected=piece,
                        length_m=float(piece.length),
                        metadata={
                            'source': 'OpenStreetMap',
                            'license': 'ODbL',
                            'osm_ids': osm_ids,
                            'road_key': key,
                            'status': 'grey',
                        },
                    )
                )

    stats = {
        'roads': len(roads),
        'segments': len(segments),
        'left_segments': sum(segment.side == 'L' for segment in segments),
        'right_segments': sum(segment.side == 'R' for segment in segments),
        'road_length_m': round(sum(float(road['geometry_projected'].length) for road in roads), 2),
        'footpath_length_m': round(sum(segment.length_m for segment in segments), 2),
        'projected_crs': str(projected_crs),
    }
    return roads, segments, stats


def build_crosswalk_links(
    graph_projected: nx.MultiDiGraph,
    segments: list[FootpathSegment],
    node_points: dict[Any, Point] | None = None,
) -> list[CrosswalkLink]:
    """Connect nearby footpath ends at OSM intersections.

    This is intentionally conservative: links are only made between different roads,
    and only when each endpoint is within 18 metres of an intersection node. The link
    remains an inferred crossing until later evidence or OSM tags confirms a ramp.
    """

    if node_points is None:
        _, _, node_points = _canonical_edges(graph_projected)

    endpoints: dict[Any, list[tuple[FootpathSegment, Point]]] = defaultdict(list)
    for segment in segments:
        start = Point(segment.geometry_projected.coords[0])
        end = Point(segment.geometry_projected.coords[-1])
        for node_id, node_point in node_points.items():
            if min(start.distance(node_point), end.distance(node_point)) <= 18:
                endpoint = start if start.distance(node_point) <= end.distance(node_point) else end
                endpoints[node_id].append((segment, endpoint))

    links: list[CrosswalkLink] = []
    seen: set[tuple[str, str]] = set()
    for node_id, candidates in endpoints.items():
        unique: dict[str, tuple[FootpathSegment, Point]] = {}
        for segment, endpoint in candidates:
            unique.setdefault(segment.road_key, (segment, endpoint))
        values = list(unique.values())
        if len(values) < 2:
            continue
        node = node_points[node_id]
        for index, (from_segment, from_point) in enumerate(values):
            for to_segment, to_point in values[index + 1:]:
                pair: tuple[str, str] = (
                    min(from_segment.id, to_segment.id),
                    max(from_segment.id, to_segment.id),
                )
                if pair in seen:
                    continue
                seen.add(pair)
                geometry = LineString([from_point, node, to_point])
                for source, target in (
                    (from_segment, to_segment),
                    (to_segment, from_segment),
                ):
                    links.append(
                        CrosswalkLink(
                            id=deterministic_uuid(f'crosswalk:{source.id}:{target.id}'),
                            from_segment_id=source.id,
                            to_segment_id=target.id,
                            geometry_projected=geometry,
                            ramp_flag=False,
                            crossing_type='inferred_intersection',
                            metadata={
                                'source': 'OpenStreetMap',
                                'license': 'ODbL',
                                'osm_node_id': str(node_id),
                                'inference': 'endpoint proximity; ramp confirmation required',
                            },
                        )
                    )
    return links
