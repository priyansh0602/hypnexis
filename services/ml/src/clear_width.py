"""
AccessPath - Sidewalk Obstacle Clear Width & Geometry Calculator.

Estimates ground plane walkable clear width in meters using camera homography
and inverse perspective mapping (IPM). Determines wheelchair accessibility status
(Green, Yellow, Red) based on obstacle footprint and corridor clearances.
"""

from __future__ import annotations

import math
from typing import List, Optional, Tuple
from pydantic import BaseModel, Field


class WheelchairProfile(BaseModel):
    """Wheelchair dimensional profile and clearance requirements."""

    width_m: float = Field(default=0.9, ge=0.5, le=1.5, description="Wheelchair width in meters")
    clearance_margin_m: float = Field(
        default=0.15, ge=0.05, le=0.5, description="Safety and maneuvering margin in meters"
    )

    @property
    def min_required_width_m(self) -> float:
        """Total required clear width for comfortable maneuvering."""
        return self.width_m + self.clearance_margin_m

    @property
    def hard_blockage_threshold_m(self) -> float:
        """Physical width below which a wheelchair is completely blocked."""
        return self.width_m


class CameraCalibration(BaseModel):
    """Extrinsic and intrinsic camera geometry for ground plane projection."""

    mounting_height_m: float = Field(
        default=0.95, gt=0.2, le=2.5, description="Camera height above pavement in meters"
    )
    pitch_deg: float = Field(
        default=12.0, ge=0.0, le=45.0, description="Downward tilt angle in degrees"
    )
    roll_deg: float = Field(default=0.0, description="Camera roll angle in degrees")
    focal_length_px: float = Field(default=1200.0, gt=100.0, description="Effective focal length in pixels")
    image_width: int = Field(default=1920, gt=0)
    image_height: int = Field(default=1080, gt=0)
    principal_point: Tuple[float, float] = Field(default=(960.0, 540.0))

    def project_ground_point(self, norm_x: float, norm_y: float) -> Tuple[float, float]:
        """
        Projects a normalized 2D image coordinate [0..1] at ground contact (norm_y)
        to real-world 3D ground coordinates (X, Z) in meters.

        X: lateral offset from camera centerline (negative = left, positive = right).
        Z: forward distance ahead of wheelchair.
        """
        px_x = norm_x * self.image_width
        px_y = norm_y * self.image_height

        cx, cy = self.principal_point
        u_c = px_x - cx
        v_c = px_y - cy

        pitch_rad = math.radians(self.pitch_deg)
        # Vertical elevation angle relative to optical center
        alpha = math.atan2(v_c, self.focal_length_px)
        total_angle = pitch_rad + alpha

        # Clamp forward distance between 0.5m and 60m
        if total_angle <= 0.015:
            dist_z = 60.0
        else:
            dist_z = self.mounting_height_m / math.tan(total_angle)
            dist_z = max(0.5, min(60.0, dist_z))

        # Lateral displacement X = Z * u_c / focal_length
        dist_x = dist_z * (u_c / self.focal_length_px)

        return (dist_x, dist_z)


class DetectedObstacle(BaseModel):
    """Detected obstacle bounding box and ground plane footprint."""

    id: str
    label: str  # 'steps', 'pole', 'parked_vehicle', 'vendor_cart', 'garbage_rubble', etc.
    confidence: float = Field(ge=0.0, le=1.0)
    bbox: Tuple[float, float, float, float]  # [ymin, xmin, ymax, xmax] normalized 0..1
    depth_extent_m: float = Field(default=1.0, ge=0.2, description="Estimated obstacle depth along path in meters")


class PavementCorridor(BaseModel):
    """Walkable pavement bounds in ground plane coordinates."""

    left_curb_x_m: float = Field(default=-1.25, description="Left curb lateral coordinate in meters")
    right_wall_x_m: float = Field(default=1.25, description="Right boundary / property line in meters")

    @property
    def total_width_m(self) -> float:
        return max(0.0, self.right_wall_x_m - self.left_curb_x_m)


