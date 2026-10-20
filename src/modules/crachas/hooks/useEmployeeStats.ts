import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EmployeeStats {
  total: number;
  withPhoto: number;
  noPhoto: number;
  noRole: number;
  noValidity: number;
  pending: number;
  expiringSoon: number;
  expired: number;
  badgesGenerated: number;
}

async function fetchAllowedConnectionIds(): Promise<string[] | null> {
  const { data, error } = await supabase
    .from('cracha_user_connections')
    .select('connection_id');
  if (error || !data || data.length === 0) return null;
  return data.map(r => r.connection_id);
}

// Fetch ALL rows in pages of 1000 to bypass Supabase default limit
async function fetchAllEmployees(connectionIds: string[] | null) {
  const PAGE = 1000;
  let from = 0;
  const all: Array<{ photo_url: string | null; role: string | null; valid_until: string | null; cnv: string | null }> = [];
  while (true) {
    let q = supabase
      .from('cracha_employees')
      .select('photo_url, role, valid_until, cnv')
      .is('desligado_em', null)
      .order('id')
      .range(from, from + PAGE - 1);
    if (connectionIds && connectionIds.length > 0) {
      q = q.in('connection_id', connectionIds);
    }
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export const useEmployeeStats = (connectionId?: string | null) => {
  return useQuery({
    queryKey: ['employee-stats', connectionId || 'all'],
    queryFn: async (): Promise<EmployeeStats> => {
      let allowed: string[] | null = null;
      if (connectionId) {
        allowed = [connectionId];
      } else {
        allowed = await fetchAllowedConnectionIds();
      }

      const employees = await fetchAllEmployees(allowed);

      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const ROLES_REQUIRING_CNV = ['vigilante', 'vigilante patrimonial', 'vigilante líder'];

      const total = employees.length;
      const withPhoto = employees.filter(e => e.photo_url).length;
      const noPhoto = employees.filter(e => !e.photo_url).length;
      const noRole = employees.filter(e => !e.role).length;
      const noValidity = employees.filter(e => !e.valid_until).length;
      const pending = employees.filter(e => !e.photo_url || !e.role || (e.role && ROLES_REQUIRING_CNV.includes(e.role.toLowerCase().trim()) && !e.cnv)).length;
      const expired = employees.filter(e => {
        if (!e.valid_until) return false;
        return new Date(e.valid_until) <= now;
      }).length;
      const expiringSoon = employees.filter(e => {
        if (!e.valid_until) return false;
        const d = new Date(e.valid_until);
        return d > now && d <= thirtyDaysFromNow;
      }).length;

      // Count actual badges generated from completed batches (filter by connection if provided)
      let batchQ = supabase
        .from('cracha_generation_batches')
        .select('processed_badges')
        .eq('status', 'completed');
      if (connectionId) batchQ = batchQ.eq('connection_id', connectionId);
      const { data: batches } = await batchQ;
      const count = (batches || []).reduce((sum, b) => sum + (b.processed_badges || 0), 0);

      return {
        total,
        withPhoto,
        noPhoto,
        noRole,
        noValidity,
        pending,
        expiringSoon,
        expired,
        badgesGenerated: count || 0,
      };
    },
  });
};

export const useSyncLogs = () => {
  return useQuery({
    queryKey: ['sync-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cracha_sync_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
  });
};
