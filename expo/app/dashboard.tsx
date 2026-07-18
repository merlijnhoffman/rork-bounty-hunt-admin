import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Plus, MapPin, Calendar, Trophy, Ticket, LogOut, Crosshair, CheckCircle } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Event, BountyLocation, EventWinner, DEFAULT_ACCENT_COLOR, getBountyStatus } from '@/types';
import Colors from '@/constants/colors';

function StatusBadge({ status, accent }: { status: string; accent: string }) {
  const color =
    status === 'live' ? accent :
    status === 'scheduled' ? Colors.amber :
    Colors.grey;
  const bgColor =
    status === 'live' ? `${accent}1A` :
    status === 'scheduled' ? Colors.amberDim :
    Colors.greyDim;

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, { color }]}>{status.toUpperCase()}</Text>
    </View>
  );
}

/** Pulsing-dot bounty status badge. Re-renders periodically so "signal lost" can trigger as time passes. */
function BountyBadge({ location }: { location: BountyLocation | null | undefined }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => tick((n) => n + 1), 15000);
    return () => clearInterval(i);
  }, []);

  const status = getBountyStatus(location);
  const config: Record<string, { color: string; bg: string; label: string; pulse: boolean }> = {
    not_started:  { color: Colors.grey,   bg: Colors.greyDim,  label: 'BOUNTY NOT STARTED',    pulse: false },
    broadcasting: { color: '#22C55E',    bg: 'rgba(34, 197, 94, 0.15)', label: 'BOUNTY BROADCASTING', pulse: true },
    signal_lost:  { color: Colors.amber, bg: Colors.amberDim, label: 'BOUNTY SIGNAL LOST',    pulse: false },
    stopped:      { color: Colors.red,   bg: Colors.redDim,   label: 'BOUNTY STOPPED',        pulse: false },
  };
  const c = config[status];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg, marginTop: 12 }]}>
      <View style={[styles.badgeDot, { backgroundColor: c.color }, c.pulse && styles.badgeDotPulse]} />
      <Text style={[styles.badgeText, { color: c.color }]}>{c.label}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [bountyMap, setBountyMap] = useState<Record<string, BountyLocation | null>>({});
  const [winnerMap, setWinnerMap] = useState<Record<string, EventWinner | null>>({});

  const eventsQuery = useQuery({
    queryKey: ['events'],
    queryFn: async () => {
      if (__DEV__) console.log('[Dashboard] Fetching events');
      const { data: events, error } = await supabase
        .from('events')
        .select('*')
        .order('date', { ascending: false });

      if (error) throw error;

      const eventsWithCounts: Event[] = await Promise.all(
        (events ?? []).map(async (event: Event) => {
          const { count } = await supabase
            .from('tickets')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', event.id);
          return { ...event, ticket_count: count ?? 0 };
        })
      );

      if (__DEV__) console.log('[Dashboard] Fetched events:', eventsWithCounts.length);
      return eventsWithCounts;
    },
  });

  // Fetch bounty_locations for live events so we can show a status badge per card.
  const liveEventIds = (eventsQuery.data ?? []).filter((e) => e.status === 'live').map((e) => e.id);
  const liveEventIdsKey = liveEventIds.join(',');
  useEffect(() => {
    if (liveEventIds.length === 0) {
      setBountyMap({});
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from('bounty_locations')
        .select('*')
        .in('event_id', liveEventIds);
      if (error) {
        if (__DEV__) console.warn('[Dashboard] bounty_locations fetch failed:', error.message);
        return;
      }
      if (cancelled) return;
      const map: Record<string, BountyLocation | null> = {};
      for (const id of liveEventIds) map[id] = null;
      for (const row of data ?? []) {
        map[(row as BountyLocation).event_id] = row as BountyLocation;
      }
      setBountyMap(map);
    };
    void load();
  }, [liveEventIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: refresh bounty_locations when any row changes.
  useEffect(() => {
    if (liveEventIds.length === 0) return;
    const channel = supabase
      .channel('dashboard-bounty-locations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bounty_locations' },
        () => {
          void supabase
            .from('bounty_locations')
            .select('*')
            .in('event_id', liveEventIds)
            .then(({ data }) => {
              if (!data) return;
              const map: Record<string, BountyLocation | null> = {};
              for (const id of liveEventIds) map[id] = null;
              for (const row of data) {
                map[(row as BountyLocation).event_id] = row as BountyLocation;
              }
              setBountyMap(map);
            });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [liveEventIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch event_winners for completed events so we can show a winner badge.
  const completedEventIds = (eventsQuery.data ?? []).filter((e) => e.status === 'completed').map((e) => e.id);
  const completedEventIdsKey = completedEventIds.join(',');
  useEffect(() => {
    if (completedEventIds.length === 0) {
      setWinnerMap({});
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from('event_winners')
        .select('*')
        .in('event_id', completedEventIds);
      if (error) {
        if (__DEV__) console.warn('[Dashboard] event_winners fetch failed:', error.message);
        return;
      }
      if (cancelled) return;
      const map: Record<string, EventWinner | null> = {};
      for (const id of completedEventIds) map[id] = null;
      for (const row of data ?? []) {
        map[(row as EventWinner).event_id] = row as EventWinner;
      }
      setWinnerMap(map);
    };
    void load();
  }, [completedEventIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: refresh event_winners when any row changes.
  useEffect(() => {
    if (completedEventIds.length === 0) return;
    const channel = supabase
      .channel('dashboard-event-winners')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_winners' },
        () => {
          void supabase
            .from('event_winners')
            .select('*')
            .in('event_id', completedEventIds)
            .then(({ data }) => {
              if (!data) return;
              const map: Record<string, EventWinner | null> = {};
              for (const id of completedEventIds) map[id] = null;
              for (const row of data) {
                map[(row as EventWinner).event_id] = row as EventWinner;
              }
              setWinnerMap(map);
            });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [completedEventIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderEvent = useCallback(({ item }: { item: Event }) => {
    const accent = item.accent_color ?? DEFAULT_ACCENT_COLOR;
    return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push({ pathname: '/event-detail', params: { id: item.id } })}
      activeOpacity={0.7}
      testID={`event-card-${item.id}`}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cityRow}>
          <MapPin size={16} color={accent} />
          <Text style={styles.titleText} numberOfLines={1}>{item.city}</Text>
        </View>
        <StatusBadge status={item.status} accent={accent} />
      </View>

      <View style={styles.cardDetails}>
        <View style={styles.detailItem}>
          <Calendar size={13} color={Colors.textMuted} />
          <Text style={styles.detailText}>{item.date}</Text>
        </View>
        <View style={styles.detailItem}>
          <Ticket size={13} color={Colors.textMuted} />
          <Text style={styles.detailText}>{item.ticket_count ?? 0} tickets</Text>
        </View>
        <View style={styles.detailItem}>
          <Trophy size={13} color={Colors.amber} />
          <Text style={[styles.detailText, { color: Colors.amber }]}>€{item.prize_amount}</Text>
        </View>
      </View>

      {item.status === 'live' ? (
        <BountyBadge location={bountyMap[item.id]} />
      ) : item.status === 'completed' && winnerMap[item.id] ? (
        <View style={[styles.winnerBadgeRow]}>
          <Trophy size={12} color={Colors.amber} />
          <Text style={styles.winnerBadgeText} numberOfLines={1}>
            WINNER DECLARED
          </Text>
          <View style={styles.winnerCheckBadge}>
            <CheckCircle size={9} color={Colors.amber} />
          </View>
        </View>
      ) : (
        <View style={styles.bountyRowHint}>
          <Crosshair size={11} color={Colors.textMuted} />
          <Text style={styles.bountyHintText}>
            {item.bounty_access_code ? 'Bounty code set' : 'No bounty code set'}
          </Text>
        </View>
      )}
    </TouchableOpacity>
    );
  }, [router, bountyMap, winnerMap]);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'COMMAND CENTER',
          headerStyle: { backgroundColor: Colors.bg },
          headerTintColor: Colors.white,
          headerTitleStyle: { fontSize: 14, letterSpacing: 2, fontWeight: '700' },
          headerRight: () => (
            <TouchableOpacity onPress={() => { void signOut().then(() => router.replace('/login')); }} style={{ paddingRight: 4 }}>
              <LogOut size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          ),
        }}
      />
      <View style={styles.container}>
        {eventsQuery.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.cyan} />
          </View>
        ) : eventsQuery.isError ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>Failed to load events</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => void eventsQuery.refetch()}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={eventsQuery.data}
            keyExtractor={(item) => item.id}
            renderItem={renderEvent}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={eventsQuery.isRefetching}
                onRefresh={() => void eventsQuery.refetch()}
                tintColor={Colors.cyan}
              />
            }
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyText}>No events yet</Text>
              </View>
            }
          />
        )}

        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push('/create-event')}
          activeOpacity={0.8}
          testID="create-event-fab"
        >
          <Plus size={24} color={Colors.bg} />
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleText: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 1,
  },
  cardDetails: {
    flexDirection: 'row',
    gap: 16,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  detailText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  badgeDotPulse: {
    shadowColor: '#22C55E',
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  bountyRowHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  bountyHintText: {
    fontSize: 11,
    color: Colors.textMuted,
    letterSpacing: 0.3,
  },
  winnerBadgeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    backgroundColor: Colors.amberDim,
    marginHorizontal: -16,
    marginBottom: -16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  winnerBadgeText: {
    fontSize: 11,
    color: Colors.amber,
    fontWeight: '700' as const,
    letterSpacing: 1,
    flex: 1,
  },
  winnerCheckBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.cyan,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: Colors.cyan,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  errorText: {
    color: Colors.red,
    fontSize: 15,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cyan,
  },
  retryText: {
    color: Colors.cyan,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 16,
  },
});
