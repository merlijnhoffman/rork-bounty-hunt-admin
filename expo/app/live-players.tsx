import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, Link, Mail, Zap } from 'lucide-react-native';
import MapView, { Circle } from 'react-native-maps';
import { supabase } from '@/lib/supabase';
import { Event, EventZone } from '@/types';
import Colors from '@/constants/colors';

/** A hunter is "in the hunt live" while their radar broadcasts (every ~5s). */
const HUNTER_LIVE_WINDOW_MS = 60_000;

interface PlayerItem {
  ticketId: string;
  email: string;
  userId: string;
  isLive: boolean;
}

export default function LivePlayersScreen() {
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const eventQuery = useQuery({
    queryKey: ['event', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as Event;
    },
    enabled: !!id,
  });

  const zoneQuery = useQuery({
    queryKey: ['eventZone', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_zones')
        .select('*')
        .eq('event_id', id)
        .maybeSingle();
      if (error) throw error;
      return data as EventZone | null;
    },
    enabled: !!id,
  });

  // Ticket holders come from the `event_ticket_holders` view — the same
  // RLS-proof pattern as `event_prize_pool`. Querying `tickets`/`profiles`
  // directly does NOT work: RLS silently filters rows the admin doesn't own,
  // so the list always came back empty.
  const ticketsQuery = useQuery({
    queryKey: ['ticketHolders', id],
    queryFn: async () => {
      if (__DEV__) console.log('[LivePlayers] Fetching ticket holders for event:', id);
      const { data: holders, error } = await supabase
        .from('event_ticket_holders')
        .select('ticket_id, event_id, user_id, claimed_at, email')
        .eq('event_id', id)
        .order('claimed_at', { ascending: true });
      if (error) throw error;

      const players: PlayerItem[] = (holders ?? []).map((h: Record<string, unknown>) => ({
        ticketId: h.ticket_id as string,
        email: (h.email as string) ?? 'Unknown',
        userId: h.user_id as string,
        isLive: false,
      }));

      if (__DEV__) console.log('[LivePlayers] Found players:', players.length);
      return players;
    },
    enabled: !!id,
    refetchInterval: 15_000,
  });

  // "Joined the hunt live": the player app broadcasts the hunter's GPS to
  // `hunter_locations` every ~5s once they join the live hunt. A row that is
  // active and refreshed within the last minute = in the hunt right now.
  const liveHuntersQuery = useQuery({
    queryKey: ['hunterLocations', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hunter_locations')
        .select('user_id, is_active, updated_at')
        .eq('event_id', id);
      if (error) throw error;
      const now = Date.now();
      const liveMap = new Map<string, string>();
      for (const row of data ?? []) {
        const r = row as { user_id: string; is_active: boolean | null; updated_at: string };
        if (!r.is_active) continue;
        const age = now - new Date(r.updated_at).getTime();
        if (age >= 0 && age < HUNTER_LIVE_WINDOW_MS) {
          liveMap.set(r.user_id, r.updated_at);
        }
      }
      return liveMap;
    },
    enabled: !!id,
    refetchInterval: 15_000,
  });

  const connectionsQuery = useQuery({
    queryKey: ['connections', id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('player_connections')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', id);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (!id) return;

    if (__DEV__) console.log('[LivePlayers] Setting up real-time subscription');
    const channel = supabase
      .channel(`tickets-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets', filter: `event_id=eq.${id}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['tickets', id] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'player_connections', filter: `event_id=eq.${id}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['connections', id] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hunter_locations', filter: `event_id=eq.${id}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['hunterLocations', id] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_zones', filter: `event_id=eq.${id}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['eventZone', id] });
        }
      )
      .subscribe();

    return () => {
      if (__DEV__) console.log('[LivePlayers] Cleaning up subscription');
      void supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  const event = eventQuery.data;
  const zone = zoneQuery.data;
  const liveMap = liveHuntersQuery.data ?? new Map<string, string>();
  const players: PlayerItem[] = (ticketsQuery.data ?? []).map((p) => ({
    ...p,
    isLive: liveMap.has(p.userId),
  }));
  const liveCount = players.filter((p) => p.isLive).length;
  const connectionCount = connectionsQuery.data ?? 0;

  const isRefreshing = ticketsQuery.isRefetching || zoneQuery.isRefetching || liveHuntersQuery.isRefetching;
  const handleRefresh = useCallback(() => {
    void ticketsQuery.refetch();
    void connectionsQuery.refetch();
    void zoneQuery.refetch();
    void liveHuntersQuery.refetch();
  }, [ticketsQuery, connectionsQuery, zoneQuery, liveHuntersQuery]);

  const renderPlayer = useCallback(({ item }: { item: PlayerItem }) => (
    <View style={styles.playerRow}>
      <View style={[styles.playerIcon, item.isLive && styles.playerIconLive]}>
        <Mail size={14} color={item.isLive ? Colors.liveGreen : Colors.cyan} />
      </View>
      <Text style={styles.playerEmail} numberOfLines={1}>{item.email}</Text>
      {item.isLive && (
        <View style={styles.liveBadge}>
          <View style={styles.liveBadgeDot} />
          <Text style={styles.liveBadgeText}>LIVE</Text>
        </View>
      )}
    </View>
  ), []);

  const isLoading = eventQuery.isLoading || ticketsQuery.isLoading;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'LIVE PLAYERS',
          headerStyle: { backgroundColor: Colors.bg },
          headerTintColor: Colors.white,
          headerTitleStyle: { fontSize: 14, letterSpacing: 2, fontWeight: '700' },
        }}
      />
      <View style={styles.container}>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.cyan} />
          </View>
        ) : (
          <FlatList
            data={players}
            keyExtractor={(item) => item.ticketId}
            renderItem={renderPlayer}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={Colors.cyan}
              />
            }
            ListHeaderComponent={
              <>
                <View style={styles.statsRow}>
                  <View style={styles.statCard}>
                    <Users size={20} color={Colors.cyan} />
                    <Text style={styles.statNumber}>{players.length}</Text>
                    <Text style={styles.statLabel}>TICKET HOLDERS</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Zap size={20} color={Colors.liveGreen} />
                    <Text style={[styles.statNumber, { color: Colors.liveGreen }]}>{liveCount}</Text>
                    <Text style={styles.statLabel}>IN THE HUNT</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Link size={20} color={Colors.amber} />
                    <Text style={styles.statNumber}>{connectionCount}</Text>
                    <Text style={styles.statLabel}>CONNECTIONS</Text>
                  </View>
                </View>

                {zone && (
                  <View style={styles.mapContainer}>
                    {Platform.OS === 'web' ? (
                      <View style={styles.mapPlaceholder}>
                        <Text style={styles.mapPlaceholderText}>
                          Zone: {zone.center_latitude.toFixed(4)}, {zone.center_longitude.toFixed(4)}
                        </Text>
                        <Text style={styles.mapPlaceholderSub}>
                          Radius: {zone.initial_radius}m
                          {zone.narrowed_percent > 0 ? ` · Narrowed: ${zone.narrowed_percent}%` : ''}
                        </Text>
                      </View>
                    ) : (
                      <MapView
                        style={styles.map}
                        initialRegion={{
                          latitude: zone.center_latitude,
                          longitude: zone.center_longitude,
                          latitudeDelta: (zone.initial_radius / 111320) * 4,
                          longitudeDelta: (zone.initial_radius / 111320) * 4,
                        }}
                      >
                        <Circle
                          center={{
                            latitude: zone.center_latitude,
                            longitude: zone.center_longitude,
                          }}
                          radius={zone.initial_radius}
                          strokeColor="rgba(0, 212, 255, 0.3)"
                          fillColor="rgba(0, 212, 255, 0.08)"
                          strokeWidth={1}
                        />
                        {zone.narrowed_percent > 0 && (
                          <Circle
                            center={{
                              latitude: zone.center_latitude,
                              longitude: zone.center_longitude,
                            }}
                            radius={zone.initial_radius * (1 - zone.narrowed_percent / 100)}
                            strokeColor="rgba(0, 212, 255, 0.9)"
                            fillColor="rgba(0, 212, 255, 0.15)"
                            strokeWidth={2}
                          />
                        )}
                      </MapView>
                    )}
                  </View>
                )}

                <Text style={styles.listTitle}>TICKET HOLDERS</Text>
              </>
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>No players yet</Text>
            }
          />
        )}
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
  },
  list: {
    padding: 16,
    gap: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  statLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    fontWeight: '600' as const,
  },
  mapContainer: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  map: {
    height: 200,
  },
  mapPlaceholder: {
    height: 200,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  mapPlaceholderText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  mapPlaceholderSub: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  listTitle: {
    fontSize: 11,
    color: Colors.cyan,
    letterSpacing: 1.5,
    fontWeight: '700' as const,
    marginBottom: 8,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  playerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.cyanDim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerIconLive: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.liveGreen,
  },
  liveBadgeText: {
    color: Colors.liveGreen,
    fontSize: 9,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
  },
  playerEmail: {
    flex: 1,
    color: Colors.white,
    fontSize: 14,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
