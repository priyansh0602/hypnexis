import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { useWheelchairProfile } from '../context/WheelchairProfileContext';
import { MapLibreView, type MapLibreViewRef } from '../components/MapLibreView';
import { SegmentBottomSheet } from '../components/SegmentBottomSheet';
import { AttributionBar } from '../components/AttributionBar';
import { DisclaimerModal } from '../components/DisclaimerModal';
import { ProfileModal } from '../components/ProfileModal';
import { fetchFootpathSegments, subscribeToSegmentStateUpdates } from '../services/segmentService';
import type {
  FootpathSegmentCollection,
  FootpathSegmentFeatureProperties,
  SegmentStateRow,
  FootpathStatus,
} from '../types';

interface MapScreenProps {
  navigation?: {
    navigate: (route: string) => void;
  };
}

export const MapScreen: React.FC<MapScreenProps> = ({ navigation }) => {
  const { theme, isDark, toggleTheme } = useAppTheme();
  const { profile } = useWheelchairProfile();

  const mapRef = useRef<MapLibreViewRef | null>(null);

  const [segmentData, setSegmentData] = useState<FootpathSegmentCollection>({
    type: 'FeatureCollection',
    features: [],
  });

  const [loading, setLoading] = useState(true);
  const [selectedSegment, setSelectedSegment] = useState<FootpathSegmentFeatureProperties | null>(
    null,
  );

  const [disclaimerVisible, setDisclaimerVisible] = useState(true);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [showLegend, setShowLegend] = useState(false);

  // Load footpath segments
  const loadSegments = useCallback(async () => {
    setLoading(true);
    try {
      const collection = await fetchFootpathSegments();
      setSegmentData(collection);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSegments();
  }, [loadSegments]);

  // Realtime subscription to segment_state updates
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

      // If currently selected segment received an update, sync it
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

  // Compute status counts for legend / filter bar
  const statusCounts = useMemo(() => {
    const counts: Record<FootpathStatus, number> = {
      green: 0,
      yellow: 0,
      red: 0,
      grey: 0,
    };
    for (const feat of segmentData.features) {
      const st = feat.properties.status;
      if (counts[st] !== undefined) {
        counts[st] += 1;
      }
    }
    return counts;
  }, [segmentData]);

  const handleSelectSegment = (props: FootpathSegmentFeatureProperties) => {
    setSelectedSegment(props);
  };

  const handleRecenter = () => {
    mapRef.current?.recenter();
  };

  const handleOpenAttribution = () => {
    if (navigation) {
      navigation.navigate('Attribution');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Top Header Bar */}
      <View
        style={[
          styles.headerBar,
          {
            backgroundColor: theme.surface,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <View style={[styles.brandIconBox, { backgroundColor: theme.surfaceSubtle }]}>
            <MaterialCommunityIcons
              name="wheelchair-accessibility"
              size={22}
              color={theme.accent}
            />
          </View>
          <View>
            <Text style={[styles.brandTitle, { color: theme.textPrimary }]}>AccessPath</Text>
            <Text style={[styles.pilotSubtitle, { color: theme.textSecondary }]}>
              Bengaluru Pilot · Indiranagar
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {/* Wheelchair Profile Button */}
          <TouchableOpacity
            style={[
              styles.profileBtn,
              {
                backgroundColor: theme.surfaceSubtle,
                borderColor: theme.border,
              },
            ]}
            onPress={() => setProfileModalVisible(true)}
            activeOpacity={0.8}
            accessibilityLabel="Open wheelchair profile settings"
          >
            <MaterialCommunityIcons
              name="ruler"
              size={16}
              color={theme.accent}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.profileBtnText, { color: theme.textPrimary }]}>
              {profile.widthMetres.toFixed(2)}m
            </Text>
          </TouchableOpacity>

          {/* Theme Toggle */}
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: theme.surfaceSubtle }]}
            onPress={toggleTheme}
            activeOpacity={0.8}
            accessibilityLabel="Toggle dark/light theme"
          >
            <MaterialCommunityIcons
              name={isDark ? 'weather-sunny' : 'weather-night'}
              size={20}
              color={theme.textPrimary}
            />
          </TouchableOpacity>

          {/* Legend Toggle */}
          <TouchableOpacity
            style={[
              styles.iconButton,
              {
                backgroundColor: showLegend ? 'rgba(56, 189, 248, 0.2)' : theme.surfaceSubtle,
              },
            ]}
            onPress={() => setShowLegend((prev) => !prev)}
            activeOpacity={0.8}
            accessibilityLabel="Toggle status legend"
          >
            <MaterialCommunityIcons
              name="layers-outline"
              size={20}
              color={showLegend ? theme.accent : theme.textPrimary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Expandable Legend / Status Overview */}
      {showLegend && (
        <View
          style={[
            styles.legendBar,
            {
              backgroundColor: theme.surfaceElevated,
              borderBottomColor: theme.border,
            },
          ]}
        >
          <View style={styles.legendItem}>
            <View style={[styles.legendPill, { backgroundColor: theme.statusColors.green }]} />
            <Text style={[styles.legendText, { color: theme.textSecondary }]}>
              Clear ({statusCounts.green})
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendPill, { backgroundColor: theme.statusColors.yellow }]} />
            <Text style={[styles.legendText, { color: theme.textSecondary }]}>
              Rough ({statusCounts.yellow})
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendPill, { backgroundColor: theme.statusColors.red }]} />
            <Text style={[styles.legendText, { color: theme.textSecondary }]}>
              Blocked ({statusCounts.red})
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendPill, { backgroundColor: theme.statusColors.grey }]} />
            <Text style={[styles.legendText, { color: theme.textSecondary }]}>
              Unverified ({statusCounts.grey})
            </Text>
          </View>
        </View>
      )}

      {/* Main Map Canvas */}
      <View style={styles.mapContainer}>
        <MapLibreView
          ref={mapRef}
          segmentCollection={segmentData}
          onSelectSegment={handleSelectSegment}
          selectedSegmentId={selectedSegment ? selectedSegment.id : null}
        />

        {/* Floating Controls */}
        <View style={styles.floatingControls}>
          <TouchableOpacity
            style={[
              styles.floatingBtn,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                shadowColor: theme.shadow,
              },
            ]}
            onPress={handleRecenter}
            activeOpacity={0.85}
            accessibilityLabel="Recenter map on Indiranagar pilot area"
          >
            <MaterialCommunityIcons name="crosshairs-gps" size={22} color={theme.accent} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.floatingBtn,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                shadowColor: theme.shadow,
              },
            ]}
            onPress={loadSegments}
            activeOpacity={0.85}
            accessibilityLabel="Refresh footpath data from database"
          >
            <MaterialCommunityIcons name="refresh" size={22} color={theme.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Loading Indicator */}
        {loading && (
          <View
            style={[
              styles.loadingBadge,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <ActivityIndicator size="small" color={theme.accent} />
            <Text style={[styles.loadingText, { color: theme.textPrimary }]}>
              Updating footpath graph...
            </Text>
          </View>
        )}

        {/* Attribution Bar (Persistent) */}
        <View style={styles.attributionWrapper}>
          <AttributionBar onPressDetails={handleOpenAttribution} />
        </View>

        {/* Segment Bottom Sheet */}
        <SegmentBottomSheet segment={selectedSegment} onClose={() => setSelectedSegment(null)} />
      </View>

      {/* First-launch safety disclaimer modal */}
      <DisclaimerModal visible={disclaimerVisible} onAccept={() => setDisclaimerVisible(false)} />

      {/* Wheelchair Profile Selector Modal */}
      <ProfileModal visible={profileModalVisible} onClose={() => setProfileModalVisible(false)} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  pilotSubtitle: {
    fontSize: 11,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  profileBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  legendBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendPill: {
    width: 14,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '700',
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  floatingControls: {
    position: 'absolute',
    top: 16,
    right: 16,
    gap: 10,
    zIndex: 10,
  },
  floatingBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 6,
  },
  loadingBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    zIndex: 10,
    elevation: 4,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: '600',
  },
  attributionWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 5,
  },
});
