import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Retrasa un valor para no consultar la API en cada tecla. */
export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Filtros de una lista guardados en la URL (para que "Atrás" conserve la búsqueda).
 * El estado vive localmente y la URL se actualiza después: si los campos se controlaran
 * directamente desde la URL, el router los actualiza en una transición y el texto o el
 * checkbox "saltan" mientras el usuario escribe.
 */
export function useUrlFilters<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams();
  const [values, setValues] = useState(() => Object.fromEntries(keys.map((k) => [k, params.get(k) ?? ''])) as Record<K, string>);

  useEffect(() => {
    const p = new URLSearchParams();
    for (const k of keys) if (values[k]) p.set(k, values[k]);
    if (p.toString() !== params.toString()) setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  const set = (k: K, v: string) => setValues((s) => ({ ...s, [k]: v }));
  return [values, set] as const;
}
