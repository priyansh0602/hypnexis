import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';

interface AttributionScreenProps {
  navigation?: {
    goBack: () => void;
  };
}

export const AttributionScreen: React.FC<AttributionScreenProps> = ({ navigation }) => {
  const { theme } = useAppTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.headerBar,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation?.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>
          Licences & Attribution
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* OpenStreetMap */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="map-outline" size={22} color={theme.accent} />
            <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>OpenStreetMap</Text>
          </View>
          <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
            Map data is © OpenStreetMap contributors and made available under the Open Database
            License (ODbL 1.0). Road centerlines, road names, and intersection geometries are
            derived from OSM data for India without commercial alteration.
          </Text>
          <View style={[styles.tag, { backgroundColor: theme.surfaceSubtle }]}>
            <Text style={[styles.tagText, { color: theme.textMuted }]}>Licence: ODbL 1.0</Text>
          </View>
        </View>

        {/* Mapillary */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="camera-iris" size={22} color={theme.accent} />
            <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Mapillary</Text>
          </View>
          <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
            Street-level imagery used to project footpath observations is sourced via the Mapillary
            Graph API. All images are licensed under Creative Commons Attribution-ShareAlike 4.0
            International (CC-BY-SA 4.0).
          </Text>
          <View style={[styles.tag, { backgroundColor: theme.surfaceSubtle }]}>
            <Text style={[styles.tagText, { color: theme.textMuted }]}>Licence: CC-BY-SA 4.0</Text>
          </View>
        </View>

        {/* OpenFreeMap / Protomaps */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="earth" size={22} color={theme.accent} />
            <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>OpenFreeMap</Text>
          </View>
          <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
            Base vector tiles and rendering styles are provided freely by OpenFreeMap. No
            proprietary SDKs (Google Maps or Mapbox SDK) are bundled in this binary.
          </Text>
          <View style={[styles.tag, { backgroundColor: theme.surfaceSubtle }]}>
            <Text style={[styles.tagText, { color: theme.textMuted }]}>
              Service: OpenFreeMap Public Tiles
            </Text>
          </View>
        </View>

        {/* Privacy & DPDP Act */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons
              name="shield-lock-outline"
              size={22}
              color={theme.statusColors.green}
            />
            <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
              Privacy & DPDP Act 2023
            </Text>
          </View>
          <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
            AccessPath adheres to the Digital Personal Data Protection Act 2023 principles of data
            minimisation and purpose limitation. Face and vehicle number plate blurring runs
            on-device before any image upload. Real-time location is never stored permanently
            without user consent.
          </Text>
        </View>
      </ScrollView>
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
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  content: {
    padding: 16,
    gap: 14,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
  },
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
