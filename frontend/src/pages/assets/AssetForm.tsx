import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { Asset, EstadoActivo } from '../../api/types';
import { Button, ErrorBox, Field, Icon, Input, PageHeader, Select, Spinner, Textarea } from '../../components/ui';
import { ESTADO_LABEL } from '../../format';

type FormState = Record<
  'codigo' | 'codigoSap' | 'nombre' | 'modelo' | 'fabricante' | 'serie' | 'area' | 'ubicacion' | 'fechaCompra' | 'fechaFinGarantia' | 'notas',
  string
> & { estado: EstadoActivo };

const EMPTY: FormState = {
  codigo: '', codigoSap: '', nombre: '', modelo: '', fabricante: '', serie: '', area: '', ubicacion: '',
  fechaCompra: '', fechaFinGarantia: '', notas: '', estado: 'OPERATIVO',
};

export function AssetForm() {
  const { id } = useParams<{ id: string }>();
  const editing = !!id;
  const nav = useNavigate();
  const qc = useQueryClient();
  const [f, setF] = useState<FormState>(EMPTY);
  const [localError, setLocalError] = useState('');

  const current = useQuery({ queryKey: ['activo', id], queryFn: () => api.get<Asset>(`/activos/${id}`), enabled: editing });
  const areas = useQuery({ queryKey: ['areas'], queryFn: () => api.get<string[]>('/activos/areas') });

  useEffect(() => {
    if (!current.data) return;
    const a = current.data;
    setF({
      codigo: a.codigo, codigoSap: a.codigoSap ?? '', nombre: a.nombre, modelo: a.modelo ?? '', fabricante: a.fabricante ?? '',
      serie: a.serie ?? '', area: a.area, ubicacion: a.ubicacion ?? '', fechaCompra: a.fechaCompra ?? '',
      fechaFinGarantia: a.fechaFinGarantia ?? '', notas: a.notas ?? '', estado: a.estado,
    });
  }, [current.data]);

  const save = useMutation({
    mutationFn: () => {
      // Los campos vacíos se envían como null para poder borrarlos al editar.
      const body: Record<string, unknown> = { ...f };
      for (const k of ['codigoSap', 'modelo', 'fabricante', 'serie', 'ubicacion', 'fechaCompra', 'fechaFinGarantia', 'notas']) {
        if (body[k] === '') body[k] = editing ? null : undefined;
      }
      return editing ? api.patch<Asset>(`/activos/${id}`, body) : api.post<Asset>('/activos', body);
    },
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ['activos'] });
      qc.invalidateQueries({ queryKey: ['areas'] });
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
          <Field label="Fabricante">{(i) => <Input id={i} {...bind('fabricante')} maxLength={100} />}</Field>
          <Field label="Modelo">{(i) => <Input id={i} {...bind('modelo')} maxLength={100} />}</Field>
          <Field label="N.° de serie">{(i) => <Input id={i} {...bind('serie')} maxLength={100} />}</Field>
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
          <Button type="submit" busy={save.isPending}>{editing ? 'Guardar cambios' : 'Registrar máquina'}</Button>
        </div>
      </form>
    </>
  );
}
