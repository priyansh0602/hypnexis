import React, { useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';
import type { FootpathSegmentCollection, FootpathSegmentFeatureProperties } from '../types';

export interface MapLibreWebViewRef {
  recenter: (coords?: [number, number]) => void;
  flyToCoordinate: (coord: [number, number], zoom?: number) => void;
  setRoutes: (accessibleCoords: [number, number][], standardCoords: [number, number][], stuckPoints?: [number, number][]) => void;
  clearRoutes: () => void;
}

interface MapLibreWebViewProps {
  segmentCollection: FootpathSegmentCollection;
  onSelectSegment: (properties: FootpathSegmentFeatureProperties) => void;
  selectedSegmentId: string | null;
  accessibleRoute?: [number, number][];
  standardRoute?: [number, number][];
  stuckPoints?: [number, number][];
}

const HTML_CONTENT = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css" />
  <script src="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js"></script>
  <style>
    body, html, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #0A1236; }
    .maplibregl-ctrl-bottom-right, .maplibregl-ctrl-bottom-left { display: none !important; }
    .stuck-marker {
      background: #EF4444;
      color: white;
      border: 2px solid white;
      border-radius: 50%;
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 14px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.5);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const map = new maplibregl.Map({
      container: 'map',
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [77.6410, 12.9750],
      zoom: 15.2,
      attributionControl: false
    });

    let currentMarkers = [];

    map.on('load', () => {
      // 1. Footpath segments source
      map.addSource('footpaths', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Segment casing (outline)
      map.addLayer({
        id: 'footpaths-casing',
        type: 'line',
        source: 'footpaths',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#0A1236',
          'line-width': 5.5,
          'line-opacity': 0.8
        }
      });

      // Segment color by status
      map.addLayer({
        id: 'footpaths-lines',
        type: 'line',
        source: 'footpaths',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'match',
            ['get', 'status'],
            'green', '#22C55E',
            'yellow', '#FACC15',
            'red', '#EF4444',
            '#9CA3AF'
          ],
          'line-width': 3.8
        }
      });

      // 2. Routes sources
      map.addSource('route-standard', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addLayer({
        id: 'route-standard-layer',
        type: 'line',
        source: 'route-standard',
        paint: {
          'line-color': '#94A3B8',
          'line-width': 4.5,
          'line-dasharray': [2, 2]
        }
      });

      map.addSource('route-accessible', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addLayer({
        id: 'route-accessible-layer',
        type: 'line',
        source: 'route-accessible',
        paint: {
          'line-color': '#22C55E',
          'line-width': 6.0,
          'line-opacity': 0.95
        }
      });

      // Click event for segments
      map.on('click', 'footpaths-lines', (e) => {
        if (e.features && e.features.length > 0) {
          const props = e.features[0].properties;
          if (props && props.active_obstacles && typeof props.active_obstacles === 'string') {
            try { props.active_obstacles = JSON.parse(props.active_obstacles); } catch (err) {}
          }
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'SEGMENT_CLICK',
              properties: props
            }));
          }
        }
      });

      map.on('mouseenter', 'footpaths-lines', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'footpaths-lines', () => { map.getCanvas().style.cursor = ''; });

      // Signal ready
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MAP_READY' }));
      }
    });

    window.updateSegments = (data) => {
      const src = map.getSource('footpaths');
      if (src) src.setData(data);
    };

    window.updateRoutes = (accessibleCoords, standardCoords, stuckPoints) => {
      // Clear previous stuck markers
      currentMarkers.forEach(m => m.remove());
      currentMarkers = [];

      const srcAcc = map.getSource('route-accessible');
      if (srcAcc) {
        srcAcc.setData({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: accessibleCoords || []
          }
        });
      }

      const srcStd = map.getSource('route-standard');
      if (srcStd) {
        srcStd.setData({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: standardCoords || []
          }
        });
      }

      // Add stuck points with red ! badge
      if (stuckPoints && stuckPoints.length > 0) {
        stuckPoints.forEach(pt => {
          const el = document.createElement('div');
          el.className = 'stuck-marker';
          el.textContent = '!';
          const marker = new maplibregl.Marker({ element: el })
            .setLngLat(pt)
            .addTo(map);
          currentMarkers.push(marker);
        });
      }
    };

    window.recenter = (lng, lat) => {
      map.flyTo({ center: [lng, lat], zoom: 15.5, duration: 1000 });
    };
  </script>
</body>
</html>
`;

export const MapLibreWebView = forwardRef<MapLibreWebViewRef, MapLibreWebViewProps>(
  ({ segmentCollection, onSelectSegment, accessibleRoute, standardRoute, stuckPoints }, ref) => {
    const webViewRef = useRef<WebView | null>(null);

    const recenter = useCallback((coords?: [number, number]) => {
      const target = coords || [77.6410, 12.9750];
      webViewRef.current?.injectJavaScript(`window.recenter(${target[0]}, ${target[1]}); true;`);
    }, []);

    const flyToCoordinate = useCallback((coord: [number, number], zoom = 16.5) => {
      webViewRef.current?.injectJavaScript(
        `map.flyTo({ center: [${coord[0]}, ${coord[1]}], zoom: ${zoom}, duration: 800 }); true;`,
      );
    }, []);

    const setRoutes = useCallback(
      (
        acc: [number, number][],
        std: [number, number][],
        stuck: [number, number][] = [],
      ) => {
        const payload = JSON.stringify({ acc, std, stuck });
        webViewRef.current?.injectJavaScript(
          `const data = ${payload}; window.updateRoutes(data.acc, data.std, data.stuck); true;`,
        );
      },
      [],
    );

    const clearRoutes = useCallback(() => {
      webViewRef.current?.injectJavaScript(
        `window.updateRoutes([], [], []); true;`,
      );
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        recenter,
        flyToCoordinate,
        setRoutes,
        clearRoutes,
      }),
      [recenter, flyToCoordinate, setRoutes, clearRoutes],
    );

    // Sync segment collection into WebView
    const handleMapReady = useCallback(() => {
      if (segmentCollection && segmentCollection.features.length > 0) {
        const escaped = JSON.stringify(segmentCollection);
        webViewRef.current?.injectJavaScript(`window.updateSegments(${escaped}); true;`);
      }
      if (accessibleRoute || standardRoute) {
        setRoutes(accessibleRoute || [], standardRoute || [], stuckPoints || []);
      }
    }, [segmentCollection, accessibleRoute, standardRoute, stuckPoints, setRoutes]);

    const onMessage = (event: { nativeEvent: { data: string } }) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === 'MAP_READY') {
          handleMapReady();
        } else if (msg.type === 'SEGMENT_CLICK' && msg.properties) {
          onSelectSegment(msg.properties);
        }
      } catch (err) {
        console.warn('Map message error:', err);
      }
    };

    const AnyWebView = WebView as unknown as React.ComponentType<any>;

    return (
      <View style={styles.container}>
        <AnyWebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: HTML_CONTENT }}
          style={styles.webView}
          onMessage={onMessage}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={false}
          scalesPageToFit={true}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1236',
  },
  webView: {
    flex: 1,
    backgroundColor: '#0A1236',
  },
});
