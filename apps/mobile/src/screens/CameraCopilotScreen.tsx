import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Platform,
  StatusBar as RNStatusBar,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

interface CameraCopilotScreenProps {
  navigation: {
    navigate: (route: string) => void;
    goBack: () => void;
  };
}

export const CameraCopilotScreen: React.FC<CameraCopilotScreenProps> = ({ navigation }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [isAlertActive, setIsAlertActive] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [alertDistance, setAlertDistance] = useState(45);
  const [lastSafeExitDist, setLastSafeExitDist] = useState(5);
  const [speechMuted, setSpeechMuted] = useState(false);

  // Request permission on mount
  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // Voice announcement helper
  const speakAlert = useCallback(
    (text: string) => {
      if (speechMuted) return;
      Speech.stop();
      Speech.speak(text, {
        language: 'en-US',
        pitch: 1.0,
        rate: 0.95,
      });
    },
    [speechMuted],
  );

  // Trigger alert sequence
  const triggerObstacleAlert = useCallback(
    async (obstacleName: string, distanceM: number, exitDistM: number) => {
      setIsAlertActive(true);
      setAlertDistance(distanceM);
      setLastSafeExitDist(exitDistM);

      // 1. Haptics
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {}

      // 2. TTS Voice Alert
      const alertMsg = `Warning! Footpath blocked ${distanceM} metres ahead. Parked scooter detected. Use the kerb ramp ${exitDistM} metres ahead to cross to the right side.`;
      speakAlert(alertMsg);

      // 3. Auto-write live observation to Supabase (source='demo' for Tier 1)
      try {
        await supabase.from('observations').insert([
          {
            segment_id: 'seg-403dff91c2491bf0-L-0002',
            obstacle_type: 'parked_vehicle',
            confidence: 0.94,
            source: 'demo',
            captured_at: new Date().toISOString(),
            heading_degrees: 180,
            camera_side: 'L',
            is_clear: false,
            metadata: { note: 'Live simulated detection from wheelchair camera copilot' },
          },
        ]);
      } catch (err) {
        console.warn('Failed to insert live detection observation:', err);
      }
    },
    [speakAlert],
  );

  const handleSimulateDetection = () => {
    setIsSimulating(true);
    triggerObstacleAlert('Parked scooter', 45, 5);
  };

  const handleClearAlert = () => {
    setIsAlertActive(false);
    setIsSimulating(false);
    Speech.stop();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Camera Preview */}
      <View style={styles.cameraContainer}>
        {permission?.granted ? (
          <CameraView style={styles.camera} facing="back">
            {/* Safe Rolling Corridor Trapezoid Overlay */}
            <View style={styles.corridorOverlay}>
              <View style={[styles.corridorTrapezoid, isAlertActive && styles.corridorAlert]} />
            </View>

            {/* Obstacle Bounding Box & Distance Chip */}
            {isAlertActive && (
              <View style={styles.detectionBox}>
                <View style={styles.detectionChip}>
                  <MaterialCommunityIcons name="motorbike" size={14} color="#FFFFFF" />
                  <Text style={styles.detectionChipText}>Scooter · {alertDistance} m</Text>
                </View>
                <View style={styles.detectionBorder} />
              </View>
            )}
          </CameraView>
        ) : (
          <View style={styles.noCameraView}>
            <MaterialCommunityIcons name="camera-off" size={48} color="#9CC4FF" />
            <Text style={styles.noCameraText}>Camera permission required for Copilot HUD</Text>
            <TouchableOpacity style={styles.grantBtn} onPress={requestPermission}>
              <Text style={styles.grantBtnText}>Grant Permission</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Top Floating HUD: Red Warning Banner */}
        {isAlertActive ? (
          <View style={styles.topRedBanner}>
            <MaterialCommunityIcons name="alert-octagon" size={24} color="#FFFFFF" />
            <View style={styles.bannerTextCol}>
              <Text style={styles.bannerTitle}>BLOCKED {alertDistance}m AHEAD</Text>
              <Text style={styles.bannerSubtitle}>Parked scooter on left footpath</Text>
            </View>
          </View>
        ) : (
          <View style={styles.topClearBanner}>
            <MaterialCommunityIcons name="check-circle" size={20} color="#22C55E" />
            <Text style={styles.clearText}>Path Clear · Rolling Corridor Active</Text>
          </View>
        )}

        {/* Mode & Tier Badge */}
        <View style={styles.modeBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.modeText}>TIER 1 · SIMULATED DETECTION</Text>
        </View>

        {/* Audio Mute Toggle */}
        <TouchableOpacity
          style={styles.muteButton}
          onPress={() => setSpeechMuted(!speechMuted)}
          accessibilityLabel={speechMuted ? 'Unmute voice guidance' : 'Mute voice guidance'}
        >
          <MaterialCommunityIcons
            name={speechMuted ? 'volume-off' : 'volume-high'}
            size={22}
            color="#FFFFFF"
          />
        </TouchableOpacity>

        {/* Bottom Floating HUD: Blue Last Safe Exit Banner */}
        {isAlertActive && (
          <View style={styles.bottomBlueBanner}>
            <MaterialCommunityIcons name="transit-detour" size={26} color="#FFFFFF" />
            <View style={styles.exitTextCol}>
              <Text style={styles.exitTitle}>LAST SAFE EXIT</Text>
              <Text style={styles.exitSubtitle}>
                Use kerb ramp {lastSafeExitDist}m ahead on right →
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Control Action Bar */}
      <View style={styles.controlBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#FFFFFF" />
          <Text style={styles.btnText}>Map</Text>
        </TouchableOpacity>

        {!isAlertActive ? (
          <TouchableOpacity
            style={styles.simulateBtn}
            onPress={handleSimulateDetection}
            accessibilityLabel="Simulate detection of an obstacle 45 meters ahead"
          >
            <MaterialCommunityIcons name="radar" size={20} color="#FFFFFF" />
            <Text style={styles.simulateBtnText}>Simulate Obstacle (45m)</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.simulateBtn, { backgroundColor: '#22C55E' }]}
            onPress={handleClearAlert}
            accessibilityLabel="Reset alert to path clear"
          >
            <MaterialCommunityIcons name="check" size={20} color="#FFFFFF" />
            <Text style={styles.simulateBtnText}>Clear Obstacle Alert</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.routesBtn}
          onPress={() => navigation.navigate('RouteComparison')}
        >
          <MaterialCommunityIcons name="routes" size={22} color="#4DA3FF" />
          <Text style={[styles.btnText, { color: '#4DA3FF' }]}>Routes</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1236',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },
  noCameraView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    padding: 20,
  },
  noCameraText: {
    color: '#9CC4FF',
    fontSize: 14,
    textAlign: 'center',
  },
  grantBtn: {
    backgroundColor: '#1E5BFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  grantBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  corridorOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  corridorTrapezoid: {
    width: 220,
    height: 340,
    backgroundColor: 'rgba(34, 197, 94, 0.22)',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 2,
    borderColor: 'rgba(34, 197, 94, 0.65)',
    transform: [{ perspective: 300 }, { rotateX: '45deg' }],
    marginBottom: 40,
  },
  corridorAlert: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    borderColor: 'rgba(239, 68, 68, 0.85)',
  },
  detectionBox: {
    position: 'absolute',
    top: '35%',
    alignSelf: 'center',
    width: 130,
    height: 100,
    alignItems: 'center',
  },
  detectionBorder: {
    width: '100%',
    height: '100%',
    borderWidth: 2,
    borderColor: '#EF4444',
    borderRadius: 8,
    borderStyle: 'dashed',
  },
  detectionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
    marginBottom: 4,
  },
  detectionChipText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  topRedBanner: {
    position: 'absolute',
    top: Platform.OS === 'android' ? (RNStatusBar.currentHeight || 28) + 12 : 16,
    left: 16,
    right: 16,
    backgroundColor: '#DC2626',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  bannerTextCol: {
    flex: 1,
  },
  bannerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  bannerSubtitle: {
    color: '#FEE2E2',
    fontSize: 12,
    marginTop: 2,
  },
  topClearBanner: {
    position: 'absolute',
    top: Platform.OS === 'android' ? (RNStatusBar.currentHeight || 28) + 12 : 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(10, 18, 54, 0.85)',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#22C55E',
  },
  clearText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  modeBadge: {
    position: 'absolute',
    top: 80,
    alignSelf: 'center',
    backgroundColor: 'rgba(31, 42, 92, 0.90)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: '#4DA3FF',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FACC15',
  },
  modeText: {
    color: '#9CC4FF',
    fontSize: 10,
    fontWeight: '800',
  },
  muteButton: {
    position: 'absolute',
    top: 76,
    right: 16,
    backgroundColor: '#1F2A5C',
    padding: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#4DA3FF',
  },
  bottomBlueBanner: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: '#1E5BFF',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  exitTextCol: {
    flex: 1,
  },
  exitTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  exitSubtitle: {
    color: '#E0E7FF',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  controlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#12234F',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#1F2A5C',
    gap: 10,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 8,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  simulateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
    minHeight: 48,
  },
  simulateBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  routesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 8,
  },
});
