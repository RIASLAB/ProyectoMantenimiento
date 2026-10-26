import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChangeEvent, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError, openProtectedFile } from '../../api/client';
import { Button, ErrorBox, Icon, PageHeader } from '../../components/ui';
import { date, money, qty } from '../../format';

type Tipo = 'maquinas' | 'repuestos';
interface ErrorFila { fila: number; columna: string | null; mensaje: string }
interface Analisis {
  tipo: Tipo;
  filas: number;
  validas: number;
  errores: ErrorFila[];
  totales: { registros: number; porArea?: Record<string, number>; dadasDeBaja?: number; conStock?: number; unidades?: number; valor?: number };
  vistaPrevia: Array<Record<string, string | number | null> & { fila: number }>;
}
interface Resultado { tipo: Tipo; cargados: number; totales: Analisis['totales'] }

const TEXTO: Record<Tipo, { titulo: string; un: string; uno: string; varios: string; lista: string; ruta: string }> = {
  maquinas: { titulo: 'Máquinas', un: 'Una máquina', uno: 'máquina', varios: 'máquinas', lista: 'Ver máquinas', ruta: '/maquinas' },
  repuestos: { titulo: 'Repuestos', un: 'Un repuesto', uno: 'repuesto', varios: 'repuestos', lista: 'Ver inventario', ruta: '/inventario' },
};
const MAX_ERRORES = 200;

