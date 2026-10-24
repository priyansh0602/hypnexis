from __future__ import annotations

from accesspath_graph_builder.config import GraphConfig
from accesspath_graph_builder.osm import graph_from_osm_map_xml


SAMPLE_XML = '''
<osm version="0.6">
  <node id="1" lat="12.0" lon="77.0" />
  <node id="2" lat="12.0" lon="77.001" />
  <node id="3" lat="12.001" lon="77.001" />
  <way id="100">
    <nd ref="1" /><nd ref="2" /><nd ref="3" />
    <tag k="highway" v="residential" />
    <tag k="name" v="Test Road" />
  </way>
  <way id="101">
    <nd ref="1" /><nd ref="2" />
    <tag k="highway" v="footway" />
  </way>
</osm>
'''


def test_osm_map_xml_filters_roads_and_preserves_geometry() -> None:
    config = GraphConfig.from_dict({
        'name': 'test',
        'bbox': {'south': 11, 'west': 76, 'north': 13, 'east': 78},
    })

    graph = graph_from_osm_map_xml(SAMPLE_XML, config.road_filter)

    assert graph.number_of_nodes() == 3
    assert graph.number_of_edges() == 2
    edge = graph.get_edge_data(1, 3)[0]
    assert edge['osmid'] == 100
    assert edge['name'] == 'Test Road'
    assert len(edge['geometry'].coords) == 3