class Bottleneck(BaseModel):
    """Identified pinch point or blockage along the footpath corridor."""

    distance_m: float
    clear_width_m: float
    left_gap_m: float
    right_gap_m: float
    occupying_obstacles: List[str]
    is_blocked: bool
    severity: str  # 'high' | 'medium' | 'low'


class ClearWidthResult(BaseModel):
    """Evaluation result for wheelchair path navigability."""

    status: str  # 'green' | 'yellow' | 'red'
    is_blocked: bool
    min_clear_width_m: float
    bottleneck_distance_m: float
    bottlenecks: List[Bottleneck]
    corridor_total_width_m: float
    summary: str
    recommendation: str


class ClearWidthCalculator:
    """
    Computes continuous ground plane clear width for wheelchair navigation.
    """

    def __init__(
        self,
        camera: Optional[CameraCalibration] = None,
        profile: Optional[WheelchairProfile] = None,
        corridor: Optional[PavementCorridor] = None,
    ):
        self.camera = camera or CameraCalibration()
        self.profile = profile or WheelchairProfile()
        self.corridor = corridor or PavementCorridor()

    def evaluate_corridor(
        self,
        obstacles: List[DetectedObstacle],
        sample_step_m: float = 0.5,
        max_horizon_m: float = 50.0,
    ) -> ClearWidthResult:
        """
        Slices the forward corridor from 1.0m to max_horizon_m ahead and computes
        the available passable gap at each distance interval.
        """
        # Step 1: Project each obstacle to ground coordinates (X_min, X_max, Z_center)
        projected_obstacles = []
        has_impassable_steps = False

        for obs in obstacles:
            ymin, xmin, ymax, xmax = obs.bbox
            x_left, z_contact = self.camera.project_ground_point(xmin, ymax)
            x_right, _ = self.camera.project_ground_point(xmax, ymax)

            # Ensure x_min < x_max
            x_min_ground = min(x_left, x_right)
            x_max_ground = max(x_left, x_right)

            projected_obstacles.append(
                {
                    "id": obs.id,
                    "label": obs.label,
                    "confidence": obs.confidence,
                    "x_min": x_min_ground,
                    "x_max": x_max_ground,
                    "z_center": z_contact,
                    "z_start": max(0.5, z_contact - obs.depth_extent_m / 2),
                    "z_end": z_contact + obs.depth_extent_m / 2,
                }
            )

            # If steps span more than 60% of corridor width, wheelchair cannot pass
            if obs.label == "steps" and (x_max_ground - x_min_ground) >= 0.8:
                has_impassable_steps = True

        # Step 2: Slice corridor at regular distance intervals
        z_distances = [
            round(z, 2)
            for z in [i * sample_step_m for i in range(int(1.0 / sample_step_m), int(max_horizon_m / sample_step_m) + 1)]
        ]

        # Also add exact obstacle ground centers to sampled slices
        for po in projected_obstacles:
            z_c = round(po["z_center"], 2)
            if 1.0 <= z_c <= max_horizon_m and z_c not in z_distances:
                z_distances.append(z_c)

        z_distances.sort()

        corridor_left = self.corridor.left_curb_x_m
        corridor_right = self.corridor.right_wall_x_m
        total_pavement_width = self.corridor.total_width_m

        bottlenecks: List[Bottleneck] = []
        min_clear_width = total_pavement_width
        bottleneck_dist = 1.0

        for z in z_distances:
            # Find obstacles overlapping this distance slice
            active_obs = [
                po for po in projected_obstacles if po["z_start"] <= z <= po["z_end"]
            ]

            if not active_obs:
                continue

            # Merge overlapping obstacle lateral spans clamped to corridor boundaries
            intervals: List[Tuple[float, float, str]] = []
            for ao in active_obs:
                clamped_min = max(corridor_left, ao["x_min"])
                clamped_max = min(corridor_right, ao["x_max"])
                if clamped_max > clamped_min:
                    intervals.append((clamped_min, clamped_max, ao["label"]))

            if not intervals:
                continue

            # Sort intervals laterally from left to right
            intervals.sort(key=lambda item: item[0])

            merged_intervals: List[Tuple[float, float]] = []
            labels_present = set()

            for start, end, label in intervals:
                labels_present.add(label)
                if not merged_intervals:
                    merged_intervals.append((start, end))
                else:
                    prev_start, prev_end = merged_intervals[-1]
                    if start <= prev_end:
                        # Overlapping or contiguous interval
                        merged_intervals[-1] = (prev_start, max(prev_end, end))
                    else:
                        merged_intervals.append((start, end))

            # Compute passable gaps:
            # 1. Gap between left curb and first obstacle
            # 2. Gaps between consecutive obstacles
            # 3. Gap between last obstacle and right wall
            gaps: List[float] = []

            # Leftmost gap
            left_gap = max(0.0, merged_intervals[0][0] - corridor_left)
            gaps.append(left_gap)

            # Internal gaps
            for i in range(len(merged_intervals) - 1):
                gap_between = max(0.0, merged_intervals[i + 1][0] - merged_intervals[i][1])
                gaps.append(gap_between)

            # Rightmost gap
            right_gap = max(0.0, corridor_right - merged_intervals[-1][1])
            gaps.append(right_gap)

            # Walkable clear width is the largest continuous gap a wheelchair can roll through
            max_continuous_gap = max(gaps) if gaps else 0.0

            if max_continuous_gap < min_clear_width:
                min_clear_width = max_continuous_gap
                bottleneck_dist = z

            is_blocked = max_continuous_gap < self.profile.hard_blockage_threshold_m
            is_narrow = max_continuous_gap < self.profile.min_required_width_m

            if is_narrow or is_blocked:
                severity = "high" if is_blocked else "medium"
                bottlenecks.append(
                    Bottleneck(
                        distance_m=z,
                        clear_width_m=round(max_continuous_gap, 2),
                        left_gap_m=round(left_gap, 2),
                        right_gap_m=round(right_gap, 2),
                        occupying_obstacles=list(labels_present),
                        is_blocked=is_blocked,
                        severity=severity,
                    )
                )

        # Step 3: Determine overall classification (Green, Yellow, Red)
        min_clear_width = round(min_clear_width, 2)

        if has_impassable_steps or min_clear_width < self.profile.hard_blockage_threshold_m:
            status = "red"
            is_blocked = True
            summary = (
                f"Footpath blocked at {bottleneck_dist:.1f}m. "
                f"Minimum clear width of {min_clear_width:.2f}m is below wheelchair threshold "
                f"({self.profile.width_m:.2f}m)."
            )
            recommendation = (
                "Wheelchair passage is impossible. Reroute via nearest safe crosswalk or ramp to opposite side."
            )
        elif min_clear_width < self.profile.min_required_width_m:
            status = "yellow"
            is_blocked = False
            summary = (
                f"Footpath narrow at {bottleneck_dist:.1f}m. "
                f"Clear width of {min_clear_width:.2f}m provides tight clearance "
                f"(requires {self.profile.min_required_width_m:.2f}m including margin)."
            )
            recommendation = "Proceed with caution. Slow rolling and careful steering advised."
        else:
            status = "green"
            is_blocked = False
            summary = (
                f"Footpath clear for wheelchair passage. "
                f"Minimum clear width of {min_clear_width:.2f}m satisfies clearance requirement "
                f"({self.profile.min_required_width_m:.2f}m)."
            )
            recommendation = "Optimal accessible route. Maintain steady forward velocity."

        return ClearWidthResult(
            status=status,
            is_blocked=is_blocked,
            min_clear_width_m=min_clear_width,
            bottleneck_distance_m=bottleneck_dist,
            bottlenecks=bottlenecks,
            corridor_total_width_m=round(total_pavement_width, 2),
            summary=summary,
            recommendation=recommendation,
        )
