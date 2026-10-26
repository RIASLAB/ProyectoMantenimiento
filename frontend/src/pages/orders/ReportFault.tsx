import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, uuid } from '../../api/client';
import type { Asset, Prioridad } from '../../api/types';
import { Button, ErrorBox, Field, Icon, PageHeader, Select, Spinner, Textarea } from '../../components/ui';
import { useAuth } from '../../auth/AuthContext';
import { PRIORIDAD_LABEL } from '../../format';
import { comprimirFoto, enviarOEncolar } from '../../offline/outbox';

const MAX_MB = 20;

/** MNT-01: reporte de falla pensado para hacerse en menos de un minuto desde el celular. */
export function ReportFault() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [activoId, setActivoId] = useState(params.get('activo') ?? '');
  const [descripcion, setDescripcion] = useState('');
  const [parada, setParada] = useState(false);
  const [prioridad, setPrioridad] = useState<Prioridad | ''>('');
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoError, setFotoError] = useState('');
  const [clientId] = useState(() => uuid());
  const [fotoClientId] = useState(() => uuid());
  const { user } = useAuth();

  const activos = useQuery({ queryKey: ['activos', '', '', ''], queryFn: () => api.get<Asset[]>('/activos') });
  const porArea = useMemo(() => {
    const m = new Map<string, Asset[]>();
    for (const a of activos.data ?? []) if (a.estado !== 'DADO_DE_BAJA') m.set(a.area, [...(m.get(a.area) ?? []), a]);
    return [...m];
  }, [activos.data]);

  const m = useMutation({
    mutationFn: async () => {
      // OFF-01/07: el reporte (y su foto, reducida) se envía de inmediato o queda guardado si no hay señal.
      const activo = activos.data?.find((a) => a.id === activoId);
      const blob = foto ? await comprimirFoto(foto) : null;
      const r = await enviarOEncolar<{ id: string; codigo: string }>({
        usuarioId: user!.id,
        tipo: 'reporte',
        resumen: `${activo?.codigo ?? 'Máquina'}: ${descripcion.slice(0, 80)}${parada ? ' (máquina parada)' : ''}`,
        method: 'POST',
        path: '/ordenes',
        body: { activoId, descripcion, maquinaParada: parada, prioridad: prioridad || undefined, clientId, reportadoEn: new Date().toISOString() },
        foto: blob ? { blob, nombre: 'falla.jpg', momento: 'REPORTE', clientId: fotoClientId } : undefined,
      });
      return r;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['ordenes'] });
      qc.invalidateQueries({ queryKey: ['ordenes-resumen'] });
      qc.invalidateQueries({ queryKey: ['activos'] });
      if (r.encolado) nav('/ordenes', { replace: true, state: { guardadoSinConexion: 'El reporte de falla' } });
      else nav(`/ordenes/${r.respuesta.id}`, { replace: true, state: { reportada: r.respuesta.codigo } });
    },
  });

  const onFoto = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFotoError('');
    if (f && !['image/jpeg', 'image/png'].includes(f.type)) { setFotoError('La foto debe ser JPG o PNG'); return; }
    if (f && f.size > MAX_MB * 1024 * 1024) { setFotoError(`La foto supera ${MAX_MB} MB`); return; }
    setFoto(f);
  };

  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };

  return (
    <>
      <PageHeader back={<Link to="/ordenes" className="back-link"><Icon name="back" size={18} /> Órdenes</Link>} title="Reportar falla" />
      <form className="card form stack" onSubmit={submit}>
        <Field label="Máquina *">
          {(i) =>
            activos.isPending ? <Spinner label="Cargando máquinas…" /> : (
              <Select id={i} value={activoId} onChange={(e) => setActivoId(e.target.value)} required>
                <option value="" disabled>Seleccione la máquina…</option>
                {porArea.map(([area, items]) => (
                  <optgroup key={area} label={area}>
                    {items.map((a) => <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>)}
                  </optgroup>
                ))}
              </Select>
            )
          }
        </Field>

        <label className={`big-toggle ${parada ? 'on' : ''}`}>
          <span>¿La máquina quedó parada?</span>
          <input type="checkbox" checked={parada} onChange={(e) => setParada(e.target.checked)} />
        </label>

        <Field label="¿Qué pasó? *" hint="Ej. Ruido fuerte en el motor y olor a quemado">
          {(i) => <Textarea id={i} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required minLength={5} maxLength={2000} />}
        </Field>

        <Field label="Prioridad" hint={parada ? 'Si la máquina está parada se marca como alta.' : undefined}>
          {(i) => (
            <Select id={i} value={prioridad} onChange={(e) => setPrioridad(e.target.value as Prioridad | '')}>
              <option value="">Automática</option>
              {(['ALTA', 'MEDIA', 'BAJA'] as Prioridad[]).map((p) => <option key={p} value={p}>{PRIORIDAD_LABEL[p]}</option>)}
            </Select>
          )}
        </Field>

        <Field label="Foto (opcional)" error={fotoError || undefined}>
          {(i) => <input id={i} className="input" type="file" accept="image/jpeg,image/png" capture="environment" onChange={onFoto} />}
        </Field>

        {m.isError ? <ErrorBox error={m.error} /> : null}
        <Button type="submit" busy={m.isPending} className="btn-block btn-lg" disabled={!activoId}>Enviar reporte</Button>
      </form>
    </>
  );
}
