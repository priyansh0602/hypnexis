import type { FootpathSide, FootpathStatus } from '@accesspath/shared';

export type ObstacleType =
  | 'steps'
  | 'pole'
  | 'parked_vehicle'
  | 'vendor_cart'
  | 'garbage_rubble'
  | 'construction_material'
  | 'missing_kerb_ramp'
  | 'uneven_surface'
  | 'other';

export interface BoundingBox {
  ymin: number; // Normalized 0..1
  xmin: number; // Normalized 0..1
  ymax: number; // Normalized 0..1
  xmax: number; // Normalized 0..1
}

export interface ObstacleDetection {
  id: string;
  label: ObstacleType;
  confidence: number;
  bbox: BoundingBox;
  estimatedDistanceM: number; // Meters ahead along corridor (30-50m horizon)
  estimatedWidthM: number;
  lateralOffsetM: number; // Negative = left, positive = right
  severity: 'low' | 'medium' | 'high';
}

export interface PrivacyFacePlateRegion {
  type: 'face' | 'license_plate';
  bbox: BoundingBox;
  confidence: number;
}

export interface PrivacyBlurConfig {
  maxThumbnailSizeBytes: number; // 50KB strict limit for DPDP Act compliance
  blurStrength: number;
  enableFaceBlur: boolean;
  enablePlateBlur: boolean;
}

export const DEFAULT_PRIVACY_CONFIG: PrivacyBlurConfig = {
  maxThumbnailSizeBytes: 50 * 1024, // 50 KB
  blurStrength: 15,
  enableFaceBlur: true,
  enablePlateBlur: true,
};

export interface FrameProcessingMetrics {
  fps: number;
  inferenceTimeMs: number;
  timestamp: number;
  facesBlurred: number;
  platesBlurred: number;
  throttled: boolean;
}

export interface CopilotAlert {
  id: string;
  type: 'blockage_ahead' | 'last_safe_exit' | 'narrow_path' | 'all_clear';
  message: string;
  distanceM: number;
  rampDistanceM?: number | undefined;
  rampSide?: FootpathSide | undefined;
  timestamp: number;
  spoken: boolean;
}

export interface PendingObservation {
  id: string;
  segmentId: string;
  roadId?: string | undefined;
  side?: FootpathSide | undefined;
  status: FootpathStatus;
  obstacleTypes: string[];
  severity: number;
  userCoordinates: [number, number]; // [lng, lat]
  headingDegrees: number;
  thumbnailBase64?: string | undefined; // DPDP blurred thumbnail
  createdAt: string;
  syncAttempts: number;
  lastSyncError?: string | undefined;
}
