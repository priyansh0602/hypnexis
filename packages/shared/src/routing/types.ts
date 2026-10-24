import type { FootpathStatus, FootpathSide, WheelchairProfile } from '../domain.ts';

export interface FootpathSegmentInput {
  id: string;
  roadId: string;
  side: FootpathSide;
  segmentIndex: number;
  lengthM: number;
  status: FootpathStatus;
  difficultyScore?: number | undefined;
  coordinates: [number, number][]; // [[lng, lat], ...]
}

export interface CrosswalkLinkInput {
  id: string;
  fromSegmentId: string;
  toSegmentId: string;
  rampFlag: boolean;
  crossingType?: string | undefined;
  lengthM?: number | undefined;
  coordinates?: [number, number][] | undefined; // [[lng, lat], ...]
}

export interface RoutingNode {
  id: string;
  coordinates: [number, number]; // [lng, lat]
  segmentId?: string | undefined;
  isJunction?: boolean | undefined;
}

export interface RoutingEdge {
  id: string;
  from: string; // RoutingNode.id
  to: string; // RoutingNode.id
  distanceM: number;
  kind: 'footpath' | 'crosswalk';
  segmentId?: string | undefined;
  roadId?: string | undefined;
  side?: FootpathSide | undefined;
  status?: FootpathStatus | undefined;
  difficultyScore?: number | undefined;
  rampFlag?: boolean | undefined;
  coordinates: [number, number][];
}

export interface RouteWarning {
  type: 'blocked_segment' | 'rough_surface' | 'unverified_area' | 'missing_kerb_ramp';
  segmentId?: string | undefined;
  crosswalkId?: string | undefined;
  location: [number, number];
  message: string;
  severity: 'high' | 'medium' | 'low';
}

export interface RouteResult {
  mode: 'accessible' | 'standard';
  pathNodeIds: string[];
  pathEdgeIds: string[];
  segments: FootpathSegmentInput[];
  crosswalks: CrosswalkLinkInput[];
  coordinates: [number, number][];
  totalDistanceM: number;
  totalCost: number;
  estimatedTimeSeconds: number;
  accessibilityScore: number; // 0 (inaccessible) to 100 (fully clear & ramped)
  hasRedObstacles: boolean;
  hasMissingRamps: boolean;
  hasGreySegments: boolean;
  warnings: RouteWarning[];
}

export interface DualRouteResult {
  accessibleRoute: RouteResult | null;
  standardRoute: RouteResult | null;
  recommendation: 'accessible' | 'standard' | 'neither';
  summary: string;
}

export interface LastSafeExitResult {
  found: boolean;
  reason?: string | undefined;
  exitCrosswalk?: CrosswalkLinkInput | undefined;
  fromSegmentId?: string | undefined;
  toSegmentId?: string | undefined;
  exitCoordinate?: [number, number] | undefined;
  distanceFromUserM?: number | undefined;
  distanceToObstacleM?: number | undefined;
  warningMessage?: string | undefined;
  hasAccessibleRamp?: boolean | undefined;
}

export interface RouterOptions {
  profile?: WheelchairProfile | undefined;
  walkingSpeedMetresPerSecond?: number | undefined; // default 1.0 m/s (~3.6 km/h)
  greenMultiplier?: number | undefined; // default 1.0
  yellowMultiplier?: number | undefined; // default 2.0
  greyMultiplier?: number | undefined; // default 1.8
  redMultiplier?: number | undefined; // default 50.0 (finite penalty)
  missingRampFixedPenaltyM?: number | undefined; // default 200.0 m
  missingRampMultiplier?: number | undefined; // default 15.0
}
