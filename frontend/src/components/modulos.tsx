import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Empty, Spinner } from './ui';

/** Módulos que la planta usa (D-40). Inventario y Compras se pueden apagar desde Ajustes → Módulos. */
export interface Modulos { inventario: boolean; compras: boolean }

export function useModulos() {
  const q = useQuery({
    queryKey: ['parametros', 'modulos'],
    queryFn: () => api.get<Modulos>('/parametros/modulos'),
    staleTime: 5 * 60_000,
  });
  // Mientras carga se asumen apagados: es mejor no mostrar un momento lo que luego desaparece.
  return { inventario: q.data?.inventario ?? false, compras: q.data?.compras ?? false, cargando: q.isPending, data: q.data };
}

const NOMBRE: Record<keyof Modulos, string> = { inventario: 'Inventario de repuestos', compras: 'Compras' };

/** Envuelve una página de un módulo: si está apagado muestra un aviso en vez de la página. */
export function ConModulo({ modulo, children }: { modulo: keyof Modulos; children: ReactNode }) {
  const m = useModulos();
  const { can } = useAuth();
  if (m.cargando) return <Spinner />;
  if (m[modulo]) return <>{children}</>;
  return (
    <Empty title={`El módulo de ${NOMBRE[modulo]} está apagado`}>
      La planta no lo está usando por ahora.{' '}
      {can('ADMIN') ? <>Lo puede encender en <Link to="/configuracion">Ajustes → Módulos</Link>.</> : 'El administrador lo puede encender en Ajustes.'}
    </Empty>
  );
}
