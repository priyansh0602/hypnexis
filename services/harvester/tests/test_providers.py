from __future__ import annotations

from dataclasses import dataclass

from accesspath_harvester.config import BoundingBox
from accesspath_harvester.providers import KartaViewClient, MapillaryClient


@dataclass
class FakeResponse:
    payload: dict
    status_code: int = 200

    @property
    def ok(self) -> bool:
        return self.status_code == 200

    @property
    def text(self) -> str:
        return str(self.payload)

    def json(self) -> dict:
        return self.payload


class FakeSession:
    def __init__(self, responses: list[FakeResponse]) -> None:
        self.responses = iter(responses)
        self.calls: list[dict] = []
        self.headers = {}

    def get(self, url, params=None, timeout=None):
        self.calls.append({'url': url, 'params': params, 'timeout': timeout})
        return next(self.responses)


def test_mapillary_queries_bbox_and_cursor_without_pin_requests() -> None:
    session = FakeSession([
        FakeResponse({
            'data': [{
                'id': 'm1',
                'geometry': {'type': 'Point', 'coordinates': [77.0, 12.0]},
                'captured_at': 1_700_000_000_000,
                'compass_angle': 90,
                'creator': {'id': 'u1', 'username': 'wheel-user'},
                'thumb_1024_url': 'https://example.test/m1.jpg',
            }],
            'paging': {'cursors': {'after': 'cursor-1'}},
        }),
        FakeResponse({'data': []}),
    ])
    client = MapillaryClient(token='test-token', session=session)

    images = list(client.iter_images(
        BoundingBox(south=12.0, west=77.0, north=12.01, east=77.01),
        max_images=5,
        page_size=2,
    ))

    assert [image.image_id for image in images] == ['m1']
    assert session.calls[0]['params']['bbox'] == '77.0,12.0,77.01,12.01'
    assert 'after' not in session.calls[0]['params']
    # The first page contained fewer records than the requested page size, so
    # the client correctly stops without a one-by-one follow-up request.
    assert len(session.calls) == 1
    assert images[0].attribution['creator_username'] == 'wheel-user'
    assert session.headers['Authorization'] == 'OAuth test-token'


def test_kartaview_filters_results_to_bbox() -> None:
    session = FakeSession([
        FakeResponse({
            'result': {
                'data': [
                    {
                        'id': 'k1',
                        'lng': '77.0005',
                        'lat': '12.0005',
                        'shotDate': '2024-01-01 12:00:00.000',
                        'heading': '180',
                        'imageThUrl': 'https://example.test/k1.jpg',
                    },
                    {
                        'id': 'outside',
                        'lng': '78.0',
                        'lat': '13.0',
                    },
                ]
            }
        })
    ])
    client = KartaViewClient(session=session)

    images = list(client.iter_images(
        BoundingBox(south=12.0, west=77.0, north=12.001, east=77.001),
        max_images=5,
    ))

    assert [image.image_id for image in images] == ['k1']
    assert session.calls[0]['params']['radius'] == 500
