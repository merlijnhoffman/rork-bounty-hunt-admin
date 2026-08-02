import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Image,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import MapView, { Marker, Circle, MapPressEvent } from 'react-native-maps';
import {
  Play,
  Square,
  Send,
  Edit3,
  Trash2,
  MapPin,
  Users,
  Pencil,
  Clock,
  RotateCcw,
  ImageIcon,
  Video,
  Mic,
  X,
  FileAudio,
  FileVideo,
  Minus,
  Plus,
  Crosshair,
  CheckCircle,
  Key,
  RefreshCw,
  Radio,
  Trophy,
  Zap,
  AlertTriangle,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import {
  Event,
  Clue,
  EventZone,
  EventWinner,
  BountyLocation,
  DEFAULT_ACCENT_COLOR,
  ZONE_RADIUS_MIN as ZONE_RADIUS_MIN_CONST,
  ZONE_RADIUS_MAX,
  ZONE_RADIUS_STEP,
  generateBountyAccessCode,
  getBountyStatus,
  deriveNarrowedPercent,
} from '@/types';
import Colors from '@/constants/colors';
import { BountyAccessCodeEditor } from '@/components/BountyAccessCodeEditor';
import { LiveBountyMap } from '@/components/LiveBountyMap';

type MediaType = 'image' | 'video' | 'audio';

interface MediaAttachment {
  uri: string;
  type: MediaType;
  fileName: string;
  mimeType: string;
}

const ZONE_DEBOUNCE_MS = 300;
const ZONE_RADIUS_MIN = ZONE_RADIUS_MIN_CONST; // 100m — imported from types
const ZONE_RADIUS_DEFAULT = 1000;

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
    <View style={[detailStyles.badge, { backgroundColor: bgColor }]}>
      <View style={[detailStyles.badgeDot, { backgroundColor: color }]} />
      <Text style={[detailStyles.badgeText, { color }]}>{status.toUpperCase()}</Text>
    </View>
  );
}

/** Renders the declared winner banner. Subscribes to realtime via the parent's
 *  react-query invalidation on event_winners. */
function WinnerCard({ winner, accent }: { winner: EventWinner | null; accent: string }) {
  if (!winner) return null;
  const declaredAt = new Date(winner.declared_at);
  return (
    <View style={detailStyles.winnerCard}>
      <View style={detailStyles.winnerHeaderRow}>
        <Trophy size={16} color={Colors.amber} />
        <Text style={detailStyles.winnerTitle}>WINNER DECLARED</Text>
        <View style={[detailStyles.winnerBadge, { backgroundColor: Colors.amberDim }]}>
          <CheckCircle size={11} color={Colors.amber} />
          <Text style={detailStyles.winnerBadgeText}>COMPLETED</Text>
        </View>
      </View>
      <View style={detailStyles.winnerInfoGrid}>
        <View style={detailStyles.winnerInfoItem}>
          <Text style={detailStyles.winnerInfoLabel}>PLAYER ID</Text>
          <Text style={detailStyles.winnerInfoValue} numberOfLines={1}>
            {winner.winner_user_id}
          </Text>
        </View>
        {winner.winner_email ? (
          <View style={detailStyles.winnerInfoItem}>
            <Text style={detailStyles.winnerInfoLabel}>EMAIL</Text>
            <Text style={detailStyles.winnerInfoValue} numberOfLines={1}>
              {winner.winner_email}
            </Text>
          </View>
        ) : null}
        <View style={detailStyles.winnerInfoItem}>
          <Text style={detailStyles.winnerInfoLabel}>VERIFICATION CODE</Text>
          <Text style={detailStyles.winnerInfoValueMono}>{winner.verification_code}</Text>
        </View>
        {winner.declare_distance_m != null ? (
          <View style={detailStyles.winnerInfoItem}>
            <Text style={detailStyles.winnerInfoLabel}>DISTANCE</Text>
            <Text style={detailStyles.winnerInfoValue}>{winner.declare_distance_m} m</Text>
          </View>
        ) : null}
        <View style={detailStyles.winnerInfoItem}>
          <Text style={detailStyles.winnerInfoLabel}>DECLARED AT</Text>
          <Text style={detailStyles.winnerInfoValue}>{declaredAt.toLocaleString()}</Text>
        </View>
      </View>
    </View>
  );
}

function MediaPreview({ attachment, onRemove }: { attachment: MediaAttachment; onRemove: () => void }) {
  return (
    <View style={detailStyles.mediaPreview}>
      {attachment.type === 'image' ? (
        <Image source={{ uri: attachment.uri }} style={detailStyles.mediaThumb} />
      ) : (
        <View style={detailStyles.mediaFilePlaceholder}>
          {attachment.type === 'video' ? (
            <FileVideo size={28} color={Colors.cyan} />
          ) : (
            <FileAudio size={28} color={Colors.cyan} />
          )}
        </View>
      )}
      <View style={detailStyles.mediaInfo}>
        <Text style={detailStyles.mediaTypeLabel}>{attachment.type.toUpperCase()}</Text>
        <Text style={detailStyles.mediaFileName} numberOfLines={1}>{attachment.fileName}</Text>
      </View>
      <TouchableOpacity onPress={onRemove} style={detailStyles.mediaRemoveBtn} hitSlop={8}>
        <X size={16} color={Colors.red} />
      </TouchableOpacity>
    </View>
  );
}

function ClueMediaDisplay({ clue }: { clue: Clue }) {
  if (!clue.media_url || !clue.media_type) return null;

  if (clue.media_type === 'image') {
    return (
      <Image
        source={{ uri: clue.media_url }}
        style={detailStyles.clueMediaImage}
        resizeMode="cover"
      />
    );
  }

  return (
    <View style={detailStyles.clueMediaFile}>
      {clue.media_type === 'video' ? (
        <FileVideo size={18} color={Colors.cyan} />
      ) : (
        <FileAudio size={18} color={Colors.cyan} />
      )}
      <Text style={detailStyles.clueMediaLabel}>
        {clue.media_type === 'video' ? 'Video attached' : 'Audio attached'}
      </Text>
    </View>
  );
}

