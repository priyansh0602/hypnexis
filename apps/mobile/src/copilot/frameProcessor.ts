import { type ObstacleDetection, type FrameProcessingMetrics, type ObstacleType } from './types.ts';

export interface CameraGeometry {
  mountingHeightM: number; // Height above pavement (default 0.95m on wheelchair)
  pitchDegrees: number; // Downward tilt (default 12 degrees)
  horizontalFovDegrees: number; // Default 70 degrees
  verticalFovDegrees: number; // Default 52 degrees
}

export const DEFAULT_CAMERA_GEOMETRY: CameraGeometry = {
  mountingHeightM: 0.95,
  pitchDegrees: 12.0,
  horizontalFovDegrees: 70.0,
  verticalFovDegrees: 52.0,
};

/**
 * Projects a 2D image coordinate (normalized ymax ground contact)
 * to 3D forward distance Z in metres ahead using camera geometry.
 */
export function estimateDistanceM(
  normalizedYMax: number,
  geometry: CameraGeometry = DEFAULT_CAMERA_GEOMETRY,
): number {
  // Horizon in normalized coordinates: y_horizon corresponds to pitch angle
  // y = 0 is top of image, y = 1 is bottom (closest to wheelchair)
  const vFovRad = (geometry.verticalFovDegrees * Math.PI) / 180;
  const pitchRad = (geometry.pitchDegrees * Math.PI) / 180;

  // Angle of ray relative to camera optical axis
  const rayAngle = (normalizedYMax - 0.5) * vFovRad;
  const totalElevationAngle = pitchRad + rayAngle;

  if (totalElevationAngle <= 0.02) {
    // Near or above horizon, distance approaches 50m ceiling
    return 50.0;
  }

  const distance = geometry.mountingHeightM / Math.tan(totalElevationAngle);
  return Math.max(1.0, Math.min(50.0, distance));
}

/**
 * Estimates lateral offset X in metres (negative = left, positive = right)
 * and obstacle ground width in metres.
 */
export function estimateLateralGeometry(
  xmin: number,
  xmax: number,
  distanceM: number,
  geometry: CameraGeometry = DEFAULT_CAMERA_GEOMETRY,
): { lateralOffsetM: number; estimatedWidthM: number } {
  const hFovRad = (geometry.horizontalFovDegrees * Math.PI) / 180;
  const imagePlaneWidthM = 2 * distanceM * Math.tan(hFovRad / 2);

  const xCenter = (xmin + xmax) / 2;
  const lateralOffsetM = (xCenter - 0.5) * imagePlaneWidthM;
  const estimatedWidthM = (xmax - xmin) * imagePlaneWidthM;

  return {
    lateralOffsetM: Math.round(lateralOffsetM * 100) / 100,
    estimatedWidthM: Math.round(estimatedWidthM * 100) / 100,
  };
}

export interface FrameProcessorConfig {
  targetFps: number; // Default 2.5 fps (process every 400ms)
  confidenceThreshold: number; // Default 0.45
  geometry: CameraGeometry;
}

export const DEFAULT_PROCESSOR_CONFIG: FrameProcessorConfig = {
  targetFps: 2.5,
  confidenceThreshold: 0.45,
  geometry: DEFAULT_CAMERA_GEOMETRY,
};

export class EdgeFrameProcessor {
  private lastProcessedTimestamp = 0;
  private readonly config: FrameProcessorConfig;
  private frameCount = 0;
  private fpsWindowStart = Date.now();
  private currentFps = 0;

  constructor(config?: Partial<FrameProcessorConfig>) {
    this.config = {
      targetFps: config?.targetFps ?? DEFAULT_PROCESSOR_CONFIG.targetFps,
      confidenceThreshold:
        config?.confidenceThreshold ?? DEFAULT_PROCESSOR_CONFIG.confidenceThreshold,
      geometry: config?.geometry ?? DEFAULT_PROCESSOR_CONFIG.geometry,
    };
  }

  /**
   * Determines if enough time has passed to process the next frame (2-3 FPS throttling).
   */
  public shouldProcessFrame(now: number = Date.now()): boolean {
    const minIntervalMs = 1000 / this.config.targetFps;
    return now - this.lastProcessedTimestamp >= minIntervalMs;
  }

  /**
   * Processes a raw camera frame, returning detected obstacles and performance metrics.
   * Runs fast on-device inference with thermal-protective throttling.
   */
  public async processFrame(
    mockDetections?: ObstacleDetection[],
    now: number = Date.now(),
  ): Promise<{
    detections: ObstacleDetection[];
    metrics: FrameProcessingMetrics;
  }> {
    const startTime = Date.now();

    if (!this.shouldProcessFrame(now)) {
      return {
        detections: [],
        metrics: {
          fps: this.currentFps,
          inferenceTimeMs: 0,
          timestamp: now,
          facesBlurred: 0,
          platesBlurred: 0,
          throttled: true,
        },
      };
    }

    this.lastProcessedTimestamp = now;
    this.frameCount++;

    // Calculate rolling FPS
    if (now - this.fpsWindowStart >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / (now - this.fpsWindowStart));
      this.frameCount = 0;
      this.fpsWindowStart = now;
    }

    // In production, fast-tflite runs model tensor here.
    // If mock or model detections provided, enrich with geometric projection:
    const detections: ObstacleDetection[] = (mockDetections || []).map((det) => {
      const distanceM = estimateDistanceM(det.bbox.ymax, this.config.geometry);
      const lateral = estimateLateralGeometry(
        det.bbox.xmin,
        det.bbox.xmax,
        distanceM,
        this.config.geometry,
      );

      // Severity classification based on obstacle type and distance
      let severity: 'low' | 'medium' | 'high' = 'medium';
      if (det.label === 'steps' || det.label === 'missing_kerb_ramp') {
        severity = 'high';
      } else if (distanceM < 15.0) {
        severity = 'high';
      } else if (distanceM > 35.0) {
        severity = 'low';
      }

      return {
        ...det,
        estimatedDistanceM: Math.round(distanceM * 10) / 10,
        estimatedWidthM: lateral.estimatedWidthM,
        lateralOffsetM: lateral.lateralOffsetM,
        severity,
      };
    });

    const inferenceTimeMs = Date.now() - startTime;

    return {
      detections,
      metrics: {
        fps: Math.max(1, this.currentFps),
        inferenceTimeMs,
        timestamp: now,
        facesBlurred: 0,
        platesBlurred: 0,
        throttled: false,
      },
    };
  }

  /**
   * Helper to generate synthetic test obstacles (for simulation and testing).
   */
  public static createSyntheticObstacle(
    label: ObstacleType,
    bbox: [number, number, number, number], // [ymin, xmin, ymax, xmax]
    confidence = 0.88,
  ): ObstacleDetection {
    const box = { ymin: bbox[0], xmin: bbox[1], ymax: bbox[2], xmax: bbox[3] };
    const dist = estimateDistanceM(box.ymax);
    const lat = estimateLateralGeometry(box.xmin, box.xmax, dist);

    return {
      id: `det-${Math.random().toString(36).substring(2, 7)}`,
      label,
      confidence,
      bbox: box,
      estimatedDistanceM: dist,
      estimatedWidthM: lat.estimatedWidthM,
      lateralOffsetM: lat.lateralOffsetM,
      severity: dist < 20 ? 'high' : 'medium',
    };
  }
}
