import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Select } from './ui';

/** D-45: plantas conocidas (las de las máquinas y las de los formatos de calidad). */
export function usePlantas() {
  return useQuery({ queryKey: ['plantas'], queryFn: () => api.get<string[]>('/activos/plantas'), staleTime: 5 * 60_000 });
}

/** Selector de planta. `vacio` es el texto de la opción sin planta. */
export function PlantaSelect({ id, value, onChange, vacio = 'Sin asignar', required }: { id?: string; value: string; onChange: (v: string) => void; vacio?: string; required?: boolean }) {
  const q = usePlantas();
  const lista = [...new Set([...(q.data ?? []), ...(value ? [value] : [])])].sort((a, b) => a.localeCompare(b));
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="">{vacio}</option>
      {lista.map((p) => <option key={p} value={p}>{p}</option>)}
    </Select>
  );
}