async function uploadMediaToSupabase(attachment: MediaAttachment, eventId: string): Promise<string> {
  const ext = attachment.fileName.split('.').pop() ?? 'bin';
  const filePath = `clues/${eventId}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

  if (__DEV__) console.log('[Upload] Starting upload:', filePath, 'mimeType:', attachment.mimeType);

  const response = await fetch(attachment.uri);
  const blob = await response.blob();

  const { data, error } = await supabase.storage
    .from('clue-media')
    .upload(filePath, blob, {
      contentType: attachment.mimeType,
      upsert: false,
    });

  if (error) {
    if (__DEV__) console.error('[Upload] Storage upload error:', error.message);
    throw new Error(`Media upload failed: ${error.message}`);
  }

  if (__DEV__) console.log('[Upload] Upload success:', data.path);

  const { data: urlData } = supabase.storage
    .from('clue-media')
    .getPublicUrl(data.path);

  if (__DEV__) console.log('[Upload] Public URL:', urlData.publicUrl);
  return urlData.publicUrl;
}

export default function EventDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  // --- Clue form state ---
  const [clueText, setClueText] = useState<string>('');
  const [clueHint, setClueHint] = useState<string>('');
  const [mediaAttachment, setMediaAttachment] = useState<MediaAttachment | null>(null);

  // --- Zone Control state ---
  const [zoneLat, setZoneLat] = useState<string>('');
  const [zoneLng, setZoneLng] = useState<string>('');
  const [zoneRadius, setZoneRadius] = useState<string>(String(ZONE_RADIUS_DEFAULT));
  const [zoneName, setZoneName] = useState<string>('');
  const [zoneCurrentRadiusMeters, setZoneCurrentRadiusMeters] = useState<string>('');
  const [zoneMapVisible, setZoneMapVisible] = useState<boolean>(false);
  const [zoneSyncStatus, setZoneSyncStatus] = useState<'idle' | 'saving' | 'synced'>('idle');

  const zoneSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bountyCode, setBountyCode] = useState<string>('');

  // --- Queries ---
  const eventQuery = useQuery({
    queryKey: ['event', id],
    queryFn: async () => {
      if (__DEV__) console.log('[EventDetail] Fetching event:', id);
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

  const cluesQuery = useQuery({
    queryKey: ['clues', id],
    queryFn: async () => {
      if (__DEV__) console.log('[EventDetail] Fetching clues for event:', id);
      const { data, error } = await supabase
        .from('clues')
        .select('*')
        .eq('event_id', id)
        .order('order_number', { ascending: true });
      if (error) {
        if (__DEV__) console.warn('[EventDetail] order_number sort failed, falling back to release_time:', error.message);
        const fallback = await supabase
          .from('clues')
          .select('*')
          .eq('event_id', id)
          .order('release_time', { ascending: true });
        if (fallback.error) throw fallback.error;
        return fallback.data as Clue[];
      }
      return data as Clue[];
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

  // Sync zone query data into local state when it loads.
  // IMPORTANT: read current_radius from the row when present; only fall back to
  // the narrowed formula (initial * (1 - narrowed/100)) when the column is null.
  // This matches the player app's contract and lets the admin expand the zone
  // above initial_radius.
  useEffect(() => {
    const zone = zoneQuery.data;
    if (zone) {
      setZoneLat(String(zone.center_latitude));
      setZoneLng(String(zone.center_longitude));
      setZoneRadius(String(zone.initial_radius));
      setZoneName(zone.zone_name ?? '');
      const currentRad =
        zone.current_radius != null
          ? Math.round(zone.current_radius)
          : Math.round(zone.initial_radius * (1 - zone.narrowed_percent / 100));
      setZoneCurrentRadiusMeters(String(currentRad));
    }
  }, [zoneQuery.data]);

  // Sync bounty_access_code from the event row.
  useEffect(() => {
    setBountyCode(eventQuery.data?.bounty_access_code ?? '');
  }, [eventQuery.data?.bounty_access_code]);

  // --- Event winner query ---
  // One row per event (unique constraint). Written by the declare-winner edge
  // function (service role) when the bounty person scans a player's QR.
  const winnerQuery = useQuery({
    queryKey: ['eventWinner', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_winners')
        .select('*')
        .eq('event_id', id)
        .maybeSingle();
      if (error) throw error;
      return data as EventWinner | null;
    },
    enabled: !!id,
    refetchInterval: 10000,
  });

  // --- Bounty location query + realtime ---
  // Polls every 5s as a fallback in case realtime WebSocket doesn't fire.
  // staleTime: 2s so the data is considered fresh briefly but refetched promptly.
  const bountyLocationQuery = useQuery({
    queryKey: ['bountyLocation', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bounty_locations')
        .select('event_id, latitude, longitude, accuracy, heading, speed, is_active, updated_at')
        .eq('event_id', id)
        .maybeSingle();
      if (error) throw error;
      if (__DEV__) console.log('[EventDetail] bounty_locations query result:', data ? `lat=${(data as BountyLocation).latitude} is_active=${(data as BountyLocation).is_active} updated_at=${(data as BountyLocation).updated_at}` : 'null');
      return data as BountyLocation | null;
    },
    enabled: !!id,
    staleTime: 2000,
    refetchInterval: 5000,
  });

  // Re-render periodically so "signal lost" status updates as time passes.
  const [, bountyTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => bountyTick((n) => n + 1), 15000);
    return () => clearInterval(i);
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (zoneSaveTimer.current) {
        clearTimeout(zoneSaveTimer.current);
      }
    };
  }, []);

  // --- Realtime subscription ---
  useEffect(() => {
    if (!id) return;

    if (__DEV__) console.log('[EventDetail] Setting up real-time subscriptions');
    const channel = supabase
      .channel(`admin-event-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clues', filter: `event_id=eq.${id}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['clues', id] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events', filter: `id=eq.${id}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['event', id] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_zones', filter: `event_id=eq.${id}` },
        () => {
          if (__DEV__) console.log('[EventDetail] event_zones change detected');
          void queryClient.invalidateQueries({ queryKey: ['eventZone', id] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bounty_locations', filter: `event_id=eq.${id}` },
        () => {
          if (__DEV__) console.log('[EventDetail] bounty_locations change detected');
          void queryClient.invalidateQueries({ queryKey: ['bountyLocation', id] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_winners', filter: `event_id=eq.${id}` },
        () => {
          if (__DEV__) console.log('[EventDetail] event_winners change detected');
          void queryClient.invalidateQueries({ queryKey: ['eventWinner', id] });
          // A winner implies the event was marked completed — refresh it too.
          void queryClient.invalidateQueries({ queryKey: ['event', id] });
        }
      )
      .subscribe();

    return () => {
      if (__DEV__) console.log('[EventDetail] Cleaning up real-time subscription');
      void supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  // --- Status mutation ---
  const statusMutation = useMutation({
    mutationFn: async (newStatus: 'live' | 'completed') => {
      if (__DEV__) console.log('[EventDetail] Changing status to:', newStatus, 'for event:', id);

      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;

      const { data, error } = await supabase
        .from('events')
        .update({ status: newStatus })
        .eq('id', id)
        .select();

      if (error) throw new Error(error.message);

      if (!data || data.length === 0) {
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
        const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Prefer': 'return=representation',
        };
        if (accessToken) {
          headers['Authorization'] = `Bearer ${accessToken}`;
        }
        const res = await fetch(
          `${supabaseUrl}/rest/v1/events?id=eq.${id}`,
          { method: 'PATCH', headers, body: JSON.stringify({ status: newStatus }) }
        );
        const resBody = await res.text();
        if (!res.ok) throw new Error(`Status update failed (${res.status}): ${resBody}`);
        const parsed = JSON.parse(resBody);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          throw new Error('Status update blocked by database policies.');
        }
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['event', id] });
      void queryClient.invalidateQueries({ queryKey: ['events'] });
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message);
    },
  });

  // --- Media pickers ---
  const pickImage = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant photo library access to attach images.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const fileName = asset.fileName ?? `photo_${Date.now()}.jpg`;
        setMediaAttachment({
          uri: asset.uri,
          type: 'image',
          fileName,
          mimeType: asset.mimeType ?? 'image/jpeg',
        });
      }
    } catch (err) {
      if (__DEV__) console.error('[Media] Image pick error:', err);
      Alert.alert('Error', 'Failed to pick image.');
    }
  }, []);

  const pickVideo = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant photo library access to attach videos.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: true,
        quality: 0.7,
        videoMaxDuration: 60,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const fileName = asset.fileName ?? `video_${Date.now()}.mp4`;
        setMediaAttachment({
          uri: asset.uri,
          type: 'video',
          fileName,
          mimeType: asset.mimeType ?? 'video/mp4',
        });
      }
    } catch (err) {
      if (__DEV__) console.error('[Media] Video pick error:', err);
      Alert.alert('Error', 'Failed to pick video.');
    }
  }, []);

  const pickAudio = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setMediaAttachment({
          uri: asset.uri,
          type: 'audio',
          fileName: asset.name,
          mimeType: asset.mimeType ?? 'audio/mpeg',
        });
      }
    } catch (err) {
      if (__DEV__) console.error('[Media] Audio pick error:', err);
      Alert.alert('Error', 'Failed to pick audio file.');
    }
  }, []);

  // --- Send clue mutation ---
  const sendClueMutation = useMutation({
    mutationFn: async () => {
      if (__DEV__) console.log('[EventDetail] Sending clue for event:', id);

      const { count, error: countError } = await supabase
        .from('clues')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', id);
      
      if (countError) {
        if (__DEV__) console.warn('[EventDetail] Could not count clues, using fallback:', countError.message);
      }
      const nextOrder = (count ?? (cluesQuery.data ?? []).length) + 1;

      let mediaUrl: string | null = null;
      let mediaType: MediaType | null = null;

      if (mediaAttachment) {
        mediaUrl = await uploadMediaToSupabase(mediaAttachment, id ?? 'unknown');
        mediaType = mediaAttachment.type;
      }

      const cluePayload: Record<string, unknown> = {
        event_id: id,
        clue_text: clueText.trim(),
        clue_order: nextOrder,
        order_number: nextOrder,
        release_time: new Date().toISOString(),
      };

      if (mediaUrl) {
        cluePayload.media_url = mediaUrl;
        cluePayload.media_type = mediaType;
      }

      if (clueHint.trim()) {
        cluePayload.hint = clueHint.trim();
      }

      const tryInsert = async (payload: Record<string, unknown>) => {
        const { data, error } = await supabase.from('clues').insert(payload).select();
        return { data, error };
      };

      let { data, error } = await tryInsert(cluePayload);

      if (error && /order_number/i.test(error.message)) {
        if (__DEV__) console.warn('[EventDetail] order_number column missing, retrying without it');
        const { order_number: _omit, ...rest } = cluePayload as { order_number?: number } & Record<string, unknown>;
        const retry = await tryInsert(rest);
        data = retry.data;
        error = retry.error;
      }

      if (error && /clue_order/i.test(error.message)) {
        if (__DEV__) console.warn('[EventDetail] clue_order column missing, retrying without it');
        const { clue_order: _omit, ...rest } = cluePayload as { clue_order?: number } & Record<string, unknown>;
        const retry = await tryInsert(rest);
        data = retry.data;
        error = retry.error;
      }

      if (error && /'hint'/i.test(error.message)) {
        if (__DEV__) console.warn('[EventDetail] hint column missing, retrying without it');
        delete (cluePayload as Record<string, unknown>).hint;
        const retry = await tryInsert(cluePayload);
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        if (__DEV__) console.log('[EventDetail] Supabase client insert failed:', error.message, '- trying direct REST');

        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
        const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
        const session = await supabase.auth.getSession();
        const accessToken = session.data.session?.access_token;

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Prefer': 'return=representation',
        };
        if (accessToken) {
          headers['Authorization'] = `Bearer ${accessToken}`;
        }

        const doFetch = async (payload: Record<string, unknown>) => {
          const res = await fetch(`${supabaseUrl}/rest/v1/clues`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
          });
          const resBody = await res.text();
          return { res, resBody };
        };

        let { res, resBody } = await doFetch(cluePayload);

        if (!res.ok && /order_number/i.test(resBody)) {
          if (__DEV__) console.warn('[EventDetail] REST insert: order_number missing, retrying without it');
          const { order_number: _omit, ...rest } = cluePayload as { order_number?: number } & Record<string, unknown>;
          const retry = await doFetch(rest);
          res = retry.res;
          resBody = retry.resBody;
        }

        if (!res.ok && /clue_order/i.test(resBody)) {
          if (__DEV__) console.warn('[EventDetail] REST insert: clue_order missing, retrying without it');
          const { clue_order: _omit, ...rest } = cluePayload as { clue_order?: number } & Record<string, unknown>;
          const retry = await doFetch(rest);
          res = retry.res;
          resBody = retry.resBody;
        }

        if (!res.ok && /'hint'/i.test(resBody)) {
          if (__DEV__) console.warn('[EventDetail] REST insert: hint missing, retrying without it');
          delete (cluePayload as Record<string, unknown>).hint;
          const retry = await doFetch(cluePayload);
          res = retry.res;
          resBody = retry.resBody;
        }

        if (!res.ok) {
          throw new Error(
            `Failed to send clue (${res.status}): ${resBody}\n\nThis is likely an RLS policy issue. ` +
            'Add an INSERT policy on the clues table.'
          );
        }
      } else {
        if (__DEV__) console.log('[EventDetail] Clue inserted successfully:', data);
      }
    },
    onSuccess: () => {
      setClueText('');
      setClueHint('');
      setMediaAttachment(null);
      void queryClient.invalidateQueries({ queryKey: ['clues', id] });
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message);
    },
  });

  // --- Delete clue mutation ---
  const deleteClueMutation = useMutation({
    mutationFn: async (clueId: string) => {
      if (__DEV__) console.log('[EventDetail] Deleting clue:', clueId);
      const { error } = await supabase
        .from('clues')
        .delete()
        .eq('id', clueId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['clues', id] });
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message);
    },
  });

  // --- Reset hunt mutation ---
  const resetMutation = useMutation({
    mutationFn: async () => {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      const { data, error } = await supabase
        .from('events')
        .update({ status: 'scheduled' })
        .eq('id', id)
        .select();
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
        const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Prefer': 'return=representation',
        };
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
        const res = await fetch(
          `${supabaseUrl}/rest/v1/events?id=eq.${id}`,
          { method: 'PATCH', headers, body: JSON.stringify({ status: 'scheduled' }) }
        );
        const resBody = await res.text();
        if (!res.ok) throw new Error(`Reset failed (${res.status}): ${resBody}`);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['event', id] });
      void queryClient.invalidateQueries({ queryKey: ['events'] });
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message);
    },
  });

  // --- Zone mutations ---
  // When the admin has an existing zone, we lock initial_radius to its stored
  // value so "Reset to initial" always returns to the original zone size.
  const zoneUpsertMutation = useMutation({
    mutationFn: async () => {
      const lat = parseFloat(zoneLat);
      const lng = parseFloat(zoneLng);
      const radius = parseInt(zoneRadius, 10);
      if (isNaN(lat) || isNaN(lng) || isNaN(radius)) {
        throw new Error('Please provide valid latitude, longitude, and radius.');
      }
      if (radius < ZONE_RADIUS_MIN) {
        throw new Error(`Radius must be at least ${ZONE_RADIUS_MIN} meters.`);
      }
      if (radius > ZONE_RADIUS_MAX) {
        throw new Error(`Radius must be at most ${ZONE_RADIUS_MAX} meters.`);
      }

      if (__DEV__) console.log('[EventDetail] Upserting zone for event:', id);
      // On initial creation, current_radius = initial_radius and narrowed_percent = 0.
      // The player app reads current_radius first and only falls back to the
      // narrowed formula when it's null.
      const { error } = await supabase
        .from('event_zones')
        .upsert({
          event_id: id,
          center_latitude: lat,
          center_longitude: lng,
          initial_radius: radius,
          narrowed_percent: 0,
          current_radius: radius,
          zone_name: zoneName.trim() || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'event_id' });

      if (error) throw error;
    },
    onSuccess: () => {
      setZoneSyncStatus('synced');
      void queryClient.invalidateQueries({ queryKey: ['eventZone', id] });
    },
    onError: (error: Error) => {
      setZoneSyncStatus('idle');
      Alert.alert('Error', error.message);
    },
  });

  const debouncedZoneUpdate = useCallback((updates: Record<string, unknown>) => {
    if (zoneSaveTimer.current) {
      clearTimeout(zoneSaveTimer.current);
    }
    setZoneSyncStatus('saving');

    zoneSaveTimer.current = setTimeout(async () => {
      try {
        // Always bump updated_at so Supabase realtime emits the row change.
        const { error } = await supabase
          .from('event_zones')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('event_id', id);

        if (error) throw error;
        setZoneSyncStatus('synced');
        void queryClient.invalidateQueries({ queryKey: ['eventZone', id] });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (__DEV__) console.error('[EventDetail] Zone update failed:', msg);
        setZoneSyncStatus('idle');
      }
    }, ZONE_DEBOUNCE_MS);
  }, [id, queryClient]);

  // CRITICAL: Always write current_radius on every radius change. The player
  // app reads current_radius first and only falls back to the narrowed formula
  // (initial * (1 - narrowed/100)) when it's null — and that formula can only
  // SHRINK from initial_radius. Without writing current_radius, the zone can
  // never expand above 1000m.
  const handleCurrentRadiusChange = useCallback((value: string) => {
    const cleaned = value.replace(/[^0-9]/g, '');
    const ir = zoneQuery.data?.initial_radius ?? (parseInt(zoneRadius) || ZONE_RADIUS_DEFAULT);
    const meters = Math.max(0, parseInt(cleaned || '0', 10));
    const str = cleaned === '' ? '' : String(meters);
    setZoneCurrentRadiusMeters(str);
    const narrowedPercent = deriveNarrowedPercent(meters, ir);
    debouncedZoneUpdate({
      current_radius: meters,
      narrowed_percent: narrowedPercent,
    });
  }, [debouncedZoneUpdate, zoneQuery.data?.initial_radius, zoneRadius]);

  const handleZoneCenterChange = useCallback((lat: number, lng: number) => {
    setZoneLat(String(lat));
    setZoneLng(String(lng));
    debouncedZoneUpdate({ center_latitude: lat, center_longitude: lng });
  }, [debouncedZoneUpdate]);

  const handleZoneReset = useCallback(() => {
    const ir = zoneQuery.data?.initial_radius ?? (parseInt(zoneRadius) || ZONE_RADIUS_DEFAULT);
    Alert.alert('Reset Zone', 'Reset the zone back to its initial radius?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        onPress: () => {
          setZoneCurrentRadiusMeters(String(ir));
          setZoneSyncStatus('saving');
          void (async () => {
            const { error } = await supabase
              .from('event_zones')
              .update({
                current_radius: ir,
                narrowed_percent: 0,
                updated_at: new Date().toISOString(),
              })
              .eq('event_id', id);
            if (error) {
              if (__DEV__) console.error('[EventDetail] Zone reset failed:', error.message);
              setZoneSyncStatus('idle');
              return;
            }
            setZoneSyncStatus('synced');
            void queryClient.invalidateQueries({ queryKey: ['eventZone', id] });
          })();
        },
      },
    ]);
  }, [id, zoneQuery.data?.initial_radius, zoneRadius, queryClient]);

  // --- Handlers ---
  const handleStartHunt = useCallback(() => {
    Alert.alert('Start Hunt', 'Are you sure you want to start this hunt?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start', onPress: () => statusMutation.mutate('live') },
    ]);
  }, [statusMutation]);

  const handleEndHunt = useCallback(() => {
    Alert.alert('End Hunt', 'Are you sure you want to end this hunt?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End Hunt', style: 'destructive', onPress: () => statusMutation.mutate('completed') },
    ]);
  }, [statusMutation]);

  const handleResetHunt = useCallback(() => {
    Alert.alert('Reset Hunt', 'Reset this hunt back to scheduled?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => resetMutation.mutate() },
    ]);
  }, [resetMutation]);

  const handleDeleteClue = useCallback((clueId: string) => {
    Alert.alert('Delete Clue', 'Are you sure you want to delete this clue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteClueMutation.mutate(clueId) },
    ]);
  }, [deleteClueMutation]);

  // --- Bounty code mutations ---
  const persistBountyCode = useCallback(async (code: string): Promise<void> => {
    const { error } = await supabase
      .from('events')
      .update({ bounty_access_code: code || null })
      .eq('id', id);
    if (error) throw new Error(error.message);
    void queryClient.invalidateQueries({ queryKey: ['event', id] });
    void queryClient.invalidateQueries({ queryKey: ['events'] });
  }, [id, queryClient]);

  const regenerateBountyCode = useCallback(() => {
    const ev = eventQuery.data;
    if (ev?.status && ev.status !== 'scheduled') {
      Alert.alert(
        'Cannot regenerate',
        'Codes can only be regenerated while the event is scheduled, to avoid breaking an active broadcast.',
      );
      return;
    }
    Alert.alert(
      'Regenerate code',
      'The old code will stop working immediately and the bounty person will need the new code. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: () => {
            const newCode = generateBountyAccessCode(ev?.city ?? '');
            void persistBountyCode(newCode)
              .then(() => setBountyCode(newCode))
              .catch((err) => {
                const msg = err instanceof Error ? err.message : String(err);
                Alert.alert('Error', msg);
              });
          },
        },
      ],
    );
  }, [eventQuery.data, persistBountyCode]);

  const canSendClue = clueText.trim().length > 0 || mediaAttachment !== null;

  const event = eventQuery.data;
  const zone = zoneQuery.data;
  const hasZone = zone !== null && zone !== undefined;
  // Lock zone controls once an event has a winner / is completed, so the admin
  // can't change the zone for a finished hunt.
  const eventCompleted = event?.status === 'completed';
  const winner = winnerQuery.data ?? null;

  const isRefreshing = eventQuery.isRefetching || cluesQuery.isRefetching || zoneQuery.isRefetching;
  const handleRefresh = useCallback(() => {
    void eventQuery.refetch();
    void cluesQuery.refetch();
    void zoneQuery.refetch();
  }, [eventQuery, cluesQuery, zoneQuery]);

  // --- Test ping: call the edge function directly to verify it's deployed ---
  const [testPingResult, setTestPingResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testPingLoading, setTestPingLoading] = useState(false);

  const handleTestPing = useCallback(async () => {
    if (!event || !id) return;
    const code = event.bounty_access_code;
    if (!code) {
      setTestPingResult({ ok: false, message: 'No access code set on this event. Set one first.' });
      return;
    }
    setTestPingLoading(true);
    setTestPingResult(null);
    try {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
      const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
      const fnUrl = `${supabaseUrl}/functions/v1/update-bounty-location`;

      // Use the zone center as the test location, or a default.
      const testLat = zone?.center_latitude ?? 53.3498;
      const testLng = zone?.center_longitude ?? -6.2603;

      if (__DEV__) console.log('[EventDetail] Test ping to edge function:', fnUrl, 'code:', code);

      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          accessCode: code,
          eventId: id,
          latitude: testLat,
          longitude: testLng,
          accuracy: 10,
        }),
      });

      const bodyText = await res.text();
      if (__DEV__) console.log('[EventDetail] Test ping response:', res.status, bodyText);

      if (res.ok) {
        setTestPingResult({
          ok: true,
          message: `Edge function responded OK (${res.status}). Location updated. The bounty_locations row should refresh within 5s.`,
        });
        // Invalidate to refetch immediately
        void queryClient.invalidateQueries({ queryKey: ['bountyLocation', id] });
      } else {
        let errorMsg = bodyText;
        try {
          const parsed = JSON.parse(bodyText);
          errorMsg = parsed.error ?? bodyText;
        } catch { /* keep raw text */ }
        setTestPingResult({
          ok: false,
          message: `Edge function returned ${res.status}: ${errorMsg}`,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (__DEV__) console.error('[EventDetail] Test ping failed:', msg);
      setTestPingResult({
        ok: false,
        message: `Network error: ${msg}. The edge function may not be deployed. Run: supabase functions deploy update-bounty-location --no-verify-jwt`,
      });
    } finally {
      setTestPingLoading(false);
    }
  }, [event, id, zone, queryClient]);

  // --- Computed zone values ---
  const initialRadius = hasZone ? (zone?.initial_radius ?? (parseFloat(zoneRadius) || ZONE_RADIUS_DEFAULT)) : ZONE_RADIUS_DEFAULT;
  // Prefer the row's current_radius (the source of truth for the player app);
  // fall back to the local text input.
  const currentRadius = hasZone
    ? (zone?.current_radius != null
        ? Math.round(zone.current_radius)
        : (parseInt(zoneCurrentRadiusMeters) || 0))
    : null;

  if (eventQuery.isLoading) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'EVENT',
            headerStyle: { backgroundColor: Colors.bg },
            headerTintColor: Colors.white,
            headerTitleStyle: { fontSize: 14, letterSpacing: 2, fontWeight: '700' },
          }}
        />
        <View style={detailStyles.center}>
          <ActivityIndicator size="large" color={Colors.cyan} />
        </View>
      </>
    );
  }

  if (!event) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'EVENT',
            headerStyle: { backgroundColor: Colors.bg },
            headerTintColor: Colors.white,
            headerTitleStyle: { fontSize: 14, letterSpacing: 2, fontWeight: '700' },
          }}
        />
        <View style={detailStyles.center}>
          <Text style={detailStyles.errorText}>Event not found</Text>
        </View>
      </>
    );
  }

  const accent = event.accent_color ?? DEFAULT_ACCENT_COLOR;

  return (
    <>
      <Stack.Screen
        options={{
          title: event.city.toUpperCase(),
          headerStyle: { backgroundColor: Colors.bg },
          headerTintColor: Colors.white,
          headerTitleStyle: { fontSize: 14, letterSpacing: 2, fontWeight: '700' },
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 16, paddingRight: 4 }}>
              <TouchableOpacity onPress={() => router.push({ pathname: '/live-players', params: { id: event.id } })}>
                <Users size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push({ pathname: '/edit-event', params: { id: event.id } })}>
                <Pencil size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <ScrollView
        style={detailStyles.container}
        contentContainerStyle={detailStyles.scroll}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={accent} />
        }
      >
        {/* Event Info Card */}
        <View style={detailStyles.infoCard}>
          <View style={detailStyles.infoRow}>
            <Text style={detailStyles.infoLabel}>Location</Text>
            <Text style={detailStyles.infoValue}>{event.city}</Text>
          </View>
          <View style={detailStyles.infoRow}>
            <Text style={detailStyles.infoLabel}>Date</Text>
            <Text style={detailStyles.infoValue}>{event.date}</Text>
          </View>
          <View style={detailStyles.infoRow}>
            <Text style={detailStyles.infoLabel}>Time</Text>
            <Text style={detailStyles.infoValue}>{event.start_time}</Text>
          </View>
          <View style={detailStyles.infoRow}>
            <Text style={detailStyles.infoLabel}>Prize</Text>
            <Text style={[detailStyles.infoValue, { color: Colors.amber }]}>€{event.prize_amount}</Text>
          </View>
          <View style={detailStyles.infoRow}>
            <Text style={detailStyles.infoLabel}>Status</Text>
            <StatusBadge status={event.status} accent={accent} />
          </View>
        </View>

        {/* Bounty Access Code */}
        <Text style={detailStyles.sectionTitle}>BOUNTY ACCESS CODE</Text>
        <BountyAccessCodeEditor
          value={bountyCode}
          city={event.city}
          onChange={setBountyCode}
          onPersist={persistBountyCode}
          mode="standalone"
          accentColor={accent}
          warnWhenLive
          isLive={event.status === 'live'}
        />
        {event.status === 'scheduled' && bountyCode.trim().length > 0 && (
          <TouchableOpacity
            style={[detailStyles.regenerateBtn, { borderColor: accent }]}
            onPress={regenerateBountyCode}
            activeOpacity={0.7}
          >
            <RefreshCw size={14} color={accent} />
            <Text style={[detailStyles.regenerateBtnText, { color: accent }]}>
              REGENERATE CODE
            </Text>
          </TouchableOpacity>
        )}

        {/* Live Bounty Map */}
        <Text style={detailStyles.sectionTitle}>LIVE BOUNTY TRACKING</Text>
        <LiveBountyMap
          eventId={id}
          accent={accent}
          zone={zone}
          bountyLocation={bountyLocationQuery.data}
          isLoading={bountyLocationQuery.isLoading}
          eventStatus={event.status}
        />

        {/* Bounty Diagnostics */}
        <View style={detailStyles.diagCard}>
          <View style={detailStyles.diagHeader}>
            <Zap size={14} color={Colors.cyan} />
            <Text style={detailStyles.diagTitle}>BOUNTY DIAGNOSTICS</Text>
          </View>

          {/* Raw data display */}
          <View style={detailStyles.diagGrid}>
            <View style={detailStyles.diagItem}>
              <Text style={detailStyles.diagLabel}>LAST UPDATE</Text>
              <Text style={detailStyles.diagValue}>
                {bountyLocationQuery.data?.updated_at
                  ? new Date(bountyLocationQuery.data.updated_at).toLocaleString()
                  : 'No row in bounty_locations'}
              </Text>
            </View>
            <View style={detailStyles.diagItem}>
              <Text style={detailStyles.diagLabel}>AGE</Text>
              <Text style={detailStyles.diagValue}>
                {bountyLocationQuery.data?.updated_at
                  ? `${Math.round((Date.now() - new Date(bountyLocationQuery.data.updated_at).getTime()) / 1000)}s (${Math.round((Date.now() - new Date(bountyLocationQuery.data.updated_at).getTime()) / 60000)}m)`
                  : '—'}
              </Text>
            </View>
            <View style={detailStyles.diagItem}>
              <Text style={detailStyles.diagLabel}>IS_ACTIVE</Text>
              <Text style={detailStyles.diagValue}>
                {bountyLocationQuery.data ? String(bountyLocationQuery.data.is_active) : '—'}
              </Text>
            </View>
            <View style={detailStyles.diagItem}>
              <Text style={detailStyles.diagLabel}>ACCESS CODE</Text>
              <Text style={detailStyles.diagValueMono} numberOfLines={1}>
                {event.bounty_access_code ?? 'NOT SET'}
              </Text>
            </View>
            <View style={detailStyles.diagItem}>
              <Text style={detailStyles.diagLabel}>EVENT ID</Text>
              <Text style={detailStyles.diagValueMono} numberOfLines={1}>
                {id}
              </Text>
            </View>
            <View style={detailStyles.diagItem}>
              <Text style={detailStyles.diagLabel}>POLL STATUS</Text>
              <Text style={detailStyles.diagValue}>
                {bountyLocationQuery.isError ? `ERROR: ${(bountyLocationQuery.error as Error)?.message}` : 'OK (polling every 5s)'}
              </Text>
            </View>
          </View>

          {/* Test ping button */}
          <TouchableOpacity
            style={detailStyles.diagPingBtn}
            onPress={handleTestPing}
            disabled={testPingLoading}
            activeOpacity={0.7}
          >
            {testPingLoading ? (
              <ActivityIndicator color={Colors.bg} size="small" />
            ) : (
              <>
                <Zap size={14} color={Colors.bg} fill={Colors.bg} />
                <Text style={detailStyles.diagPingBtnText}>SEND TEST PING TO EDGE FUNCTION</Text>
              </>
            )}
          </TouchableOpacity>

          {testPingResult && (
            <View style={[detailStyles.diagResultBox, !testPingResult.ok && detailStyles.diagResultBoxErr]}>
              <View style={detailStyles.diagResultHeader}>
                {testPingResult.ok ? (
                  <CheckCircle size={12} color={Colors.cyan} />
                ) : (
                  <AlertTriangle size={12} color={Colors.amber} />
                )}
                <Text style={[detailStyles.diagResultTitle, { color: testPingResult.ok ? Colors.cyan : Colors.amber }]}>
                  {testPingResult.ok ? 'SUCCESS' : 'FAILED'}
                </Text>
              </View>
              <Text style={detailStyles.diagResultMsg}>{testPingResult.message}</Text>
            </View>
          )}

          {/* Help text */}
          <Text style={detailStyles.diagHelp}>
            The admin app polls bounty_locations every 5s. If the last update is stale, the bounty
            person's device is not successfully calling the edge function. Use the test ping to verify
            the edge function is deployed and the access code is valid.
          </Text>
        </View>

        {/* Winner (auto-updates via realtime on event_winners) */}
        <WinnerCard winner={winner} accent={accent} />

        {/* Status Control */}
        <Text style={detailStyles.sectionTitle}>STATUS CONTROL</Text>
        <View style={detailStyles.statusButtons}>
          {event.status === 'scheduled' && (
            <TouchableOpacity
              style={[detailStyles.startButton, { backgroundColor: accent }]}
              onPress={handleStartHunt}
              disabled={statusMutation.isPending}
              activeOpacity={0.7}
              testID="start-hunt-button"
            >
              {statusMutation.isPending ? (
                <ActivityIndicator color={Colors.bg} size="small" />
              ) : (
                <>
                  <Play size={18} color={Colors.bg} fill={Colors.bg} />
                  <Text style={detailStyles.startButtonText}>START HUNT</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          {event.status === 'live' && (
            <TouchableOpacity
              style={detailStyles.endButton}
              onPress={handleEndHunt}
              disabled={statusMutation.isPending}
              activeOpacity={0.7}
              testID="end-hunt-button"
            >
              {statusMutation.isPending ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <>
                  <Square size={18} color={Colors.white} fill={Colors.white} />
                  <Text style={detailStyles.endButtonText}>END HUNT</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          {event.status === 'completed' && (
            <>
              <View style={detailStyles.completedBanner}>
                <Text style={detailStyles.completedText}>HUNT COMPLETED</Text>
              </View>
              <TouchableOpacity
                style={detailStyles.resetButton}
                onPress={handleResetHunt}
                disabled={resetMutation.isPending}
                activeOpacity={0.7}
                testID="reset-hunt-button"
              >
                {resetMutation.isPending ? (
                  <ActivityIndicator color={Colors.amber} size="small" />
                ) : (
                  <>
                    <RotateCcw size={18} color={Colors.amber} />
                    <Text style={detailStyles.resetButtonText}>RESET HUNT</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Zone Control */}
        <Text style={detailStyles.sectionTitle}>ZONE CONTROL</Text>
        <View style={detailStyles.zoneControlCard}>
          {zoneQuery.isLoading ? (
            <ActivityIndicator color={Colors.cyan} style={{ paddingVertical: 20 }} />
          ) : !hasZone ? (
            /* --- Initial Zone Setup --- */
            <View style={detailStyles.zoneForm}>
              <Text style={detailStyles.zoneSetupHint}>
                Configure the hunt zone for this event. Players will see their position relative to this zone.
              </Text>

              <TextInput
                style={detailStyles.input}
                value={zoneName}
                onChangeText={setZoneName}
                placeholder="Zone name (optional, e.g. 'Downtown area')"
                placeholderTextColor={Colors.textMuted}
              />

              {Platform.OS !== 'web' ? (
                <>
                  <TouchableOpacity
                    style={detailStyles.zoneMapToggle}
                    onPress={() => setZoneMapVisible(!zoneMapVisible)}
                    activeOpacity={0.7}
                  >
                    <Crosshair size={14} color={Colors.cyan} />
                    <Text style={detailStyles.zoneMapToggleText}>
                      {zoneMapVisible ? 'Hide Map' : 'Pick Zone Center'}
                    </Text>
                  </TouchableOpacity>
                  {zoneMapVisible && (
                    <View style={detailStyles.zoneMapContainer}>
                      <MapView
                        style={detailStyles.zoneMap}
                        initialRegion={{
                          latitude: parseFloat(zoneLat) || 53.3498,
                          longitude: parseFloat(zoneLng) || -6.2603,
                          latitudeDelta: ((parseFloat(zoneRadius) || ZONE_RADIUS_DEFAULT) / 111320) * 4,
                          longitudeDelta: ((parseFloat(zoneRadius) || ZONE_RADIUS_DEFAULT) / 111320) * 4,
                        }}
                        onPress={(e: MapPressEvent) => {
                          const { latitude, longitude } = e.nativeEvent.coordinate;
                          setZoneLat(String(latitude));
                          setZoneLng(String(longitude));
                        }}
                      >
                        {zoneLat && zoneLng && parseFloat(zoneLat) !== 0 && (
                          <>
                            <Marker
                              coordinate={{
                                latitude: parseFloat(zoneLat),
                                longitude: parseFloat(zoneLng),
                              }}
                            />
                            <Circle
                              center={{
                                latitude: parseFloat(zoneLat),
                                longitude: parseFloat(zoneLng),
                              }}
                              radius={parseFloat(zoneRadius) || ZONE_RADIUS_DEFAULT}
                              strokeColor="rgba(0, 212, 255, 0.8)"
                              fillColor="rgba(0, 212, 255, 0.12)"
                              strokeWidth={2}
                            />
                          </>
                        )}
                      </MapView>
                      <View style={detailStyles.mapOverlayHint}>
                        <Crosshair size={12} color={Colors.cyan} />
                        <Text style={detailStyles.mapOverlayHintText}>Tap map to set zone center</Text>
                      </View>
                    </View>
                  )}
                </>
              ) : (
                <View style={detailStyles.webCoordsRow}>
                  <View style={detailStyles.webCoordField}>
                    <Text style={detailStyles.zoneLabel}>LATITUDE</Text>
                    <TextInput
                      style={detailStyles.input}
                      value={zoneLat}
                      onChangeText={setZoneLat}
                      placeholder="e.g. 53.3498"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={detailStyles.webCoordField}>
                    <Text style={detailStyles.zoneLabel}>LONGITUDE</Text>
                    <TextInput
                      style={detailStyles.input}
                      value={zoneLng}
                      onChangeText={setZoneLng}
                      placeholder="e.g. -6.2603"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              )}

              <View style={detailStyles.radiusControl}>
                <Text style={detailStyles.zoneLabel}>ZONE RADIUS</Text>
                <View style={detailStyles.radiusRow}>
                  <TouchableOpacity
                    style={detailStyles.radiusBtn}
                    onPress={() => {
                      const current = parseFloat(zoneRadius) || ZONE_RADIUS_DEFAULT;
                      const step = current > 1000 ? 500 : current > 200 ? 100 : 50;
                      setZoneRadius(String(Math.max(ZONE_RADIUS_MIN, current - step)));
                    }}
                    activeOpacity={0.7}
                  >
                    <Minus size={16} color={Colors.cyan} />
                  </TouchableOpacity>
                  <View style={detailStyles.radiusValueContainer}>
                    <Text style={detailStyles.radiusValue}>{parseFloat(zoneRadius) || ZONE_RADIUS_DEFAULT}</Text>
                    <Text style={detailStyles.radiusUnit}>meters</Text>
                  </View>
                  <TouchableOpacity
                    style={detailStyles.radiusBtn}
                    onPress={() => {
                      const current = parseFloat(zoneRadius) || ZONE_RADIUS_DEFAULT;
                      const step = current >= 1000 ? 500 : current >= 200 ? 100 : 50;
                      setZoneRadius(String(current + step));
                    }}
                    activeOpacity={0.7}
                  >
                    <Plus size={16} color={Colors.cyan} />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={[detailStyles.zoneSaveBtn, !zoneLat || !zoneLng ? detailStyles.buttonDisabled : undefined]}
                onPress={() => zoneUpsertMutation.mutate()}
                disabled={zoneUpsertMutation.isPending || !zoneLat || !zoneLng}
                activeOpacity={0.7}
              >
                {zoneUpsertMutation.isPending ? (
                  <ActivityIndicator color={Colors.bg} size="small" />
                ) : (
                  <>
                    <MapPin size={16} color={Colors.bg} />
                    <Text style={detailStyles.zoneSaveBtnText}>SAVE ZONE</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            /* --- Live Zone Control --- */
            <View style={detailStyles.zoneForm}>
              {/* Zone info header */}
              <View style={detailStyles.zoneLiveHeader}>
                <View style={detailStyles.zoneLiveInfo}>
                  {zone?.zone_name ? (
                    <Text style={detailStyles.zoneLiveName}>{zone.zone_name}</Text>
                  ) : null}
                  <View style={detailStyles.zoneLiveCoords}>
                    <Text style={detailStyles.zoneLiveCoordText}>
                      {zone?.center_latitude.toFixed(6)}, {zone?.center_longitude.toFixed(6)}
                    </Text>
                  </View>
                </View>
                <View style={detailStyles.zoneSyncBadge}>
                  {zoneSyncStatus === 'saving' ? (
                    <ActivityIndicator size="small" color={Colors.amber} />
                  ) : zoneSyncStatus === 'synced' ? (
                    <CheckCircle size={14} color={Colors.cyan} />
                  ) : null}
                  <Text style={[
                    detailStyles.zoneSyncText,
                    zoneSyncStatus === 'synced' && { color: Colors.cyan },
                    zoneSyncStatus === 'saving' && { color: Colors.amber },
                  ]}>
                    {zoneSyncStatus === 'saving' ? 'Saving…' : zoneSyncStatus === 'synced' ? 'Synced' : ''}
                  </Text>
                </View>
              </View>

              {/* Map with draggable marker */}
              {Platform.OS !== 'web' ? (
                <>
                  <TouchableOpacity
                    style={detailStyles.zoneMapToggle}
                    onPress={() => setZoneMapVisible(!zoneMapVisible)}
                    activeOpacity={0.7}
                  >
                    <MapPin size={14} color={Colors.cyan} />
                    <Text style={detailStyles.zoneMapToggleText}>
                      {zoneMapVisible ? 'Hide Map' : 'Show Map'}
                    </Text>
                  </TouchableOpacity>
                  {zoneMapVisible && (
                    <View style={detailStyles.zoneMapContainer}>
                      <MapView
                        style={detailStyles.zoneMap}
                        region={{
                          latitude: (parseFloat(zoneLat) || zone?.center_latitude) ?? 53.3498,
                          longitude: (parseFloat(zoneLng) || zone?.center_longitude) ?? -6.2603,
                          latitudeDelta: ((zone?.initial_radius ?? ZONE_RADIUS_DEFAULT) / 111320) * 4,
                          longitudeDelta: ((zone?.initial_radius ?? ZONE_RADIUS_DEFAULT) / 111320) * 4,
                        }}
                      >
                        <Marker
                          coordinate={{
                            latitude: zone?.center_latitude ?? 0,
                            longitude: zone?.center_longitude ?? 0,
                          }}
                          draggable={!eventCompleted}
                          onDragEnd={(e) => {
                            const { latitude, longitude } = e.nativeEvent.coordinate;
                            handleZoneCenterChange(latitude, longitude);
                          }}
                        />
                        <Circle
                          center={{
                            latitude: zone?.center_latitude ?? 0,
                            longitude: zone?.center_longitude ?? 0,
                          }}
                          radius={zone?.initial_radius ?? ZONE_RADIUS_DEFAULT}
                          strokeColor="rgba(0, 212, 255, 0.3)"
                          fillColor="rgba(0, 212, 255, 0.05)"
                          strokeWidth={1}
                        />
                        {currentRadius != null && currentRadius > 0 && (
                          <Circle
                            center={{
                              latitude: zone?.center_latitude ?? 0,
                              longitude: zone?.center_longitude ?? 0,
                            }}
                            radius={currentRadius}
                            strokeColor="rgba(0, 212, 255, 0.9)"
                            fillColor="rgba(0, 212, 255, 0.15)"
                            strokeWidth={2}
                          />
                        )}
                      </MapView>
                      <View style={detailStyles.mapOverlayHint}>
                        <Crosshair size={12} color={Colors.cyan} />
                        <Text style={detailStyles.mapOverlayHintText}>
                          Drag marker to move zone center
                        </Text>
                      </View>
                    </View>
                  )}
                </>
              ) : (
                <View style={detailStyles.webCoordsRow}>
                  <View style={detailStyles.webCoordField}>
                    <Text style={detailStyles.zoneLabel}>LATITUDE</Text>
                    <TextInput
                      style={[detailStyles.input, eventCompleted && { opacity: 0.5 }]}
                      value={zoneLat}
                      onChangeText={(v) => {
                        setZoneLat(v);
                        const n = parseFloat(v);
                        if (!isNaN(n)) handleZoneCenterChange(n, parseFloat(zoneLng) || 0);
                      }}
                      placeholder="e.g. 53.3498"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="decimal-pad"
                      editable={!eventCompleted}
                    />
                  </View>
                  <View style={detailStyles.webCoordField}>
                    <Text style={detailStyles.zoneLabel}>LONGITUDE</Text>
                    <TextInput
                      style={[detailStyles.input, eventCompleted && { opacity: 0.5 }]}
                      value={zoneLng}
                      onChangeText={(v) => {
                        setZoneLng(v);
                        const n = parseFloat(v);
                        if (!isNaN(n)) handleZoneCenterChange(parseFloat(zoneLat) || 0, n);
                      }}
                      placeholder="e.g. -6.2603"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="decimal-pad"
                      editable={!eventCompleted}
                    />
                  </View>
                </View>
              )}

              {/* Current radius control (meters) */}
              <View style={detailStyles.narrowControl}>
                <Text style={detailStyles.narrowLabel}>CURRENT RADIUS</Text>
                <View style={detailStyles.narrowRow}>
                  <TouchableOpacity
                    style={detailStyles.narrowBtn}
                    onPress={() => {
                      const cur = parseInt(zoneCurrentRadiusMeters) || 0;
                      const next = Math.max(ZONE_RADIUS_MIN, cur - ZONE_RADIUS_STEP);
                      handleCurrentRadiusChange(String(next));
                    }}
                    activeOpacity={0.7}
                    disabled={eventCompleted}
                  >
                    <Minus size={18} color={eventCompleted ? Colors.textMuted : Colors.cyan} />
                  </TouchableOpacity>
                  <View style={detailStyles.narrowValueBox}>
                    <TextInput
                      style={detailStyles.narrowPercentInput}
                      value={zoneCurrentRadiusMeters}
                      onChangeText={(t) => {
                        handleCurrentRadiusChange(t);
                      }}
                      onBlur={() => {
                        if (!zoneCurrentRadiusMeters) {
                          handleCurrentRadiusChange(String(initialRadius));
                        }
                      }}
                      keyboardType="number-pad"
                      maxLength={5}
                      placeholder={String(Math.round(initialRadius))}
                      placeholderTextColor={Colors.textMuted}
                    />
                    <Text style={detailStyles.narrowUnitLabel}>m</Text>
                  </View>
                  <TouchableOpacity
                    style={detailStyles.narrowBtn}
                    onPress={() => {
                      const cur = parseInt(zoneCurrentRadiusMeters) || 0;
                      const next = Math.min(ZONE_RADIUS_MAX, cur + ZONE_RADIUS_STEP);
                      handleCurrentRadiusChange(String(next));
                    }}
                    activeOpacity={0.7}
                    disabled={eventCompleted}
                  >
                    <Plus size={18} color={eventCompleted ? Colors.textMuted : Colors.cyan} />
                  </TouchableOpacity>
                </View>

              </View>

              {/* Zone actions */}
              <View style={detailStyles.zoneLiveActions}>
                <TouchableOpacity
                  style={detailStyles.zoneResetBtn}
                  onPress={handleZoneReset}
                  activeOpacity={0.7}
                  disabled={currentRadius === Math.round(initialRadius)}
                >
                  <RotateCcw size={14} color={currentRadius === Math.round(initialRadius) ? Colors.textMuted : Colors.amber} />
                  <Text style={[
                    detailStyles.zoneResetBtnText,
                    currentRadius === Math.round(initialRadius) && { color: Colors.textMuted },
                  ]}>
                    RESET ZONE
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Updated timestamp */}
              {zone?.updated_at && (
                <Text style={detailStyles.zoneUpdatedText}>
                  Last updated: {new Date(zone.updated_at).toLocaleString()}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Send Clue */}
        <Text style={detailStyles.sectionTitle}>SEND CLUE</Text>
        <View style={detailStyles.clueForm}>
          <TextInput
            style={detailStyles.input}
            value={clueText}
            onChangeText={setClueText}
            placeholder="Enter clue text..."
            placeholderTextColor={Colors.textMuted}
            multiline
          />

          <TextInput
            style={detailStyles.input}
            value={clueHint}
            onChangeText={setClueHint}
            placeholder="Hint (optional, shown to players who need help)"
            placeholderTextColor={Colors.textMuted}
          />

          {mediaAttachment && (
            <MediaPreview
              attachment={mediaAttachment}
              onRemove={() => setMediaAttachment(null)}
            />
          )}

          <View style={detailStyles.mediaPickerRow}>
            <TouchableOpacity
              style={[detailStyles.mediaPickerBtn, mediaAttachment?.type === 'image' && detailStyles.mediaPickerBtnActive]}
              onPress={pickImage}
              activeOpacity={0.7}
              testID="pick-image-button"
            >
              <ImageIcon size={18} color={mediaAttachment?.type === 'image' ? Colors.bg : Colors.cyan} />
              <Text style={[detailStyles.mediaPickerLabel, mediaAttachment?.type === 'image' && detailStyles.mediaPickerLabelActive]}>Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[detailStyles.mediaPickerBtn, mediaAttachment?.type === 'video' && detailStyles.mediaPickerBtnActive]}
              onPress={pickVideo}
              activeOpacity={0.7}
              testID="pick-video-button"
            >
              <Video size={18} color={mediaAttachment?.type === 'video' ? Colors.bg : Colors.cyan} />
              <Text style={[detailStyles.mediaPickerLabel, mediaAttachment?.type === 'video' && detailStyles.mediaPickerLabelActive]}>Video</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[detailStyles.mediaPickerBtn, mediaAttachment?.type === 'audio' && detailStyles.mediaPickerBtnActive]}
              onPress={pickAudio}
              activeOpacity={0.7}
              testID="pick-audio-button"
            >
              <Mic size={18} color={mediaAttachment?.type === 'audio' ? Colors.bg : Colors.cyan} />
              <Text style={[detailStyles.mediaPickerLabel, mediaAttachment?.type === 'audio' && detailStyles.mediaPickerLabelActive]}>Audio</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[detailStyles.sendButton, !canSendClue && detailStyles.buttonDisabled]}
            onPress={() => sendClueMutation.mutate()}
            disabled={sendClueMutation.isPending || !canSendClue}
            activeOpacity={0.7}
            testID="send-clue-button"
          >
            {sendClueMutation.isPending ? (
              <View style={detailStyles.sendingRow}>
                <ActivityIndicator color={Colors.bg} size="small" />
                <Text style={detailStyles.sendButtonText}>
                  {mediaAttachment ? 'UPLOADING...' : 'SENDING...'}
                </Text>
              </View>
            ) : (
              <>
                <Send size={16} color={Colors.bg} />
                <Text style={detailStyles.sendButtonText}>SEND CLUE</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Clue History */}
        <Text style={detailStyles.sectionTitle}>CLUE HISTORY</Text>
        {cluesQuery.isLoading ? (
          <ActivityIndicator color={Colors.cyan} style={{ marginVertical: 20 }} />
        ) : (cluesQuery.data ?? []).length === 0 ? (
          <Text style={detailStyles.emptyText}>No clues sent yet</Text>
        ) : (
          <View style={detailStyles.clueList}>
            {(cluesQuery.data ?? []).map((clue, index) => (
              <View key={clue.id} style={detailStyles.clueCard}>
                <View style={detailStyles.clueHeader}>
                  <View style={detailStyles.clueNumber}>
                    <Text style={detailStyles.clueNumberText}>#{index + 1}</Text>
                  </View>
                  <View style={detailStyles.clueActions}>
                    <TouchableOpacity
                      onPress={() => router.push({ pathname: '/edit-clue', params: { id: clue.id, eventId: id } })}
                      hitSlop={8}
                    >
                      <Edit3 size={15} color={Colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteClue(clue.id)}
                      hitSlop={8}
                    >
                      <Trash2 size={15} color={Colors.red} />
                    </TouchableOpacity>
                  </View>
                </View>
                {clue.clue_text ? (
                  <Text style={detailStyles.clueText}>{clue.clue_text}</Text>
                ) : null}
                {clue.hint ? (
                  <Text style={detailStyles.clueHintText}>Hint: {clue.hint}</Text>
                ) : null}
                <ClueMediaDisplay clue={clue} />
                <View style={detailStyles.clueTime}>
                  <Clock size={11} color={Colors.textMuted} />
                  <Text style={detailStyles.clueTimeText}>
                    {new Date(clue.release_time).toLocaleString()}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const detailStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  center: {
    flex: 1,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  errorText: {
    color: Colors.red,
    fontSize: 15,
  },
  infoCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    color: Colors.white,
    fontWeight: '600' as const,
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
  sectionTitle: {
    fontSize: 11,
    color: Colors.cyan,
    letterSpacing: 1.5,
    fontWeight: '700' as const,
    marginTop: 8,
  },
  regenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 8,
  },
  regenerateBtnText: {
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 1.2,
  },
  statusButtons: {
    gap: 10,
  },
  startButton: {
    backgroundColor: Colors.cyan,
    borderRadius: 10,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  startButtonText: {
    color: Colors.bg,
    fontSize: 14,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
  },
  endButton: {
    backgroundColor: Colors.red,
    borderRadius: 10,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  endButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
  },
  completedBanner: {
    backgroundColor: Colors.greyDim,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  winnerCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: `${Colors.amber}55`,
    padding: 16,
    gap: 12,
  },
  winnerHeaderRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  winnerTitle: {
    color: Colors.amber,
    fontSize: 13,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
    flex: 1,
  },
  winnerBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  winnerBadgeText: {
    color: Colors.amber,
    fontSize: 9,
    fontWeight: '700' as const,
    letterSpacing: 1,
  },
  winnerInfoGrid: {
    gap: 10,
  },
  winnerInfoItem: {
    gap: 3,
  },
  winnerInfoLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    letterSpacing: 1,
    fontWeight: '700' as const,
  },
  winnerInfoValue: {
    fontSize: 13,
    color: Colors.white,
  },
  winnerInfoValueMono: {
    fontSize: 13,
    color: Colors.white,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 0.5,
  },
  completedText: {
    color: Colors.grey,
    fontSize: 14,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
  },
  resetButton: {
    borderWidth: 1,
    borderColor: Colors.amber,
    borderRadius: 10,
    paddingVertical: 14,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
  },
  resetButtonText: {
    color: Colors.amber,
    fontSize: 14,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
  },
  clueForm: {
    gap: 10,
  },
  input: {
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: Colors.white,
    fontSize: 15,
    minHeight: 48,
  },
  mediaPickerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  mediaPickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.cyanDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.3)',
    borderRadius: 10,
    paddingVertical: 10,
  },
  mediaPickerBtnActive: {
    backgroundColor: Colors.cyan,
    borderColor: Colors.cyan,
  },
  mediaPickerLabel: {
    color: Colors.cyan,
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
  },
  mediaPickerLabelActive: {
    color: Colors.bg,
  },
  mediaPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 10,
    gap: 10,
  },
  mediaThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: Colors.inputBg,
  },
  mediaFilePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: Colors.cyanDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaInfo: {
    flex: 1,
    gap: 2,
  },
  mediaTypeLabel: {
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 1,
    color: Colors.cyan,
  },
  mediaFileName: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  mediaRemoveBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.redDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    backgroundColor: Colors.cyan,
    borderRadius: 10,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    color: Colors.bg,
    fontSize: 13,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
  },
  sendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // --- Zone Control ---
  zoneControlCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  zoneForm: {
    padding: 14,
    gap: 12,
  },
  zoneSetupHint: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  zoneMapToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  zoneMapToggleText: {
    color: Colors.cyan,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  zoneMapContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  zoneMap: {
    height: 240,
  },
  mapOverlayHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(10, 10, 10, 0.85)',
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  mapOverlayHintText: {
    fontSize: 11,
    color: Colors.textSecondary,
    letterSpacing: 0.3,
  },
  radiusControl: {
    gap: 6,
  },
  radiusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  radiusBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.cyanDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radiusValueContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    paddingVertical: 10,
    gap: 4,
  },
  radiusValue: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  radiusUnit: {
    fontSize: 10,
    color: Colors.textMuted,
    letterSpacing: 1,
    fontWeight: '600' as const,
  },
  percentInput: {
    color: Colors.white,
    fontSize: 22,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
    minWidth: 50,
    paddingVertical: 0,
  },
  currentRadiusText: {
    fontSize: 12,
    color: Colors.cyan,
    fontWeight: '600' as const,
  },
  // Narrow zone live control (cleaner layout)
  narrowControl: {
    flexDirection: 'column' as const,
    gap: 10,
  },
  narrowLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    letterSpacing: 1.2,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
  },
  narrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  narrowBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.cyanDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  narrowValueBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.2)',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  narrowPercentInput: {
    color: Colors.white,
    fontSize: 26,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
    minWidth: 40,
    paddingVertical: 0,
  },
  narrowUnitLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  narrowRangeHint: {
    fontSize: 10,
    color: Colors.textMuted,
    letterSpacing: 0.3,
    marginTop: 6,
  },
  zoneLockedNotice: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    backgroundColor: Colors.amberDim,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  zoneLockedText: {
    fontSize: 11,
    color: Colors.amber,
    lineHeight: 15,
  },
  narrowRadiusPreview: {
    fontSize: 12,
    color: Colors.cyan,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
  },
  zoneLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    letterSpacing: 1,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  zoneSaveBtn: {
    backgroundColor: Colors.cyan,
    borderRadius: 10,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  zoneSaveBtnText: {
    color: Colors.bg,
    fontSize: 13,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
  },
  // Live zone control
  zoneLiveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  zoneLiveInfo: {
    flex: 1,
    gap: 2,
  },
  zoneLiveName: {
    fontSize: 15,
    color: Colors.white,
    fontWeight: '700' as const,
  },
  zoneLiveCoords: {
    flexDirection: 'row',
    gap: 6,
  },
  zoneLiveCoordText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  zoneSyncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.bg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  zoneSyncText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600' as const,
  },
  zoneLiveActions: {
    flexDirection: 'row',
    gap: 10,
  },
  zoneResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.amber,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  zoneResetBtnText: {
    color: Colors.amber,
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 1,
  },
  zoneUpdatedText: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },
  // --- Bounty Diagnostics ---
  diagCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 14,
    gap: 12,
  },
  diagHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  diagTitle: {
    fontSize: 11,
    color: Colors.cyan,
    letterSpacing: 1.5,
    fontWeight: '700' as const,
  },
  diagGrid: {
    gap: 8,
  },
  diagItem: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  diagLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    letterSpacing: 1,
    fontWeight: '700' as const,
    flexShrink: 0,
  },
  diagValue: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: 'right' as const,
    flex: 1,
  },
  diagValueMono: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlign: 'right' as const,
    flex: 1,
  },
  diagPingBtn: {
    backgroundColor: Colors.cyan,
    borderRadius: 10,
    paddingVertical: 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
  },
  diagPingBtnText: {
    color: Colors.bg,
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1,
  },
  diagResultBox: {
    backgroundColor: Colors.cyanDim,
    borderRadius: 8,
    padding: 10,
    gap: 6,
  },
  diagResultBoxErr: {
    backgroundColor: Colors.amberDim,
  },
  diagResultHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  diagResultTitle: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1,
  },
  diagResultMsg: {
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  diagHelp: {
    fontSize: 10,
    color: Colors.textMuted,
    lineHeight: 15,
  },
  // --- Clue History ---
  clueList: {
    gap: 10,
  },
  clueCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 8,
  },
  clueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clueNumber: {
    backgroundColor: Colors.cyanDim,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  clueNumberText: {
    color: Colors.cyan,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  clueActions: {
    flexDirection: 'row',
    gap: 14,
  },
  clueText: {
    color: Colors.white,
    fontSize: 14,
    lineHeight: 20,
  },
  clueHintText: {
    color: Colors.amber,
    fontSize: 13,
    fontStyle: 'italic' as const,
    lineHeight: 18,
  },
  clueMediaImage: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    backgroundColor: Colors.inputBg,
  },
  clueMediaFile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.cyanDim,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  clueMediaLabel: {
    color: Colors.cyan,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  clueTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clueTimeText: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  webCoordsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  webCoordField: {
    flex: 1,
  },
});
