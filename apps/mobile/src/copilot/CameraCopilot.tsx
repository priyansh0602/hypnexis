import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
  Animated,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { EdgeFrameProcessor } from './frameProcessor.ts';
import { triggerLastSafeExitAlert, triggerAllClearAlert, stopSpeaking } from './copilotAlerts.ts';
import { applyPrivacyBlur, detectFacesAndPlates } from './privacyBlur.ts';
import {
  enqueueObservation,
  flushObservationQueue,
  recordAllClearObservation,
} from './observationQueue.ts';
import type { ObstacleDetection, CopilotAlert, FrameProcessingMetrics } from './types.ts';
import { lightTheme, darkTheme } from '../theme/index.ts';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface CameraCopilotProps {
  onClose?: () => void;
  userCoordinates?: [number, number]; // [lng, lat]
  headingDegrees?: number;
  currentRoadName?: string;
  isDark?: boolean;
}

export const CameraCopilot: React.FC<CameraCopilotProps> = ({
  onClose,
  userCoordinates = [77.638, 12.975],
  headingDegrees = 45,
  currentRoadName = '100 Feet Road, Indiranagar',
  isDark = true,
}) => {
  const theme = isDark ? darkTheme : lightTheme;

  const [isProcessing, setIsProcessing] = useState(true);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [activeAlert, setActiveAlert] = useState<CopilotAlert | null>(null);
  const [detections, setDetections] = useState<ObstacleDetection[]>([]);
  const [metrics, setMetrics] = useState<FrameProcessingMetrics>({
    fps: 2.5,
    inferenceTimeMs: 42,
    timestamp: Date.now(),
    facesBlurred: 0,
    platesBlurred: 0,
    throttled: false,
  });
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [privacyMaskActive, setPrivacyMaskActive] = useState(true);

  // Pulse animation for HUD alert
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const processorRef = useRef<EdgeFrameProcessor | null>(null);

  if (!processorRef.current) {
    processorRef.current = new EdgeFrameProcessor({ targetFps: 2.5 });
  }

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [pulseAnim]);

  // Simulated processing tick (2.5 FPS)
  useEffect(() => {
    if (!isProcessing) return;

    const interval = setInterval(async () => {
      if (!processorRef.current) return;

      const result = await processorRef.current.processFrame(detections);
      setMetrics(result.metrics);
    }, 400);

    return () => clearInterval(interval);
  }, [isProcessing, detections]);

  // Handler to trigger simulated 40m blockage with Last Safe Exit
  const handleSimulateBlockage = useCallback(async () => {
    const obstacle = EdgeFrameProcessor.createSyntheticObstacle(
      'steps',
      [0.45, 0.35, 0.65, 0.65], // Obstacle ~40m ahead
      0.92,
    );

    setDetections([obstacle]);

    // Apply on-device privacy masking test
    const dummyImage = 'data:image/jpeg;base64,' + 'A'.repeat(8000);
    const regions = detectFacesAndPlates(640, 480, [obstacle]);
    const privacyResult = await applyPrivacyBlur(dummyImage, regions);

    setMetrics((prev) => ({
      ...prev,
      facesBlurred: privacyResult.facesBlurred,
      platesBlurred: privacyResult.platesBlurred,
    }));

    // Trigger Last Safe Exit alert: blocked 40m ahead, ramp available 5m ahead on left
    if (!voiceMuted) {
      const alert = await triggerLastSafeExitAlert(40, 5, 'left', true);
      setActiveAlert(alert);
    }

    // Queue observation offline
    await enqueueObservation({
      segmentId: 'seg-pilot-100ft-03',
      roadId: 'road-100ft-indiranagar',
      side: 'left',
      status: 'red',
      obstacleTypes: ['steps'],
      severity: 90,
      userCoordinates,
      headingDegrees,
      thumbnailBase64: privacyResult.blurredBase64,
    });

    setPendingQueueCount((c) => c + 1);
  }, [voiceMuted, userCoordinates, headingDegrees]);

  const handleSimulateAllClear = useCallback(async () => {
    setDetections([]);
    setActiveAlert(null);
    await stopSpeaking();

    if (!voiceMuted) {
      const alert = await triggerAllClearAlert('seg-pilot-100ft-03');
      setActiveAlert(alert);
    }

    await recordAllClearObservation(
      {
        id: 'seg-pilot-100ft-03',
        roadId: 'road-100ft-indiranagar',
        side: 'left',
        segmentIndex: 3,
        lengthM: 10,
        status: 'green',
        coordinates: [userCoordinates, [userCoordinates[0] + 0.0001, userCoordinates[1] + 0.0001]],
      },
      userCoordinates,
      headingDegrees,
    );

    setPendingQueueCount((c) => c + 1);
  }, [voiceMuted, userCoordinates, headingDegrees]);

  const handleSyncQueue = useCallback(async () => {
    const result = await flushObservationQueue();
    setPendingQueueCount(result.remainingQueueSize);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      {/* Viewfinder Background Simulator */}
      <View style={styles.viewfinder}>
        {/* Rolling Corridor Visualizer Overlay (Green/Yellow/Red ground lines) */}
        <View style={styles.corridorGrid}>
          {/* Vanishing perspective horizon */}
          <View style={styles.horizonLine} />

          {/* Wheelchair clear width corridor guide (1.05m width: 0.9m + 0.15m margin) */}
          <View
            style={[
              styles.corridorPath,
              {
                borderColor:
                  detections.length > 0 ? theme.statusColors.red : theme.statusColors.green,
              },
            ]}
          />

          {/* Distance markers (10m, 20m, 30m, 40m, 50m) */}
          <View style={[styles.distanceMarker, { top: '35%' }]}>
            <Text style={styles.distanceLabel}>50m</Text>
          </View>
          <View style={[styles.distanceMarker, { top: '48%' }]}>
            <Text style={styles.distanceLabel}>40m</Text>
          </View>
          <View style={[styles.distanceMarker, { top: '60%' }]}>
            <Text style={styles.distanceLabel}>30m</Text>
          </View>
          <View style={[styles.distanceMarker, { top: '75%' }]}>
            <Text style={styles.distanceLabel}>15m</Text>
          </View>

          {/* Bounding box overlays for detected obstacles */}
          {detections.map((det) => (
            <View
              key={det.id}
              style={[
                styles.detectionBox,
                {
                  top: `${det.bbox.ymin * 100}%`,
                  left: `${det.bbox.xmin * 100}%`,
                  width: `${(det.bbox.xmax - det.bbox.xmin) * 100}%`,
                  height: `${(det.bbox.ymax - det.bbox.ymin) * 100}%`,
                  borderColor: theme.statusColors.red,
                },
              ]}
            >
              <View style={[styles.detectionBadge, { backgroundColor: theme.statusColors.red }]}>
                <Text style={styles.detectionBadgeText}>
                  {det.label.toUpperCase()} • {Math.round(det.estimatedDistanceM)}m
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Top Header & Privacy Badge */}
        <View style={styles.topHeader}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.privacyBadge}>
            <MaterialCommunityIcons name="shield-lock" size={16} color="#4ADE80" />
            <Text style={styles.privacyBadgeText}>DPDP Act 2023 Masking Active (≤50KB)</Text>
          </View>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => {
              setVoiceMuted((v) => !v);
              if (!voiceMuted) stopSpeaking();
            }}
          >
            <MaterialCommunityIcons
              name={voiceMuted ? 'volume-off' : 'volume-high'}
              size={22}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        </View>

        {/* Street & Road Indicator */}
        <View style={styles.roadIndicatorCard}>
          <MaterialCommunityIcons name="compass-outline" size={18} color="#FFFFFF" />
          <Text style={styles.roadIndicatorText}>
            {currentRoadName} ({headingDegrees}°)
          </Text>
        </View>

        {/* High-Priority Last Safe Exit HUD Banner */}
        {activeAlert && (
          <Animated.View
            style={[
              styles.alertCard,
              {
                transform: [{ scale: pulseAnim }],
                backgroundColor: activeAlert.type === 'all_clear' ? '#166534' : '#991B1B',
              },
            ]}
          >
            <View style={styles.alertHeaderRow}>
              <MaterialCommunityIcons
                name={activeAlert.type === 'all_clear' ? 'check-circle' : 'alert-octagon'}
                size={26}
                color="#FFFFFF"
              />
              <Text style={styles.alertTitle}>
                {activeAlert.type === 'last_safe_exit'
                  ? 'LAST SAFE EXIT DETECTED'
                  : activeAlert.type === 'all_clear'
                    ? 'PATH UNOBSTRUCTED'
                    : 'COPILOT ALERT'}
              </Text>
            </View>
            <Text style={styles.alertMessage}>{activeAlert.message}</Text>
          </Animated.View>
        )}

        {/* Bottom Control Bar */}
        <View style={styles.bottomBar}>
          <View style={styles.telemetryRow}>
            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryValue}>{metrics.fps.toFixed(1)}</Text>
              <Text style={styles.telemetryLabel}>FPS</Text>
            </View>
            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryValue}>{metrics.inferenceTimeMs}ms</Text>
              <Text style={styles.telemetryLabel}>Latency</Text>
            </View>
            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryValue}>{detections.length}</Text>
              <Text style={styles.telemetryLabel}>Barriers</Text>
            </View>
            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryValue}>{pendingQueueCount}</Text>
              <Text style={styles.telemetryLabel}>Queued</Text>
            </View>
          </View>

          {/* Interactive Simulation / Testing Buttons */}
          <View style={styles.actionButtonRow}>
            <TouchableOpacity
              style={[styles.simButton, { backgroundColor: '#DC2626' }]}
              onPress={handleSimulateBlockage}
            >
              <MaterialCommunityIcons name="stairs" size={18} color="#FFFFFF" />
              <Text style={styles.simButtonText}>Simulate Blockage</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.simButton, { backgroundColor: '#16A34A' }]}
              onPress={handleSimulateAllClear}
            >
              <MaterialCommunityIcons name="check-all" size={18} color="#FFFFFF" />
              <Text style={styles.simButtonText}>All-Clear</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.simButton, { backgroundColor: '#2563EB' }]}
              onPress={handleSyncQueue}
            >
              <MaterialCommunityIcons name="cloud-upload" size={18} color="#FFFFFF" />
              <Text style={styles.simButtonText}>Sync Queue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  viewfinder: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#0A0F1D',
  },
  corridorGrid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  horizonLine: {
    position: 'absolute',
    top: '30%',
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  corridorPath: {
    position: 'absolute',
    top: '30%',
    bottom: 0,
    width: '45%',
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(34, 197, 94, 0.06)',
  },
  distanceMarker: {
    position: 'absolute',
    left: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.3)',
    width: 60,
  },
  distanceLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  detectionBox: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  detectionBadge: {
    position: 'absolute',
    top: -22,
    left: 0,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  detectionBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  topHeader: {
    position: 'absolute',
    top: 48,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.3)',
  },
  privacyBadgeText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '600',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  roadIndicatorCard: {
    position: 'absolute',
    top: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  roadIndicatorText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },
  alertCard: {
    position: 'absolute',
    top: '22%',
    left: 20,
    right: 20,
    borderRadius: 14,
    padding: 16,
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  alertHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  alertTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  alertMessage: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  telemetryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  telemetryItem: {
    alignItems: 'center',
  },
  telemetryValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  telemetryLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  actionButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  simButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  simButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
