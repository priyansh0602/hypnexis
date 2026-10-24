export const FOOTPATH_STATUSES = ['green', 'yellow', 'red', 'grey'] as const;
export type FootpathStatus = (typeof FOOTPATH_STATUSES)[number];

export const FOOTPATH_SIDES = ['left', 'right'] as const;
export type FootpathSide = (typeof FOOTPATH_SIDES)[number];

export const OBSERVATION_SOURCES = ['harvester', 'user', 'camera'] as const;
export type ObservationSource = (typeof OBSERVATION_SOURCES)[number];

export const OBSTACLE_CODES = [
  'missing_kerb_ramp',
  'steps',
  'broken_footpath',
  'pole_fixed_obstacle',
  'parked_vehicle',
  'vendor_cart',
  'rubble',
  'garbage',
  'unknown',
] as const;
export type ObstacleCode = (typeof OBSTACLE_CODES)[number];

export const DEFAULT_WHEELCHAIR_WIDTH_METRES = 0.9;
export const DEFAULT_CLEARANCE_MARGIN_METRES = 0.15;
export const FOOTPATH_SEGMENT_TARGET_LENGTH_METRES = 10;

export interface WheelchairProfile {
  widthMetres: number;
  clearanceMarginMetres: number;
}

export interface SegmentState {
  segmentId: string;
  status: FootpathStatus;
  difficultyScore: number;
  computedAt: string;
  lastVerifiedAt: string | null;
}
