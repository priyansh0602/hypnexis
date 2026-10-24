from __future__ import annotations

import pytest

from accesspath_harvester.config import HarvesterConfig


def test_harvester_config_validates_bbox_and_limits() -> None:
    config = HarvesterConfig.from_dict({
        'name': 'pilot',
        'bbox': {'south': 12.9, 'west': 77.5, 'north': 13.0, 'east': 77.6},
    })

    assert config.bbox.as_mapillary() == '77.5,12.9,77.6,13.0'
    assert config.request_page_size == 100


def test_harvester_config_rejects_invalid_page_size() -> None:
    with pytest.raises(ValueError, match='request_page_size'):
        HarvesterConfig.from_dict({
            'name': 'pilot',
            'bbox': {'south': 12.9, 'west': 77.5, 'north': 13.0, 'east': 77.6},
            'request_page_size': 2001,
        })
