import { useEffect, useState, useCallback, useMemo } from 'react';
import { Session, User } from '@supabase/supabase-js';
import createContextHook from '@nkzw/create-context-hook';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types';

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [profileLoading, setProfileLoading] = useState<boolean>(false);

  const fetchProfile = useCallback(async (userId: string) => {
    setProfileLoading(true);
    try {
      console.log('[Auth] Fetching profile for user:', userId);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('[Auth] Profile fetch error:', JSON.stringify({
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        }));
        setProfile(null);
        setIsAdmin(false);
        return;
      }

      console.log('[Auth] Profile fetched:', data?.email, 'isAdmin:', data?.is_admin);
      setProfile(data as Profile);
      setIsAdmin(data?.is_admin === true);
    } catch (err) {
      const e = err as Error;
      console.error('[Auth] Profile fetch exception:', e?.message ?? String(err));
      setProfile(null);
      setIsAdmin(false);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    console.log('[Auth] Initializing auth listener');

    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      console.log('[Auth] Initial session:', s?.user?.email ?? 'none');
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        void fetchProfile(s.user.id).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        console.log('[Auth] Auth state changed:', _event, s?.user?.email);
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) {
          void fetchProfile(s.user.id);
        } else {
          setProfile(null);
          setIsAdmin(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    console.log('[Auth] Signing in:', email);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    console.log('[Auth] Signing out');
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
