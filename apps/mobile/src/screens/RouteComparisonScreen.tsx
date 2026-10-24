import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  Platform,
  StatusBar as RNStatusBar,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { useWheelchairProfile } from '../context/WheelchairProfileContext';
import { MapLibreWebView, type MapLibreWebViewRef } from '../components/MapLibreWebView';
import { fetchFootpathSegments } from '../services/segmentService';
import type { FootpathSegmentCollection } from '../types';

interface RouteComparisonScreenProps {
  navigation: {
    navigate: (route: string) => void;
    goBack: () => void;
  };
}

export const RouteComparisonScreen: React.FC<RouteComparisonScreenProps> = ({ navigation }) => {
  const { theme } = useAppTheme();
  const { profile, setWidthMetres } = useWheelchairProfile();
  const mapRef = useRef<MapLibreWebViewRef | null>(null);

  const [loading, setLoading] = useState(true);
  const [segmentData, setSegmentData] = useState<FootpathSegmentCollection>({
    type: 'FeatureCollection',
    features: [],
  });

  const [selectedRouteType, setSelectedRouteType] = useState<'accessible' | 'standard'>('accessible');

  // Hardcoded demo corridor coordinates along 100 Feet Road
  // Standard route hits 3 blocked segments on the West/Left sidewalk
  const standardCoords: [number, number][] = useMemo(
    () => [
      [77.6410, 12.9715],
      [77.6411, 12.9728],
      [77.6412, 12.9740], // Stuck point 1: Parked scooter
      [77.6413, 12.9752], // Stuck point 2: Vendor cart
      [77.6414, 12.9765], // Stuck point 3: Rubble
      [77.6415, 12.9780],
    ],
    [],
  );

  // Accessible route: Crosses via ramp to East/Right sidewalk (Green), avoids all 3 blockages, then crosses back
  const accessibleCoords: [number, number][] = useMemo(
    () => [
      [77.6410, 12.9715],
      [77.6413, 12.9720], // Crosswalk with kerb ramp to East side
      [77.6416, 12.9730],
      [77.6417, 12.9745], // Rolling along unobstructed wide pavement
      [77.6418, 12.9760],
      [77.6419, 12.9772],
      [77.6415, 12.9780], // Reached destination
    ],
    [],
  );

  const stuckPoints: [number, number][] = useMemo(
    () => [
      [77.6412, 12.9740],
      [77.6413, 12.9752],
      [77.6414, 12.9765],
    ],
    [],
  );

  useEffect(() => {
    let isMounted = true;
    fetchFootpathSegments().then((res) => {
      if (isMounted) {
        setSegmentData(res);
        setLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleRecenter = useCallback(() => {
    mapRef.current?.recenter([77.6414, 12.9745]);
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#0A1236' }]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back to live map"
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>Route Comparison</Text>
          <Text style={styles.subtitle}>Indiranagar · 100 Feet Road Corridor</Text>
        </View>
        <TouchableOpacity
          style={styles.recenterButton}
          onPress={handleRecenter}
          accessibilityLabel="Recenter map"
        >
          <MaterialCommunityIcons name="crosshairs-gps" size={20} color="#4DA3FF" />
        </TouchableOpacity>
      </View>

      {/* Map View */}
      <View style={styles.mapContainer}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1E5BFF" />
            <Text style={styles.loadingText}>Computing accessible footpath routes...</Text>
          </View>
        ) : (
          <MapLibreWebView
            ref={mapRef}
            segmentCollection={segmentData}
            onSelectSegment={() => {}}
            selectedSegmentId={null}
            accessibleRoute={accessibleCoords}
            standardRoute={standardCoords}
            stuckPoints={stuckPoints}
          />
        )}
      </View>

      {/* Bottom Route Comparison Card */}
      <View style={styles.bottomCard}>
        {/* Route Selector Tabs */}
        <View style={styles.routeTabs}>
          <TouchableOpacity
            style={[
              styles.routeTab,
              selectedRouteType === 'accessible' && styles.routeTabActiveAccessible,
            ]}
            onPress={() => setSelectedRouteType('accessible')}
          >
            <View style={styles.tabIconRow}>
              <View style={[styles.dot, { backgroundColor: '#22C55E' }]} />
              <Text
                style={[
                  styles.tabLabel,
                  selectedRouteType === 'accessible' && styles.tabLabelActive,
                ]}
              >
                Accessible Route
              </Text>
            </View>
            <Text style={styles.tabMetric}>1.2 km · 14 min</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.routeTab,
              selectedRouteType === 'standard' && styles.routeTabActiveStandard,
            ]}
            onPress={() => setSelectedRouteType('standard')}
          >
            <View style={styles.tabIconRow}>
              <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />
              <Text
                style={[
                  styles.tabLabel,
                  selectedRouteType === 'standard' && styles.tabLabelActive,
                ]}
              >
                Standard Route
              </Text>
            </View>
            <Text style={styles.tabMetric}>0.9 km · 3 Blockages</Text>
          </TouchableOpacity>
        </View>

        {/* Comparison Summary Banner */}
        {selectedRouteType === 'accessible' ? (
          <View style={styles.summaryBox}>
            <View style={styles.statItem}>
              <MaterialCommunityIcons name="shield-check" size={20} color="#22C55E" />
              <Text style={styles.statTitle}>3 Blockages Avoided</Text>
            </View>
            <Text style={styles.statDesc}>
              Reroutes via opposite footpath. Zero steps, ramps verified on both sides.
            </Text>
          </View>
        ) : (
          <View style={[styles.summaryBox, { borderColor: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
            <View style={styles.statItem}>
              <MaterialCommunityIcons name="alert-octagon" size={20} color="#EF4444" />
              <Text style={[styles.statTitle, { color: '#EF4444' }]}>3 Wheelchair Blockages</Text>
            </View>
            <Text style={[styles.statDesc, { color: '#FCA5A5' }]}>
              Standard route follows road centerline. Pavement has parked scooters, vendor cart, and construction rubble.
            </Text>
          </View>
        )}

        {/* Wheelchair Profile Width Selector */}
        <View style={styles.profileRow}>
          <Text style={styles.profileLabel}>Wheelchair Width:</Text>
          <View style={styles.widthButtons}>
            {[0.75, 0.90, 1.05].map((w) => (
              <TouchableOpacity
                key={w}
                style={[
                  styles.widthBtn,
                  Math.abs(profile.widthMetres - w) < 0.05 && styles.widthBtnActive,
                ]}
                onPress={() => setWidthMetres(w)}
              >
                <Text
                  style={[
                    styles.widthBtnText,
                    Math.abs(profile.widthMetres - w) < 0.05 && styles.widthBtnTextActive,
                  ]}
                >
                  {w.toFixed(2)} m
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Start Navigation Button */}
        <TouchableOpacity
          style={styles.startNavButton}
          onPress={() => navigation.navigate('CameraCopilot')}
        >
          <MaterialCommunityIcons name="navigation-variant" size={20} color="#FFFFFF" />
          <Text style={styles.startNavText}>Start Live Camera Copilot</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight || 28) + 6 : 12,
    paddingBottom: 12,
    backgroundColor: '#0A1236',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2A5C',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 12,
    color: '#9CC4FF',
    marginTop: 2,
  },
  recenterButton: {
    padding: 8,
    backgroundColor: '#1F2A5C',
    borderRadius: 8,
  },
  mapContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A1236',
    gap: 12,
  },
  loadingText: {
    color: '#9CC4FF',
    fontSize: 13,
    fontWeight: '600',
  },
  bottomCard: {
    backgroundColor: '#12234F',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1F2A5C',
    gap: 12,
  },
  routeTabs: {
    flexDirection: 'row',
    gap: 10,
  },
  routeTab: {
    flex: 1,
    backgroundColor: '#1F2A5C',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  routeTabActiveAccessible: {
    borderColor: '#22C55E',
    backgroundColor: '#1A3358',
  },
  routeTabActiveStandard: {
    borderColor: '#EF4444',
    backgroundColor: '#381E38',
  },
  tabIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CC4FF',
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
  tabMetric: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  summaryBox: {
    backgroundColor: '#1F2A5C',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#22C55E',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  statTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#22C55E',
  },
  statDesc: {
    fontSize: 12,
    color: '#9CC4FF',
    lineHeight: 16,
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  profileLabel: {
    fontSize: 12,
    color: '#9CC4FF',
    fontWeight: '600',
  },
  widthButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  widthBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#1F2A5C',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2A3B7A',
  },
  widthBtnActive: {
    backgroundColor: '#1E5BFF',
    borderColor: '#4DA3FF',
  },
  widthBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CC4FF',
  },
  widthBtnTextActive: {
    color: '#FFFFFF',
  },
  startNavButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E5BFF',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    minHeight: 48,
  },
  startNavText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
