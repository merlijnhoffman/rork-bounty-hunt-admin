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
} from 'react-native';
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

      const { error } = await supabase.from('clues').update(updatePayload).eq('id', id);
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
  saveButtonText: {
    color: Colors.bg,
    fontSize: 15,
    fontWeight: '700' as const,
    letterSpacing: 2,
  },
});
