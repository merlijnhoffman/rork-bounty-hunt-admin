import React, { useState, useCallback, useEffect } from 'react';
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
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { Event, Clue } from '@/types';
import Colors from '@/constants/colors';

type MediaType = 'image' | 'video' | 'audio';

interface MediaAttachment {
  uri: string;
  type: MediaType;
  fileName: string;
  mimeType: string;
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'live' ? Colors.cyan :
    status === 'scheduled' ? Colors.amber :
    Colors.grey;
  const bgColor =
    status === 'live' ? Colors.cyanDim :
    status === 'scheduled' ? Colors.amberDim :
    Colors.greyDim;

  return (
    <View style={[detailStyles.badge, { backgroundColor: bgColor }]}>
      <View style={[detailStyles.badgeDot, { backgroundColor: color }]} />
      <Text style={[detailStyles.badgeText, { color }]}>{status.toUpperCase()}</Text>
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

  console.log('[Upload] Starting upload:', filePath, 'mimeType:', attachment.mimeType);

  const response = await fetch(attachment.uri);
  const blob = await response.blob();

  const { data, error } = await supabase.storage
    .from('clue-media')
    .upload(filePath, blob, {
      contentType: attachment.mimeType,
      upsert: false,
    });

  if (error) {
    console.error('[Upload] Storage upload error:', error.message);
    throw new Error(`Media upload failed: ${error.message}`);
  }

  console.log('[Upload] Upload success:', data.path);

  const { data: urlData } = supabase.storage
    .from('clue-media')
    .getPublicUrl(data.path);

  console.log('[Upload] Public URL:', urlData.publicUrl);
  return urlData.publicUrl;
}

export default function EventDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [clueText, setClueText] = useState<string>('');
  const [clueHint, setClueHint] = useState<string>('');
  const [mediaAttachment, setMediaAttachment] = useState<MediaAttachment | null>(null);


  const [clueZoneLat, setClueZoneLat] = useState<string>('');
  const [clueZoneLng, setClueZoneLng] = useState<string>('');
  const [clueZoneRadius, setClueZoneRadius] = useState<string>('500');
  const [clueZoneName, setClueZoneName] = useState<string>('');
  const [clueZoneEnabled, setClueZoneEnabled] = useState<boolean>(false);
  const [clueZoneMapVisible, setClueZoneMapVisible] = useState<boolean>(false);

