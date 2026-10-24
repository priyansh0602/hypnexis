import React, { useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { StyleSheet, View, type NativeSyntheticEvent } from 'react-native';
import {
  Map,
  Camera,
  GeoJSONSource,
  Layer,
  type CameraRef,
  type MapRef,
  type PressEventWithFeatures,
} from '@maplibre/maplibre-react-native';
import { useAppTheme } from '../context/ThemeContext';
import { PILOT_CENTER } from '../services/segmentService';
import type { FootpathSegmentCollection, FootpathSegmentFeatureProperties } from '../types';

export interface MapLibreViewRef {
  recenter: () => void;
  flyToCoordinate: (coord: [number, number], zoom?: number) => void;
}

interface MapLibreViewProps {
  segmentCollection: FootpathSegmentCollection;
  onSelectSegment: (properties: FootpathSegmentFeatureProperties) => void;
  selectedSegmentId: string | null;
}

export const MapLibreView = forwardRef<MapLibreViewRef, MapLibreViewProps>(
  ({ segmentCollection, onSelectSegment, selectedSegmentId: _selectedSegmentId }, ref) => {
    const { theme } = useAppTheme();
    const mapRef = useRef<MapRef | null>(null);
    const cameraRef = useRef<CameraRef | null>(null);

    const recenter = useCallback(() => {
      if (cameraRef.current) {
        cameraRef.current.flyTo({
          center: PILOT_CENTER,
          zoom: 15.5,
          duration: 1200,
        });
      }
    }, []);

    const flyToCoordinate = useCallback((coord: [number, number], zoom = 16.5) => {
      if (cameraRef.current) {
        cameraRef.current.flyTo({
          center: coord,
          zoom,
          duration: 1000,
        });
      }
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        recenter,
        flyToCoordinate,
      }),
      [recenter, flyToCoordinate],
    );

    const handleSourcePress = (e: NativeSyntheticEvent<PressEventWithFeatures>) => {
      const features = e.nativeEvent?.features;
      if (features && features.length > 0 && features[0]?.properties) {
        const props = features[0].properties as FootpathSegmentFeatureProperties;
        onSelectSegment(props);
      }
    };

    return (
      <View style={styles.container}>
        <Map
          ref={mapRef}
          style={styles.map}
          mapStyle={theme.mapStyle}
          dragPan
          touchZoom
          doubleTapZoom
        >
          <Camera
            ref={cameraRef}
            initialViewState={{
              center: PILOT_CENTER,
              zoom: 15.5,
            }}
          />

          <GeoJSONSource
            id="accesspath-footpaths"
            data={segmentCollection}
            onPress={handleSourcePress}
            hitbox={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            {/* Outline casing for contrast on any map background */}
            <Layer
              id="footpaths-casing"
              type="line"
              paint={{
                'line-color': theme.isDark ? '#000000' : '#ffffff',
                'line-width': 7,
                'line-opacity': 0.85,
              }}
              layout={{
                'line-cap': 'round',
                'line-join': 'round',
              }}
            />

            {/* Core status lines */}
            <Layer
              id="footpaths-colored"
              type="line"
              paint={{
                'line-color': [
                  'match',
                  ['get', 'status'],
                  'green',
                  '#10b981',
                  'yellow',
                  '#f59e0b',
                  'red',
                  '#ef4444',
                  '#94a3b8',
                ],
                'line-width': 4.5,
                'line-opacity': 0.95,
              }}
              layout={{
                'line-cap': 'round',
                'line-join': 'round',
              }}
            />
          </GeoJSONSource>
        </Map>
      </View>
    );
  },
);

MapLibreView.displayName = 'MapLibreView';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
});
