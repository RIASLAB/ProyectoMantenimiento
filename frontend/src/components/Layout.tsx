import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet } from 'react-router-dom';
import { api } from '../api/client';
import type { Rol } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ROL_LABEL } from '../format';
import { Icon } from './ui';

/** `tab: false` = no aparece en la barra inferior del celular (se llega desde Ajustes). */
const NAV: Array<{ to: string; label: string; icon: string; roles?: Rol[]; tab?: boolean }> = [
  { to: '/ordenes', label: 'Órdenes', icon: 'wrench' },
  { to: '/compras', label: 'Compras', icon: 'cart', roles: ['ADMIN', 'AUTORIZADOR', 'TECNICO'] },
  { to: '/maquinas', label: 'Máquinas', icon: 'machine' },
  { to: '/inventario', label: 'Inventario', icon: 'box' },
  { to: '/usuarios', label: 'Usuarios', icon: 'users', roles: ['ADMIN'], tab: false },
  { to: '/configuracion', label: 'Ajustes', icon: 'settings', roles: ['ADMIN'] },
];

export function Layout() {
  const { user, logout, can } = useAuth();
  const items = NAV.filter((n) => !n.roles || can(...n.roles));
  // Contador de solicitudes por aprobar junto a "Compras"
  const compras = useQuery({
    queryKey: ['compras', 'resumen'],
    queryFn: () => api.get<{ pendientes: number }>('/compras/resumen'),
    enabled: can('ADMIN', 'AUTORIZADOR'),
    refetchInterval: 60_000,
  });
  const pendientes = compras.data?.pendientes ?? 0;
  const badge = (to: string) => (to === '/compras' && pendientes > 0 ? <span className="nav-badge" aria-label={`${pendientes} por aprobar`}>{pendientes}</span> : null);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/icon.svg" alt="" width={32} height={32} />
          <div>
            <strong>Mantenimiento</strong>
            <span>Nutrialimentos Cárnicos</span>
          </div>
        </div>
        <nav aria-label="Principal">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} className="nav-link">
              <Icon name={n.icon} />
              {n.label}
              {badge(n.to)}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-user">
          <div>
            <strong>{user?.nombre}</strong>
            <span>{user ? ROL_LABEL[user.rol] : ''}</span>
          </div>
          <button className="icon-btn" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión">
            <Icon name="logout" />
          </button>
        </div>
      </aside>

      <header className="topbar">
        <div className="brand">
          <img src="/icon.svg" alt="" width={28} height={28} />
          <strong>Mantenimiento</strong>
        </div>
        <div className="topbar-user">
          <span>{user?.nombre.split(' ')[0]} · {user ? ROL_LABEL[user.rol] : ''}</span>
          <button className="icon-btn" onClick={logout} aria-label="Cerrar sesión">
            <Icon name="logout" />
          </button>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Principal">
        {items.filter((n) => n.tab !== false).map((n) => (
          <NavLink key={n.to} to={n.to} className="tab-link">
            <span className="tab-icon"><Icon name={n.icon} size={22} />{badge(n.to)}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
