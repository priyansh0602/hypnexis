from __future__ import annotations

from shapely.geometry import LineString

from accesspath_graph_builder.geometry import (
    canonical_line,
    deterministic_uuid,
    offset_line,
    segment_id,
    split_line,
)


def test_split_line_covers_the_input_length_without_empty_segments() -> None:
    line = LineString([(0, 0), (25, 0)])
    pieces = split_line(line, 10)

    assert len(pieces) == 3
    assert sum(piece.length for piece in pieces) == 25
    assert all(piece.length > 0 for piece in pieces)


def test_split_line_exact_multiple_does_not_add_a_zero_length_piece() -> None:
    pieces = split_line(LineString([(0, 0), (20, 0)]), 10)

    assert len(pieces) == 2
    assert [piece.length for piece in pieces] == [10, 10]


def test_canonical_line_is_direction_independent() -> None:
    forward = LineString([(0, 0), (10, 0)])
    reverse = LineString([(10, 0), (0, 0)])

    assert list(canonical_line(forward).coords) == list(canonical_line(reverse).coords)


def test_stable_ids_are_repeatable_and_side_specific() -> None:
    assert deterministic_uuid('road:test') == deterministic_uuid('road:test')
    assert segment_id('road:test', 'L', 0) != segment_id('road:test', 'R', 0)


def test_offset_line_is_parallel_and_keeps_a_positive_length() -> None:
    line = LineString([(0, 0), (10, 0)])
    left = offset_line(line, 1.5)
    right = offset_line(line, -1.5)

    assert left.length == right.length == 10
    assert left.centroid.y > 0
    assert right.centroid.y < 0
