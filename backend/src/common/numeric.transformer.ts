import { ValueTransformer } from 'typeorm';

/** PostgreSQL devuelve `numeric` como string; lo convertimos a number. */
export const numeric: ValueTransformer = {
  to: (v?: number | null) => v,
  from: (v?: string | null) => (v === null || v === undefined ? v : Number(v)),
};
