from __future__ import annotations

from accesspath_harvester.models import ImageRecord, SegmentRecord
from accesspath_harvester.projection import SegmentProjector


def test_projection_selects_nearby_left_or_right_segment() -> None:
    projector = SegmentProjector(
        [
            SegmentRecord('left', 'L', ((77.0, 12.0), (77.001, 12.0))),
            SegmentRecord('right', 'R', ((77.0, 12.0002), (77.001, 12.0002))),
        ],
        radius_m=50,
    )
    image = ImageRecord(
        provider='mapillary',
        image_id='image-1',
        longitude=77.0005,
        latitude=12.00019,
        captured_at=None,
        heading_degrees=90,
        camera_side=None,
        thumbnail_url=None,
        attribution={'provider': 'Mapillary'},
    )

    projection = projector.project(image)

    assert projection is not None
    assert projection.segment_id == 'right'
    assert projection.side == 'R'
    assert projection.distance_m < 5
    assert projection.confidence > 0.8


def test_projection_rejects_images_outside_radius() -> None:
    projector = SegmentProjector(
        [SegmentRecord('segment', 'L', ((77.0, 12.0), (77.001, 12.0)))],
        radius_m=5,
    )
    image = ImageRecord(
        provider='mapillary',
        image_id='image-2',
        longitude=77.0005,
        latitude=12.001,
        captured_at=None,
        heading_degrees=None,
        camera_side=None,
        thumbnail_url=None,
        attribution={'provider': 'Mapillary'},
    )

    assert projector.project(image) is None
