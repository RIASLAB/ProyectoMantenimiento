import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import { Button, ErrorBox, Field, Input, Modal } from './ui';

type Equipo = { id: string; codigo: string; nombre: string; area: string; ubicacion: string | null };

/** Instalar una máquina que estaba en bodega: se elige el área y la ubicación; queda operativa y recibe sus preventivos. */
export function InstallModal({ equipo, onClose, onDone }: { equipo: Equipo | null; onClose: () => void; onDone?: (r: { planesAplicados: number }) => void }) {
  const qc = useQueryClient();
  const areas = useQuery({ queryKey: ['areas'], queryFn: () => api.get<string[]>('/activos/areas'), enabled: !!equipo });
  const [area, setArea] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  useEffect(() => {
    if (!equipo) return;
    setArea(equipo.area);
    setUbicacion('');
  }, [equipo]);
  const m = useMutation({
    mutationFn: () => api.post<{ planesAplicados: number }>(`/activos/${equipo!.id}/instalar`, { area, ubicacion: ubicacion || null }),
    onSuccess: (r) => {
      for (const k of ['activos', 'activo', 'areas', 'planes', 'ordenes', 'tipos-equipo', 'bitacora']) qc.invalidateQueries({ queryKey: [k] });
      onDone?.(r);
      cerrar();
    },
  });
  const cerrar = () => { m.reset(); onClose(); };
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <Modal open={!!equipo} title={`Instalar ${equipo?.codigo ?? ''}`} onClose={cerrar}
      footer={<><Button variant="ghost" type="button" onClick={cerrar}>Cancelar</Button><Button type="submit" form="instalar-form" busy={m.isPending}>Instalar</Button></>}>
      <form id="instalar-form" className="stack" onSubmit={submit}>
        <p className="muted" style={{ margin: 0 }}>{equipo?.nombre} sale de bodega y queda operativo. Si su tipo tiene preventivos, se le programan desde ahora.</p>
        <Field label="Área donde se instala *">
          {(i) => (
            <>
              <Input id={i} value={area} onChange={(e) => setArea(e.target.value)} required minLength={2} maxLength={100} list="areas-instalar" />
              <datalist id="areas-instalar">{areas.data?.map((a) => <option key={a} value={a} />)}</datalist>
            </>
          )}
        </Field>
        <Field label="Ubicación" hint="Ej. Sala de molienda 2">{(i) => <Input id={i} value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} maxLength={150} />}</Field>
        {m.isError ? <ErrorBox error={m.error} /> : null}
      </form>
    </Modal>
  );
}
