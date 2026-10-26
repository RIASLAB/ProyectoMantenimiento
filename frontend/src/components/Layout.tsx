import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Rol } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ROL_LABEL } from '../format';
import { ConnectionStatus, SyncManager } from '../offline/SyncManager';
import { usePendientes } from '../offline/outbox';
import { reasociarAvisos } from '../notifications/push';
import { useMarcarLeida } from '../pages/Notifications';
import { Button, Icon, Modal } from './ui';

/** `tab: false` = no aparece en la barra inferior del celular (se llega desde Ajustes). */
const NAV: Array<{ to: string; label: string; icon: string; roles?: Rol[]; tab?: boolean }> = [
  { to: '/ordenes', label: 'Órdenes', icon: 'wrench' },
  { to: '/calidad', label: 'Calidad', icon: 'thermo' },
  { to: '/compras', label: 'Compras', icon: 'cart', roles: ['ADMIN', 'AUTORIZADOR', 'TECNICO'] },
  { to: '/maquinas', label: 'Máquinas', icon: 'machine' },
  { to: '/inventario', label: 'Inventario', icon: 'box' },
  { to: '/indicadores', label: 'Indicadores', icon: 'chart', roles: ['ADMIN', 'AUTORIZADOR'] },
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
  const noLeidas = useAvisos(user?.id);
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
          <NavLink to="/notificaciones" className="nav-link">
            <Icon name="bell" />
            Notificaciones
            {noLeidas > 0 ? <span className="nav-badge" aria-label={`${noLeidas} sin leer`}>{noLeidas > 99 ? '99+' : noLeidas}</span> : null}
          </NavLink>
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
          <NavLink to="/notificaciones" className="icon-btn bell" aria-label={noLeidas ? `Notificaciones: ${noLeidas} sin leer` : 'Notificaciones'}>
            <Icon name="bell" />
            {noLeidas > 0 ? <span className="nav-badge" aria-hidden>{noLeidas > 99 ? '99+' : noLeidas}</span> : null}
          </NavLink>
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

/**
 * Contador de notificaciones sin leer (NOT-02): se consulta cada 30 s y al instante cuando llega un aviso al celular.
 * También marca como leída la notificación con la que se abrió la app (?leer=<id>) y deja este dispositivo
 * recibiendo los avisos del usuario que ingresó.
 */
function useAvisos(usuarioId: string | undefined) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const location = useLocation();
  const leer = useMarcarLeida();
  const contador = useQuery({
    queryKey: ['notificaciones', 'contador'],
    queryFn: () => api.get<{ noLeidas: number }>('/notificaciones/contador'),
    enabled: !!usuarioId,
    refetchInterval: 30_000,
  });
  const noLeidas = contador.data?.noLeidas ?? 0;

  useEffect(() => {
    if (!usuarioId) return;
    reasociarAvisos().catch(() => undefined);
  }, [usuarioId]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMsg = (e: MessageEvent) => { if (e.data?.tipo === 'cmms:aviso') qc.invalidateQueries({ queryKey: ['notificaciones'] }); };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, [qc]);

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const id = p.get('leer');
    if (!id) return;
    leer.mutate(id);
    p.delete('leer');
    nav({ pathname: location.pathname, search: p.toString() ? `?${p}` : '' }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Número en el ícono de la app instalada (donde el sistema lo permite).
  useEffect(() => {
    const n = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    (noLeidas ? n.setAppBadge?.(noLeidas) : n.clearAppBadge?.())?.catch(() => undefined);
  }, [noLeidas]);

  return noLeidas;
}
