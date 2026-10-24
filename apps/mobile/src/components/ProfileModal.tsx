import React, { useState } from 'react';
import { StyleSheet, View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import {
  useWheelchairProfile,
  WHEELCHAIR_PRESETS,
  type WheelchairPreset,
} from '../context/WheelchairProfileContext';

interface ProfileModalProps {
  visible: boolean;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ visible, onClose }) => {
  const { theme } = useAppTheme();
  const {
    profile,
    totalClearanceRequired,
    selectedPresetId,
    setWidthMetres,
    setClearanceMarginMetres,
    applyPreset,
  } = useWheelchairProfile();

  const [tempWidth, setTempWidth] = useState(profile.widthMetres);
  const [tempMargin, setTempMargin] = useState(profile.clearanceMarginMetres);

  // Sync state on open
  React.useEffect(() => {
    if (visible) {
      setTempWidth(profile.widthMetres);
      setTempMargin(profile.clearanceMarginMetres);
    }
  }, [visible, profile]);

  const handleStepWidth = (delta: number) => {
    const next = Math.max(0.55, Math.min(1.8, Math.round((tempWidth + delta) * 100) / 100));
    setTempWidth(next);
  };

  const handleStepMargin = (delta: number) => {
    const next = Math.max(0.05, Math.min(0.4, Math.round((tempMargin + delta) * 100) / 100));
    setTempMargin(next);
  };

  const handleApplyPreset = (preset: WheelchairPreset) => {
    setTempWidth(preset.widthMetres);
    setTempMargin(preset.clearanceMarginMetres);
    applyPreset(preset);
  };

  const handleSave = () => {
    setWidthMetres(tempWidth);
    setClearanceMarginMetres(tempMargin);
    onClose();
  };

  const computedClearance = Math.round((tempWidth + 2 * tempMargin) * 100) / 100;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: theme.borderStrong,
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <MaterialCommunityIcons
                name="wheelchair-accessibility"
                size={26}
                color={theme.accent}
              />
              <Text style={[styles.title, { color: theme.textPrimary }]}>Wheelchair Profile</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialCommunityIcons name="close" size={24} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollArea}>
            <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
              AccessPath calculates footpath passability and warning flags based on your exact chair
              dimensions.
            </Text>

            {/* Presets */}
            <Text style={[styles.sectionHeading, { color: theme.textPrimary }]}>
              Standard Presets
            </Text>
            <View style={styles.presetList}>
              {WHEELCHAIR_PRESETS.map((preset) => {
                const isSelected =
                  selectedPresetId === preset.id && tempWidth === preset.widthMetres;
                return (
                  <TouchableOpacity
                    key={preset.id}
                    onPress={() => handleApplyPreset(preset)}
                    style={[
                      styles.presetCard,
                      {
                        backgroundColor: isSelected
                          ? 'rgba(56, 189, 248, 0.12)'
                          : theme.surfaceSubtle,
                        borderColor: isSelected ? theme.accent : theme.border,
                      },
                    ]}
                    activeOpacity={0.8}
                  >
                    <View style={styles.presetCardTop}>
                      <Text
                        style={[
                          styles.presetName,
                          { color: isSelected ? theme.accent : theme.textPrimary },
                        ]}
                      >
                        {preset.name}
                      </Text>
                      <View
                        style={[
                          styles.badge,
                          {
                            backgroundColor: isSelected ? theme.accent : theme.surfaceElevated,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            {
                              color: isSelected ? theme.accentContrast : theme.textSecondary,
                            },
                          ]}
                        >
                          {preset.widthMetres.toFixed(2)} m
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.presetDesc, { color: theme.textSecondary }]}>
                      {preset.description}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom Adjustments */}
            <Text style={[styles.sectionHeading, { color: theme.textPrimary, marginTop: 18 }]}>
              Fine-Tune Dimensions
            </Text>

            {/* Width Stepper */}
            <View
              style={[
                styles.stepperContainer,
                { backgroundColor: theme.surfaceSubtle, borderColor: theme.border },
              ]}
            >
              <View>
                <Text style={[styles.stepperLabel, { color: theme.textPrimary }]}>
                  Wheelchair Width
                </Text>
                <Text style={[styles.stepperSubLabel, { color: theme.textMuted }]}>
                  Widest point (wheel to wheel)
                </Text>
              </View>
              <View style={styles.stepperControls}>
                <TouchableOpacity
                  onPress={() => handleStepWidth(-0.05)}
                  style={[styles.stepperBtn, { backgroundColor: theme.surfaceElevated }]}
                >
                  <MaterialCommunityIcons name="minus" size={20} color={theme.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.stepperValue, { color: theme.accent }]}>
                  {tempWidth.toFixed(2)} m
                </Text>
                <TouchableOpacity
                  onPress={() => handleStepWidth(0.05)}
                  style={[styles.stepperBtn, { backgroundColor: theme.surfaceElevated }]}
                >
                  <MaterialCommunityIcons name="plus" size={20} color={theme.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Clearance Margin Stepper */}
            <View
              style={[
                styles.stepperContainer,
                { backgroundColor: theme.surfaceSubtle, borderColor: theme.border, marginTop: 10 },
              ]}
            >
              <View>
                <Text style={[styles.stepperLabel, { color: theme.textPrimary }]}>
                  Safety Clearance Margin
                </Text>
                <Text style={[styles.stepperSubLabel, { color: theme.textMuted }]}>
                  Buffer on both sides (default 0.15 m)
                </Text>
              </View>
              <View style={styles.stepperControls}>
                <TouchableOpacity
                  onPress={() => handleStepMargin(-0.02)}
                  style={[styles.stepperBtn, { backgroundColor: theme.surfaceElevated }]}
                >
                  <MaterialCommunityIcons name="minus" size={20} color={theme.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.stepperValue, { color: theme.accent }]}>
                  {tempMargin.toFixed(2)} m
                </Text>
                <TouchableOpacity
                  onPress={() => handleStepMargin(0.02)}
                  style={[styles.stepperBtn, { backgroundColor: theme.surfaceElevated }]}
                >
                  <MaterialCommunityIcons name="plus" size={20} color={theme.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Total Required Corridor */}
            <View
              style={[
                styles.corridorNotice,
                {
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  borderColor: theme.statusColors.green,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="arrow-expand-horizontal"
                size={22}
                color={theme.statusColors.green}
                style={{ marginRight: 10 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.corridorTitle, { color: theme.textPrimary }]}>
                  Total Clear Path Required:{' '}
                  <Text style={{ color: theme.statusColors.green, fontWeight: '800' }}>
                    {computedClearance.toFixed(2)} m
                  </Text>
                </Text>
                <Text style={[styles.corridorText, { color: theme.textSecondary }]}>
                  Includes {tempWidth.toFixed(2)} m chair + 2× {tempMargin.toFixed(2)} m buffer.
                </Text>
              </View>
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: theme.accent }]}
            onPress={handleSave}
            activeOpacity={0.85}
          >
            <Text style={[styles.saveButtonText, { color: theme.accentContrast }]}>
              Apply Wheelchair Profile
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  card: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    padding: 22,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
  },
  scrollArea: {
    marginBottom: 16,
  },
  sectionSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  presetList: {
    gap: 10,
  },
  presetCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
  },
  presetCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  presetName: {
    fontSize: 15,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  presetDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  stepperContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  stepperLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  stepperSubLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },
  stepperValue: {
    fontSize: 16,
    fontWeight: '800',
    minWidth: 60,
    textAlign: 'center',
  },
  corridorNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 16,
  },
  corridorTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  corridorText: {
    fontSize: 11,
    marginTop: 2,
  },
  saveButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
});
