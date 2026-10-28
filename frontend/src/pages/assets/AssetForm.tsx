import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { Asset, EquipmentModel, EstadoActivo } from '../../api/types';
import { OpcionesTipos } from '../orders/Plans';
import { Button, ErrorBox, Field, Icon, Input, PageHeader, Select, Spinner, Textarea } from '../../components/ui';
import { ESTADO_LABEL } from '../../format';

type FormState = Record<
  'codigo' | 'codigoSap' | 'nombre' | 'modelo' | 'fabricante' | 'serie' | 'area' | 'ubicacion' | 'fechaCompra' | 'fechaFinGarantia' | 'notas' | 'modeloId' | 'cantidad',
  string
> & { estado: EstadoActivo };

const EMPTY: FormState = {
  codigo: '', codigoSap: '', nombre: '', modelo: '', fabricante: '', serie: '', area: '', ubicacion: '',
  fechaCompra: '', fechaFinGarantia: '', notas: '', estado: 'OPERATIVO', modeloId: '', cantidad: '1',
};

/** Códigos que se crearán al registrar varios equipos iguales (AA-001 → AA-001…AA-010). */
function consecutivos(codigo: string, n: number) {
  const m = /^(.*?)(\d+)$/.exec(codigo.trim().toUpperCase());
  if (!m || n < 2) return null;
  const fin = String(Number(m[2]) + n - 1).padStart(m[2].length, '0');
  return `${m[1]}${m[2]} a ${m[1]}${fin}`;
}

