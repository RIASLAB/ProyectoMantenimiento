import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, uuid } from '../../api/client';
import type { ControlPointInfo } from '../../api/types';
import { Button, Empty, ErrorBox, Field, Icon, Input, PageHeader, Select, Spinner, Textarea } from '../../components/ui';
import { useAuth } from '../../auth/AuthContext';
import { qty, rangoTexto } from '../../format';
import { enviarOEncolar } from '../../offline/outbox';

/** CAL-01/03: registro rápido de temperatura. Tras guardar, deja el formulario listo para el siguiente punto. */
export function RecordTemperature() {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [puntoId, setPuntoId] = useState(params.get('punto') ?? '');
  const [valor, setValor] = useState('');
  const [accion, setAccion] = useState('');
  const [clientId, setClientId] = useState(() => uuid());
  const [ultimo, setUltimo] = useState<{ punto: string; valor: number; fuera: boolean; sinConexion: boolean } | null>(null);
  const { user } = useAuth();

  const puntos = useQuery({ queryKey: ['calidad', 'puntos'], queryFn: () => api.get<ControlPointInfo[]>('/calidad/puntos') });
  const punto = puntos.data?.find((p) => p.id === puntoId);
  const porArea = useMemo(() => {
    const m = new Map<string, ControlPointInfo[]>();
    for (const p of puntos.data ?? []) m.set(p.activo.area, [...(m.get(p.activo.area) ?? []), p]);
    return [...m];
  }, [puntos.data]);

  const n = valor === '' ? null : Number(valor.replace(',', '.'));
  const fuera = !!punto && n !== null && Number.isFinite(n) && ((punto.minimo !== null && n < punto.minimo) || (punto.maximo !== null && n > punto.maximo));

  const m = useMutation({
    // OFF-01: la hora real de la lectura viaja con el registro aunque se envíe más tarde.
    mutationFn: () => enviarOEncolar({
      usuarioId: user!.id, tipo: 'temperatura', method: 'POST', path: '/calidad/temperaturas',
      resumen: `${punto!.activo.codigo} · ${punto!.nombre}: ${qty(n!)} °C${fuera ? ' (fuera de rango)' : ''}`,
      body: { puntoId, valor: n, accionCorrectiva: fuera ? accion : undefined, clientId, registradoEn: new Date().toISOString() },
    }),
    onSuccess: (r) => {
      setUltimo({ punto: `${punto!.activo.codigo} · ${punto!.nombre}`, valor: n!, fuera, sinConexion: r.encolado });
      setValor(''); setAccion(''); setPuntoId(''); setClientId(uuid());
      qc.invalidateQueries({ queryKey: ['calidad'] });
    },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };

  return (
    <>
      <PageHeader back={<Link to="/calidad" className="back-link"><Icon name="back" size={18} /> Calidad</Link>} title="Registrar temperatura" />
      {ultimo ? (
        <div className={`alert ${ultimo.fuera ? 'alert-warn' : 'alert-ok'}`}>
          {ultimo.sinConexion ? 'Guardado en el dispositivo (sin señal)' : 'Guardado'}: {ultimo.punto} → {qty(ultimo.valor)} °C{ultimo.fuera ? ' (fuera de rango, con acción correctiva)' : ''}.
          {ultimo.sinConexion ? ' Se enviará al recuperar la señal.' : ''} Puede registrar el siguiente.
        </div>
      ) : null}
      {puntos.isPending ? <Spinner /> : puntos.isError ? <ErrorBox error={puntos.error} /> : puntos.data.length === 0 ? (
        <Empty title="No hay puntos de control configurados"><p className="muted">El administrador los crea en Calidad → Configuración.</p></Empty>
      ) : (
        <form className="card form stack" onSubmit={submit}>
          <Field label="Equipo y punto de control *" hint={punto ? `Rango permitido: ${rangoTexto(punto.minimo, punto.maximo)}` : undefined}>
            {(i) => (
              <Select id={i} value={puntoId} onChange={(e) => setPuntoId(e.target.value)} required>
                <option value="" disabled>Seleccione…</option>
                {porArea.map(([area, items]) => (
                  <optgroup key={area} label={area}>
                    {items.map((p) => <option key={p.id} value={p.id}>{p.activo.codigo} · {p.activo.nombre} — {p.nombre}</option>)}
                  </optgroup>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Temperatura (°C) *">
            {(i) => (
              <Input id={i} type="number" inputMode="decimal" step="0.1" min="-100" max="400" value={valor} onChange={(e) => setValor(e.target.value)} required
                className={`input big-number ${fuera ? 'input-bad' : ''}`} />
            )}
          </Field>
          {fuera ? (
            <>
              <div className="alert alert-bad" role="alert">
                <Icon name="alert" /> Fuera de rango ({rangoTexto(punto!.minimo, punto!.maximo)}). Registre qué se hizo.
              </div>
              <Field label="Acción correctiva *" hint="Ej. Se cerró la puerta de la cámara y se avisó a mantenimiento">
                {(i) => <Textarea id={i} value={accion} onChange={(e) => setAccion(e.target.value)} required minLength={5} maxLength={2000} />}
              </Field>
            </>
          ) : null}
          {m.isError ? <ErrorBox error={m.error} /> : null}
          <Button type="submit" busy={m.isPending} className="btn-block btn-lg" disabled={!puntoId || n === null}>Guardar registro</Button>
          <p className="muted small" style={{ margin: 0 }}>Los registros no se pueden editar. Si se equivoca, el administrador puede anularlo indicando el motivo.</p>
        </form>
      )}
    </>
  );
}
