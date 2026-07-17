import React, { useCallback } from 'react';
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
import { Plus, MapPin, Calendar, Trophy, Ticket, LogOut } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Event, DEFAULT_ACCENT_COLOR } from '@/types';
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

export default function DashboardScreen() {
  const router = useRouter();
  const { signOut } = useAuth();

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
    </TouchableOpacity>
    );
  }, [router]);

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
