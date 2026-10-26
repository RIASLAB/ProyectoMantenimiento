import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, qs } from '../../api/client';
import type { AuditItem, User } from '../../api/types';
import { Button, Empty, ErrorBox, Field, Input, PageHeader, Select, Spinner } from '../../components/ui';
import { dateTime } from '../../format';

const ACCION_LABEL: Record<string, string> = {
  USUARIO_CREADO: 'Creó usuario',
  USUARIO_ACTUALIZADO: 'Modificó usuario',
  USUARIO_BLOQUEADO: 'Usuario bloqueado por intentos fallidos',
  AUTORIZADOR_CAMBIADO: 'Cambió el autorizador de compras',
  ACTIVO_CREADO: 'Registró máquina',
  ACTIVO_ACTUALIZADO: 'Modificó máquina',
  DOCUMENTO_ADJUNTADO: 'Adjuntó documento',
  REPUESTO_CREADO: 'Registró repuesto',
  REPUESTO_ACTUALIZADO: 'Modificó repuesto',
  AJUSTE_INVENTARIO: 'Ajuste de inventario',
  CONTEO_FISICO: 'Conteo físico',
  STOCK_NEGATIVO: 'Stock quedó negativo',
  TARIFA_HORA_CAMBIADA: 'Cambió la tarifa de mano de obra',
  OT_CANCELADA: 'Canceló una orden de trabajo',
  ACTIVO_ESTADO_AUTOMATICO: 'Estado de máquina actualizado por una orden',
  PLAN_CREADO: 'Creó plan preventivo',
  PLAN_ACTUALIZADO: 'Modificó plan preventivo',
};

const ENTIDADES: Array<[string, string]> = [['', 'Todo'], ['usuario', 'Usuarios'], ['parametro', 'Parámetros'], ['activo', 'Máquinas'], ['repuesto', 'Repuestos'], ['orden', 'Órdenes'], ['plan', 'Planes']];

function resumen(d: Record<string, unknown> | null): string {
  if (!d) return '';
  return Object.entries(d)
    .filter(([k]) => !['movimientoId', 'anterior', 'nuevo'].includes(k))
    .map(([k, v]) => {
      if (v && typeof v === 'object' && 'antes' in v) {
        const c = v as { antes: unknown; despues: unknown };
        return `${k}: ${c.antes ?? '—'} → ${c.despues ?? '—'}`;
      }
      return `${k}: ${v}`;
    })
    .join(' · ');
}

function Autorizador() {
  const qc = useQueryClient();
  const actual = useQuery({ queryKey: ['autorizador'], queryFn: () => api.get<{ autorizador: { id: string; nombre: string } | null; actualizadoEn: string | null }>('/parametros/autorizador') });
  const usuarios = useQuery({ queryKey: ['usuarios'], queryFn: () => api.get<User[]>('/usuarios') });
  const [sel, setSel] = useState('');
  useEffect(() => setSel(actual.data?.autorizador?.id ?? ''), [actual.data]);

  const candidatos = usuarios.data?.filter((u) => u.rol === 'AUTORIZADOR' && u.activo) ?? [];
  const m = useMutation({
    mutationFn: () => api.put('/parametros/autorizador', { usuarioId: sel }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['autorizador'] });
      qc.invalidateQueries({ queryKey: ['bitacora'] });
    },
  });

  return (
    <section className="card">
      <h2>Autorizador de compras</h2>
      <p className="muted">Recibe y aprueba las solicitudes de compra de repuestos. Se puede cambiar en cualquier momento; el cambio queda en la bitácora.</p>
      {actual.isPending || usuarios.isPending ? <Spinner /> : actual.isError ? <ErrorBox error={actual.error} /> : (
        <>
          <p>
            Actual: <strong>{actual.data.autorizador?.nombre ?? 'Sin asignar'}</strong>
            {actual.data.actualizadoEn ? <span className="muted"> · desde {dateTime(actual.data.actualizadoEn)}</span> : null}
          </p>
          {candidatos.length === 0 ? (
            <div className="alert alert-warn">No hay usuarios activos con rol Autorizador. Cree uno en Usuarios.</div>
          ) : (
            <form className="inline-form" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
              <Field label="Nuevo autorizador">
                {(i) => (
                  <Select id={i} value={sel} onChange={(e) => setSel(e.target.value)} required>
                    <option value="" disabled>Seleccione…</option>
                    {candidatos.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                  </Select>
                )}
              </Field>
              <Button type="submit" busy={m.isPending} disabled={!sel || sel === actual.data.autorizador?.id}>Guardar</Button>
            </form>
          )}
          {m.isError ? <ErrorBox error={m.error} /> : null}
          {m.isSuccess ? <div className="alert alert-ok">Autorizador actualizado.</div> : null}
        </>
      )}
    </section>
  );
}

