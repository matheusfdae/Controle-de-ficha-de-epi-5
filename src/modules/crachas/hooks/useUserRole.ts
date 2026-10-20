import { useAuth } from '@/contexts/AuthContext';

/** Adaptador: "admin" do módulo de crachás = quem pode editar o módulo Crachás no EPI. */
export function useUserRole() {
  const { isAdmin, can, loading } = useAuth();
  const admin = isAdmin || can('crachas', 'edit');
  return { isAdmin: admin, role: admin ? 'admin' : 'operator', isLoading: loading };
}
