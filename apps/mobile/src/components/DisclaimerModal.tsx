import React from 'react';
import { StyleSheet, View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';

interface DisclaimerModalProps {
  visible: boolean;
  onAccept: () => void;
}

export const DisclaimerModal: React.FC<DisclaimerModalProps> = ({ visible, onAccept }) => {
  const { theme } = useAppTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
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
          <View style={styles.iconContainer}>
            <View style={[styles.iconBubble, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
              <MaterialCommunityIcons name="alert-octagon" size={40} color="#ef4444" />
            </View>
          </View>

          <Text style={[styles.title, { color: theme.textPrimary }]}>Important Safety Notice</Text>

          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Assistive Navigation Aid, Not a Guarantee
          </Text>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            <View
              style={[
                styles.noticeBox,
                {
                  backgroundColor: theme.surfaceSubtle,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.bulletRow}>
                <MaterialCommunityIcons
                  name="shield-alert-outline"
                  size={20}
                  color={theme.accent}
                  style={styles.bulletIcon}
                />
                <Text style={[styles.bulletText, { color: theme.textPrimary }]}>
                  <Text style={styles.bold}>Safety First:</Text> AccessPath is an assistive aid
                  designed to help wheelchair users discover footpath conditions. It does not
                  replace personal judgement, vigilance, or local traffic rules.
                </Text>
              </View>

              <View style={styles.bulletRow}>
                <MaterialCommunityIcons
                  name="clock-alert-outline"
                  size={20}
                  color="#f59e0b"
                  style={styles.bulletIcon}
                />
                <Text style={[styles.bulletText, { color: theme.textPrimary }]}>
                  <Text style={styles.bold}>Rapid Road Changes:</Text> Parked vehicles, vendor
                  carts, and sudden construction rubble may appear at any time after evidence is
                  collected.
                </Text>
              </View>

              <View style={styles.bulletRow}>
                <MaterialCommunityIcons
                  name="eye-off-outline"
                  size={20}
                  color={theme.statusColors.grey}
                  style={styles.bulletIcon}
                />
                <Text style={[styles.bulletText, { color: theme.textPrimary }]}>
                  <Text style={styles.bold}>No Invented Accessibility:</Text> Areas shown in{' '}
                  <Text style={{ color: theme.statusColors.grey, fontWeight: '700' }}>Grey</Text>{' '}
                  indicate unverified segments with no recent audit. Never assume a Grey segment is
                  rollable.
                </Text>
              </View>

              <View style={styles.bulletRow}>
                <MaterialCommunityIcons
                  name="wheelchair-accessibility"
                  size={20}
                  color={theme.statusColors.green}
                  style={styles.bulletIcon}
                />
                <Text style={[styles.bulletText, { color: theme.textPrimary }]}>
                  <Text style={styles.bold}>Customized Width:</Text> Set your exact wheelchair width
                  and clearance margin in the Profile settings to ensure accuracy for your chair.
                </Text>
              </View>
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.acceptButton, { backgroundColor: theme.accent }]}
            onPress={onAccept}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Accept safety disclaimer and proceed"
          >
            <MaterialCommunityIcons
              name="check-circle-outline"
              size={20}
              color={theme.accentContrast}
              style={{ marginRight: 8 }}
            />
            <Text style={[styles.acceptButtonText, { color: theme.accentContrast }]}>
              I Understand & Agree
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '85%',
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  iconBubble: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  scrollArea: {
    marginBottom: 20,
  },
  noticeBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  bulletIcon: {
    marginRight: 10,
    marginTop: 2,
  },
  bulletText: {
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  bold: {
    fontWeight: '700',
  },
  acceptButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
