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

export default function CreateEventScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [city, setCity] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [prizeAmount, setPrizeAmount] = useState<string>('');
  const [zoneLat, setZoneLat] = useState<string>('');
  const [zoneLng, setZoneLng] = useState<string>('');
  const [zoneRadius, setZoneRadius] = useState<string>('');

  const createMutation = useMutation({
    mutationFn: async () => {
      console.log('[CreateEvent] Creating event:', city);
      const insertData: Record<string, unknown> = {
        city: city.trim(),
        date,
        start_time: startTime,
        price: parseFloat(price),
        prize_amount: parseFloat(prizeAmount),
        is_active: true,
        status: 'scheduled',
      };
      if (zoneLat) insertData.zone_latitude = parseFloat(zoneLat);
      if (zoneLng) insertData.zone_longitude = parseFloat(zoneLng);
      if (zoneRadius) insertData.zone_radius = parseFloat(zoneRadius);

      const { error } = await supabase.from('events').insert(insertData);
      if (error) throw error;
    },
    onSuccess: () => {
      console.log('[CreateEvent] Event created successfully');
      void queryClient.invalidateQueries({ queryKey: ['events'] });
      router.back();
    },
    onError: (error: Error) => {
      console.error('[CreateEvent] Error:', error.message);
      Alert.alert('Error', error.message);
    },
  });

  const isValid = city && date && startTime && price && prizeAmount;

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
          <InputField label="CITY" value={city} onChangeText={setCity} placeholder="Amsterdam" />
          <InputField label="DATE" value={date} onChangeText={setDate} placeholder="2026-04-15" />
          <InputField label="START TIME" value={startTime} onChangeText={setStartTime} placeholder="14:00" />

          <View style={styles.row}>
            <View style={styles.halfField}>
              <InputField label="PRICE (EUR)" value={price} onChangeText={setPrice} placeholder="25" keyboardType="decimal-pad" />
            </View>
            <View style={styles.halfField}>
              <InputField label="PRIZE (EUR)" value={prizeAmount} onChangeText={setPrizeAmount} placeholder="500" keyboardType="decimal-pad" />
            </View>
          </View>

          <Text style={styles.sectionLabel}>ZONE COORDINATES</Text>
          <View style={styles.row}>
            <View style={styles.halfField}>
              <InputField label="LATITUDE" value={zoneLat} onChangeText={setZoneLat} placeholder="52.3676" keyboardType="decimal-pad" />
            </View>
            <View style={styles.halfField}>
              <InputField label="LONGITUDE" value={zoneLng} onChangeText={setZoneLng} placeholder="4.9041" keyboardType="decimal-pad" />
            </View>
          </View>
          <InputField label="RADIUS (METERS)" value={zoneRadius} onChangeText={setZoneRadius} placeholder="500" keyboardType="decimal-pad" />

          <TouchableOpacity
            style={[styles.createButton, !isValid && styles.buttonDisabled]}
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
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'decimal-pad' | 'numeric';
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        keyboardType={keyboardType ?? 'default'}
        autoCorrect={false}
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
  sectionLabel: {
    fontSize: 11,
    color: Colors.cyan,
    letterSpacing: 1.5,
    fontWeight: '600' as const,
    marginTop: 8,
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
  createButton: {
    backgroundColor: Colors.cyan,
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
