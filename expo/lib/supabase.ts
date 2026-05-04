import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

if (Platform.OS !== 'web') {
  require('react-native-url-polyfill/auto');
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (__DEV__) {
  console.log('[Supabase] Initializing with URL:', supabaseUrl ? supabaseUrl.substring(0, 40) + '...' : 'MISSING');
  console.log('[Supabase] Anon key present:', supabaseAnonKey ? 'yes' : 'no');
  console.log('[Supabase] Platform:', Platform.OS);
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Supabase] Missing env vars. URL:', !!supabaseUrl, 'Key:', !!supabaseAnonKey);
}

const customFetch: typeof fetch = async (input, init) => {
  try {
    const res = await fetch(input, init);
    if (__DEV__) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      console.log('[Supabase fetch]', init?.method ?? 'GET', res.status, url);
    }
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (__DEV__) console.error('[Supabase fetch] FAILED:', msg);
    throw new Error(`Network request failed: ${msg}. Check your connection and Supabase URL.`);
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: customFetch,
  },
});
