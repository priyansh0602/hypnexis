from __future__ import annotations

import pytest

from accesspath_graph_builder.config import GraphConfig


def test_config_rejects_invalid_bbox() -> None:
    with pytest.raises(ValueError, match='bbox latitude'):
        GraphConfig.from_dict({
            'name': 'invalid',
            'bbox': {'south': 1, 'west': 2, 'north': 0, 'east': 3},
        })


def test_config_accepts_pilot_shape() -> None:
    config = GraphConfig.from_dict({
        'name': 'pilot',
        'bbox': {'south': 12.9, 'west': 77.5, 'north': 13.0, 'east': 77.6},
    })

    assert config.bbox.as_osmnx == (77.5, 12.9, 77.6, 13.0)
    assert config.segment_length_metres == 10
