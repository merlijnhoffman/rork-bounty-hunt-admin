import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Clue } from '@/types';
import Colors from '@/constants/colors';

export default function EditClueScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id, eventId } = useLocalSearchParams<{ id: string; eventId: string }>();

  const [text, setText] = useState<string>('');
  const [hint, setHint] = useState<string>('');
  const [hasZone, setHasZone] = useState<boolean>(false);
  const [revealPercent, setRevealPercent] = useState<string>('100');


  const clueQuery = useQuery({
    queryKey: ['clue', id],
    queryFn: async () => {
      if (__DEV__) console.log('[EditClue] Fetching clue:', id);
      const { data, error } = await supabase
        .from('clues')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as Clue;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (clueQuery.data) {
      const c = clueQuery.data;
      setText(c.clue_text);
      setHint(c.hint ?? '');
      setHasZone(!!(c.zone_latitude && c.zone_longitude));
      const p = c.zone_reveal_percent ?? c.zone_visible_percent ?? c.zone_percent ?? c.reveal_percent;
      setRevealPercent(typeof p === 'number' ? String(p) : '100');
    }
  }, [clueQuery.data]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (__DEV__) console.log('[EditClue] Updating clue:', id);
      const updatePayload: Record<string, unknown> = {
        clue_text: text.trim(),
      };
      if (hint.trim()) {
        updatePayload.hint = hint.trim();
      } else {
        updatePayload.hint = null;
      }

      if (hasZone) {
        const percentNum = Math.max(0, Math.min(100, parseFloat(revealPercent) || 100));
        updatePayload.zone_reveal_percent = percentNum;
        updatePayload.zone_visible_percent = percentNum;
        updatePayload.zone_percent = percentNum;
        updatePayload.reveal_percent = percentNum;
      }

      const tryUpdate = async (payload: Record<string, unknown>) => {
        return supabase.from('clues').update(payload).eq('id', id);
      };

      let { error } = await tryUpdate(updatePayload);

      const percentColumns = ['zone_reveal_percent', 'zone_visible_percent', 'zone_percent', 'reveal_percent'] as const;
      for (const col of percentColumns) {
        if (error && new RegExp(col, 'i').test(error.message) && /column|schema cache/i.test(error.message)) {
          if (__DEV__) console.warn(`[EditClue] ${col} column missing, retrying without it`);
          delete updatePayload[col];
          const retry = await tryUpdate(updatePayload);
          error = retry.error;
        }
      }

      if (error) throw error;
    },
    onSuccess: () => {
      if (__DEV__) console.log('[EditClue] Clue updated');
      void queryClient.invalidateQueries({ queryKey: ['clues', eventId] });
      router.back();
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message);
    },
  });

  if (clueQuery.isLoading) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'EDIT CLUE',
            headerStyle: { backgroundColor: Colors.bg },
            headerTintColor: Colors.white,
            headerTitleStyle: { fontSize: 14, letterSpacing: 2, fontWeight: '700' },
          }}
        />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.cyan} />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'EDIT CLUE',
          headerStyle: { backgroundColor: Colors.bg },
          headerTintColor: Colors.white,
          headerTitleStyle: { fontSize: 14, letterSpacing: 2, fontWeight: '700' },
        }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>CLUE TEXT</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={text}
              onChangeText={setText}
              placeholder="Enter clue text..."
              placeholderTextColor={Colors.textMuted}
              multiline
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>HINT (OPTIONAL)</Text>
            <TextInput
              style={styles.input}
              value={hint}
              onChangeText={setHint}
              placeholder="Hint shown to players who need help"
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          {hasZone && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>ZONE REVEAL %</Text>
              <View style={styles.percentRow}>
                <TouchableOpacity
                  style={styles.percentBtn}
                  onPress={() => {
                    const current = parseFloat(revealPercent);
                    const safe = isNaN(current) ? 100 : current;
                    setRevealPercent(String(Math.max(0, safe - 5)));
                  }}
                  activeOpacity={0.7}
                  testID="decrease-percent-button"
                >
                  <Minus size={16} color={Colors.cyan} />
                </TouchableOpacity>
                <View style={styles.percentValueContainer}>
                  <TextInput
                    style={styles.percentInput}
                    value={revealPercent}
                    onChangeText={(t) => {
                      const cleaned = t.replace(/[^0-9]/g, '');
                      if (cleaned === '') { setRevealPercent(''); return; }
                      const n = Math.max(0, Math.min(100, parseInt(cleaned, 10)));
                      setRevealPercent(String(n));
                    }}
                    onBlur={() => {
                      if (!revealPercent) setRevealPercent('100');
                    }}
                    keyboardType="number-pad"
                    maxLength={3}
                    placeholder="100"
                    placeholderTextColor={Colors.textMuted}
                    testID="percent-input"
                  />
                  <Text style={styles.percentUnit}>% shown</Text>
                </View>
                <TouchableOpacity
                  style={styles.percentBtn}
                  onPress={() => {
                    const current = parseFloat(revealPercent);
                    const safe = isNaN(current) ? 100 : current;
                    setRevealPercent(String(Math.min(100, safe + 5)));
                  }}
                  activeOpacity={0.7}
                  testID="increase-percent-button"
                >
                  <Plus size={16} color={Colors.cyan} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveButton, !text.trim() && styles.buttonDisabled]}
            onPress={() => updateMutation.mutate()}
            disabled={updateMutation.isPending || !text.trim()}
            activeOpacity={0.7}
            testID="save-clue-button"
          >
            {updateMutation.isPending ? (
              <ActivityIndicator color={Colors.bg} size="small" />
            ) : (
              <Text style={styles.saveButtonText}>SAVE CHANGES</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  form: {
    padding: 20,
    gap: 20,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 11,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    fontWeight: '600' as const,
  },
  input: {
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: Colors.white,
    fontSize: 16,
  },
  multilineInput: {
    minHeight: 100,
    textAlignVertical: 'top' as const,
  },
  saveButton: {
    backgroundColor: Colors.cyan,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  percentRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 10,
    padding: 8,
  },
  percentBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: Colors.cyanDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.3)',
  },
  percentValueContainer: {
    flex: 1,
    alignItems: 'center' as const,
  },
  percentInput: {
    color: Colors.white,
    fontSize: 22,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
    minWidth: 60,
    paddingVertical: 0,
  },
  percentUnit: {
    color: Colors.textSecondary,
    fontSize: 11,
    letterSpacing: 1,
  },
  saveButtonText: {
    color: Colors.bg,
    fontSize: 15,
    fontWeight: '700' as const,
    letterSpacing: 2,
  },
});
