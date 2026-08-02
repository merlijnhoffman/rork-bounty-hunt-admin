import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import { Radio, Crosshair, Clock, Navigation } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { EventZone, BountyLocation, getBountyStatus, BountyStatus } from '@/types';

const ZONE_RADIUS_DEFAULT = 1000;

/** Status config shared with the dashboard badge but with longer labels. */
const STATUS_CONFIG: Record<BountyStatus, { color: string; bg: string; label: string; pulse: boolean }> = {
  not_started:  { color: Colors.grey,   bg: Colors.greyDim,  label: 'Waiting for bounty to start broadcasting', pulse: false },
  broadcasting: { color: '#22C55E',    bg: 'rgba(34, 197, 94, 0.15)', label: 'Bounty broadcasting',                 pulse: true },
  signal_lost:  { color: Colors.amber, bg: Colors.amberDim, label: 'Bounty signal lost',                       pulse: false },
  stopped:      { color: Colors.red,   bg: Colors.redDim,   label: 'Bounty stopped',                           pulse: false },
};

function formatTimeAgo(updatedAt: string): string {
  const ms = Date.now() - new Date(updatedAt).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(updatedAt).toLocaleString();
}

/**
 * Live bounty tracking map. Subscribes to realtime updates via the parent's
 * react-query invalidation; receives the current bounty_location and zone.
 */
