import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { SparePart } from '../../api/types';
import { Button, ErrorBox, Field, Icon, Input, PageHeader, Spinner } from '../../components/ui';

const UNIDADES = ['UND', 'JGO', 'M', 'KG', 'L', 'GAL', 'PAR', 'ROLLO', 'CAJA'];

export function PartForm() {
  const { id } = useParams<{ id: string }>();
  const editing = !!id;
  const nav = useNavigate();
  const qc = useQueryClient();
  const [f, setF] = useState({ codigo: '', codigoSap: '', descripcion: '', unidad: 'UND', ubicacion: '', stockMinimo: '0', activo: true });

  const current = useQuery({ queryKey: ['repuesto', id], queryFn: () => api.get<SparePart>(`/repuestos/${id}`), enabled: editing });
  useEffect(() => {
    const p = current.data;
    if (p) setF({ codigo: p.codigo, codigoSap: p.codigoSap ?? '', descripcion: p.descripcion, unidad: p.unidad, ubicacion: p.ubicacion ?? '', stockMinimo: String(p.stockMinimo), activo: p.activo });
  }, [current.data]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        codigo: f.codigo,
        codigoSap: f.codigoSap || (editing ? null : undefined),
        descripcion: f.descripcion,
        unidad: f.unidad,
        ubicacion: f.ubicacion || (editing ? null : undefined),
        stockMinimo: Number(f.stockMinimo || 0),
        ...(editing ? { activo: f.activo } : {}),
      };
      return editing ? api.patch<SparePart>(`/repuestos/${id}`, body) : api.post<SparePart>('/repuestos', body);
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['repuestos'] });
      qc.setQueryData(['repuesto', p.id], p);
      nav(`/inventario/${p.id}`, { replace: true });
    },
  });

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };

  if (editing && current.isPending) return <Spinner />;
  if (editing && current.isError) return <ErrorBox error={current.error} />;

  return (
    <>
      <PageHeader
        back={<Link to={editing ? `/inventario/${id}` : '/inventario'} className="back-link"><Icon name="back" size={18} /> {editing ? 'Volver al repuesto' : 'Inventario'}</Link>}
        title={editing ? `Editar ${current.data?.codigo}` : 'Nuevo repuesto'}
        subtitle={editing ? undefined : 'El stock inicial se carga después con un movimiento de entrada o un conteo físico.'}
      />
      <form className="card form" onSubmit={submit}>
        <div className="form-grid">
          <Field label="Código *" hint="Se guarda en mayúsculas.">
            {(i) => <Input id={i} value={f.codigo} onChange={set('codigo')} required pattern="[A-Za-z0-9._\/\-]{2,40}" title="Letras, números, punto, guion o barra (2 a 40)" />}
          </Field>
          <Field label="Código SAP">{(i) => <Input id={i} value={f.codigoSap} onChange={set('codigoSap')} maxLength={40} />}</Field>
          <Field label="Descripción *" full>{(i) => <Input id={i} value={f.descripcion} onChange={set('descripcion')} required minLength={2} maxLength={200} />}</Field>
          <Field label="Unidad de medida *">
            {(i) => (
              <>
                <Input id={i} value={f.unidad} onChange={set('unidad')} required maxLength={20} list="unidades" />
                <datalist id="unidades">{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
              </>
            )}
          </Field>
          <Field label="Stock mínimo" hint="Por debajo de este valor se marca como bajo el mínimo.">
            {(i) => <Input id={i} type="number" inputMode="decimal" min="0" step="0.001" value={f.stockMinimo} onChange={set('stockMinimo')} />}
          </Field>
          <Field label="Ubicación en bodega" full>{(i) => <Input id={i} value={f.ubicacion} onChange={set('ubicacion')} maxLength={100} />}</Field>
          {editing ? (
            <label className="toggle full">
              <input type="checkbox" checked={f.activo} onChange={(e) => setF((s) => ({ ...s, activo: e.target.checked }))} />
              Repuesto activo (los inactivos no admiten movimientos)
            </label>
          ) : null}
        </div>
        {save.isError ? <ErrorBox error={save.error} /> : null}
        <div className="form-actions">
          <Link to={editing ? `/inventario/${id}` : '/inventario'} className="btn btn-ghost">Cancelar</Link>
          <Button type="submit" busy={save.isPending}>{editing ? 'Guardar cambios' : 'Registrar repuesto'}</Button>
        </div>
      </form>
    </>
  );
}
