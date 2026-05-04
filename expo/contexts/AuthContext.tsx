import { useEffect, useState, useCallback, useMemo } from 'react';
import { Session, User } from '@supabase/supabase-js';
import createContextHook from '@nkzw/create-context-hook';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types';

/**
 * Hardcoded fallback list of admin emails. Used if the profile row cannot be
 * fetched (for example, due to RLS policies blocking SELECT on `profiles`).
 * These users will be granted admin access regardless of the database state.
 */
const ADMIN_EMAIL_ALLOWLIST: readonly string[] = [
  'merlijnhoffman@gmail.com',
] as const;

const isAllowlistedAdmin = (email: string | null | undefined): boolean => {
  if (!email) return false;
  return ADMIN_EMAIL_ALLOWLIST.includes(email.trim().toLowerCase());
};

const log = (...args: unknown[]): void => {
  if (__DEV__) console.log(...args);
};

const logError = (...args: unknown[]): void => {
  if (__DEV__) console.error(...args);
};

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [profileLoading, setProfileLoading] = useState<boolean>(false);

  const fetchProfile = useCallback(async (authUser: User) => {
    setProfileLoading(true);
    try {
      log('[Auth] Fetching profile for user');
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      const allowlisted = isAllowlistedAdmin(authUser.email);

      if (error) {
        logError('[Auth] Profile fetch error:', JSON.stringify({
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        }));
        setProfile(null);
        // Fall back to the allowlist so RLS issues don't lock out admins.
        setIsAdmin(allowlisted);
        return;
      }

      log('[Auth] Profile fetched, isAdmin:', data?.is_admin);
      setProfile(data as Profile);
      setIsAdmin(data?.is_admin === true || allowlisted);
    } catch (err) {
      const e = err as Error;
      logError('[Auth] Profile fetch exception:', e?.message ?? String(err));
      setProfile(null);
      setIsAdmin(isAllowlistedAdmin(authUser.email));
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    log('[Auth] Initializing auth listener');

    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      log('[Auth] Initial session loaded');
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        void fetchProfile(s.user).finally(() => setIsLoading(false));
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
          void fetchProfile(s.user);
        } else {
          setProfile(null);
          setIsAdmin(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    log('[Auth] Signing in');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    log('[Auth] Signing out');
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setIsAdmin(false);
  }, []);

  return useMemo(() => ({
    session,
    user,
    profile,
    isLoading: isLoading || profileLoading,
    isAdmin,
    signIn,
    signOut,
  }), [session, user, profile, isLoading, profileLoading, isAdmin, signIn, signOut]);
});
