import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Crosshair } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import Colors from '@/constants/colors';

export default function LoginScreen() {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const { signIn } = useAuth();
  const router = useRouter();

  const loginMutation = useMutation({
    mutationFn: async () => {
      await signIn(email.trim(), password);
    },
    onSuccess: () => {
      if (__DEV__) console.log('[Login] Success, navigating to index');
      router.replace('/');
    },
    onError: (error: Error) => {
      if (__DEV__) console.error('[Login] Error:', error.message);
      Alert.alert('Sign In Failed', error.message);
    },
  });

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.inner}>
          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <Crosshair size={40} color={Colors.cyan} strokeWidth={1.5} />
            </View>
            <Text style={styles.title}>BOUNTY HUNT</Text>
            <Text style={styles.subtitle}>Admin Control Panel</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>EMAIL</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="admin@example.com"
                placeholderTextColor={Colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                testID="email-input"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>PASSWORD</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter password"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry
                testID="password-input"
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loginMutation.isPending && styles.buttonDisabled]}
              onPress={() => loginMutation.mutate()}
              disabled={loginMutation.isPending || !email || !password}
              activeOpacity={0.7}
              testID="sign-in-button"
            >
              {loginMutation.isPending ? (
                <ActivityIndicator color={Colors.bg} size="small" />
              ) : (
                <Text style={styles.buttonText}>SIGN IN</Text>
              )}
            </TouchableOpacity>
          </View>
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
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    borderColor: Colors.cyan,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: Colors.cyanDim,
  },
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: Colors.white,
    letterSpacing: 4,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    letterSpacing: 2,
    marginTop: 6,
    textTransform: 'uppercase' as const,
  },
  form: {
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
  button: {
    backgroundColor: Colors.cyan,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: Colors.bg,
    fontSize: 15,
    fontWeight: '700' as const,
    letterSpacing: 2,
  },
});
