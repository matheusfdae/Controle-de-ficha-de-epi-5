import { useAuth as useAuthEpi } from '@/contexts/AuthContext';
import { esquecerUsuarioAtual } from '@/modules/crachas/lib/usuario';

/** Adaptador: o módulo de crachás usa o login do EPI. */
export function useAuth() {
  const { user, loading, logout } = useAuthEpi();
  return {
    user: user ? { id: user.id, email: user.email } : null,
    isLoading: loading,
    signOut: async () => { esquecerUsuarioAtual(); await logout(); },
  };
}
