/** Semanas ISO 8601 (lunes a domingo; la semana 1 es la que tiene el primer jueves del año), como el planeador de la planta. */

const DIA = 86_400_000;
const utc = (f: string) => Date.parse(`${f}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export function semanaIso(fecha: string): { anio: number; semana: number } {
  const t = utc(fecha);
  const dia = (new Date(t).getUTCDay() + 6) % 7; // 0 = lunes
  const jueves = t + (3 - dia) * DIA;
  const anio = new Date(jueves).getUTCFullYear();
  const semana = 1 + Math.floor((jueves - Date.UTC(anio, 0, 1)) / (7 * DIA));
  return { anio, semana };
}

export const semanasDelAnio = (anio: number) => semanaIso(`${anio}-12-28`).semana;

/** Lunes de la semana `n` del año ISO. */
export function lunesDeSemana(anio: number, n: number) {
  const ene4 = Date.UTC(anio, 0, 4);
  const dia = (new Date(ene4).getUTCDay() + 6) % 7;
  return iso(ene4 - dia * DIA + (n - 1) * 7 * DIA);
}

/** Mes (1-12) al que pertenece la semana: el de su jueves. */
export const mesDeSemana = (anio: number, n: number) => new Date(utc(lunesDeSemana(anio, n)) + 3 * DIA).getUTCMonth() + 1;
