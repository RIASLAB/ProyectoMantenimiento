import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChangeEvent, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { EstadoActivo, UnidadFrecuencia } from '../../api/types';
import { Badge, Button, ErrorBox, Field, Icon, Input, PageHeader } from '../../components/ui';
import { date, diaLocal, ESTADO_LABEL } from '../../format';

interface Frec { valor: number; unidad: UnidadFrecuencia }
interface HojaRevisada {
  hoja: string;
  codigo: string | null;
  accion: 'CREAR' | 'ACTUALIZAR' | null;
  datos: {
    nombre: string | null; descripcion: string | null; area: string | null; ubicacion: string | null; marca: string | null; modelo: string | null;
    referencia: string | null; serie: string | null; voltaje: string | null; amperaje: string | null; capacidad: string | null; peso: string | null;
    adquisicion: string | null; ubicacionManual: string | null; estado: EstadoActivo;
  };
  fotos: number;
  planes: Array<{ clave: string; nombre: string; frecuencia: Frec; periodicidad: string; tareas: string[]; materiales: string | null; existe: boolean }>;
  diarias: string[];
  referencias: Array<{ texto: string; nombre: string; codigo: string | null; cantidad: number | null; enInventario: boolean; descripcion: string | null }>;
  advertencias: string[];
  errores: string[];
}
interface Revision {
  hojas: HojaRevisada[];
  omitidas: string[];
  errores: number;
  periodicidades: Array<{ clave: string; frecuencia: Frec; texto: string }>;
  tareasNuevas: number;
  repuestosNuevos: Array<{ codigo: string; descripcion: string }>;
  /** D-40: con el módulo de inventario apagado las referencias quedan solo en las notas. */
  inventario: boolean;
}
interface Resultado {
  creadas: number; actualizadas: number; fotos: number; tareasCreadas: number; repuestosCreados: number; materiales: number;
  planes: Array<{ codigo: string; plan: string; orden: string; fecha: string }>;
}

const DATOS: Array<[keyof HojaRevisada['datos'], string]> = [
  ['area', 'Área'], ['ubicacion', 'Ubicación'], ['marca', 'Marca'], ['modelo', 'Modelo'], ['serie', 'N.º de serie'], ['voltaje', 'Voltaje'],
  ['amperaje', 'Amperaje'], ['capacidad', 'Capacidad'], ['peso', 'Peso'], ['adquisicion', 'Adquisición'], ['ubicacionManual', 'Ubicación del manual'],
];

/**
 * Cargar la hoja de vida de maquinaria (AC-PMT-FR05) desde el Excel de la planta (D-34): cada pestaña es una máquina.
 * Se revisa primero y se muestra lo que se va a crear; luego se carga todo junto.
 */
const MAX_MB = 100;

