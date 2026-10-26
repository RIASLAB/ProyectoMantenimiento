import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, uuid } from '../../api/client';
import type { Asset, ChecklistItemInfo, ChecklistTemplateInfo } from '../../api/types';
import { Button, ErrorBox, Field, Icon, Input, PageHeader, Select, Spinner, Textarea } from '../../components/ui';

type Valor = string;

function conforme(item: ChecklistItemInfo, v: Valor | undefined): boolean | null {
  if (v === undefined || v === '') return null;
  if (item.tipo === 'SI_NO') return v === (item.esperado ?? 'SI');
  if (item.tipo === 'NUMERO') {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return (item.minimo === null || item.minimo === undefined || n >= item.minimo) && (item.maximo === null || item.maximo === undefined || n <= item.maximo);
  }
  return true;
}

/** CAL-04: llenado de un checklist; las respuestas no conformes se resaltan mientras se responde. */
export function FillChecklist() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [valores, setValores] = useState<Record<string, Valor>>({});
  const [activoId, setActivoId] = useState('');
  const [obs, setObs] = useState('');
  const [accion, setAccion] = useState('');
  const [clientId] = useState(() => uuid());

  const p = useQuery({ queryKey: ['calidad', 'plantilla', id], queryFn: () => api.get<ChecklistTemplateInfo>(`/calidad/plantillas/${id}`) });
  const activos = useQuery({ queryKey: ['activos', '', '', ''], queryFn: () => api.get<Asset[]>('/activos'), enabled: !!p.data && !p.data.activoId });

  const noConformes = p.data?.items.filter((i) => conforme(i, valores[i.id]) === false) ?? [];
  const m = useMutation({
    mutationFn: () => api.post('/calidad/checklists', {
      plantillaId: id,
      activoId: activoId || undefined,
      respuestas: p.data!.items.map((i) => ({ itemId: i.id, valor: valores[i.id] === undefined || valores[i.id] === '' ? null : i.tipo === 'NUMERO' ? Number(valores[i.id]) : valores[i.id] })),
      observaciones: obs || undefined,
      accionCorrectiva: noConformes.length ? accion : undefined,
      clientId,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calidad'] });
      nav('/calidad?vista=checklists', { state: { guardado: p.data!.nombre } });
    },
  });
  const set = (k: string, v: string) => setValores((s) => ({ ...s, [k]: v }));
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };

  const back = <Link to="/calidad" className="back-link"><Icon name="back" size={18} /> Calidad</Link>;
  if (p.isPending) return <Spinner />;
  if (p.isError) return <>{back}<ErrorBox error={p.error} /></>;
  const t = p.data;

  return (
    <>
      <PageHeader back={back} title={t.nombre} subtitle={[t.area, t.activo ? `${t.activo.codigo} · ${t.activo.nombre}` : null, t.descripcion].filter(Boolean).join(' · ') || undefined} />
      <form className="stack" onSubmit={submit}>
        {!t.activoId ? (
          <section className="card">
            <Field label="Equipo (opcional)">
              {(i) => (
                <Select id={i} value={activoId} onChange={(e) => setActivoId(e.target.value)}>
                  <option value="">General / no aplica</option>
                  {activos.data?.filter((a) => a.estado !== 'DADO_DE_BAJA').map((a) => <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>)}
                </Select>
              )}
            </Field>
          </section>
        ) : null}

        <ol className="check-items">
          {t.items.map((item, k) => {
            const ok = conforme(item, valores[item.id]);
            return (
              <li key={item.id} className={`card check-item ${ok === false ? 'nc' : ''}`}>
                <p className="check-q"><span className="muted">{k + 1}.</span> {item.texto}{item.obligatorio ? ' *' : ''}</p>
                {item.tipo === 'SI_NO' ? (
                  <div className="seg" role="radiogroup" aria-label={item.texto}>
                    {(['SI', 'NO'] as const).map((v) => (
                      <button key={v} type="button" role="radio" aria-checked={valores[item.id] === v} className={`seg-btn ${valores[item.id] === v ? 'on' : ''}`} onClick={() => set(item.id, v)}>
                        {v === 'SI' ? 'Sí' : 'No'}
                      </button>
                    ))}
                  </div>
                ) : item.tipo === 'NUMERO' ? (
                  <Input type="number" inputMode="decimal" step="any" value={valores[item.id] ?? ''} onChange={(e) => set(item.id, e.target.value)} aria-label={item.texto}
                    placeholder={item.minimo !== undefined && item.minimo !== null && item.maximo !== undefined && item.maximo !== null ? `${item.minimo} a ${item.maximo}` : undefined} />
                ) : (
                  <Textarea value={valores[item.id] ?? ''} onChange={(e) => set(item.id, e.target.value)} aria-label={item.texto} rows={2} maxLength={1000} />
                )}
                {ok === false ? <p className="field-error" style={{ marginTop: 6 }}>No conforme</p> : null}
              </li>
            );
          })}
        </ol>

        <section className="card stack">
          {noConformes.length ? (
            <>
              <div className="alert alert-bad" role="alert">{noConformes.length} punto{noConformes.length === 1 ? '' : 's'} no conforme{noConformes.length === 1 ? '' : 's'}. Registre la acción correctiva.</div>
              <Field label="Acción correctiva *">{(i) => <Textarea id={i} value={accion} onChange={(e) => setAccion(e.target.value)} required minLength={5} maxLength={2000} />}</Field>
            </>
          ) : null}
          <Field label="Observaciones">{(i) => <Textarea id={i} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={2000} />}</Field>
          {m.isError ? <ErrorBox error={m.error} /> : null}
          <Button type="submit" busy={m.isPending} className="btn-block btn-lg">Guardar checklist</Button>
        </section>
      </form>
    </>
  );
}
