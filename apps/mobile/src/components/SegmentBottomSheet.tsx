import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Modal,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { useWheelchairProfile } from '../context/WheelchairProfileContext';
import { OBSTACLE_METADATA } from '../theme';
import type { FootpathSegmentFeatureProperties, ObservationRow, ObstacleCode } from '../types';
import { fetchSegmentObservations } from '../services/segmentService';
import { formatDistance, formatTimestamp } from '../utils/geometry';

interface SegmentBottomSheetProps {
  segment: FootpathSegmentFeatureProperties | null;
  onClose: () => void;
}

export const SegmentBottomSheet: React.FC<SegmentBottomSheetProps> = ({ segment, onClose }) => {
  const { theme } = useAppTheme();
  const { profile, totalClearanceRequired } = useWheelchairProfile();

  const [observations, setObservations] = useState<ObservationRow[]>([]);
  const [loadingObservations, setLoadingObservations] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (!segment) {
      setObservations([]);
      return;
    }

    let isMounted = true;
    setLoadingObservations(true);

    fetchSegmentObservations(segment.id)
      .then((obs) => {
        if (isMounted) {
          setObservations(obs);
          setLoadingObservations(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoadingObservations(false);
      });

    return () => {
      isMounted = false;
    };
  }, [segment]);

  if (!segment) return null;

  const statusColor = theme.statusColors[segment.status];
  const statusLabel = theme.statusLabels[segment.status];
  const statusDesc = theme.statusDescriptions[segment.status];

  // Derive obstacles from observations or properties
  const obstacleSet = new Set<ObstacleCode>();
  if (segment.activeObstacles && Array.isArray(segment.activeObstacles)) {
    segment.activeObstacles.forEach((o) => obstacleSet.add(o));
  }
  observations.forEach((obs) => {
    if (obs.obstacle_type && !obs.is_clear) {
      obstacleSet.add(obs.obstacle_type);
    }
  });
  const obstacles = Array.from(obstacleSet);

  // Wheelchair compatibility message
  const isBlocked = segment.status === 'red';
  const isRough = segment.status === 'yellow';
  const isUnverified = segment.status === 'grey';

  return (
    <View
      style={[
        styles.sheetContainer,
        {
          backgroundColor: theme.surface,
          borderColor: theme.borderStrong,
          shadowColor: theme.shadow,
        },
      ]}
    >
      {/* Drag / Close Handle */}
      <View style={styles.topHandleBar}>
        <View style={[styles.handlePill, { backgroundColor: theme.border }]} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetContent}>
        {/* Header: Segment Title & Close */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.sideBadgeRow}>
              <View
                style={[
                  styles.sideBadge,
                  { backgroundColor: theme.surfaceSubtle, borderColor: theme.border },
                ]}
              >
                <MaterialCommunityIcons
                  name={segment.side === 'left' ? 'arrow-left-bold' : 'arrow-right-bold'}
                  size={14}
                  color={theme.accent}
                />
                <Text style={[styles.sideBadgeText, { color: theme.textSecondary }]}>
                  {segment.side === 'left' ? 'Left Footpath' : 'Right Footpath'}
                </Text>
              </View>
              <Text style={[styles.segmentIdText, { color: theme.textMuted }]}>#{segment.id}</Text>
            </View>

            <Text style={[styles.streetName, { color: theme.textPrimary }]}>
              Footpath Segment {segment.segmentIndex > 0 ? `· Section ${segment.segmentIndex}` : ''}
            </Text>
          </View>

          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeBtn, { backgroundColor: theme.surfaceSubtle }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons name="close" size={20} color={theme.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Status Pill Card */}
        <View
          style={[
            styles.statusCard,
            {
              backgroundColor: `${statusColor}18`,
              borderColor: statusColor,
            },
          ]}
        >
          <View style={styles.statusTitleRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusTitle, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          <Text style={[styles.statusDescription, { color: theme.textSecondary }]}>
            {statusDesc}
          </Text>
        </View>

        {/* Metrics Grid */}
        <View style={styles.metricsGrid}>
          <View
            style={[
              styles.metricCard,
              { backgroundColor: theme.surfaceSubtle, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Length</Text>
            <Text style={[styles.metricValue, { color: theme.textPrimary }]}>
              {formatDistance(segment.lengthM)}
            </Text>
          </View>

          <View
            style={[
              styles.metricCard,
              { backgroundColor: theme.surfaceSubtle, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Difficulty Score</Text>
            <Text
              style={[
                styles.metricValue,
                {
                  color:
                    segment.difficultyScore > 70
                      ? theme.statusColors.red
                      : segment.difficultyScore > 40
                        ? theme.statusColors.yellow
                        : theme.statusColors.green,
                },
              ]}
            >
              {segment.difficultyScore} / 100
            </Text>
          </View>

          <View
            style={[
              styles.metricCard,
              { backgroundColor: theme.surfaceSubtle, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Last Audit</Text>
            <Text style={[styles.metricValueSmall, { color: theme.textPrimary }]}>
              {formatTimestamp(segment.lastVerifiedAt)}
            </Text>
          </View>
        </View>

        {/* Wheelchair Compatibility Notice */}
        <View
          style={[
            styles.chairNoticeCard,
            {
              backgroundColor: isBlocked
                ? 'rgba(239, 68, 68, 0.12)'
                : isRough
                  ? 'rgba(245, 158, 11, 0.12)'
                  : isUnverified
                    ? 'rgba(148, 163, 184, 0.12)'
                    : 'rgba(16, 185, 129, 0.12)',
              borderColor: statusColor,
            },
          ]}
        >
          <MaterialCommunityIcons
            name={
              isBlocked
                ? 'close-octagon'
                : isRough
                  ? 'alert'
                  : isUnverified
                    ? 'help-circle'
                    : 'check-decagram'
            }
            size={22}
            color={statusColor}
            style={{ marginRight: 10 }}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.chairNoticeTitle, { color: theme.textPrimary }]}>
              {profile.widthMetres.toFixed(2)} m Wheelchair Profile Check
            </Text>
            <Text style={[styles.chairNoticeDesc, { color: theme.textSecondary }]}>
              {isBlocked
                ? `Blocked by impassable barriers. Cannot accommodate your ${totalClearanceRequired.toFixed(2)} m required clearance.`
                : isRough
                  ? `Rough terrain may tilt or stall a ${profile.widthMetres.toFixed(2)} m chair. Extreme care needed.`
                  : isUnverified
                    ? `No recorded wheelchair clearance data. Do not assume rollability.`
                    : `Sufficient clear rolling corridor for your ${profile.widthMetres.toFixed(2)} m wheelchair.`}
            </Text>
          </View>
        </View>

        {/* Obstacle Badges Section */}
        <View style={styles.sectionContainer}>
          <Text style={[styles.sectionHeading, { color: theme.textPrimary }]}>
            Active Obstacles ({obstacles.length})
          </Text>

          {obstacles.length === 0 ? (
            <View
              style={[
                styles.emptyBox,
                { backgroundColor: theme.surfaceSubtle, borderColor: theme.border },
              ]}
            >
              <MaterialCommunityIcons
                name="shield-check"
                size={20}
                color={theme.statusColors.green}
              />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                {isUnverified
                  ? 'No obstacle reports on file for this unverified segment.'
                  : 'No active physical blockages reported on this footpath.'}
              </Text>
            </View>
          ) : (
            <View style={styles.obstacleBadgesList}>
              {obstacles.map((code) => {
                const meta = OBSTACLE_METADATA[code] || {
                  name: code,
                  icon: 'alert-circle',
                  severity: 50,
                  isPermanent: false,
                  description: 'Reported obstacle restriction.',
                };
                return (
                  <View
                    key={code}
                    style={[
                      styles.obstacleBadgeCard,
                      {
                        backgroundColor: theme.surfaceSubtle,
                        borderColor: meta.isPermanent
                          ? theme.statusColors.red
                          : theme.statusColors.yellow,
                      },
                    ]}
                  >
                    <View style={styles.obstacleBadgeHeader}>
                      <View style={styles.obstacleBadgeLeft}>
                        <MaterialCommunityIcons
                          name={(meta.icon as any) || 'alert-circle'}
                          size={18}
                          color={
                            meta.isPermanent ? theme.statusColors.red : theme.statusColors.yellow
                          }
                        />
                        <Text style={[styles.obstacleName, { color: theme.textPrimary }]}>
                          {meta.name}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.severityPill,
                          {
                            backgroundColor: meta.isPermanent
                              ? 'rgba(239, 68, 68, 0.2)'
                              : 'rgba(245, 158, 11, 0.2)',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.severityText,
                            {
                              color: meta.isPermanent
                                ? theme.statusColors.red
                                : theme.statusColors.yellow,
                            },
                          ]}
                        >
                          {meta.isPermanent ? 'Permanent' : 'Temporary'} · {meta.severity}%
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.obstacleDesc, { color: theme.textSecondary }]}>
                      {meta.description}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Proof Photos & Attribution */}
        <View style={styles.sectionContainer}>
          <Text style={[styles.sectionHeading, { color: theme.textPrimary }]}>
            Evidence & Photo Proof
          </Text>

          {loadingObservations ? (
            <ActivityIndicator size="small" color={theme.accent} style={{ marginVertical: 12 }} />
          ) : observations.length === 0 ? (
            <View
              style={[
                styles.emptyBox,
                { backgroundColor: theme.surfaceSubtle, borderColor: theme.border },
              ]}
            >
              <MaterialCommunityIcons name="camera-off" size={20} color={theme.textMuted} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No verified street-level photos uploaded for this segment yet.
              </Text>
            </View>
          ) : (
            <View style={styles.observationList}>
              {observations.map((obs) => (
                <View
                  key={obs.id}
                  style={[
                    styles.obsCard,
                    { backgroundColor: theme.surfaceSubtle, borderColor: theme.border },
                  ]}
                >
                  {obs.photo_url ? (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setSelectedPhoto(obs.photo_url)}
                      style={styles.thumbnailWrapper}
                    >
                      <Image
                        source={{ uri: obs.photo_url }}
                        style={styles.thumbnailImage}
                        resizeMode="cover"
                      />
                      <View style={styles.tapToZoomBadge}>
                        <MaterialCommunityIcons name="magnify-plus" size={12} color="#ffffff" />
                        <Text style={styles.tapToZoomText}>Tap to View</Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.noThumbBox, { backgroundColor: theme.surfaceElevated }]}>
                      <MaterialCommunityIcons
                        name="image-outline"
                        size={24}
                        color={theme.textMuted}
                      />
                      <Text style={[styles.noThumbText, { color: theme.textMuted }]}>
                        Non-visual sensor observation
                      </Text>
                    </View>
                  )}

                  <View style={styles.obsMeta}>
                    <View style={styles.obsSourceRow}>
                      <View style={[styles.sourcePill, { backgroundColor: theme.surfaceElevated }]}>
                        <Text style={[styles.sourceText, { color: theme.accent }]}>
                          Source: {obs.source.toUpperCase()}
                        </Text>
                      </View>
                      <Text style={[styles.obsConfidence, { color: theme.textMuted }]}>
                        Conf: {Math.round(obs.confidence * 100)}%
                      </Text>
                    </View>

                    {obs.attribution?.provider && (
                      <Text style={[styles.attributionText, { color: theme.textSecondary }]}>
                        Attribution:{' '}
                        <Text style={{ fontWeight: '700', color: theme.textPrimary }}>
                          © {obs.attribution.provider}
                        </Text>
                        {obs.attribution.creator ? ` (${obs.attribution.creator})` : ''}
                        {obs.attribution.license ? ` · ${obs.attribution.license}` : ''}
                      </Text>
                    )}

                    <Text style={[styles.capturedAtText, { color: theme.textMuted }]}>
                      Captured: {formatTimestamp(obs.captured_at)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* Fullscreen Photo Modal */}
      <Modal
        visible={Boolean(selectedPhoto)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPhoto(null)}
      >
        <View style={styles.photoModalOverlay}>
          <TouchableOpacity
            style={styles.photoModalClose}
            onPress={() => setSelectedPhoto(null)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <MaterialCommunityIcons name="close-circle" size={36} color="#ffffff" />
          </TouchableOpacity>
          {selectedPhoto && (
            <Image
              source={{ uri: selectedPhoto }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </View>
  );
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  sheetContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    maxHeight: '65%',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 16,
  },
  topHandleBar: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  handlePill: {
    width: 44,
    height: 5,
    borderRadius: 3,
  },
  sheetContent: {
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  sideBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sideBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  sideBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  segmentIdText: {
    fontSize: 11,
  },
  streetName: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
    marginBottom: 14,
  },
  statusTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  statusDescription: {
    fontSize: 12,
    lineHeight: 17,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  metricCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  metricValueSmall: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  chairNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  chairNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  chairNoticeDesc: {
    fontSize: 11,
    lineHeight: 16,
  },
  sectionContainer: {
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  emptyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  emptyText: {
    fontSize: 12,
    flex: 1,
  },
  obstacleBadgesList: {
    gap: 8,
  },
  obstacleBadgeCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
  },
  obstacleBadgeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  obstacleBadgeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  obstacleName: {
    fontSize: 13,
    fontWeight: '700',
  },
  severityPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  severityText: {
    fontSize: 10,
    fontWeight: '800',
  },
  obstacleDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  observationList: {
    gap: 10,
  },
  obsCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
  },
  thumbnailWrapper: {
    position: 'relative',
    height: 140,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  tapToZoomBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tapToZoomText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  noThumbBox: {
    height: 60,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    gap: 4,
  },
  noThumbText: {
    fontSize: 11,
  },
  obsMeta: {
    gap: 4,
  },
  obsSourceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sourcePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sourceText: {
    fontSize: 10,
    fontWeight: '800',
  },
  obsConfidence: {
    fontSize: 10,
  },
  attributionText: {
    fontSize: 11,
  },
  capturedAtText: {
    fontSize: 10,
  },
  photoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoModalClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },
  fullscreenImage: {
    width: SCREEN_WIDTH,
    height: '80%',
  },
});
