"""
Unit tests for the AccessPath Clear Width & Geometry Calculator.
"""

import pytest
from clear_width import (
    WheelchairProfile,
    CameraCalibration,
    DetectedObstacle,
    PavementCorridor,
    ClearWidthCalculator,
)


def test_camera_ground_projection():
    """Validates inverse perspective mapping from image pixels to metric ground distance."""
    cam = CameraCalibration(
        mounting_height_m=0.95,
        pitch_deg=12.0,
        focal_length_px=1200.0,
        image_width=1920,
        image_height=1080,
        principal_point=(960.0, 540.0),
    )

    # Center optical line at bottom of image (closest to wheelchair, y=1.0)
    x_close, z_close = cam.project_ground_point(0.5, 1.0)
    assert abs(x_close) < 0.05
    assert 1.0 < z_close < 3.0

    # Nearer horizon (further distance ahead, y=0.30) -> further distance (>20m)
    x_far, z_far = cam.project_ground_point(0.5, 0.30)
    assert z_far > z_close
    assert z_far > 20.0


def test_clear_corridor_without_obstacles():
    """An unobstructed 2.5m wide sidewalk evaluates to Green with maximum clear width."""
    corridor = PavementCorridor(left_curb_x_m=-1.25, right_wall_x_m=1.25)
    calc = ClearWidthCalculator(corridor=corridor)

    result = calc.evaluate_corridor(obstacles=[])

    assert result.status == "green"
    assert result.is_blocked is False
    assert result.min_clear_width_m == 2.5
    assert len(result.bottlenecks) == 0
    assert "clear for wheelchair passage" in result.summary.lower()


def test_minor_obstacle_on_sidewalk_edge():
    """A small pole on the far left edge of the sidewalk leaves ample clearance (> 1.05m) -> Green."""
    corridor = PavementCorridor(left_curb_x_m=-1.25, right_wall_x_m=1.25)
    calc = ClearWidthCalculator(corridor=corridor)

    # Pole located on far left [xmin=0.1, xmax=0.15], ground contact ymax=0.7 (~5m ahead)
    pole = DetectedObstacle(
        id="obs-pole-1",
        label="pole",
        confidence=0.91,
        bbox=(0.3, 0.1, 0.7, 0.15),
        depth_extent_m=0.5,
    )

    result = calc.evaluate_corridor(obstacles=[pole])

    assert result.status == "green"
    assert result.is_blocked is False
    assert result.min_clear_width_m > 1.2  # Plentiful clearance on the right side of the pole
    assert len(result.bottlenecks) == 0


def test_narrow_pinch_point_evaluates_to_yellow():
    """
    Vendor cart occupying lateral space such that available passable width
    is between 0.90m and 1.05m -> Yellow caution.
    """
    corridor = PavementCorridor(left_curb_x_m=-1.0, right_wall_x_m=1.0)  # 2.0m total width
    calc = ClearWidthCalculator(corridor=corridor)

    # Cart occupying left side up to x~0.05m, leaving ~0.95m passable gap on the right
    # At y=0.55 (~3.65m ahead), bbox xmin=0.33, xmax=0.51
    cart = DetectedObstacle(
        id="obs-cart-1",
        label="vendor_cart",
        confidence=0.89,
        bbox=(0.4, 0.33, 0.55, 0.51),
        depth_extent_m=1.5,
    )

    result = calc.evaluate_corridor(obstacles=[cart])

    # Passable width should be tight (< 1.05m) but still physically possible (>= 0.9m)
    assert result.status == "yellow"
    assert result.is_blocked is False
    assert 0.85 <= result.min_clear_width_m <= 1.05
    assert len(result.bottlenecks) > 0
    assert result.bottlenecks[0].severity == "medium"
    assert "tight clearance" in result.summary.lower()


def test_severe_obstacle_blocks_path_evaluates_to_red():
    """
    Parked auto-rickshaw or car blocking most of the sidewalk, leaving < 0.9m -> Red (Blocked).
    """
    corridor = PavementCorridor(left_curb_x_m=-1.0, right_wall_x_m=1.0)  # 2.0m width
    calc = ClearWidthCalculator(corridor=corridor)

    # Vehicle spanning almost the entire width (xmin=0.15 to xmax=0.85)
    vehicle = DetectedObstacle(
        id="obs-auto-1",
        label="parked_vehicle",
        confidence=0.95,
        bbox=(0.35, 0.15, 0.75, 0.85),
        depth_extent_m=2.5,
    )

    result = calc.evaluate_corridor(obstacles=[vehicle])

    assert result.status == "red"
    assert result.is_blocked is True
    assert result.min_clear_width_m < 0.9
    assert len(result.bottlenecks) > 0
    assert result.bottlenecks[0].is_blocked is True
    assert result.bottlenecks[0].severity == "high"
    assert "passage is impossible" in result.recommendation.lower()


def test_steps_spanning_corridor_triggers_immediate_red():
    """Steps spanning across the footpath immediately trigger Red status."""
    corridor = PavementCorridor(left_curb_x_m=-1.0, right_wall_x_m=1.0)
    calc = ClearWidthCalculator(corridor=corridor)

    # Wide steps across middle of sidewalk
    steps = DetectedObstacle(
        id="obs-steps-1",
        label="steps",
        confidence=0.98,
        bbox=(0.45, 0.3, 0.7, 0.7),
        depth_extent_m=1.0,
    )

    result = calc.evaluate_corridor(obstacles=[steps])

    assert result.status == "red"
    assert result.is_blocked is True


def test_custom_wheelchair_profile():
    """A wider powered wheelchair profile (width = 1.0m, margin = 0.2m) alters clearance thresholds."""
    corridor = PavementCorridor(left_curb_x_m=-1.0, right_wall_x_m=1.0)
    wide_profile = WheelchairProfile(width_m=1.0, clearance_margin_m=0.2)
    assert wide_profile.min_required_width_m == 1.2
    assert wide_profile.hard_blockage_threshold_m == 1.0

    calc = ClearWidthCalculator(corridor=corridor, profile=wide_profile)

    # An obstacle leaving 0.95m passable gap is passable for standard 0.9m wheelchair (Yellow),
    # but completely blocked for the 1.0m wheelchair (Red).
    cart = DetectedObstacle(
        id="obs-cart-1",
        label="vendor_cart",
        confidence=0.89,
        bbox=(0.4, 0.28, 0.75, 0.62),
        depth_extent_m=1.5,
    )

    result = calc.evaluate_corridor(obstacles=[cart])
    assert result.status == "red"
    assert result.is_blocked is True
