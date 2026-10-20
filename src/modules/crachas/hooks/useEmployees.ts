import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Employee {
  id: string;
  full_name: string;
  employee_id: string;
  role: string | null;
  company: string | null;
  photo_url: string | null;
  valid_until: string | null;
  rg: string | null;
  cpf: string | null;
  cnv: string | null;
  blood_type: string | null;
  request_reason: string | null;
  access_level: string | null;
  qr_value: string | null;
  phone: string | null;
  address: string | null;
  connection_id: string | null;
  /** Ligado à lista da Senior (nulo = cadastro manual ou solicitação). */
  senior_id: string | null;
  desligado_em: string | null;
  request_status: 'recebida' | 'em_analise' | 'aprovada' | 'rejeitada' | null;
  /** Foto enviada na solicitação; vira photo_url quando o RH aprova. */
  request_photo_url: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const useEmployees = (connectionId?: string) => {
  return useQuery({
    queryKey: ['cracha_employees', connectionId],
    queryFn: async () => {
      // A lista espelha a Senior (milhares): lê de 1000 em 1000, sem os desligados.
      const todos: Employee[] = [];
      for (let de = 0; ; de += 1000) {
        let query = supabase
          .from('cracha_employees')
          .select('*')
          .is('desligado_em', null)
          .order('created_at', { ascending: false })
          .order('id')
          .range(de, de + 999);
        if (connectionId) {
          query = query.eq('connection_id', connectionId);
        }
        const { data, error } = await query;
        if (error) throw error;
        todos.push(...(data as Employee[]));
        if (!data || data.length < 1000) return todos;
      }
    },
  });
};

// Stats moved to useEmployeeStats.ts — re-export for backward compatibility
export { useEmployeeStats } from './useEmployeeStats';

export const useRecentEmployees = (limit = 5) => {
  return useQuery({
    queryKey: ['recent-employees', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cracha_employees')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as Employee[];
    },
  });
};
