import { useEffect, useState, useCallback, useMemo } from 'react';
import { Session, User } from '@supabase/supabase-js';
import createContextHook from '@nkzw/create-context-hook';
import { supabase } from '@/lib/supabase';

const log = (...args: unknown[]): void => {
  if (__DEV__) console.log(...args);
};

const logError = (...args: unknown[]): void => {
  if (__DEV__) console.error(...args);
};

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  /**
   * Admin gate: the signed-in user must have a row in the `admins` table
   * where user_id equals their auth user id (RLS lets admins read their
   * own row). No row → not authorized.
   */
  const checkAdminAccess = useCallback(async (authUser: User) => {
    try {
      log('[Auth] Checking admins table for user');
      const { data, error } = await supabase
        .from('admins')
        .select('user_id')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (error) {
        logError('[Auth] Admins check error:', JSON.stringify({
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        }));
        setIsAdmin(false);
        return;
      }

      const admin = data != null;
      log('[Auth] Admin row found:', admin);
      setIsAdmin(admin);
    } catch (err) {
      const e = err as Error;
      logError('[Auth] Admins check exception:', e?.message ?? String(err));
      setIsAdmin(false);
    }
  }, []);

  useEffect(() => {
    log('[Auth] Initializing auth listener');

    // Supabase persists the session in AsyncStorage (persistSession in
    // lib/supabase.ts), so a stored session is restored here on app start
    // and the user stays logged in across launches.
    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      log('[Auth] Initial session loaded');
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        void checkAdminAccess(s.user).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        log('[Auth] Auth state changed:', _event);
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) {
          void checkAdminAccess(s.user);
        } else {
          setIsAdmin(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [checkAdminAccess]);

  const signIn = useCallback(async (email: string, password: string) => {
    log('[Auth] Signing in');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) {
      // Gate immediately: a signed-in non-admin never reaches the dashboard.
      await checkAdminAccess(data.user);
    }
  }, [checkAdminAccess]);

  const signOut = useCallback(async () => {
    log('[Auth] Signing out');
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setIsAdmin(false);
  }, []);

  return useMemo(() => ({
    session,
    user,
    isLoading,
    isAdmin,
    signIn,
    signOut,
  }), [session, user, isLoading, isAdmin, signIn, signOut]);
});
