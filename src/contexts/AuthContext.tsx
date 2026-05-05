import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type UserRole = 'admin' | 'operador';

export interface User {
  username: string;
  nome: string;
  role: UserRole;
}

interface StoredUser extends User {
  password: string;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  // user management
  listUsers: () => StoredUser[];
  addUser: (u: StoredUser) => { ok: boolean; error?: string };
  updateUser: (username: string, patch: Partial<StoredUser>) => void;
  deleteUser: (username: string) => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);
const USERS_KEY = 'epi_auth_users';
const SESSION_KEY = 'epi_auth_user';

const DEFAULT_USERS: StoredUser[] = [
  { username: 'admin', password: 'admin123', nome: 'Administrador', role: 'admin' },
  { username: 'operador', password: 'operador123', nome: 'Operador', role: 'operador' },
];

function loadUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) {
      localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
      return DEFAULT_USERS;
    }
    return JSON.parse(raw);
  } catch {
    return DEFAULT_USERS;
  }
}

function saveUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    loadUsers(); // ensure seeded
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved) setUser(JSON.parse(saved));
  }, []);

  const login = (username: string, password: string): boolean => {
    const users = loadUsers();
    const found = users.find(u => u.username === username && u.password === password);
    if (found) {
      const u: User = { username: found.username, nome: found.nome, role: found.role };
      setUser(u);
      localStorage.setItem(SESSION_KEY, JSON.stringify(u));
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
  };

  const listUsers = () => loadUsers();

  const addUser = (u: StoredUser) => {
    const users = loadUsers();
    if (users.some(x => x.username === u.username)) {
      return { ok: false, error: 'Usuário já existe' };
    }
    saveUsers([...users, u]);
    return { ok: true };
  };

  const updateUser = (username: string, patch: Partial<StoredUser>) => {
    const users = loadUsers().map(u => u.username === username ? { ...u, ...patch } : u);
    saveUsers(users);
    if (user?.username === username && (patch.nome || patch.role)) {
      const updated = { ...user, ...(patch.nome ? { nome: patch.nome } : {}), ...(patch.role ? { role: patch.role } : {}) };
      setUser(updated);
      localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
    }
  };

  const deleteUser = (username: string) => {
    saveUsers(loadUsers().filter(u => u.username !== username));
  };

  return (
    <AuthContext.Provider value={{
      user, login, logout,
      isAuthenticated: !!user,
      isAdmin: user?.role === 'admin',
      listUsers, addUser, updateUser, deleteUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
