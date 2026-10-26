import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, qs } from '../../api/client';
import type { AuditItem, KpiParams, User } from '../../api/types';
import { Link } from 'react-router-dom';
import { Button, Empty, ErrorBox, Field, Icon, Input, PageHeader, Select, Spinner } from '../../components/ui';
import { dateTime } from '../../format';

const ACCION_LABEL: Record<string, string> = {
  USUARIO_CREADO: 'Creó usuario',
  USUARIO_ACTUALIZADO: 'Modificó usuario',
  USUARIO_BLOQUEADO: 'Usuario bloqueado por intentos fallidos',
  AUTORIZADOR_CAMBIADO: 'Cambió el autorizador de compras',
  PARAMETROS_INDICADORES: 'Cambió el horario de producción o las metas de los indicadores',
  CARGA_MASIVA: 'Carga masiva desde Excel',
  ACTIVO_CREADO: 'Registró máquina',
  ACTIVO_ACTUALIZADO: 'Modificó máquina',
  DOCUMENTO_ADJUNTADO: 'Adjuntó documento',
  REPUESTO_CREADO: 'Registró repuesto',
  REPUESTO_ACTUALIZADO: 'Modificó repuesto',
  AJUSTE_INVENTARIO: 'Ajuste de inventario',
  CONTEO_FISICO: 'Conteo físico',
  STOCK_NEGATIVO: 'Stock quedó negativo',
  COMPRA_SOLICITADA: 'Solicitud de compra',
  COMPRA_AJUSTADA: 'Solicitud de compra ajustada',
  COMPRA_APROBADA: 'Aprobó compra',
  COMPRA_RECHAZADA: 'Rechazó compra',
  COMPRA_REALIZADA: 'Registró compra',
  COMPRA_RECIBIDA: 'Recibió compra en bodega',
  COMPRA_CANCELADA: 'Canceló solicitud de compra',
  TEMPERATURA_FUERA_DE_RANGO: 'Temperatura fuera de rango',
  CHECKLIST_NO_CONFORME: 'Checklist con no conformidades',
  REGISTRO_CALIDAD_ANULADO: 'Anuló un registro de calidad',
  PUNTO_CONTROL_CREADO: 'Creó punto de control',
  PUNTO_CONTROL_ACTUALIZADO: 'Modificó punto de control',
  PLANTILLA_CREADA: 'Creó plantilla de checklist',
  PLANTILLA_ACTUALIZADA: 'Modificó plantilla de checklist',
  TARIFA_HORA_CAMBIADA: 'Cambió la tarifa de mano de obra',
  OT_CANCELADA: 'Canceló una orden de trabajo',
  ACTIVO_ESTADO_AUTOMATICO: 'Estado de máquina actualizado por una orden',
  PLAN_CREADO: 'Creó plan preventivo',
  PLAN_ACTUALIZADO: 'Modificó plan preventivo',
};

const ENTIDADES: Array<[string, string]> = [['', 'Todo'], ['usuario', 'Usuarios'], ['parametro', 'Parámetros'], ['activo', 'Máquinas'], ['repuesto', 'Repuestos'], ['orden', 'Órdenes'], ['plan', 'Planes'], ['compra', 'Compras'], ['calidad', 'Calidad']];

