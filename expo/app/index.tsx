import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import Colors from '@/constants/colors';

export default function IndexScreen() {
  const { session, isLoading, isAdmin } = useAuth();
  const router = useRouter();
  const [timedOut, setTimedOut] = useState<boolean>(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      console.log('[Index] Auth loading timed out');
      setTimedOut(true);
    }, 8000);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (isLoading && !timedOut) return;

    if (!session) {
      router.replace('/login');
      return;
    }

    if (!isAdmin) {
      router.replace('/access-denied');
      return;
    }

    router.replace('/dashboard');
  }, [isLoading, session, isAdmin, router, timedOut]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.cyan} />
      <Text style={styles.text}>{timedOut ? 'Taking longer than expected...' : 'Loading...'}</Text>
      {timedOut && (
        <TouchableOpacity
          style={styles.skipButton}
          onPress={() => router.replace('/login')}
        >
          <Text style={styles.skipText}>Go to Login</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  text: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  skipButton: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cyan,
  },
  skipText: {
    color: Colors.cyan,
    fontSize: 14,
    fontWeight: '600' as const,
  },
});
