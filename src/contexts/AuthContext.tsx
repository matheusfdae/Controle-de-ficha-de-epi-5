import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth as useClerkAuth, useUser, useClerk } from '@clerk/clerk-react';
import { supabase } from '@/integrations/supabase/client';

export type UserRole = 'admin' | 'rh' | 'supervisor' | 'almoxarife' | 'colaborador' | 'operador';

export interface User {
  id: string;
  username: string;
  nome: string;
  email: string;
  role: UserRole;
  mustChangePassword?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: boolean; // admin OR rh (mantém gating atual)
  refreshUser: () => Promise<void>;
}

// Roles com acesso de administrador
const ADMIN_ROLES: UserRole[] = ['admin', 'rh'];

// Ordem de precedência: o primeiro role encontrado na lista do usuário vence
const ROLE_HIERARCHY: UserRole[] = ['admin', 'rh', 'supervisor', 'almoxarife', 'colaborador'];

function resolveRole(roles: string[]): UserRole {
  for (const role of ROLE_HIERARCHY) {
    if (roles.includes(role)) return role;
  }
  return 'colaborador';
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

async function fetchUserData(clerkUserId: string, fallbackEmail: string): Promise<User | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, nome_completo, email, must_change_password')
    .eq('clerk_user_id', clerkUserId)
    .maybeSingle();
  if (!profile) return null;

  const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', profile.id);
  const rolesList = (roles ?? []).map(r => r.role);

  return {
    id: profile.id,
    username: profile.email ?? fallbackEmail,
    email: profile.email ?? fallbackEmail,
    nome: profile.nome_completo ?? fallbackEmail,
    role: resolveRole(rolesList),
    mustChangePassword: (profile as any).must_change_password === true,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const { signOut } = useClerk();
  const [user, setUser] = useState<User | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!clerkUser) {
      setUser(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    const data = await fetchUserData(clerkUser.id, clerkUser.primaryEmailAddress?.emailAddress ?? '');
    setUser(data);
    setProfileLoading(false);
  }, [clerkUser]);

  useEffect(() => {
    if (!isLoaded) return;
    refreshUser();
  }, [isLoaded, isSignedIn, clerkUser?.id, refreshUser]);

  const logout = async () => {
    await signOut();
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading: !isLoaded || profileLoading,
      logout,
      isAuthenticated: !!isSignedIn,
      isAdmin: user ? ADMIN_ROLES.includes(user.role) : false,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