function TarifaHora() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['tarifa-hora'], queryFn: () => api.get<{ tarifaHora: number }>('/parametros/tarifa-hora') });
  const [valor, setValor] = useState('');
  useEffect(() => { if (q.data) setValor(String(q.data.tarifaHora)); }, [q.data]);
  const m = useMutation({
    mutationFn: () => api.put('/parametros/tarifa-hora', { valor: Number(valor) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tarifa-hora'] }); qc.invalidateQueries({ queryKey: ['bitacora'] }); },
  });
  return (
    <section className="card">
      <h2>Costo de mano de obra</h2>
      <p className="muted">Tarifa por hora de los técnicos. Se usa al cerrar cada orden para calcular el costo acumulado de la máquina; las órdenes ya cerradas conservan la tarifa con la que se cerraron.</p>
      {q.isPending ? <Spinner /> : (
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <Field label="Tarifa por hora (COP)">
            {(i) => <Input id={i} type="number" inputMode="decimal" min="0" step="100" value={valor} onChange={(e) => setValor(e.target.value)} required />}
          </Field>
          <Button type="submit" busy={m.isPending} disabled={valor === String(q.data?.tarifaHora ?? '')}>Guardar</Button>
        </form>
      )}
      {m.isError ? <ErrorBox error={m.error} /> : null}
      {m.isSuccess ? <div className="alert alert-ok">Tarifa actualizada.</div> : null}
    </section>
  );
}

function Bitacora() {
  const [entidad, setEntidad] = useState('');
  const [pagina, setPagina] = useState(0);
  const POR_PAGINA = 25;
  const q = useQuery({
    queryKey: ['bitacora', entidad, pagina],
    queryFn: () => api.get<{ items: AuditItem[]; total: number }>(`/bitacora${qs({ entidad, limite: POR_PAGINA, desde: pagina * POR_PAGINA })}`),
  });
  const paginas = q.data ? Math.max(1, Math.ceil(q.data.total / POR_PAGINA)) : 1;

  return (
    <section className="card">
      <div className="card-head">
        <h2>Bitácora de auditoría</h2>
        <Select value={entidad} onChange={(e) => { setEntidad(e.target.value); setPagina(0); }} aria-label="Filtrar bitácora">
          {ENTIDADES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </div>
      <p className="muted">Registro permanente de las acciones críticas. No se puede modificar ni borrar.</p>
      {q.isPending ? <Spinner /> : q.isError ? <ErrorBox error={q.error} /> : q.data.items.length === 0 ? <Empty title="Sin registros" /> : (
        <>
          <ul className="audit">
            {q.data.items.map((a) => (
              <li key={a.id}>
                <div>
                  <strong>{ACCION_LABEL[a.accion] ?? a.accion}</strong>
                  <span className="muted"> · {a.usuario?.nombre ?? 'Sistema'}</span>
                </div>
                <span className="muted small">{dateTime(a.creadoEn)}</span>
                {resumen(a.detalle) ? <p className="audit-detail">{resumen(a.detalle)}</p> : null}
              </li>
            ))}
          </ul>
          <div className="pager">
            <Button variant="ghost" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
            <span className="muted">Página {pagina + 1} de {paginas}</span>
            <Button variant="ghost" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>Siguiente</Button>
          </div>
        </>
      )}
    </section>
  );
}

export function Settings() {
  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="stack-lg">
        <Autorizador />
        <TarifaHora />
        <Bitacora />
      </div>
    </>
  );
}
