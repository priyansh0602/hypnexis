from __future__ import annotations

import pytest

from accesspath_harvester.models import ImageRecord, ProjectedObservation, Projection


def _projected(metadata: dict) -> ProjectedObservation:
    return ProjectedObservation(
        image=ImageRecord(
            provider='mapillary',
            image_id='image-1',
            longitude=77,
            latitude=12,
            captured_at=None,
            heading_degrees=None,
            camera_side=None,
            thumbnail_url=None,
            attribution={'provider': 'Mapillary'},
            metadata=metadata,
        ),
        projection=Projection(
            segment_id='segment-1',
            side='L',
            distance_m=1,
            heading_delta_degrees=None,
            confidence=0.9,
        ),
    )


def test_raw_imagery_cannot_become_a_false_clear_observation() -> None:
    with pytest.raises(ValueError, match='false clear observation'):
        _projected({}).to_supabase_row()


def test_local_projection_serialization_does_not_invent_state() -> None:
    payload = _projected({}).to_json()

    assert payload['projection']['segment_id'] == 'segment-1'
    assert 'is_clear' not in payload['image']['metadata']


def test_explicit_clear_observation_is_allowed() -> None:
    row = _projected({'is_clear': True}).to_supabase_row()

    assert row['is_clear'] is True
    assert row['obstacle_type'] is None
