import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  TextInput,
  Platform,
  StatusBar as RNStatusBar,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { useWheelchairProfile } from '../context/WheelchairProfileContext';
import { MapLibreWebView, type MapLibreWebViewRef } from '../components/MapLibreWebView';
import { SegmentBottomSheet } from '../components/SegmentBottomSheet';
import { AttributionBar } from '../components/AttributionBar';
import { DisclaimerModal } from '../components/DisclaimerModal';
import { ProfileModal } from '../components/ProfileModal';
import { fetchFootpathSegments, subscribeToSegmentStateUpdates } from '../services/segmentService';
import type {
  FootpathSegmentCollection,
  FootpathSegmentFeatureProperties,
  SegmentStateRow,
} from '../types';

interface MapScreenProps {
  navigation: {
    navigate: (route: string) => void;
  };
}

export const MapScreen: React.FC<MapScreenProps> = ({ navigation }) => {
  const { theme } = useAppTheme();
  const { profile } = useWheelchairProfile();
  const mapRef = useRef<MapLibreWebViewRef | null>(null);

  const [segmentData, setSegmentData] = useState<FootpathSegmentCollection>({
    type: 'FeatureCollection',
    features: [],
  });

  const [loading, setLoading] = useState(true);
  const [selectedSegment, setSelectedSegment] = useState<FootpathSegmentFeatureProperties | null>(null);
  const [disclaimerVisible, setDisclaimerVisible] = useState(true);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [showDemoOnly, setShowDemoOnly] = useState(false);
  const [demoCount, setDemoCount] = useState(91);

  // Load footpath segments via high-speed RPC
  const loadSegments = useCallback(async () => {
    setLoading(true);
    try {
      const collection = await fetchFootpathSegments();
      setSegmentData(collection);

      const demoFeatures = collection.features.filter((f) => (f.properties as any)?.has_demo);
      if (demoFeatures.length > 0) {
        setDemoCount(demoFeatures.length);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSegments();
  }, [loadSegments]);

  // Realtime subscription to live segment_state changes
  useEffect(() => {
    const unsubscribe = subscribeToSegmentStateUpdates((update: SegmentStateRow) => {
      setSegmentData((prev) => {
        let changed = false;
        const newFeatures = prev.features.map((feat) => {
          if (feat.properties.id === update.segment_id) {
            changed = true;
            return {
              ...feat,
              properties: {
                ...feat.properties,
                status: update.status,
                difficultyScore: update.difficulty_score,
                lastVerifiedAt: update.last_verified_at,
              },
            };
          }
          return feat;
        });

        return changed ? { ...prev, features: newFeatures } : prev;
      });

      setSelectedSegment((current) => {
        if (current && current.id === update.segment_id) {
          return {
            ...current,
            status: update.status,
            difficultyScore: update.difficulty_score,
            lastVerifiedAt: update.last_verified_at,
          };
        }
        return current;
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleSelectSegment = useCallback((props: FootpathSegmentFeatureProperties) => {
    setSelectedSegment(props);
  }, []);

  const handleCloseBottomSheet = useCallback(() => {
    setSelectedSegment(null);
  }, []);

  const handleRecenter = useCallback(() => {
    mapRef.current?.recenter([77.6410, 12.9750]);
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#0A1236' }]}>
      <StatusBar style="light" />

      {/* Top Header & Search Bar */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandTitleRow}>
            <View style={styles.brandIcon}>
              <MaterialCommunityIcons name="wheelchair-accessibility" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.brandTitle}>AccessPath</Text>
            <View style={styles.realtimePulse}>
              <View style={styles.greenDot} />
              <Text style={styles.realtimeText}>Live Sync</Text>
            </View>
          </View>

          {/* DEMO DATA chip */}
          <TouchableOpacity
            style={[styles.demoChip, showDemoOnly && styles.demoChipActive]}
            onPress={() => setShowDemoOnly(!showDemoOnly)}
            accessibilityLabel="Demo data indicator, tap to filter"
          >
            <MaterialCommunityIcons name="database-marker" size={14} color="#FACC15" />
            <Text style={styles.demoChipText}>DEMO DATA ({demoCount})</Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar ("Where to?") */}
        <TouchableOpacity
          style={styles.searchBar}
          onPress={() => navigation.navigate('RouteComparison')}
          accessibilityLabel="Search destination or compare routes"
        >
          <MaterialCommunityIcons name="magnify" size={20} color="#9CC4FF" />
          <Text style={styles.searchPlaceholder}>Where to in Indiranagar?</Text>
          <View style={styles.searchRouteBadge}>
            <Text style={styles.searchRouteBadgeText}>Routes →</Text>
          </View>
        </TouchableOpacity>

        {/* Action Shortcuts */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.shortcutBtn}
            onPress={() => navigation.navigate('RouteComparison')}
          >
            <MaterialCommunityIcons name="routes" size={16} color="#4DA3FF" />
            <Text style={styles.shortcutText}>Dual Routes (Standard vs Accessible)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.shortcutBtn, { backgroundColor: '#1E5BFF' }]}
            onPress={() => navigation.navigate('CameraCopilot')}
          >
            <MaterialCommunityIcons name="camera" size={16} color="#FFFFFF" />
            <Text style={[styles.shortcutText, { color: '#FFFFFF' }]}>Copilot HUD</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Map View */}
      <View style={styles.mapContainer}>
        <MapLibreWebView
          ref={mapRef}
          segmentCollection={segmentData}
          onSelectSegment={handleSelectSegment}
          selectedSegmentId={selectedSegment?.id || null}
        />

        {loading && (
          <View style={styles.syncBadge}>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text style={styles.syncText}>Syncing live footpaths...</Text>
          </View>
        )}

        {/* Status Legend Overlay */}
        <View style={styles.legendOverlay}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#22C55E' }]} />
            <Text style={styles.legendText}>Clear</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#FACC15' }]} />
            <Text style={styles.legendText}>Rough</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
            <Text style={styles.legendText}>Blocked</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#9CA3AF' }]} />
            <Text style={styles.legendText}>Unverified</Text>
          </View>
        </View>

        {/* Floating Controls */}
        <View style={styles.fabColumn}>
          <TouchableOpacity style={styles.fab} onPress={handleRecenter} accessibilityLabel="Recenter map">
            <MaterialCommunityIcons name="crosshairs-gps" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.fab}
            onPress={() => setProfileModalVisible(true)}
            accessibilityLabel="Wheelchair profile settings"
          >
            <MaterialCommunityIcons name="wheelchair" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.fab}
            onPress={loadSegments}
            accessibilityLabel="Refresh footpath data"
          >
            <MaterialCommunityIcons name="refresh" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Attribution Bar */}
      <AttributionBar onPressDetails={() => navigation.navigate('Attribution')} />

      {/* Segment Detail Bottom Sheet */}
      <SegmentBottomSheet segment={selectedSegment} onClose={handleCloseBottomSheet} />

      {/* Modals */}
      <DisclaimerModal
        visible={disclaimerVisible}
        onAccept={() => setDisclaimerVisible(false)}
      />
      <ProfileModal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight || 28) + 6 : 10,
    paddingBottom: 12,
    backgroundColor: '#0A1236',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2A5C',
    gap: 10,
  },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandIcon: {
    backgroundColor: '#1E5BFF',
    padding: 6,
    borderRadius: 8,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  realtimePulse: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  realtimeText: {
    color: '#22C55E',
    fontSize: 10,
    fontWeight: '700',
  },
  demoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1F2A5C',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FACC15',
  },
  demoChipActive: {
    backgroundColor: 'rgba(250, 204, 21, 0.25)',
  },
  demoChipText: {
    color: '#FACC15',
    fontSize: 10,
    fontWeight: '800',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2A5C',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: '#2A3B7A',
  },
  searchPlaceholder: {
    flex: 1,
    color: '#9CC4FF',
    fontSize: 14,
    fontWeight: '500',
  },
  searchRouteBadge: {
    backgroundColor: '#1E5BFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  searchRouteBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  shortcutBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F2A5C',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#2A3B7A',
  },
  shortcutText: {
    color: '#9CC4FF',
    fontSize: 11,
    fontWeight: '700',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  syncBadge: {
    position: 'absolute',
    top: 55,
    alignSelf: 'center',
    backgroundColor: 'rgba(30, 91, 255, 0.90)',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    elevation: 4,
  },
  syncText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  legendOverlay: {
    position: 'absolute',
    top: 14,
    left: 14,
    backgroundColor: 'rgba(10, 18, 54, 0.90)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    gap: 10,
    borderWidth: 1,
    borderColor: '#1F2A5C',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  fabColumn: {
    position: 'absolute',
    bottom: 20,
    right: 14,
    gap: 10,
  },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1E5BFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});