function resumen(d: Record<string, unknown> | null): string {
  if (!d) return '';
  return Object.entries(d)
    // Los objetos anidados (ej. totales de una carga masiva) no caben en una línea.
    .filter(([k, v]) => !['movimientoId', 'anterior', 'nuevo'].includes(k) && !(v && typeof v === 'object' && !('antes' in v)))
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

const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const METAS: Array<{ k: keyof KpiParams['metas']; label: string; hint: string; max: number; step: string }> = [
  { k: 'disponibilidad', label: 'Disponibilidad mínima (%)', hint: 'Ej. 95', max: 100, step: '0.1' },
  { k: 'mtbf', label: 'MTBF mínimo (horas)', hint: 'Tiempo medio entre fallas', max: 100000, step: '1' },
  { k: 'mttr', label: 'MTTR máximo (horas)', hint: 'Tiempo medio de reparación', max: 100000, step: '0.1' },
  { k: 'cumplimiento', label: 'Cumplimiento de preventivos (%)', hint: 'Ej. 90', max: 100, step: '1' },
  { k: 'rotacion', label: 'Rotación mínima del inventario', hint: 'Veces en el período', max: 1000, step: '0.01' },
];

/** D-05 / KPI-07: calendario de producción (tiempo planificado) y metas de los indicadores. */
function ParametrosIndicadores() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['indicadores', 'parametros'], queryFn: () => api.get<KpiParams>('/indicadores/parametros') });
  const [dias, setDias] = useState<number[]>([]);
  const [ini, setIni] = useState('00:00');
  const [fin, setFin] = useState('00:00');
  const [metas, setMetas] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!q.data) return;
    setDias(q.data.dias); setIni(q.data.horaInicio); setFin(q.data.horaFin === '24:00' ? '00:00' : q.data.horaFin);
    setMetas(Object.fromEntries(Object.entries(q.data.metas).map(([k, v]) => [k, v === null ? '' : String(v)])));
  }, [q.data]);
  // Un fin a las 00:00 es medianoche del mismo día (24:00).
  const finReal = fin === '00:00' ? '24:00' : fin;
  const invalido = finReal <= ini;
  const m = useMutation({
    mutationFn: () => api.put('/indicadores/parametros', {
      dias, horaInicio: ini, horaFin: finReal,
      metas: Object.fromEntries(METAS.map(({ k }) => [k, metas[k] === '' || metas[k] === undefined ? null : Number(metas[k])])),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['indicadores'] }); qc.invalidateQueries({ queryKey: ['bitacora'] }); },
  });
  const toggle = (d: number) => setDias((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d].sort()));
  return (
    <section className="card">
      <h2>Indicadores</h2>
      <p className="muted">El horario de producción define el tiempo planificado de la disponibilidad y el MTBF: las paradas fuera de este horario no cuentan. Las metas se muestran junto a cada indicador. Pendiente de aprobación por Dirección (D-05).</p>
      {q.isPending ? <Spinner /> : q.isError ? <ErrorBox error={q.error} /> : (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field-legend">Días de producción</legend>
            <div className="days">
              {DIAS_CORTOS.map((d, i) => (
                <label key={d}><input type="checkbox" checked={dias.includes(i + 1)} onChange={() => toggle(i + 1)} /> {d}</label>
              ))}
            </div>
          </fieldset>
          <div className="form-grid">
            <Field label="Desde (hora)">{(i) => <Input id={i} type="time" value={ini} onChange={(e) => setIni(e.target.value)} required />}</Field>
            <Field label="Hasta (hora)" hint="00:00 = medianoche" error={invalido ? 'Debe ser posterior a la hora de inicio' : undefined}>
              {(i) => <Input id={i} type="time" value={fin} onChange={(e) => setFin(e.target.value)} required />}
            </Field>
            {METAS.map(({ k, label, hint, max, step }) => (
              <Field key={k} label={label} hint={`${hint}. Vacío = sin meta`}>
                {(i) => <Input id={i} type="number" inputMode="decimal" min="0" max={max} step={step} value={metas[k] ?? ''} onChange={(e) => setMetas((s) => ({ ...s, [k]: e.target.value }))} />}
              </Field>
            ))}
          </div>
          {m.isError ? <ErrorBox error={m.error} /> : null}
          {m.isSuccess ? <div className="alert alert-ok">Horario y metas guardados.</div> : null}
          <div><Button type="submit" busy={m.isPending} disabled={!dias.length || invalido}>Guardar</Button></div>
        </form>
      )}
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
        <Link to="/usuarios" className="card link-card">
          <div>
            <h2 style={{ margin: 0 }}>Usuarios</h2>
            <p className="muted" style={{ margin: '4px 0 0' }}>Crear usuarios, cambiar roles, restablecer PIN o contraseña.</p>
          </div>
          <Icon name="users" />
        </Link>
        <Link to="/configuracion/carga-masiva" className="card link-card">
          <div>
            <h2 style={{ margin: 0 }}>Carga masiva desde Excel</h2>
            <p className="muted" style={{ margin: '4px 0 0' }}>Cargar de una vez las máquinas y los repuestos con su stock inicial.</p>
          </div>
          <Icon name="upload" />
        </Link>
        <Autorizador />
        <TarifaHora />
        <ParametrosIndicadores />
        <Bitacora />
      </div>
    </>
  );
}