/** INT-01: carga inicial de máquinas y repuestos desde la plantilla de Excel. */
export function BulkImport() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tipo: Tipo = params.get('tipo') === 'repuestos' ? 'repuestos' : 'maquinas';
  const t = TEXTO[tipo];
  const input = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [errorDescarga, setErrorDescarga] = useState<unknown>(null);

  const form = (f: File) => { const d = new FormData(); d.append('archivo', f); return d; };
  const validar = useMutation({ mutationFn: (f: File) => api.post<Analisis>(`/importacion/${tipo}/validar`, form(f)) });
  const cargar = useMutation({
    mutationFn: () => api.post<Resultado>(`/importacion/${tipo}`, form(archivo!)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [tipo === 'maquinas' ? 'activos' : 'repuestos'] });
      qc.invalidateQueries({ queryKey: ['bitacora'] });
    },
  });

  const reiniciar = () => {
    setArchivo(null); validar.reset(); cargar.reset();
    if (input.current) input.current.value = '';
  };
  const cambiarTipo = (nuevo: Tipo) => { reiniciar(); setParams({ tipo: nuevo }, { replace: true }); };
  const elegir = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    cargar.reset();
    if (!f) return;
    setArchivo(f);
    validar.mutate(f);
  };
  const descargar = async () => {
    setDescargando(true); setErrorDescarga(null);
    try { await openProtectedFile(`/importacion/${tipo}/plantilla`, `plantilla-${tipo}.xlsx`, true); } catch (e) { setErrorDescarga(e); } finally { setDescargando(false); }
  };

  const a = validar.data;
  // Si alguien creó un código mientras tanto, la carga devuelve la lista de errores actualizada.
  const erroresCarga = cargar.error instanceof ApiError ? (cargar.error.datos as { errores?: ErrorFila[] } | undefined)?.errores : undefined;
  const errores = erroresCarga ?? a?.errores ?? [];

  return (
    <>
      <PageHeader back={<Link to="/configuracion" className="back-link"><Icon name="back" size={18} /> Ajustes</Link>} title="Carga masiva desde Excel"
        subtitle="Para la carga inicial de máquinas y repuestos" />

      <div className="chips" role="group" aria-label="Qué va a cargar">
        {(['maquinas', 'repuestos'] as Tipo[]).map((x) => (
          <button key={x} type="button" className={`chip ${tipo === x ? 'chip-on' : ''}`} aria-pressed={tipo === x} onClick={() => cambiarTipo(x)}>{TEXTO[x].titulo}</button>
        ))}
      </div>

      {cargar.isSuccess ? (
        <section className="card stack" aria-live="polite">
          <div className="alert alert-ok">
            <strong>Se cargaron {cargar.data.cargados} {cargar.data.cargados === 1 ? t.uno : t.varios}.</strong> {resumenTotales(tipo, cargar.data.totales)}
          </div>
          <div className="import-actions">
            <Link to={t.ruta} className="btn btn-primary">{t.lista}</Link>
            <Button variant="ghost" onClick={reiniciar}>Cargar otro archivo</Button>
          </div>
        </section>
      ) : (
        <ol className="steps">
          <li className="card">
            <h2>1. Descargue la plantilla</h2>
            <p className="muted">
              {t.un} por fila. Las columnas con * son obligatorias y los códigos no pueden repetirse ni existir ya en el sistema.
              {tipo === 'repuestos' ? ' El stock inicial queda como "Saldo inicial" en el kárdex, con el costo unitario como costo promedio.' : ' Los manuales y fichas se adjuntan después en cada máquina.'}
              {' '}La hoja “Instrucciones” explica cada columna.
            </p>
            <Button variant="secondary" busy={descargando} onClick={descargar}><Icon name="download" /> Plantilla de {t.varios}</Button>
            {errorDescarga ? <ErrorBox error={errorDescarga} /> : null}
          </li>

          <li className="card">
            <h2>2. Suba el archivo lleno</h2>
            <p className="muted">Se revisa todo el archivo antes de guardar. Si una fila tiene errores no se carga nada.</p>
            <label className="btn btn-secondary file-btn">
              <Icon name="upload" /> {archivo ? 'Elegir otro archivo' : 'Elegir archivo .xlsx'}
              <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={elegir} aria-label="Archivo de Excel" />
            </label>
            {archivo ? <p className="small muted" style={{ margin: '8px 0 0' }}><Icon name="file" size={14} /> {archivo.name}</p> : null}
            {validar.isPending ? <p className="muted"><span className="spinner sm" aria-hidden /> Revisando el archivo…</p> : null}
            {validar.isError ? <ErrorBox error={validar.error} /> : null}
          </li>

          {a ? (
            <li className="card stack">
              <h2>3. Revise y cargue</h2>
              <div className="kpis import-sum">
                <div className="kpi"><span className="kpi-title">Filas con datos</span><strong className="kpi-value">{a.filas}</strong><span className="kpi-detail">{archivo?.name}</span></div>
                <div className="kpi"><span className="kpi-title">Listas para cargar</span><strong className="kpi-value">{a.validas}</strong><span className="kpi-detail">{resumenTotales(tipo, a.totales)}</span></div>
                <div className={`kpi ${errores.length ? 'kpi-bad' : ''}`}><span className="kpi-title">Errores</span><strong className="kpi-value">{errores.length}</strong>
                  <span className="kpi-detail">{errores.length ? `en ${new Set(errores.map((e) => e.fila)).size} fila${new Set(errores.map((e) => e.fila)).size === 1 ? '' : 's'}` : 'Ninguno'}</span></div>
              </div>

              {errores.length ? (
                <>
                  <div className="alert alert-bad" role="alert">
                    Corrija estas filas en el archivo y vuelva a subirlo. No se cargará nada mientras haya errores.
                  </div>
                  <div className="table-wrap">
                    <table className="table import-errors">
                      <thead><tr><th className="num">Fila</th><th>Columna</th><th>Problema</th></tr></thead>
                      <tbody>
                        {errores.slice(0, MAX_ERRORES).map((e, i) => (
                          <tr key={i}><td data-label="Fila" className="num">{e.fila}</td><td data-label="Columna">{e.columna ?? '—'}</td><td data-label="Problema">{e.mensaje}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {errores.length > MAX_ERRORES ? <p className="muted small">Se muestran los primeros {MAX_ERRORES} de {errores.length} errores.</p> : null}
                </>
              ) : (
                <>
                  {a.vistaPrevia.length ? <VistaPrevia tipo={tipo} filas={a.vistaPrevia} total={a.validas} /> : null}
                  {cargar.isError && !erroresCarga ? <ErrorBox error={cargar.error} /> : null}
                  <div>
                    <Button className="btn-lg" busy={cargar.isPending} onClick={() => cargar.mutate()}>
                      Cargar {a.validas} {a.validas === 1 ? t.uno : t.varios}
                    </Button>
                  </div>
                </>
              )}
            </li>
          ) : null}
        </ol>
      )}
    </>
  );
}

function resumenTotales(tipo: Tipo, tot: Analisis['totales']) {
  if (tipo === 'maquinas') {
    const areas = Object.entries(tot.porArea ?? {}).map(([k, v]) => `${k}: ${v}`).join(' · ');
    return [areas, tot.dadasDeBaja ? `${tot.dadasDeBaja} dada${tot.dadasDeBaja === 1 ? '' : 's'} de baja` : ''].filter(Boolean).join(' · ');
  }
  return `${tot.conStock ?? 0} con stock inicial · ${qty(tot.unidades ?? 0)} unidades · valor ${money(tot.valor ?? 0)}`;
}

function VistaPrevia({ tipo, filas, total }: { tipo: Tipo; filas: Analisis['vistaPrevia']; total: number }) {
  const cols: Array<[string, string, (v: unknown) => string]> = tipo === 'maquinas'
    ? [['codigo', 'Código', String], ['nombre', 'Nombre', String], ['area', 'Área', String], ['ubicacion', 'Ubicación', (v) => (v ? String(v) : '—')],
      ['fechaCompra', 'Compra', (v) => (v ? date(String(v)) : '—')], ['estado', 'Estado', (v) => (v === 'DADO_DE_BAJA' ? 'Dado de baja' : 'Operativo')]]
    : [['codigo', 'Código', String], ['descripcion', 'Descripción', String], ['unidad', 'Unidad', String], ['stockMinimo', 'Mínimo', (v) => qty(Number(v))],
      ['stockInicial', 'Stock inicial', (v) => qty(Number(v))], ['costoUnitario', 'Costo unitario', (v) => (v === null ? '—' : money(Number(v)))]];
  const numericas = ['stockMinimo', 'stockInicial', 'costoUnitario'];
  return (
    <>
      <h3 className="small muted" style={{ margin: 0 }}>Vista previa{total > filas.length ? ` (primeras ${filas.length} de ${total})` : ''}</h3>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th className="num">Fila</th>{cols.map(([k, l]) => <th key={k} className={numericas.includes(k) ? 'num' : undefined}>{l}</th>)}</tr></thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.fila}>
                <td data-label="Fila" className="num">{f.fila}</td>
                {cols.map(([k, l, fmt]) => <td key={k} data-label={l} className={numericas.includes(k) ? 'num' : undefined}>{fmt(f[k])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
