"""Command-line entry point for building and optionally uploading a pilot graph."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from pyproj import Transformer

from .builder import build_crosswalk_links, build_segments
from .config import GraphConfig
from .osm import build_preview, download_projected_graph
from .supabase import upload_graph


def _load_local_env(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description='Build AccessPath footpath segments from OSM data.')
    parser.add_argument(
        '--config',
        type=Path,
        default=Path('services/graph-builder/config/pilot.json'),
        help='JSON pilot configuration path',
    )
    parser.add_argument(
        '--output-dir',
        type=Path,
        default=Path('services/graph-builder/output'),
        help='directory for GeoJSON preview and build statistics',
    )
    parser.add_argument(
        '--cache-dir',
        type=Path,
        default=Path('services/graph-builder/cache'),
        help='OSMnx HTTP cache directory',
    )
    parser.add_argument(
        '--upload',
        action='store_true',
        help='upload roads, segments, and crosswalk links using the server-side Supabase key',
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    config = GraphConfig.from_json(args.config)
    _load_local_env(Path('.env'))

    print(f'Pilot: {config.name}')
    print(f'BBox: {config.bbox.as_dict()}')
    print('Downloading OSM road graph...')
    graph = download_projected_graph(config, args.cache_dir)
    roads, segments, stats = build_segments(graph, config)
    links = build_crosswalk_links(graph, segments)
    stats['crosswalk_links'] = len(links)
    stats['osm_nodes'] = graph.number_of_nodes()
    stats['osm_edges'] = graph.number_of_edges()

    transformer = Transformer.from_crs(graph.graph['crs'], 'EPSG:4326', always_xy=True)
    output_dir = args.output_dir / config.name
    build_preview(output_dir / 'preview.geojson', config, roads, segments, links, transformer)
    (output_dir / 'stats.json').write_text(json.dumps(stats, indent=2), encoding='utf-8')

    if args.upload:
        print('Uploading graph to Supabase...')
        upload_graph(roads, segments, links, transformer)
        print('Supabase upload complete.')
    else:
        print('Upload skipped. Use --upload only when you intend to write this graph to Supabase.')

    print(json.dumps(stats, indent=2))
    print(f'Preview: {output_dir / "preview.geojson"}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
