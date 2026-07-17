import React, { useState } from 'react';
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
import { useRouter, Stack } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';
import { EVENT_COLORS, DEFAULT_ACCENT_COLOR } from '@/types';

export default function CreateEventScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [city, setCity] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [accentColor, setAccentColor] = useState<string>(DEFAULT_ACCENT_COLOR);
  const [price, setPrice] = useState<string>('');
  const [prizeAmount, setPrizeAmount] = useState<string>('');
  const [isFree, setIsFree] = useState<boolean>(false);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (__DEV__) console.log('[CreateEvent] Creating event:', city);
      const insertData: Record<string, unknown> = {
        title: city.trim(),
        city: city.trim(),
        date: date.trim(),
        start_time: startTime.trim(),
        accent_color: accentColor,
        price: isFree ? 0 : parseFloat(price) || 0,
        prize_amount: parseFloat(prizeAmount) || 0,
        is_active: true,
        status: 'scheduled',
      };

      const { error } = await supabase.from('events').insert(insertData);
      if (error) throw error;
    },
    onSuccess: () => {
      if (__DEV__) console.log('[CreateEvent] Event created successfully');
      void queryClient.invalidateQueries({ queryKey: ['events'] });
      router.back();
    },
    onError: (error: Error) => {
      if (__DEV__) console.error('[CreateEvent] Error:', error.message);
      Alert.alert('Error', error.message);
    },
  });

  const isValid = city && date && startTime && (isFree || price) && prizeAmount;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'CREATE EVENT',
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
          <InputField
            label="LOCATION"
            value={city}
            onChangeText={setCity}
            placeholder="Amsterdam"
          />
          <View style={styles.row}>
            <View style={styles.halfField}>
              <InputField label="DATE" value={date} onChangeText={setDate} placeholder="2026-04-15" />
            </View>
            <View style={styles.halfField}>
              <InputField label="START TIME" value={startTime} onChangeText={setStartTime} placeholder="14:00" />
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
              {EVENT_COLORS.find((c) => c.hex === accentColor)?.label ?? 'Custom'} — sets the accent color for this event
            </Text>
          </View>

          <View style={styles.row}>
            <View style={styles.halfField}>
              <InputField
                label="TICKET PRICE (EUR)"
                value={isFree ? '0' : price}
                onChangeText={setPrice}
                placeholder="25"
                keyboardType="decimal-pad"
                editable={!isFree}
              />
            </View>
            <View style={styles.halfField}>
              <InputField
                label="PRIZE (EUR)"
                value={prizeAmount}
                onChangeText={setPrizeAmount}
                placeholder="500"
                keyboardType="decimal-pad"
              />
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
            style={[styles.createButton, !isValid && styles.buttonDisabled, { backgroundColor: accentColor }]}
            onPress={() => createMutation.mutate()}
            disabled={createMutation.isPending || !isValid}
            activeOpacity={0.7}
            testID="create-event-button"
          >
            {createMutation.isPending ? (
              <ActivityIndicator color={Colors.bg} size="small" />
            ) : (
              <Text style={styles.createButtonText}>CREATE EVENT</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

function InputField({
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
  placeholder: string;
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
  createButton: {
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  createButtonText: {
    color: Colors.bg,
    fontSize: 15,
    fontWeight: '700' as const,
    letterSpacing: 2,
  },
});
