import { NavLink, Outlet } from 'react-router-dom';
import type { Rol } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ROL_LABEL } from '../format';
import { Icon } from './ui';

const NAV: Array<{ to: string; label: string; icon: string; roles?: Rol[] }> = [
  { to: '/maquinas', label: 'Máquinas', icon: 'machine' },
  { to: '/inventario', label: 'Inventario', icon: 'box' },
  { to: '/usuarios', label: 'Usuarios', icon: 'users', roles: ['ADMIN'] },
  { to: '/configuracion', label: 'Configuración', icon: 'settings', roles: ['ADMIN'] },
];

export function Layout() {
  const { user, logout, can } = useAuth();
  const items = NAV.filter((n) => !n.roles || can(...n.roles));

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
        {items.map((n) => (
          <NavLink key={n.to} to={n.to} className="tab-link">
            <Icon name={n.icon} size={22} />
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
