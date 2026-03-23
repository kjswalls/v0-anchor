'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { usePlannerStore } from '@/lib/planner-store';

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const initializeStore = usePlannerStore((s) => s.initializeStore);
  const clearStore = usePlannerStore((s) => s.clearStore);

  useEffect(() => {
    const supabase = createClient();

    // Check current session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        initializeStore(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        initializeStore(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        clearStore();
      }
    });

    return () => subscription.unsubscribe();
  }, [initializeStore, clearStore]);

  return <>{children}</>;
}
