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
import { Users, Link, Mail } from 'lucide-react-native';
import MapView, { Circle } from 'react-native-maps';
import { supabase } from '@/lib/supabase';
import { Event, Ticket, Profile } from '@/types';
import Colors from '@/constants/colors';

interface PlayerItem {
  ticketId: string;
  email: string;
  userId: string;
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

  const ticketsQuery = useQuery({
    queryKey: ['tickets', id],
    queryFn: async () => {
      console.log('[LivePlayers] Fetching tickets for event:', id);
      const { data: tickets, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('event_id', id);
      if (error) throw error;

      const userIds = (tickets as Ticket[]).map((t) => t.user_id);
      let profiles: Profile[] = [];
      if (userIds.length > 0) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .in('id', userIds);
        if (!profileError && profileData) {
          profiles = profileData as Profile[];
        }
      }

      const profileMap = new Map(profiles.map((p) => [p.id, p]));

      const players: PlayerItem[] = (tickets as Ticket[]).map((t) => ({
        ticketId: t.id,
        email: profileMap.get(t.user_id)?.email ?? 'Unknown',
        userId: t.user_id,
      }));

      console.log('[LivePlayers] Found players:', players.length);
      return players;
    },
    enabled: !!id,
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

    console.log('[LivePlayers] Setting up real-time subscription');
    const channel = supabase
      .channel(`tickets-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets', filter: `event_id=eq.${id}` },
        () => {
          console.log('[LivePlayers] Ticket change detected, refetching');
          void queryClient.invalidateQueries({ queryKey: ['tickets', id] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'player_connections', filter: `event_id=eq.${id}` },
        () => {
          console.log('[LivePlayers] Connection change detected');
          void queryClient.invalidateQueries({ queryKey: ['connections', id] });
        }
      )
      .subscribe();

    return () => {
      console.log('[LivePlayers] Cleaning up subscription');
      void supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  const event = eventQuery.data;
  const players = ticketsQuery.data ?? [];
  const connectionCount = connectionsQuery.data ?? 0;

  const isRefreshing = ticketsQuery.isRefetching;
  const handleRefresh = useCallback(() => {
    void ticketsQuery.refetch();
    void connectionsQuery.refetch();
  }, [ticketsQuery, connectionsQuery]);

  const renderPlayer = useCallback(({ item }: { item: PlayerItem }) => (
    <View style={styles.playerRow}>
      <View style={styles.playerIcon}>
        <Mail size={14} color={Colors.cyan} />
      </View>
      <Text style={styles.playerEmail} numberOfLines={1}>{item.email}</Text>
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
                    <Text style={styles.statLabel}>PLAYERS</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Link size={20} color={Colors.amber} />
                    <Text style={styles.statNumber}>{connectionCount}</Text>
                    <Text style={styles.statLabel}>CONNECTIONS</Text>
                  </View>
                </View>

                {event && event.zone_latitude && event.zone_longitude && (
                  <View style={styles.mapContainer}>
                    {Platform.OS === 'web' ? (
                      <View style={styles.mapPlaceholder}>
                        <Text style={styles.mapPlaceholderText}>
                          Map: {event.zone_latitude.toFixed(4)}, {event.zone_longitude.toFixed(4)}
                        </Text>
                        <Text style={styles.mapPlaceholderSub}>Radius: {event.zone_radius}m</Text>
                      </View>
                    ) : (
                      <MapView
                        style={styles.map}
                        initialRegion={{
                          latitude: event.zone_latitude,
                          longitude: event.zone_longitude,
                          latitudeDelta: ((event.zone_radius ?? 500) / 111320) * 4,
                          longitudeDelta: ((event.zone_radius ?? 500) / 111320) * 4,
                        }}
                      >
                        <Circle
                          center={{
                            latitude: event.zone_latitude,
                            longitude: event.zone_longitude,
                          }}
                          radius={event.zone_radius ?? 500}
                          strokeColor="rgba(0, 212, 255, 0.8)"
                          fillColor="rgba(0, 212, 255, 0.15)"
                          strokeWidth={2}
                        />
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
