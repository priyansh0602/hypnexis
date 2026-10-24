"""OpenStreetMap download and local preview generation."""

from __future__ import annotations

import json
import re
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

import osmnx as ox
import requests
import networkx as nx
from shapely.geometry import LineString
from shapely.geometry import mapping
from shapely.ops import transform

from .builder import build_crosswalk_links, build_segments
from .config import GraphConfig
from .geometry import CrosswalkLink, FootpathSegment, project_to_wgs84, segment_feature


def _allowed_highways(road_filter: str) -> set[str]:
    match = re.search(r'~"([^"]+)"', road_filter)
    if match is None:
        return set()
    return set(match.group(1).split('|'))


def graph_from_osm_map_xml(xml_text: str, road_filter: str) -> nx.MultiDiGraph:
    """Build a small road graph from the free OSM API's `/api/0.6/map` XML."""

    root = ET.fromstring(xml_text)
    allowed = _allowed_highways(road_filter)
    nodes: dict[int, tuple[float, float]] = {}
    for element in root.findall('node'):
        node_id = int(element.attrib['id'])
        nodes[node_id] = (float(element.attrib['lon']), float(element.attrib['lat']))

    graph = nx.MultiDiGraph()
    graph.graph['crs'] = 'EPSG:4326'
    graph.graph['source'] = 'OpenStreetMap map API'
    for node_id, (lon, lat) in nodes.items():
        graph.add_node(node_id, x=lon, y=lat)

    for way in root.findall('way'):
        tags = {tag.attrib['k']: tag.attrib.get('v', '') for tag in way.findall('tag')}
        highway = tags.get('highway')
        if not highway or (allowed and highway not in allowed):
            continue
        references = [int(node.attrib['ref']) for node in way.findall('nd')]
        references = [node_id for node_id in references if node_id in nodes]
        if len(references) < 2:
            continue
        geometry = LineString([nodes[node_id] for node_id in references])
        start, end = references[0], references[-1]
        edge_data = {
            'osmid': int(way.attrib['id']),
            'name': tags.get('name'),
            'highway': highway,
            'geometry': geometry,
            'oneway': tags.get('oneway') in {'yes', 'true', '1'},
        }
        # Footpath geometry is usable in both travel directions even when the
        # road's vehicle traffic is one-way.
        graph.add_edge(start, end, **edge_data)
        graph.add_edge(end, start, **edge_data)
    return graph


def download_from_osm_api(config: GraphConfig) -> nx.MultiDiGraph:
    west, south, east, north = config.bbox.as_osmnx
    url = f'https://api.openstreetmap.org/api/0.6/map?bbox={west},{south},{east},{north}'
    response = requests.get(
        url,
        headers={'User-Agent': 'AccessPath/0.1 (open-source accessibility pilot)'},
        timeout=120,
    )
    response.raise_for_status()
    graph = graph_from_osm_map_xml(response.text, config.road_filter)
    if graph.number_of_edges() == 0:
        raise RuntimeError('OSM API returned no matching roads for the configured bounding box')
    return graph


def download_projected_graph(config: GraphConfig, cache_dir: Path):
    cache_dir.mkdir(parents=True, exist_ok=True)
    ox.settings.use_cache = True
    ox.settings.cache_folder = str(cache_dir)
    ox.settings.requests_timeout = 120
    ox.settings.log_console = False

    # The official OSM map API is reliable for the small pilot bbox and avoids an
    # Overpass quota. Larger future areas can still fall back to Overpass.
    try:
        return ox.project_graph(download_from_osm_api(config))
    except (requests.RequestException, ET.ParseError, RuntimeError) as error:
        api_error = error

    # Overpass instances enforce independent quotas. Try a short ordered list so a
    # transient outage on the default instance does not make the pilot impossible.
    endpoints = [
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass.private.coffee/api/interpreter',
        'https://overpass-api.de/api/interpreter',
    ]
    last_error: Exception | None = None
    graph = None
    for endpoint in endpoints:
        ox.settings.overpass_url = endpoint
        try:
            graph = ox.graph_from_bbox(
                config.bbox.as_osmnx,
                network_type='all_public',
                custom_filter=config.road_filter,
                simplify=True,
                retain_all=True,
                truncate_by_edge=True,
            )
            break
        except (requests.RequestException, requests.exceptions.Timeout) as error:
            last_error = error
            time.sleep(1)

    if graph is None:
        raise RuntimeError(
            'OSM map API and all configured Overpass endpoints failed; retry when the free public '
            'endpoints are available or provide a cached OSM extract'
        ) from (last_error or api_error)
    if graph.number_of_edges() == 0:
        raise RuntimeError('OSM returned no roads for the configured bounding box')
    return ox.project_graph(graph)


def _feature_from_link(link: CrosswalkLink, transformer: Any) -> dict[str, Any]:
    geometry = project_to_wgs84(link.geometry_projected, transformer)
    return {
        'type': 'Feature',
        'id': link.id,
        'properties': {
            'id': link.id,
            'from_segment_id': link.from_segment_id,
            'to_segment_id': link.to_segment_id,
            'ramp_flag': link.ramp_flag,
            'crossing_type': link.crossing_type,
            **link.metadata,
        },
        'geometry': mapping(geometry),
    }


def build_preview(
    output_path: Path,
    config: GraphConfig,
    roads: list[dict[str, Any]],
    segments: list[FootpathSegment],
    links: list[CrosswalkLink],
    transformer: Any,
) -> None:
    """Write a standards-compatible GeoJSON preview for QGIS or geojson.io."""

    features: list[dict[str, Any]] = []
    for road in roads:
        geometry = project_to_wgs84(road['geometry_projected'], transformer)
        features.append({
            'type': 'Feature',
            'id': road['id'],
            'properties': {
                'kind': 'road_centerline',
                'id': road['id'],
                'osm_id': road['osm_id'],
                'name': road['name'],
                'highway_type': road['highway_type'],
                **road['metadata'],
            },
            'geometry': mapping(geometry),
        })
    for segment in segments:
        features.append(segment_feature(segment, transformer))
    features.extend(_feature_from_link(link, transformer) for link in links)

    payload = {
        'type': 'FeatureCollection',
        'name': config.name,
        'metadata': {
            'source': 'OpenStreetMap contributors',
            'license': 'ODbL',
            'pilot': config.name,
            'status_default': 'grey',
        },
        'features': features,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2), encoding='utf-8')
