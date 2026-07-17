import { useUser } from '@clerk/clerk-react';

/**
 * Gate independente do sistema de papéis do Postgres (AuthContext/isAdmin) —
 * autoriza só pelo publicMetadata.role do próprio usuário no Clerk. Espelha
 * o guard verifyEditor() do backend (supabase/functions/_shared/clerk.ts) e
 * é usado exclusivamente para exibir/ocultar a tela de convites.
 *
 * publicMetadata.role="edit" é atribuído manualmente no dashboard do Clerk
 * (Users → usuário → Metadata) — não há UI neste app para setar isso.
 */
export function useCanManageInvites(): boolean {
  const { user, isLoaded } = useUser();
  if (!isLoaded) return false;
  return (user?.publicMetadata as Record<string, unknown> | undefined)?.role === 'edit';
}
