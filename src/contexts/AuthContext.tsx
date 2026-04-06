import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  username: string;
  nome: string;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const DEMO_USERS = [
  { username: 'admin', password: 'admin123', nome: 'Administrador' },
  { username: 'tecnico', password: 'tecnico123', nome: 'Técnico de Segurança' },
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('epi_auth_user');
    if (saved) setUser(JSON.parse(saved));
  }, []);

  const login = (username: string, password: string): boolean => {
    const found = DEMO_USERS.find(u => u.username === username && u.password === password);
    if (found) {
      const u = { username: found.username, nome: found.nome };
      setUser(u);
      localStorage.setItem('epi_auth_user', JSON.stringify(u));
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('epi_auth_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
