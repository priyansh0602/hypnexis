import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';

interface AttributionBarProps {
  onPressDetails?: () => void;
}

export const AttributionBar: React.FC<AttributionBarProps> = ({ onPressDetails }) => {
  const { theme } = useAppTheme();
  const [modalVisible, setModalVisible] = useState(false);

  const handleOpen = () => {
    if (onPressDetails) {
      onPressDetails();
    } else {
      setModalVisible(true);
    }
  };

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handleOpen}
        style={[
          styles.barContainer,
          {
            backgroundColor: theme.surfaceSubtle,
            borderColor: theme.border,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Data and imagery attribution information"
      >
        <MaterialCommunityIcons
          name="information-outline"
          size={14}
          color={theme.accent}
          style={styles.icon}
        />
        <Text style={[styles.barText, { color: theme.textSecondary }]} numberOfLines={1}>
          Map: <Text style={styles.bold}>© OpenStreetMap</Text> • Imagery:{' '}
          <Text style={styles.bold}>© Mapillary</Text> •{' '}
          <Text style={styles.bold}>OpenFreeMap</Text>
        </Text>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.borderStrong,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={styles.headerTitleRow}>
                <MaterialCommunityIcons
                  name="shield-check-outline"
                  size={24}
                  color={theme.accent}
                />
                <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
                  Data & Attribution
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel="Close attribution dialog"
              >
                <MaterialCommunityIcons name="close" size={22} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.accent }]}>Map Data</Text>
                <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
                  • <Text style={styles.bold}>OpenStreetMap:</Text> Road geometries, street names,
                  and baseline infrastructure are © OpenStreetMap contributors under the Open
                  Database License (ODbL 1.0).
                </Text>
                <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
                  • <Text style={styles.bold}>OpenFreeMap:</Text> Vector and raster base map tile
                  rendering is powered by OpenFreeMap without commercial trackers or proprietary
                  SDKs.
                </Text>
              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.accent }]}>
                  Street-Level Imagery
                </Text>
                <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
                  • <Text style={styles.bold}>Mapillary:</Text> Street-level imagery and
                  crowd-sourced sequences are licensed under Creative Commons Attribution-ShareAlike
                  4.0 International (CC-BY-SA 4.0).
                </Text>
                <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
                  • <Text style={styles.bold}>KartaView:</Text> Open-source street-level
                  observations licensed under Open Data Commons Open Database License (ODbL).
                </Text>
              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.accent }]}>
                  Privacy & DPDP Act 2023
                </Text>
                <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
                  AccessPath enforces on-device automated face and vehicle license-plate blurring
                  prior to any upload. No persistent tracking of wheelchair user journeys is
                  retained without explicit consent.
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: theme.accent }]}
              onPress={() => setModalVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.closeButtonText, { color: theme.accentContrast }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  barContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 12,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  icon: {
    marginRight: 6,
  },
  barText: {
    fontSize: 11,
    flex: 1,
  },
  bold: {
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '80%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalBody: {
    marginBottom: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 6,
  },
  closeButton: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
