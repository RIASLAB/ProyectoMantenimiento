import { useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, SESSION_EXPIRED, tokenStore } from '../api/client';
import type { Rol, SessionUser } from '../api/types';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  expired: boolean;
  login: (usuario: string, credencial: string) => Promise<void>;
  logout: () => void;
  can: (...roles: Rol[]) => boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(!!tokenStore.get());
  const [expired, setExpired] = useState(false);

  const logout = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
    qc.clear();
  }, [qc]);

  // Restaura la sesión al recargar la página
  useEffect(() => {
    if (!tokenStore.get()) return;
    api
      .get<SessionUser>('/auth/yo')
      .then(setUser)
      .catch(() => tokenStore.set(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onExpired = () => {
      setExpired(true);
      logout();
    };
    window.addEventListener(SESSION_EXPIRED, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED, onExpired);
  }, [logout]);

  const login = async (usuario: string, credencial: string) => {
    const r = await api.post<{ token: string; usuario: SessionUser }>('/auth/login', { usuario, credencial });
    tokenStore.set(r.token);
    setExpired(false);
    setUser(r.usuario);
  };

  const can = (...roles: Rol[]) => !!user && roles.includes(user.rol);

  return <Ctx.Provider value={{ user, loading, expired, login, logout, can }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fuera de AuthProvider');
  return c;
}
