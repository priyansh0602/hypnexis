from __future__ import annotations

from accesspath_harvester.cache import JsonlCache
from accesspath_harvester.models import ImageRecord


def test_jsonl_cache_is_resumable_by_provider_image_key(tmp_path) -> None:
    cache = JsonlCache(tmp_path / 'images.jsonl')
    image = ImageRecord(
        provider='mapillary',
        image_id='abc',
        longitude=77,
        latitude=12,
        captured_at=None,
        heading_degrees=None,
        camera_side=None,
        thumbnail_url=None,
        attribution={'provider': 'Mapillary'},
    )

    cache.append(image, 'mapillary:abc')
    cache.append(image, 'mapillary:abc-2')

    assert cache.existing_ids() == {'mapillary:abc', 'mapillary:abc-2'}
    assert len(list(cache.read())) == 2
