import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { useWheelchairProfile, WHEELCHAIR_PRESETS } from '../context/WheelchairProfileContext';

interface ProfileScreenProps {
  navigation?: {
    goBack: () => void;
  };
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ navigation }) => {
  const { theme } = useAppTheme();
  const {
    profile,
    totalClearanceRequired,
    selectedPresetId,
    setWidthMetres,
    setClearanceMarginMetres,
    applyPreset,
  } = useWheelchairProfile();

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
          Wheelchair Specifications
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
            Active Chair Configuration
          </Text>
          <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
            Footpath segments with clear width below your total clearance corridor will be flagged
            as yellow or red.
          </Text>

          <View style={styles.metricRow}>
            <View
              style={[
                styles.metricBox,
                { backgroundColor: theme.surfaceSubtle, borderColor: theme.border },
              ]}
            >
              <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Chair Width</Text>
              <Text style={[styles.metricVal, { color: theme.accent }]}>
                {profile.widthMetres.toFixed(2)} m
              </Text>
            </View>

            <View
              style={[
                styles.metricBox,
                { backgroundColor: theme.surfaceSubtle, borderColor: theme.border },
              ]}
            >
              <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Clearance Buffer</Text>
              <Text style={[styles.metricVal, { color: theme.accent }]}>
                2× {profile.clearanceMarginMetres.toFixed(2)} m
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.totalNotice,
              {
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                borderColor: theme.statusColors.green,
              },
            ]}
          >
            <MaterialCommunityIcons
              name="check-circle-outline"
              size={20}
              color={theme.statusColors.green}
            />
            <Text style={[styles.totalNoticeText, { color: theme.textPrimary }]}>
              Minimum Required Clear Width:{' '}
              <Text style={{ fontWeight: '800', color: theme.statusColors.green }}>
                {totalClearanceRequired.toFixed(2)} m
              </Text>
            </Text>
          </View>
        </View>

        {/* Presets */}
        <Text style={[styles.heading, { color: theme.textPrimary }]}>
          Choose Wheelchair Category
        </Text>
        <View style={styles.presetsWrapper}>
          {WHEELCHAIR_PRESETS.map((preset) => {
            const isSelected = selectedPresetId === preset.id;
            return (
              <TouchableOpacity
                key={preset.id}
                onPress={() => applyPreset(preset)}
                style={[
                  styles.presetBtn,
                  {
                    backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.12)' : theme.surface,
                    borderColor: isSelected ? theme.accent : theme.border,
                  },
                ]}
                activeOpacity={0.8}
              >
                <View style={styles.presetTop}>
                  <Text
                    style={[
                      styles.presetTitle,
                      { color: isSelected ? theme.accent : theme.textPrimary },
                    ]}
                  >
                    {preset.name}
                  </Text>
                  <Text
                    style={[
                      styles.presetWidthPill,
                      {
                        backgroundColor: isSelected ? theme.accent : theme.surfaceSubtle,
                        color: isSelected ? theme.accentContrast : theme.textSecondary,
                      },
                    ]}
                  >
                    {preset.widthMetres.toFixed(2)} m
                  </Text>
                </View>
                <Text style={[styles.presetDescription, { color: theme.textSecondary }]}>
                  {preset.description}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Custom Fine-Tuning */}
        <Text style={[styles.heading, { color: theme.textPrimary }]}>Custom Adjustments</Text>
        <View
          style={[styles.customCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <View style={styles.stepperRow}>
            <View>
              <Text style={[styles.stepperTitle, { color: theme.textPrimary }]}>
                Wheelchair Width
              </Text>
              <Text style={[styles.stepperSub, { color: theme.textMuted }]}>
                Adjust by 0.05m increments
              </Text>
            </View>
            <View style={styles.btnRow}>
              <TouchableOpacity
                onPress={() => setWidthMetres(profile.widthMetres - 0.05)}
                style={[styles.smallBtn, { backgroundColor: theme.surfaceSubtle }]}
              >
                <MaterialCommunityIcons name="minus" size={18} color={theme.textPrimary} />
              </TouchableOpacity>
              <Text style={[styles.valText, { color: theme.accent }]}>
                {profile.widthMetres.toFixed(2)} m
              </Text>
              <TouchableOpacity
                onPress={() => setWidthMetres(profile.widthMetres + 0.05)}
                style={[styles.smallBtn, { backgroundColor: theme.surfaceSubtle }]}
              >
                <MaterialCommunityIcons name="plus" size={18} color={theme.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.stepperRow, { marginTop: 14 }]}>
            <View>
              <Text style={[styles.stepperTitle, { color: theme.textPrimary }]}>
                Side Clearance Margin
              </Text>
              <Text style={[styles.stepperSub, { color: theme.textMuted }]}>
                Safety buffer on both sides
              </Text>
            </View>
            <View style={styles.btnRow}>
              <TouchableOpacity
                onPress={() => setClearanceMarginMetres(profile.clearanceMarginMetres - 0.02)}
                style={[styles.smallBtn, { backgroundColor: theme.surfaceSubtle }]}
              >
                <MaterialCommunityIcons name="minus" size={18} color={theme.textPrimary} />
              </TouchableOpacity>
              <Text style={[styles.valText, { color: theme.accent }]}>
                {profile.clearanceMarginMetres.toFixed(2)} m
              </Text>
              <TouchableOpacity
                onPress={() => setClearanceMarginMetres(profile.clearanceMarginMetres + 0.02)}
                style={[styles.smallBtn, { backgroundColor: theme.surfaceSubtle }]}
              >
                <MaterialCommunityIcons name="plus" size={18} color={theme.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>
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
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 14,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  metricBox: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  metricVal: {
    fontSize: 18,
    fontWeight: '800',
  },
  totalNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  totalNoticeText: {
    fontSize: 12,
  },
  heading: {
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  presetsWrapper: {
    gap: 10,
    marginBottom: 20,
  },
  presetBtn: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
  },
  presetTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  presetTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  presetWidthPill: {
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  presetDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  customCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  stepperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepperTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  stepperSub: {
    fontSize: 11,
    marginTop: 2,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  smallBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  valText: {
    fontSize: 15,
    fontWeight: '800',
    minWidth: 55,
    textAlign: 'center',
  },
});
