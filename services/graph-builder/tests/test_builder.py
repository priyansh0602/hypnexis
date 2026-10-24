from __future__ import annotations

import networkx as nx
from pyproj import Transformer

from accesspath_graph_builder.builder import build_segments
from accesspath_graph_builder.config import GraphConfig


def test_build_segments_creates_grey_left_and_right_records() -> None:
    graph = nx.MultiDiGraph()
    graph.graph['crs'] = 'EPSG:32643'
    graph.add_node(1, x=500_000, y=1_400_000)
    graph.add_node(2, x=500_050, y=1_400_000)
    graph.add_edge(1, 2, osmid=123, name='Test Road', highway='residential')
    graph.add_edge(2, 1, osmid=123, name='Test Road', highway='residential')

    config = GraphConfig.from_dict({
        'name': 'test',
        'bbox': {'south': 12, 'west': 77, 'north': 13, 'east': 78},
        'segment_length_metres': 10,
    })
    roads, segments, stats = build_segments(graph, config)

    assert len(roads) == 1
    assert stats['left_segments'] == stats['right_segments']
    assert all(segment.side in {'L', 'R'} for segment in segments)
    assert all(segment.length_m > 0 for segment in segments)
    assert all(segment.metadata['status'] == 'grey' for segment in segments)