export function LifeSheetImport() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [grande, setGrande] = useState('');
  const [fechas, setFechas] = useState<Record<string, string>>({});
  const [crearRepuestos, setCrearRepuestos] = useState(true);
  const form = (f: File, extra?: Record<string, string>) => {
    const d = new FormData();
    d.append('archivo', f);
    for (const [k, v] of Object.entries(extra ?? {})) d.append(k, v);
    return d;
  };
  const revisar = useMutation({
    mutationFn: (f: File) => api.post<Revision>('/hojas-de-vida/revisar', form(f)),
    onSuccess: (r) => setFechas(Object.fromEntries(r.periodicidades.map((p) => [p.clave, diaLocal(7)]))),
  });
  const cargar = useMutation({
    mutationFn: () => api.post<Resultado>('/hojas-de-vida/cargar', form(archivo!, { fechas: JSON.stringify(fechas), crearRepuestos: String(crearRepuestos) })),
    onSuccess: () => { for (const k of ['activos', 'activo', 'planes', 'ordenes', 'ordenes-resumen', 'tareas-mantenimiento', 'repuestos', 'activo-materiales']) qc.invalidateQueries({ queryKey: [k] }); },
  });
  const elegir = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setArchivo(f);
    cargar.reset();
    // Mismo límite del servidor (MAX_BYTES_HV): se avisa antes de subirlo, con el tamaño del archivo.
    if (f.size > MAX_MB * 1024 * 1024) {
      setGrande(`El archivo pesa ${Math.round(f.size / 1024 / 1024)} MB y el máximo es ${MAX_MB} MB. Divida el libro en dos archivos (unas pestañas en cada uno) o reduzca las fotos en Excel (Archivo → Comprimir imágenes).`);
      revisar.reset();
      return;
    }
    setGrande('');
    revisar.mutate(f);
  };
  const r = revisar.data;
  const listas = useMemo(() => r?.hojas.filter((h) => h.accion) ?? [], [r]);
  const res = cargar.data;

  return (
    <>
      <PageHeader title="Cargar hoja de vida" subtitle="Formato AC-PMT-FR05 en Excel: cada pestaña es una máquina" back={<Link to="/maquinas" className="back-link"><Icon name="back" size={18} /> Máquinas</Link>} />
      <ol className="steps">
        <li className="card">
          <h2>1. Elija el Excel de la hoja de vida</h2>
          <p className="muted">
            Se leen los datos de la máquina, las fotos, las actividades del mantenimiento preventivo y las referencias de materiales.
            Primero se muestra lo que se va a cargar; nada se guarda hasta que lo confirme.
          </p>
          <label className="btn btn-secondary file-btn">
            <Icon name="upload" /> {archivo ? 'Elegir otro archivo' : 'Elegir archivo .xlsx'}
            <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={elegir} aria-label="Archivo de Excel" />
          </label>
          {archivo ? <p className="small muted" style={{ margin: '8px 0 0' }}><Icon name="file" size={14} /> {archivo.name}</p> : null}
          {revisar.isPending ? <p className="muted"><span className="spinner sm" aria-hidden /> Leyendo el archivo…</p> : null}
          {grande ? <div className="alert alert-bad">{grande}</div> : null}
          {revisar.isError ? <ErrorBox error={revisar.error} /> : null}
        </li>

        {r && !res ? (
          <>
            <li className="card stack">
              <h2>2. Revise lo que se va a cargar</h2>
              <div className="kpis import-sum">
                <div className="kpi"><span className="kpi-title">Máquinas</span><strong className="kpi-value">{listas.length}</strong>
                  <span className="kpi-detail">{listas.filter((h) => h.accion === 'CREAR').length} nuevas · {listas.filter((h) => h.accion === 'ACTUALIZAR').length} ya existen (se actualizan)</span></div>
                <div className="kpi"><span className="kpi-title">Planes preventivos</span><strong className="kpi-value">{r.hojas.reduce((n, h) => n + h.planes.filter((p) => !p.existe).length, 0)}</strong>
                  <span className="kpi-detail">{r.tareasNuevas} tarea{r.tareasNuevas === 1 ? '' : 's'} nueva{r.tareasNuevas === 1 ? '' : 's'} en el catálogo</span></div>
                <div className={`kpi ${r.errores ? 'kpi-bad' : ''}`}><span className="kpi-title">Errores</span><strong className="kpi-value">{r.errores}</strong>
                  <span className="kpi-detail">{r.errores ? 'Corrija el Excel y vuelva a elegirlo' : 'Ninguno'}</span></div>
              </div>
              {r.omitidas.length ? <p className="muted small" style={{ margin: 0 }}>Pestañas que no son hojas de vida (no se cargan): {r.omitidas.join(', ')}.</p> : null}

              {r.hojas.map((h) => <HojaCard key={h.hoja} h={h} inventario={r.inventario} />)}
            </li>

            {!r.errores ? (
              <li className="card stack">
                <h2>3. Confirme y cargue</h2>
                {r.periodicidades.length ? (
                  <div className="stack" style={{ gap: 8 }}>
                    <p className="muted" style={{ margin: 0 }}>¿Cuándo toca el primer preventivo? Desde esa fecha se programan los siguientes.</p>
                    <div className="grid-2">
                      {r.periodicidades.map((p) => (
                        <Field key={p.clave} label={`Primer preventivo ${p.texto} *`}>
                          {(i) => <Input id={i} type="date" value={fechas[p.clave] ?? ''} min={diaLocal(-60)} onChange={(e) => setFechas((s) => ({ ...s, [p.clave]: e.target.value }))} required />}
                        </Field>
                      ))}
                    </div>
                  </div>
                ) : null}
                {r.repuestosNuevos.length ? (
                  <label className="check-line">
                    <input type="checkbox" checked={crearRepuestos} onChange={(e) => setCrearRepuestos(e.target.checked)} />
                    <span>
                      Crear en inventario {r.repuestosNuevos.length === 1 ? 'el repuesto que no existe' : `los ${r.repuestosNuevos.length} repuestos que no existen`} (con existencia 0) y agregarlos a la lista de materiales de cada máquina:{' '}
                      <span className="muted">{r.repuestosNuevos.map((x) => `${x.codigo} · ${x.descripcion}`).join(' — ')}</span>
                    </span>
                  </label>
                ) : null}
                {cargar.isError ? <ErrorBox error={cargar.error} /> : null}
                <div>
                  <Button busy={cargar.isPending} disabled={!listas.length || r.periodicidades.some((p) => !fechas[p.clave])} onClick={() => cargar.mutate()}>
                    <Icon name="upload" /> Cargar {listas.length} máquina{listas.length === 1 ? '' : 's'}
                  </Button>
                </div>
              </li>
            ) : null}
          </>
        ) : null}

        {res ? (
          <li className="card stack">
            <div className="alert alert-ok" role="status">
              Listo: {res.creadas} máquina{res.creadas === 1 ? '' : 's'} nueva{res.creadas === 1 ? '' : 's'}{res.actualizadas ? `, ${res.actualizadas} actualizada${res.actualizadas === 1 ? '' : 's'}` : ''},
              {' '}{res.fotos} foto{res.fotos === 1 ? '' : 's'}, {res.planes.length} plan{res.planes.length === 1 ? '' : 'es'} preventivo{res.planes.length === 1 ? '' : 's'}, {res.tareasCreadas} tarea{res.tareasCreadas === 1 ? '' : 's'} nueva{res.tareasCreadas === 1 ? '' : 's'}
              {res.repuestosCreados ? `, ${res.repuestosCreados} repuesto${res.repuestosCreados === 1 ? '' : 's'} nuevo${res.repuestosCreados === 1 ? '' : 's'} en inventario` : ''}
              {res.materiales ? ` y ${res.materiales} material${res.materiales === 1 ? '' : 'es'} en las listas de las máquinas` : ''}.
            </div>
            {res.planes.length ? (
              <ul className="list">
                {res.planes.map((p) => (
                  <li key={`${p.codigo}-${p.plan}`} className="list-row static">
                    <div className="list-main"><strong>{p.codigo} · {p.plan}</strong><span className="muted">Primera orden {p.orden} para el {date(p.fecha)}</span></div>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="hv-acciones">
              <Link to="/maquinas" className="btn btn-primary">Ver máquinas</Link>
              <Link to="/ordenes/planes" className="btn btn-secondary">Ver planes preventivos</Link>
              <Button variant="ghost" onClick={() => { setArchivo(null); revisar.reset(); cargar.reset(); input.current?.click(); }}>Cargar otra hoja de vida</Button>
            </div>
          </li>
        ) : null}
      </ol>
    </>
  );
}

function HojaCard({ h, inventario }: { h: HojaRevisada; inventario: boolean }) {
  const d = h.datos;
  return (
    <section className={`hv-card ${h.errores.length ? 'hv-bad' : ''}`} aria-label={`Pestaña ${h.hoja}`}>
      <div className="hv-head">
        <div>
          <strong>{h.codigo ?? 'Sin código'} · {d.nombre ?? 'Sin nombre'}</strong>
          <span className="muted small"> (pestaña “{h.hoja}”)</span>
        </div>
        {h.errores.length ? <Badge tone="bad">Con errores</Badge> : h.accion === 'CREAR' ? <Badge tone="ok">Nueva</Badge> : <Badge tone="info">Ya existe: se actualiza</Badge>}
      </div>
      {h.errores.length ? <ul className="hv-msgs bad">{h.errores.map((e) => <li key={e}>{e}</li>)}</ul> : null}
      {d.descripcion ? <p className="muted small" style={{ margin: 0 }}>{d.descripcion}</p> : null}
      <dl className="hv-datos">
        {DATOS.filter(([k]) => d[k]).map(([k, t]) => <div key={k}><dt>{t}</dt><dd>{d[k]}</dd></div>)}
        <div><dt>Estado</dt><dd>{ESTADO_LABEL[d.estado]}</dd></div>
        <div><dt>Fotos</dt><dd>{h.fotos}</dd></div>
      </dl>
      {h.planes.map((p) => (
        <div key={p.clave} className="hv-plan">
          <p className="subtle-head">{p.nombre}{p.existe ? ' · ya existe, no se crea' : ''}</p>
          <ol className="plan-tareas">{p.tareas.map((t) => <li key={t}>{t}</li>)}</ol>
          {p.materiales ? <p className="muted small" style={{ margin: '4px 0 0' }}>Materiales: {p.materiales}</p> : null}
        </div>
      ))}
      {h.diarias.length ? (
        <p className="muted small" style={{ margin: 0 }}><strong>Rutina diaria (no genera órdenes, queda en las notas de la máquina):</strong> {h.diarias.join(' ')}</p>
      ) : null}
      {h.referencias.length ? (
        <div>
          <p className="subtle-head">Referencias de materiales</p>
          <ul className="hv-refs">
            {h.referencias.map((x) => (
              <li key={x.texto}>
                <span>{x.texto}</span>{' '}
                {x.codigo
                  ? <Badge tone={x.enInventario ? 'ok' : 'warn'}>{x.enInventario ? 'En inventario' : 'Repuesto nuevo'}{x.cantidad ? ` · ${x.cantidad} en la lista` : ''}</Badge>
                  : <Badge tone="muted">{inventario ? 'Sin código: queda en notas' : 'Queda en las notas'}</Badge>}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {h.advertencias.length ? <ul className="hv-msgs warn">{h.advertencias.map((e) => <li key={e}>{e}</li>)}</ul> : null}
    </section>
  );
}
