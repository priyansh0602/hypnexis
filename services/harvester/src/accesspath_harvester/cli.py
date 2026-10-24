"""Command-line entry point for resumable imagery harvesting."""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime
from pathlib import Path

from .cache import JsonlCache, download_resumable
from .config import HarvesterConfig
from .models import ImageRecord, ProjectedObservation
from .projection import SegmentProjector
from .providers import KartaViewClient, MapillaryClient, ProviderError
from .supabase import upload_observations


def _load_local_env(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _parse_image(raw: dict) -> ImageRecord:
    captured_at = raw.get('captured_at')
    return ImageRecord(
        provider=raw['provider'],
        image_id=raw['image_id'],
        longitude=float(raw['longitude']),
        latitude=float(raw['latitude']),
        captured_at=datetime.fromisoformat(captured_at) if captured_at else None,
        heading_degrees=raw.get('heading_degrees'),
        camera_side=raw.get('camera_side'),
        thumbnail_url=raw.get('thumbnail_url'),
        attribution=raw.get('attribution') or {},
        metadata=raw.get('metadata') or {},
    )


def _write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8') as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + '\n')


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description='Harvest licensed street-level imagery for AccessPath.')
    parser.add_argument('--config', type=Path, default=Path('services/harvester/config/pilot.json'))
    parser.add_argument(
        '--segments-geojson',
        type=Path,
        default=Path('services/graph-builder/output/indiranagar-100ft-road-pilot/preview.geojson'),
    )
    parser.add_argument('--provider', choices=['mapillary', 'kartaview'], default='mapillary')
    parser.add_argument('--output-dir', type=Path, default=Path('services/harvester/output'))
    parser.add_argument('--cache-dir', type=Path, default=Path('services/harvester/cache'))
    parser.add_argument('--download', action='store_true', help='download provider thumbnails locally')
    parser.add_argument('--upload-observations', action='store_true', help='write projected observations to Supabase')
    parser.add_argument(
        '--metadata-jsonl',
        type=Path,
        help='optional provider metadata JSONL fixture for offline projection testing',
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    _load_local_env(Path('.env'))
    config = HarvesterConfig.from_json(args.config)
    projector = SegmentProjector.from_geojson(args.segments_geojson, config.projection_radius_m)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    metadata_cache = JsonlCache(args.cache_dir / f'{args.provider}-images.jsonl')
    downloaded_dir = args.output_dir / 'images' / args.provider
    existing_keys = metadata_cache.existing_ids()

    if args.metadata_jsonl:
        rows = []
        with args.metadata_jsonl.open('r', encoding='utf-8') as handle:
            for line in handle:
                if line.strip():
                    rows.append(_parse_image(json.loads(line)))
        records = iter(rows)
    elif args.provider == 'mapillary':
        client = MapillaryClient()
        records = client.iter_images(
            config.bbox,
            config.max_images,
            config.request_page_size,
            config.mapillary_tile_area_degrees_squared,
        )
    else:
        client = KartaViewClient()
        records = client.iter_images(config.bbox, config.max_images)

    projected: list[ProjectedObservation] = []
    harvested = 0
    skipped = 0
    downloaded = 0
    for image in records:
        provider_key = f'{image.provider}:{image.image_id}'
        if provider_key in existing_keys:
            skipped += 1
            continue
        projection = projector.project(image)
        if projection is None:
            continue
        metadata_cache.append(image, provider_key, {'projection': projection.__dict__})
        existing_keys.add(provider_key)
        harvested += 1
        projected.append(ProjectedObservation(image=image, projection=projection))
        if args.download and image.thumbnail_url:
            suffix = '.jpg'
            destination = downloaded_dir / f'{image.provider}_{image.image_id}{suffix}'
            if download_resumable(image.thumbnail_url, destination):
                downloaded += 1

    summary = {
        'provider': args.provider,
        'pilot': config.name,
        'bbox': config.bbox.as_dict(),
        'harvested': harvested,
        'skipped_cached': skipped,
        'downloaded': downloaded,
        'projected_observations': len(projected),
        'upload_requested': args.upload_observations,
        'attribution_note': 'Mapillary attribution must remain visible in the app; verify KartaView attribution at release.',
    }
    (args.output_dir / f'{args.provider}-summary.json').write_text(
        json.dumps(summary, indent=2), encoding='utf-8'
    )
    _write_jsonl(
        args.output_dir / f'{args.provider}-projected-observations.jsonl',
        [observation.to_supabase_row() for observation in projected],
    )
    if args.upload_observations:
        uploaded = upload_observations(projected)
        print(f'Uploaded observations: {uploaded}')
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
