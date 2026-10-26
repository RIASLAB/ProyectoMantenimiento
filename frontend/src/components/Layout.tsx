import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import type { Rol } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ROL_LABEL } from '../format';
import { ConnectionStatus, SyncManager } from '../offline/SyncManager';
import { usePendientes } from '../offline/outbox';
import { Button, Icon, Modal } from './ui';

/** `tab: false` = no aparece en la barra inferior del celular (se llega desde Ajustes). */
const NAV: Array<{ to: string; label: string; icon: string; roles?: Rol[]; tab?: boolean }> = [
  { to: '/ordenes', label: 'Órdenes', icon: 'wrench' },
  { to: '/calidad', label: 'Calidad', icon: 'thermo' },
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
  // En celular caben 5 pestañas; si hay más, las últimas van en "Más".
  const tabs = items.filter((n) => n.tab !== false);
  const visibles = tabs.length > 5 ? tabs.slice(0, 4) : tabs;
  const resto = tabs.length > 5 ? tabs.slice(4) : [];
  const [mas, setMas] = useState(false);
  const [salir, setSalir] = useState(false);
  const sinEnviar = usePendientes(user?.id).length;
  // Advierte antes de cerrar sesión si quedan registros guardados en el dispositivo.
  const pedirSalida = () => (sinEnviar ? setSalir(true) : logout());
  const location = useLocation();
  const enResto = resto.some((n) => location.pathname.startsWith(n.to));
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
        <ConnectionStatus />
        <div className="sidebar-user">
          <div>
            <strong>{user?.nombre}</strong>
            <span>{user ? ROL_LABEL[user.rol] : ''}</span>
          </div>
          <button className="icon-btn" onClick={pedirSalida} aria-label="Cerrar sesión" title="Cerrar sesión">
            <Icon name="logout" />
          </button>
        </div>
      </aside>

      <header className="topbar">
        <div className="brand">
          <img src="/icon.svg" alt="" width={28} height={28} />
          <strong>Mantenimiento</strong>
        </div>
        <ConnectionStatus compact />
        <div className="topbar-user">
          <span>{user?.nombre.split(' ')[0]} · {user ? ROL_LABEL[user.rol] : ''}</span>
          <button className="icon-btn" onClick={pedirSalida} aria-label="Cerrar sesión">
            <Icon name="logout" />
          </button>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Principal">
        {visibles.map((n) => (
          <NavLink key={n.to} to={n.to} className="tab-link">
            <span className="tab-icon"><Icon name={n.icon} size={22} />{badge(n.to)}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
        {resto.length ? (
          <button type="button" className={`tab-link ${enResto ? 'active' : ''}`} onClick={() => setMas(true)}>
            <Icon name="more" size={22} />
            <span>Más</span>
          </button>
        ) : null}
      </nav>
      <SyncManager />
      <Modal open={salir} title="Hay registros sin enviar" onClose={() => setSalir(false)}
        footer={<><Button variant="ghost" onClick={() => setSalir(false)}>Seguir aquí</Button><Button variant="danger" onClick={() => { setSalir(false); logout(); }}>Cerrar sesión</Button></>}>
        <p style={{ margin: 0 }}>
          Tiene {sinEnviar} registro{sinEnviar === 1 ? '' : 's'} guardado{sinEnviar === 1 ? '' : 's'} en este dispositivo que aún no llega{sinEnviar === 1 ? '' : 'n'} al sistema.
          Si cierra sesión, se enviará{sinEnviar === 1 ? '' : 'n'} cuando usted vuelva a ingresar en este mismo dispositivo.
        </p>
      </Modal>
      <Modal open={mas} title="Más opciones" onClose={() => setMas(false)}>
        <nav className="more-menu" aria-label="Más opciones">
          {resto.map((n) => (
            <NavLink key={n.to} to={n.to} className="more-link" onClick={() => setMas(false)}>
              <Icon name={n.icon} /> {n.label} {badge(n.to)}
            </NavLink>
          ))}
        </nav>
      </Modal>
    </div>
  );
}
