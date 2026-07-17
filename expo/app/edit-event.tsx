import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Event, EVENT_COLORS, DEFAULT_ACCENT_COLOR } from '@/types';
import Colors from '@/constants/colors';

export default function EditEventScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [title, setTitle] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [accentColor, setAccentColor] = useState<string>(DEFAULT_ACCENT_COLOR);
  const [price, setPrice] = useState<string>('');
  const [prizeAmount, setPrizeAmount] = useState<string>('');
  const [isFree, setIsFree] = useState<boolean>(false);

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

  useEffect(() => {
    if (eventQuery.data) {
      const e = eventQuery.data;
      setTitle(e.title ?? '');
      setCity(e.city);
      setDate(e.date);
      setStartTime(e.start_time);
      setAccentColor(e.accent_color ?? DEFAULT_ACCENT_COLOR);
      const priceValue = e.price ?? 0;
      setPrice(String(priceValue));
      setPrizeAmount(String(e.prize_amount));
      setIsFree(priceValue === 0);
    }
  }, [eventQuery.data]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const updateData: Record<string, unknown> = {
        title: title.trim(),
        city: city.trim(),
        date: date.trim(),
        start_time: startTime.trim(),
        accent_color: accentColor,
        price: isFree ? 0 : parseFloat(price),
        prize_amount: parseFloat(prizeAmount),
      };
      if (__DEV__) console.log('[EditEvent] Updating event:', id, 'with data:', JSON.stringify(updateData));

      const { error: updateError } = await supabase
        .from('events')
        .update(updateData)
        .eq('id', id);
      if (__DEV__) console.log('[EditEvent] Update response error:', updateError);
      if (updateError) throw updateError;

      const { data: verify, error: verifyError } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .single();
      if (__DEV__) console.log('[EditEvent] Verification fetch:', JSON.stringify({ verify, verifyError }));
      if (verifyError) throw verifyError;
      return verify as Event;
    },
    onSuccess: async () => {
      if (__DEV__) console.log('[EditEvent] Event updated successfully');
      await queryClient.invalidateQueries({ queryKey: ['events'] });
      await queryClient.invalidateQueries({ queryKey: ['event', id] });
      router.back();
    },
    onError: (error: Error) => {
      if (__DEV__) console.error('[EditEvent] Error:', error.message);
      Alert.alert('Error', error.message);
    },
  });

  if (eventQuery.isLoading) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'EDIT EVENT',
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

  const isValid = title && city && date && startTime && (isFree || price) && prizeAmount;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'EDIT EVENT',
          headerStyle: { backgroundColor: Colors.bg },
          headerTintColor: Colors.white,
          headerTitleStyle: { fontSize: 14, letterSpacing: 2, fontWeight: '700' },
        }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <EditField label="EVENT TITLE" value={title} onChangeText={setTitle} placeholder="Amsterdam Treasure Hunt" />
          <EditField label="LOCATION" value={city} onChangeText={setCity} />
          <View style={styles.row}>
            <View style={styles.halfField}>
              <EditField label="DATE" value={date} onChangeText={setDate} placeholder="2026-04-15" />
            </View>
            <View style={styles.halfField}>
              <EditField label="START TIME" value={startTime} onChangeText={setStartTime} placeholder="14:00" />
            </View>
          </View>

          {/* Color Picker */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>EVENT COLOR</Text>
            <View style={styles.colorGrid}>
              {EVENT_COLORS.map((color) => {
                const selected = accentColor === color.hex;
                return (
                  <TouchableOpacity
                    key={color.hex}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: color.hex },
                      selected && styles.colorSwatchSelected,
                    ]}
                    onPress={() => setAccentColor(color.hex)}
                    activeOpacity={0.7}
                  >
                    {selected && <Text style={styles.colorCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.colorHint}>
              {EVENT_COLORS.find((c) => c.hex === accentColor)?.label ?? 'Custom'} — accent color for this event
            </Text>
          </View>

          <View style={styles.row}>
            <View style={styles.halfField}>
              <EditField
                label="TICKET PRICE (EUR)"
                value={isFree ? '0' : price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
                editable={!isFree}
              />
            </View>
            <View style={styles.halfField}>
              <EditField label="PRIZE (EUR)" value={prizeAmount} onChangeText={setPrizeAmount} keyboardType="decimal-pad" />
            </View>
          </View>

          <TouchableOpacity
            style={styles.freeToggle}
            onPress={() => setIsFree((v) => !v)}
            activeOpacity={0.7}
          >
            <View style={[styles.freeIndicator, isFree && { borderColor: accentColor, backgroundColor: accentColor }]}>
              {isFree && <Text style={styles.freeCheck}>✓</Text>}
            </View>
            <Text style={styles.freeLabel}>FREE EVENT</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveButton, !isValid && styles.buttonDisabled, { backgroundColor: accentColor }]}
            onPress={() => updateMutation.mutate()}
            disabled={updateMutation.isPending || !isValid}
            activeOpacity={0.7}
            testID="save-event-button"
          >
            {updateMutation.isPending ? (
              <ActivityIndicator color={Colors.bg} size="small" />
            ) : (
              <Text style={styles.saveButtonText}>SAVE CHANGES</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

function EditField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad' | 'numeric';
  editable?: boolean;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, !editable && styles.inputDisabled]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        keyboardType={keyboardType ?? 'default'}
        autoCorrect={false}
        editable={editable}
      />
    </View>
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
  scroll: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
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
  inputDisabled: {
    opacity: 0.4,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 4,
  },
  colorSwatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSwatchSelected: {
    borderWidth: 3,
    borderColor: Colors.white,
  },
  colorCheck: {
    color: Colors.bg,
    fontSize: 16,
    fontWeight: '700' as const,
  },
  colorHint: {
    fontSize: 12,
    color: Colors.textMuted,
    paddingTop: 2,
  },
  freeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  freeIndicator: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.inputBorder,
    backgroundColor: Colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  freeCheck: {
    color: Colors.bg,
    fontSize: 14,
    fontWeight: '700' as const,
    lineHeight: 16,
  },
  freeLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    fontWeight: '600' as const,
  },
  saveButton: {
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
