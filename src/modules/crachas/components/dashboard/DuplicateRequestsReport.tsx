import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, Users, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DuplicateEntry {
  full_name: string;
  employee_id: string;
  count: number;
}

export function DuplicateRequestsReport() {
  const { data: duplicates, isLoading } = useQuery({
    queryKey: ['duplicate-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cracha_batch_items')
        .select('employee_id, employees(full_name, employee_id)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const counts = new Map<string, { full_name: string; employee_id: string; count: number }>();

      for (const item of data || []) {
        const emp = item.employees as any;
        if (!emp) continue;
        const key = item.employee_id;
        const existing = counts.get(key);
        if (existing) {
          existing.count++;
        } else {
          counts.set(key, { full_name: emp.full_name, employee_id: emp.employee_id, count: 1 });
        }
      }

      return Array.from(counts.values())
        .filter(e => e.count > 1)
        .sort((a, b) => b.count - a.count);
    },
  });

  const { data: nameDuplicates } = useQuery({
    queryKey: ['name-duplicates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('cracha_employees').select('full_name, employee_id');
      if (error) throw error;

      const counts = new Map<string, { full_name: string; employee_id: string; count: number }>();
      for (const emp of data || []) {
        const key = emp.full_name.toLowerCase().trim();
        const existing = counts.get(key);
        if (existing) {
          existing.count++;
        } else {
          counts.set(key, { full_name: emp.full_name, employee_id: emp.employee_id, count: 1 });
        }
      }

      return Array.from(counts.values())
        .filter(e => e.count > 1)
        .sort((a, b) => b.count - a.count);
    },
  });

  const allDuplicates = (duplicates && duplicates.length > 0) ? duplicates : nameDuplicates;
  const hasDuplicates = allDuplicates && allDuplicates.length > 0;

  return (
    <div className="section-card p-6 animate-slide-up">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="h-8 w-8 rounded-xl bg-warning/10 flex items-center justify-center">
          <AlertTriangle className="h-4 w-4 text-warning" />
        </div>
        <div>
          <h3 className="text-base font-bold text-foreground">Solicitações Duplicadas</h3>
          <p className="text-xs text-muted-foreground/60">Colaboradores com mais de um registro</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-muted/40 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !hasDuplicates ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
          <div className="h-12 w-12 rounded-2xl bg-success/5 flex items-center justify-center mb-3">
            <Shield className="h-6 w-6 text-success opacity-60" />
          </div>
          <p className="text-sm font-medium">Tudo em ordem</p>
          <p className="text-xs mt-1 opacity-60">Nenhuma duplicata encontrada</p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {allDuplicates.map((entry, idx) => (
            <div
              key={idx}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/25 hover:bg-muted/50 transition-all duration-200 animate-slide-right',
                `stagger-${Math.min(idx + 1, 4)}`
              )}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{entry.full_name}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{entry.employee_id}</p>
              </div>
              <span className="inline-flex items-center justify-center min-w-[32px] h-7 rounded-lg bg-destructive/10 text-destructive text-xs font-bold">
                {entry.count}×
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