export function AssetForm() {
  const { id } = useParams<{ id: string }>();
  const editing = !!id;
  const nav = useNavigate();
  const qc = useQueryClient();
  const [f, setF] = useState<FormState>(EMPTY);
  const [localError, setLocalError] = useState('');

  const current = useQuery({ queryKey: ['activo', id], queryFn: () => api.get<Asset>(`/activos/${id}`), enabled: editing });
  const areas = useQuery({ queryKey: ['areas'], queryFn: () => api.get<string[]>('/activos/areas') });
  const tipos = useQuery({ queryKey: ['tipos-equipo'], queryFn: () => api.get<EquipmentModel[]>('/tipos-equipo') });

  useEffect(() => {
    if (!current.data) return;
    const a = current.data;
    setF({
      codigo: a.codigo, codigoSap: a.codigoSap ?? '', nombre: a.nombre, modelo: a.modelo ?? '', fabricante: a.fabricante ?? '',
      serie: a.serie ?? '', area: a.area, ubicacion: a.ubicacion ?? '', fechaCompra: a.fechaCompra ?? '',
      fechaFinGarantia: a.fechaFinGarantia ?? '', notas: a.notas ?? '', estado: a.estado, modeloId: a.modeloId ?? '', cantidad: '1',
    });
  }, [current.data]);

  const save = useMutation({
    mutationFn: (): Promise<{ varios: Array<{ id: string; codigo: string }> } | { a: Asset }> => {
      // Los campos vacíos se envían como null para poder borrarlos al editar.
      const { cantidad, ...resto } = f;
      const body: Record<string, unknown> = { ...resto };
      for (const k of ['codigoSap', 'modelo', 'fabricante', 'serie', 'ubicacion', 'fechaCompra', 'fechaFinGarantia', 'notas', 'modeloId']) {
        if (body[k] === '') body[k] = editing ? null : undefined;
      }
      if (!editing && Number(cantidad) > 1) {
        return api.post<{ creados: Array<{ id: string; codigo: string }> }>('/activos/varios', { ...body, cantidad: Number(cantidad) })
          .then((r) => ({ varios: r.creados }));
      }
      return (editing ? api.patch<Asset>(`/activos/${id}`, body) : api.post<Asset>('/activos', body)).then((a) => ({ a }));
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['activos'] });
      qc.invalidateQueries({ queryKey: ['areas'] });
      qc.invalidateQueries({ queryKey: ['tipos-equipo'] });
      qc.invalidateQueries({ queryKey: ['planes'] });
      if ('varios' in r) {
        nav(`/maquinas?q=${encodeURIComponent(r.varios[0].codigo.replace(/\d+$/, ''))}`, { replace: true, state: { creados: r.varios.length } });
        return;
      }
      const a = r.a;
      qc.setQueryData(['activo', a.id], (old: Asset | undefined) => ({ ...old, ...a }));
      qc.invalidateQueries({ queryKey: ['activo', a.id] });
      nav(`/maquinas/${a.id}`, { replace: true });
    },
  });

  const bind = (k: keyof FormState) => ({
    value: f[k],
    onChange: (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value })),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setLocalError('');
    if (f.fechaCompra && f.fechaFinGarantia && f.fechaFinGarantia < f.fechaCompra) {
      return setLocalError('La fecha de fin de garantía no puede ser anterior a la fecha de compra');
    }
    save.mutate();
  };

  if (editing && current.isPending) return <Spinner />;
  if (editing && current.isError) return <ErrorBox error={current.error} />;

  return (
    <>
      <PageHeader
        back={
          <Link to={editing ? `/maquinas/${id}` : '/maquinas'} className="back-link">
            <Icon name="back" size={18} /> {editing ? 'Volver a la ficha' : 'Máquinas'}
          </Link>
        }
        title={editing ? `Editar ${current.data?.codigo}` : 'Nueva máquina'}
      />
      <form className="card form" onSubmit={submit}>
        <div className="form-grid">
          <Field label="Código interno *" hint="Ej. MOL-001. Se guarda en mayúsculas.">
            {(i) => <Input id={i} {...bind('codigo')} required pattern="[A-Za-z0-9._\/\-]{2,40}" title="Letras, números, punto, guion o barra (2 a 40)" />}
          </Field>
          <Field label="Nombre *">{(i) => <Input id={i} {...bind('nombre')} required minLength={2} maxLength={150} />}</Field>
          <Field label="Tipo de equipo" hint={tipos.data?.length ? 'Define su lista de materiales y sus preventivos por tipo.' : 'Créelos en Máquinas → Tipos de equipo.'}>
            {(i) => (
              <Select id={i} value={f.modeloId} onChange={(e) => {
                const t = tipos.data?.find((x) => x.id === e.target.value);
                // Fabricante y modelo se completan con los del tipo si están vacíos.
                setF((s) => ({ ...s, modeloId: e.target.value, fabricante: s.fabricante || t?.fabricante || '', modelo: s.modelo || t?.referencia || '' }));
              }}>
                <option value="">Sin tipo</option>
                <OpcionesTipos tipos={tipos.data} />
              </Select>
            )}
          </Field>
          {!editing ? (
            <Field label="Cantidad de equipos iguales" hint={consecutivos(f.codigo, Number(f.cantidad)) ? `Se crearán ${f.cantidad}: ${consecutivos(f.codigo, Number(f.cantidad))}. La serie se registra después en cada uno.` : 'Ej. 10 aires iguales: el código debe terminar en número (AA-001).'}>
              {(i) => <Input id={i} type="number" min="1" max="100" {...bind('cantidad')} required />}
            </Field>
          ) : null}
          <Field label="Fabricante">{(i) => <Input id={i} {...bind('fabricante')} maxLength={100} />}</Field>
          <Field label="Modelo">{(i) => <Input id={i} {...bind('modelo')} maxLength={100} />}</Field>
          {Number(f.cantidad) > 1 ? null : <Field label="N.° de serie">{(i) => <Input id={i} {...bind('serie')} maxLength={100} />}</Field>}
          <Field label="Código SAP" hint="Opcional, para la futura integración.">{(i) => <Input id={i} {...bind('codigoSap')} maxLength={40} />}</Field>
          <Field label="Área *" hint="Escriba una nueva o elija una existente.">
            {(i) => (
              <>
                <Input id={i} {...bind('area')} required minLength={2} maxLength={100} list="areas-list" />
                <datalist id="areas-list">{areas.data?.map((a) => <option key={a} value={a} />)}</datalist>
              </>
            )}
          </Field>
          <Field label="Ubicación">{(i) => <Input id={i} {...bind('ubicacion')} maxLength={150} />}</Field>
          <Field label="Fecha de compra">{(i) => <Input id={i} type="date" {...bind('fechaCompra')} />}</Field>
          <Field label="Fin de garantía">{(i) => <Input id={i} type="date" {...bind('fechaFinGarantia')} min={f.fechaCompra || undefined} />}</Field>
          <Field label="Estado">
            {(i) => (
              <Select id={i} {...bind('estado')}>
                {(Object.keys(ESTADO_LABEL) as EstadoActivo[]).map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Notas" full>{(i) => <Textarea id={i} {...bind('notas')} maxLength={4000} />}</Field>
        </div>
        {localError ? <div className="alert alert-bad">{localError}</div> : null}
        {save.isError ? <ErrorBox error={save.error} /> : null}
        <div className="form-actions">
          <Link to={editing ? `/maquinas/${id}` : '/maquinas'} className="btn btn-ghost">Cancelar</Link>
          <Button type="submit" busy={save.isPending}>{editing ? 'Guardar cambios' : Number(f.cantidad) > 1 ? `Registrar ${f.cantidad} equipos` : 'Registrar máquina'}</Button>
        </div>
      </form>
    </>
  );
}