  const eventQuery = useQuery({
    queryKey: ['event', id],
    queryFn: async () => {
      console.log('[EventDetail] Fetching event:', id);
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
      console.log('[EventDetail] Fetching clues for event:', id);
      const { data, error } = await supabase
        .from('clues')
        .select('*')
        .eq('event_id', id)
        .order('order_number', { ascending: true });
      if (error) {
        console.warn('[EventDetail] order_number sort failed, falling back to release_time:', error.message);
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

  useEffect(() => {
    if (!id) return;

    console.log('[EventDetail] Setting up real-time subscription for clues and event');
    const channel = supabase
      .channel(`admin-event-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clues', filter: `event_id=eq.${id}` },
        () => {
          console.log('[EventDetail] Clue change detected, refetching');
          void queryClient.invalidateQueries({ queryKey: ['clues', id] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events', filter: `id=eq.${id}` },
        () => {
          console.log('[EventDetail] Event change detected, refetching');
          void queryClient.invalidateQueries({ queryKey: ['event', id] });
        }
      )
      .subscribe();

    return () => {
      console.log('[EventDetail] Cleaning up real-time subscription');
      void supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  const statusMutation = useMutation({
    mutationFn: async (newStatus: 'live' | 'completed') => {
      console.log('[EventDetail] Changing status to:', newStatus, 'for event:', id);

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
        console.log('[Media] Image selected:', fileName);
      }
    } catch (err) {
      console.error('[Media] Image pick error:', err);
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
        console.log('[Media] Video selected:', fileName);
      }
    } catch (err) {
      console.error('[Media] Video pick error:', err);
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
        console.log('[Media] Audio selected:', asset.name);
      }
    } catch (err) {
      console.error('[Media] Audio pick error:', err);
      Alert.alert('Error', 'Failed to pick audio file.');
    }
  }, []);

  const sendClueMutation = useMutation({
    mutationFn: async () => {
      console.log('[EventDetail] Sending clue for event:', id);

      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;

      const { count, error: countError } = await supabase
        .from('clues')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', id);
      
      if (countError) {
        console.warn('[EventDetail] Could not count clues, using fallback:', countError.message);
      }
      const nextOrder = (count ?? (cluesQuery.data ?? []).length) + 1;
      console.log('[EventDetail] Next clue order:', nextOrder);

      let mediaUrl: string | null = null;
      let mediaType: MediaType | null = null;

      if (mediaAttachment) {
        console.log('[EventDetail] Uploading media attachment...');
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

      if (clueZoneEnabled && clueZoneLat && clueZoneLng) {
        cluePayload.zone_latitude = parseFloat(clueZoneLat);
        cluePayload.zone_longitude = parseFloat(clueZoneLng);
        cluePayload.zone_radius = parseFloat(clueZoneRadius) || 500;
        if (clueZoneName.trim()) {
          cluePayload.zone_name = clueZoneName.trim();
        }
        console.log('[EventDetail] Clue zone data:', { lat: cluePayload.zone_latitude, lng: cluePayload.zone_longitude, radius: cluePayload.zone_radius, name: cluePayload.zone_name });
      }

      console.log('[EventDetail] Clue payload:', JSON.stringify(cluePayload));

      const tryInsert = async (payload: Record<string, unknown>) => {
        const { data, error } = await supabase.from('clues').insert(payload).select();
        return { data, error };
      };

      let { data, error } = await tryInsert(cluePayload);

      if (error && /order_number/i.test(error.message)) {
        console.warn('[EventDetail] order_number column missing, retrying without it');
        const { order_number: _omit, ...rest } = cluePayload as { order_number?: number } & Record<string, unknown>;
        const retry = await tryInsert(rest);
        data = retry.data;
        error = retry.error;
      }

      if (error && /clue_order/i.test(error.message)) {
        console.warn('[EventDetail] clue_order column missing, retrying without it');
        const { clue_order: _omit, ...rest } = cluePayload as { clue_order?: number } & Record<string, unknown>;
        const retry = await tryInsert(rest);
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        console.log('[EventDetail] Supabase client insert failed:', error.message, '- trying direct REST');

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
        console.log('[EventDetail] Direct REST clue insert response:', res.status, resBody);

        if (!res.ok && /order_number/i.test(resBody)) {
          console.warn('[EventDetail] REST insert: order_number missing, retrying without it');
          const { order_number: _omit, ...rest } = cluePayload as { order_number?: number } & Record<string, unknown>;
          const retry = await doFetch(rest);
          res = retry.res;
          resBody = retry.resBody;
          console.log('[EventDetail] Retry REST clue insert response:', res.status, resBody);
        }

        if (!res.ok && /clue_order/i.test(resBody)) {
          console.warn('[EventDetail] REST insert: clue_order missing, retrying without it');
          const { clue_order: _omit, ...rest } = cluePayload as { clue_order?: number } & Record<string, unknown>;
          const retry = await doFetch(rest);
          res = retry.res;
          resBody = retry.resBody;
          console.log('[EventDetail] Retry REST clue insert response (clue_order):', res.status, resBody);
        }

        if (!res.ok) {
          throw new Error(
            `Failed to send clue (${res.status}): ${resBody}\n\nThis is likely an RLS policy issue. ` +
            'Add an INSERT policy on the clues table.'
          );
        }
      } else {
        console.log('[EventDetail] Clue inserted successfully:', data);
      }
    },
    onSuccess: () => {
      setClueText('');
      setClueHint('');
      setMediaAttachment(null);
      setClueZoneEnabled(false);
      setClueZoneLat('');
      setClueZoneLng('');
      setClueZoneRadius('500');
      setClueZoneName('');
      setClueZoneMapVisible(false);
      void queryClient.invalidateQueries({ queryKey: ['clues', id] });
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message);
    },
  });

  const deleteClueMutation = useMutation({
    mutationFn: async (clueId: string) => {
      console.log('[EventDetail] Deleting clue:', clueId);
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


  const canSendClue = clueText.trim().length > 0 || mediaAttachment !== null || (clueZoneEnabled && clueZoneLat && clueZoneLng);

  const event = eventQuery.data;

  const isRefreshing = eventQuery.isRefetching || cluesQuery.isRefetching;
  const handleRefresh = useCallback(() => {
    void eventQuery.refetch();
    void cluesQuery.refetch();
  }, [eventQuery, cluesQuery]);

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
              <TouchableOpacity onPress={() => router.push(`/live-players?id=${event.id}`)}>
                <Users size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push(`/edit-event?id=${event.id}`)}>
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
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={Colors.cyan} />
        }
      >
        <View style={detailStyles.infoCard}>
          <View style={detailStyles.infoRow}>
            <Text style={detailStyles.infoLabel}>City</Text>
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
            <StatusBadge status={event.status} />
          </View>
        </View>

        <Text style={detailStyles.sectionTitle}>STATUS CONTROL</Text>
        <View style={detailStyles.statusButtons}>
          {event.status === 'scheduled' && (
            <TouchableOpacity
              style={detailStyles.startButton}
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

          <View style={detailStyles.zoneToggleSection}>
            <TouchableOpacity
              style={[detailStyles.zoneToggleBtn, clueZoneEnabled && detailStyles.zoneToggleBtnActive]}
              onPress={() => {
                setClueZoneEnabled(!clueZoneEnabled);
                if (!clueZoneEnabled && event.zone_latitude && event.zone_longitude) {
                  setClueZoneLat(String(event.zone_latitude));
                  setClueZoneLng(String(event.zone_longitude));
                  setClueZoneRadius(String(event.zone_radius ?? 500));
                }
              }}
              activeOpacity={0.7}
            >
              <MapPin size={16} color={clueZoneEnabled ? Colors.bg : Colors.cyan} />
              <Text style={[detailStyles.zoneToggleLabel, clueZoneEnabled && detailStyles.zoneToggleLabelActive]}>
                {clueZoneEnabled ? 'Zone Attached' : 'Add Zone'}
              </Text>
            </TouchableOpacity>
          </View>

          {clueZoneEnabled && (
            <View style={detailStyles.clueZoneForm}>
              <TextInput
                style={detailStyles.input}
                value={clueZoneName}
                onChangeText={setClueZoneName}
                placeholder="Zone name (optional, e.g. 'Near the park')"
                placeholderTextColor={Colors.textMuted}
              />

              {Platform.OS !== 'web' ? (
                <>
                  <TouchableOpacity
                    style={detailStyles.clueZoneMapToggle}
                    onPress={() => setClueZoneMapVisible(!clueZoneMapVisible)}
                    activeOpacity={0.7}
                  >
                    <Crosshair size={14} color={Colors.cyan} />
                    <Text style={detailStyles.clueZoneMapToggleText}>
                      {clueZoneMapVisible ? 'Hide Map' : 'Pick on Map'}
                    </Text>
                  </TouchableOpacity>
                  {clueZoneMapVisible && (
                    <View style={detailStyles.clueZoneMapContainer}>
                      <MapView
                        style={detailStyles.clueZoneMap}
                        initialRegion={{
                          latitude: parseFloat(clueZoneLat) || event.zone_latitude || 53.3498,
                          longitude: parseFloat(clueZoneLng) || event.zone_longitude || -6.2603,
                          latitudeDelta: ((parseFloat(clueZoneRadius) || 500) / 111320) * 4,
                          longitudeDelta: ((parseFloat(clueZoneRadius) || 500) / 111320) * 4,
                        }}
                        onPress={(e: MapPressEvent) => {
                          const { latitude, longitude } = e.nativeEvent.coordinate;
                          setClueZoneLat(String(latitude));
                          setClueZoneLng(String(longitude));
                        }}
                      >
                        {clueZoneLat && clueZoneLng && parseFloat(clueZoneLat) !== 0 && (
                          <>
                            <Marker
                              coordinate={{
                                latitude: parseFloat(clueZoneLat),
                                longitude: parseFloat(clueZoneLng),
                              }}
                              draggable
                              onDragEnd={(e) => {
                                const { latitude, longitude } = e.nativeEvent.coordinate;
                                setClueZoneLat(String(latitude));
                                setClueZoneLng(String(longitude));
                              }}
                            />
                            <Circle
                              center={{
                                latitude: parseFloat(clueZoneLat),
                                longitude: parseFloat(clueZoneLng),
                              }}
                              radius={parseFloat(clueZoneRadius) || 500}
                              strokeColor="rgba(0, 212, 255, 0.8)"
                              fillColor="rgba(0, 212, 255, 0.12)"
                              strokeWidth={2}
                            />
                          </>
                        )}
                      </MapView>
                      <View style={detailStyles.mapOverlayHint}>
                        <Crosshair size={12} color={Colors.cyan} />
                        <Text style={detailStyles.mapOverlayHintText}>Tap to set zone center</Text>
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
                      value={clueZoneLat}
                      onChangeText={setClueZoneLat}
                      placeholder="e.g. 53.3498"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={detailStyles.webCoordField}>
                    <Text style={detailStyles.zoneLabel}>LONGITUDE</Text>
                    <TextInput
                      style={detailStyles.input}
                      value={clueZoneLng}
                      onChangeText={setClueZoneLng}
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
                      const current = parseFloat(clueZoneRadius) || 500;
                      const step = current > 1000 ? 500 : current > 200 ? 100 : 50;
                      setClueZoneRadius(String(Math.max(50, current - step)));
                    }}
                    activeOpacity={0.7}
                  >
                    <Minus size={16} color={Colors.cyan} />
                  </TouchableOpacity>
                  <View style={detailStyles.radiusValueContainer}>
                    <Text style={detailStyles.radiusValue}>{parseFloat(clueZoneRadius) || 500}</Text>
                    <Text style={detailStyles.radiusUnit}>meters</Text>
                  </View>
                  <TouchableOpacity
                    style={detailStyles.radiusBtn}
                    onPress={() => {
                      const current = parseFloat(clueZoneRadius) || 500;
                      const step = current >= 1000 ? 500 : current >= 200 ? 100 : 50;
                      setClueZoneRadius(String(current + step));
                    }}
                    activeOpacity={0.7}
                  >
                    <Plus size={16} color={Colors.cyan} />
                  </TouchableOpacity>
                </View>
              </View>

              {Platform.OS !== 'web' && clueZoneLat && clueZoneLng && (
                <View style={detailStyles.coordDisplay}>
                  <View style={detailStyles.coordItem}>
                    <Text style={detailStyles.coordLabel}>LAT</Text>
                    <Text style={detailStyles.coordValue}>{parseFloat(clueZoneLat)?.toFixed(6) || '—'}</Text>
                  </View>
                  <View style={detailStyles.coordDivider} />
                  <View style={detailStyles.coordItem}>
                    <Text style={detailStyles.coordLabel}>LNG</Text>
                    <Text style={detailStyles.coordValue}>{parseFloat(clueZoneLng)?.toFixed(6) || '—'}</Text>
                  </View>
                </View>
              )}
            </View>
          )}

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
                {(clue.zone_latitude && clue.zone_longitude) ? (
                  <View style={detailStyles.clueZoneTag}>
                    <MapPin size={12} color={Colors.cyan} />
                    <Text style={detailStyles.clueZoneTagText}>
                      {clue.zone_name ? clue.zone_name : `${clue.zone_latitude?.toFixed(4)}, ${clue.zone_longitude?.toFixed(4)}`}
                      {clue.zone_radius ? ` · ${clue.zone_radius}m` : ''}
                    </Text>
                  </View>
                ) : null}
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
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
  zoneForm: {
    gap: 12,
  },
  mapEditorContainer: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  mapEditor: {
    height: 280,
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
  mapWebFallback: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  mapWebFallbackTitle: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  mapWebFallbackSub: {
    color: Colors.textMuted,
    fontSize: 12,
    marginBottom: 12,
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
  coordDisplay: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  coordItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    gap: 2,
  },
  coordLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    letterSpacing: 1.5,
    fontWeight: '700' as const,
  },
  coordValue: {
    fontSize: 13,
    color: Colors.white,
    fontWeight: '600' as const,
  },
  coordDivider: {
    width: 1,
    backgroundColor: Colors.cardBorder,
  },
  zoneRow: {
    flexDirection: 'row',
    gap: 12,
  },
  zoneLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    letterSpacing: 1,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  zoneActions: {
    flexDirection: 'row',
    gap: 10,
  },
  zoneCancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  zoneCancelText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600' as const,
    letterSpacing: 1,
  },
  zoneSaveButton: {
    flex: 1,
    backgroundColor: Colors.cyan,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  zoneSaveText: {
    color: Colors.bg,
    fontSize: 13,
    fontWeight: '700' as const,
    letterSpacing: 1,
  },
  zoneInfo: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  zoneMapPreview: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  zoneMapPreviewMap: {
    height: 160,
  },
  zoneInfoDetails: {
    padding: 14,
    gap: 6,
  },
  zoneInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  zoneInfoText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
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
  zoneToggleSection: {
    flexDirection: 'row',
  },
  zoneToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.cyanDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.3)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  zoneToggleBtnActive: {
    backgroundColor: Colors.cyan,
    borderColor: Colors.cyan,
  },
  zoneToggleLabel: {
    color: Colors.cyan,
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
  },
  zoneToggleLabelActive: {
    color: Colors.bg,
  },
  clueZoneForm: {
    gap: 10,
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 12,
  },
  clueZoneMapToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  clueZoneMapToggleText: {
    color: Colors.cyan,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  clueZoneMapContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  clueZoneMap: {
    height: 220,
  },
  clueZoneTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.cyanDim,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  clueZoneTagText: {
    color: Colors.cyan,
    fontSize: 11,
    fontWeight: '600' as const,
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
