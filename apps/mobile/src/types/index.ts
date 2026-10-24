import type {
  FootpathStatus,
  FootpathSide,
  ObservationSource,
  ObstacleCode,
  WheelchairProfile,
  SegmentState,
} from '@accesspath/shared';

export type {
  FootpathStatus,
  FootpathSide,
  ObservationSource,
  ObstacleCode,
  WheelchairProfile,
  SegmentState,
};

export interface FootpathSegmentRow {
  id: string;
  road_id: string;
  side: FootpathSide | 'L' | 'R';
  segment_index: number;
  geometry: unknown; // GeoJSON geometry, string WKT, or coordinate array
  length_m: number;
  status: FootpathStatus;
  difficulty_score: number;
  last_verified_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SegmentStateRow {
  segment_id: string;
  status: FootpathStatus;
  difficulty_score: number;
  confidence: number;
  last_verified_at: string | null;
  active_obstacles: ObstacleCode[] | Record<string, unknown>[];
  computed_at: string;
  state_version: number;
  updated_at?: string;
}

export interface ObservationRow {
  id: string;
  segment_id: string | null;
  obstacle_type: ObstacleCode | null;
  confidence: number;
  source: ObservationSource;
  reporter_id: string | null;
  photo_url: string | null;
  attribution: {
    provider?: string;
    creator?: string;
    license?: string;
    image_id?: string;
    sequence_id?: string;
    captured_at?: string;
    [key: string]: unknown;
  } | null;
  captured_at: string;
  heading_degrees: number | null;
  camera_side: FootpathSide | 'L' | 'R' | null;
  projection_confidence: number | null;
  is_clear: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface FootpathSegmentFeatureProperties {
  id: string;
  roadId: string;
  side: 'left' | 'right';
  segmentIndex: number;
  lengthM: number;
  status: FootpathStatus;
  difficultyScore: number;
  lastVerifiedAt: string | null;
  activeObstacles?: ObstacleCode[];
}

export type FootpathSegmentFeature = GeoJSON.Feature<
  GeoJSON.LineString,
  FootpathSegmentFeatureProperties
>;

export type FootpathSegmentCollection = GeoJSON.FeatureCollection<
  GeoJSON.LineString,
  FootpathSegmentFeatureProperties
>;

export interface PilotAreaBBox {
  south: number;
  west: number;
  north: number;
  east: number;
}
