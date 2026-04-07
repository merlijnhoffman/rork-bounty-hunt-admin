import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ShieldOff } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import Colors from '@/constants/colors';

export default function AccessDeniedScreen() {
  const { signOut } = useAuth();
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <View style={styles.iconContainer}>
          <ShieldOff size={56} color={Colors.red} strokeWidth={1.5} />
        </View>
        <Text style={styles.title}>ACCESS DENIED</Text>
        <Text style={styles.message}>
          Your account does not have admin privileges. Contact the system administrator for access.
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => { void signOut().then(() => router.replace('/login')); }}
          activeOpacity={0.7}
          testID="sign-out-button"
        >
          <Text style={styles.buttonText}>SIGN OUT</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.redDim,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: Colors.red,
    letterSpacing: 3,
    marginBottom: 12,
  },
  message: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  button: {
    borderWidth: 1,
    borderColor: Colors.red,
    borderRadius: 10,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  buttonText: {
    color: Colors.red,
    fontSize: 14,
    fontWeight: '600' as const,
    letterSpacing: 1.5,
  },
});