export function LiveBountyMap({
  eventId,
  accent,
  zone,
  bountyLocation,
  isLoading,
  eventStatus,
}: {
  eventId: string;
  accent: string;
  zone: EventZone | null | undefined;
  bountyLocation: BountyLocation | null | undefined;
  isLoading: boolean;
  eventStatus: string;
}) {
  const status = getBountyStatus(bountyLocation);
  const cfg = STATUS_CONFIG[status];
  // Only show the live marker when actively broadcasting (is_active && fresh).
  // When signal_lost or stopped, hide the marker and show the offline state.
  const isLive = status === 'broadcasting';

  // Map region: prefer bounty location, fall back to zone center, then default.
  const lat = bountyLocation?.latitude ?? zone?.center_latitude ?? 53.3498;
  const lng = bountyLocation?.longitude ?? zone?.center_longitude ?? -6.2603;
  // Use current_radius (the actual live radius) when present; only fall back to
  // initial_radius when the column is null. This matches the player app's contract.
  const zoneRadius =
    zone?.current_radius != null
      ? zone.current_radius
      : zone?.initial_radius ?? ZONE_RADIUS_DEFAULT;
  const delta = (zoneRadius / 111320) * 4;

  if (isLoading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={Colors.cyan} style={{ paddingVertical: 24 }} />
      </View>
    );
  }

  // Web fallback: no MapView, just status + coordinates.
  if (Platform.OS === 'web') {
    return (
      <View style={styles.card}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: cfg.color, ...(cfg.pulse && styles.statusDotPulse) }]} />
          <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label.toUpperCase()}</Text>
        </View>
        {bountyLocation ? (
          <View style={styles.coordsBlock}>
            <Text style={styles.coordLabel}>BOUNTY POSITION</Text>
            <Text style={styles.coordValue}>
              {bountyLocation.latitude.toFixed(6)}, {bountyLocation.longitude.toFixed(6)}
            </Text>
            {bountyLocation.accuracy != null && (
              <Text style={styles.metaText}>Accuracy: ±{Math.round(bountyLocation.accuracy)}m</Text>
            )}
            <Text style={styles.metaText}>Updated: {formatTimeAgo(bountyLocation.updated_at)}</Text>
          </View>
        ) : (
          <Text style={styles.emptyText}>{cfg.label}</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {/* Status header */}
      <View style={[styles.statusBanner, { backgroundColor: cfg.bg }]}>
        {cfg.pulse ? (
          <View style={[styles.statusDot, { backgroundColor: cfg.color, ...styles.statusDotPulse }]} />
        ) : (
          <Radio size={12} color={cfg.color} />
        )}
        <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label.toUpperCase()}</Text>
      </View>

      {isLive && bountyLocation ? (
        <>
          <View style={styles.mapContainer}>
            <MapView
              style={styles.map}
              region={{
                latitude: lat,
                longitude: lng,
                latitudeDelta: delta,
                longitudeDelta: delta,
              }}
              showsUserLocation={false}
              followsUserLocation={false}
            >
              {/* Zone overlay — uses current_radius (the actual live radius) */}
              {zone && (
                <Circle
                  center={{
                    latitude: zone.center_latitude,
                    longitude: zone.center_longitude,
                  }}
                  radius={zone.current_radius != null ? zone.current_radius : zone.initial_radius}
                  strokeColor={`${accent}66`}
                  fillColor={`${accent}14`}
                  strokeWidth={1}
                />
              )}

              {/* Bounty marker */}
              <Marker
                coordinate={{
                  latitude: bountyLocation.latitude,
                  longitude: bountyLocation.longitude,
                }}
                tracksViewChanges
              >
                <View style={[styles.bountyMarker, { borderColor: cfg.color }]}>
                  <View style={[styles.bountyMarkerInner, { backgroundColor: cfg.color }]} />
                </View>
              </Marker>
            </MapView>
          </View>

          {/* Telemetry */}
          <View style={styles.telemetryRow}>
            <View style={styles.telemetryItem}>
              <Crosshair size={11} color={Colors.textMuted} />
              <Text style={styles.telemetryText}>
                ±{bountyLocation.accuracy != null ? `${Math.round(bountyLocation.accuracy)}m` : '—'}
              </Text>
            </View>
            {bountyLocation.heading != null && (
              <View style={styles.telemetryItem}>
                <Navigation size={11} color={Colors.textMuted} />
                <Text style={styles.telemetryText}>{Math.round(bountyLocation.heading)}°</Text>
              </View>
            )}
            {bountyLocation.speed != null && (
              <View style={styles.telemetryItem}>
                <Text style={styles.telemetryText}>{Math.round(bountyLocation.speed)} m/s</Text>
              </View>
            )}
            <View style={styles.telemetryItem}>
              <Clock size={11} color={Colors.textMuted} />
              <Text style={styles.telemetryText}>{formatTimeAgo(bountyLocation.updated_at)}</Text>
            </View>
          </View>

          <View style={styles.coordsRow}>
            <Text style={styles.coordsLabel}>LIVE POSITION</Text>
            <Text style={styles.coordsValue}>
              {bountyLocation.latitude.toFixed(6)}, {bountyLocation.longitude.toFixed(6)}
            </Text>
          </View>
        </>
      ) : (
        <View style={styles.placeholder}>
          <Radio size={28} color={cfg.color} />
          <Text style={[styles.placeholderText, { color: cfg.color }]}>{cfg.label}</Text>
          <Text style={styles.placeholderHint}>
            {status === 'signal_lost'
              ? 'Bounty signal is stale (last update was more than 10 minutes ago). Check the bounty person\'s device and connection.'
              : status === 'stopped'
                ? 'The bounty person has stopped broadcasting.'
                : eventStatus === 'live'
                  ? 'The bounty person has not started broadcasting yet. They need to enter the access code in their app.'
                  : 'Tracking activates once the event is live and the bounty person starts broadcasting.'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotPulse: {
    shadowColor: '#22C55E',
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1.2,
  },
  mapContainer: {
    height: 260,
    backgroundColor: Colors.inputBg,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  bountyMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bountyMarkerInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  telemetryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  telemetryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  telemetryText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  coordsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  coordsLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    letterSpacing: 1,
    fontWeight: '700' as const,
  },
  coordsValue: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  coordsBlock: {
    padding: 14,
    gap: 6,
  },
  coordLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    letterSpacing: 1,
    fontWeight: '700' as const,
  },
  coordValue: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  metaText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  placeholder: {
    padding: 28,
    alignItems: 'center',
    gap: 10,
  },
  placeholderText: {
    fontSize: 13,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  placeholderHint: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 17,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    padding: 20,
  },
});
