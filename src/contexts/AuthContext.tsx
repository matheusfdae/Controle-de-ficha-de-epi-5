import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Session, User as SupaUser } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type UserRole = 'admin' | 'rh' | 'supervisor' | 'colaborador' | 'operador';

export interface User {
  id: string;
  username: string;
  nome: string;
  email: string;
  role: UserRole;
  mustChangePassword?: boolean;
}

interface StoredUser {
  username: string;
  password: string;
  nome: string;
  role: UserRole;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signup: (email: string, password: string, nome: string) => Promise<{ ok: boolean; error?: string }>;
  resetPassword: (email: string) => Promise<{ ok: boolean; error?: string }>;
  updatePassword: (newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: boolean; // admin OR rh (mantém gating atual)
  // Legacy stubs — telas antigas ainda chamam estas funções
  listUsers: () => StoredUser[];
  addUser: (u: StoredUser) => { ok: boolean; error?: string };
  updateUser: (username: string, patch: Partial<StoredUser>) => void;
  deleteUser: (username: string) => void;
}

// Roles com acesso de administrador
const ADMIN_ROLES: UserRole[] = ['admin', 'rh'];

// Ordem de precedência: o primeiro role encontrado na lista do usuário vence
const ROLE_HIERARCHY: UserRole[] = ['admin', 'rh', 'supervisor', 'colaborador'];

function resolveRole(roles: string[]): UserRole {
  for (const role of ROLE_HIERARCHY) {
    if (roles.includes(role)) return role;
  }
  return 'colaborador';
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

async function fetchUserData(supaUser: SupaUser): Promise<User> {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from('profiles').select('nome_completo, email, must_change_password').eq('id', supaUser.id).maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', supaUser.id),
  ]);
  const rolesList = (roles ?? []).map(r => r.role);
  return {
    id: supaUser.id,
    username: supaUser.email ?? '',
    email: supaUser.email ?? '',
    nome: profile?.nome_completo ?? supaUser.email ?? '',
    role: resolveRole(rolesList),
    mustChangePassword: (profile as any)?.must_change_password === true,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Registra o listener ANTES de getSession() para não perder eventos (regra Supabase)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (sess?.user) {
        // Defer para evitar deadlock dentro da máquina de estados do Supabase
        setTimeout(() => {
          fetchUserData(sess.user).then(setUser).catch(() => setUser(null));
        }, 0);
      } else {
        setUser(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      if (sess?.user) {
        fetchUserData(sess.user).then(setUser).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  const signup = async (email: string, password: string, nome: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { nome_completo: nome },
      },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  // Legacy stubs (mantêm telas antigas funcionando sem quebrar)
  const listUsers = (): StoredUser[] => [];
  const addUser = (_u: StoredUser) => ({ ok: false, error: 'Use a tela de Cadastro' });
  const updateUser = (_username: string, _patch: Partial<StoredUser>) => {};
  const deleteUser = (_username: string) => {};

  return (
    <AuthContext.Provider value={{
      user, session, loading,
      login, signup, resetPassword, updatePassword, logout,
      isAuthenticated: !!session,
      isAdmin: user ? ADMIN_ROLES.includes(user.role) : false,
      listUsers, addUser, updateUser, deleteUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
