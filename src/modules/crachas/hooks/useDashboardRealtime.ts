import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const ALL_DASHBOARD_KEYS = [
  'employees',
  'employee-stats',
  'recent-employees',
  'dashboard-charts',
  'duplicate-requests',
  'name-duplicates',
];

export function useDashboardRealtime() {
  const queryClient = useQueryClient();
  const pollIntervalRef = useRef(5000);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isActiveRef = useRef(true);

  useEffect(() => {
    isActiveRef.current = true;

    const invalidateAll = () => {
      ALL_DASHBOARD_KEYS.forEach(key => {
        queryClient.invalidateQueries({ queryKey: [key] });
      });
    };

    // Primary: Realtime subscription
    const channel = supabase
      .channel('dashboard-employees')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'employees' },
        () => {
          invalidateAll();
          pollIntervalRef.current = 5000; // reset on realtime event
        }
      )
      .subscribe();

    // Fallback: polling with exponential backoff
    const poll = () => {
      if (!isActiveRef.current) return;
      invalidateAll();
      pollIntervalRef.current = Math.min(pollIntervalRef.current * 1.3, 60000);
      timeoutRef.current = setTimeout(poll, pollIntervalRef.current);
    };

    // Start polling after initial delay
    timeoutRef.current = setTimeout(poll, pollIntervalRef.current);

    return () => {
      isActiveRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
