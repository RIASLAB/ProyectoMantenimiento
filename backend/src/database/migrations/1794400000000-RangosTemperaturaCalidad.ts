import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * D-42: rangos de temperatura que pidió calidad (noviembre de 2026) y fin del registro de los túneles.
 * Solo toca los cuartos cargados de los formatos (código CF-…) cuyo nombre es de uno de los grupos que cambiaron;
 * los demás puntos (y los creados a mano) quedan como estén. Las lecturas ya hechas conservan el rango con que se
 * evaluaron. La regla queda copiada aquí para que la migración no cambie si luego cambia la del cargador.
 */
const GRUPOS: Array<{ grupo: string; patron: RegExp; minimo: number; maximo: number }> = [
  { grupo: 'Cuarto de cabezas y pezuñas', patron: /CABEZA/, minimo: -8, maximo: 6 },
  { grupo: 'Subproducto y muelles', patron: /SUBPRODUCTO|^MUELLE\b/, minimo: -4, maximo: 6 },
  { grupo: 'Salas, marinado y pasillos', patron: /^(SALA|PASILLO|PASSILLO)\b|MARINADO/, minimo: 4, maximo: 10 },
  { grupo: 'Frizado', patron: /FRISS|FRIZZ|FRIZADO|FRIZ\b/, minimo: -25, maximo: -10 },
  { grupo: 'Conservación', patron: /CONSERVACION/, minimo: -24, maximo: -14 },
  { grupo: 'Refrigeración', patron: /REFRIGERACION/, minimo: -8, maximo: 4 },
];

const normalizar = (s: string) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export class RangosTemperaturaCalidad1794400000000 implements MigrationInterface {
  name = 'RangosTemperaturaCalidad1794400000000';

  public async up(q: QueryRunner): Promise<void> {
    const puntos: Array<{ id: string; cuarto: string; area: string; minimo: string | null; maximo: string | null; vigente: boolean }> = await q.query(
      `SELECT p.id, a.nombre AS cuarto, a.area, p.minimo, p.maximo, p.vigente
         FROM puntos_control p JOIN activos a ON a.id = p.activo_id
        WHERE a.codigo LIKE 'CF-%'`,
    );
    const cambios: Array<Record<string, unknown>> = [];
    for (const p of puntos) {
      const n = normalizar(p.cuarto);
      if (/TUNEL/.test(n)) {
        if (p.vigente) {
          await q.query(`UPDATE puntos_control SET vigente = false, actualizado_en = now() WHERE id = $1`, [p.id]);
          cambios.push({ cuarto: p.cuarto, planta: p.area, cambio: 'Ya no se registra (túnel)' });
        }
        continue;
      }
      const g = GRUPOS.find((x) => x.patron.test(n));
      if (!g) continue;
      const antes = [p.minimo === null ? null : Number(p.minimo), p.maximo === null ? null : Number(p.maximo)];
      if (antes[0] === g.minimo && antes[1] === g.maximo) continue;
      await q.query(`UPDATE puntos_control SET minimo = $2, maximo = $3, actualizado_en = now() WHERE id = $1`, [p.id, g.minimo, g.maximo]);
      cambios.push({ cuarto: p.cuarto, planta: p.area, grupo: g.grupo, antes: `${antes[0] ?? '—'} a ${antes[1] ?? '—'} °C`, despues: `${g.minimo} a ${g.maximo} °C` });
    }
    if (cambios.length) {
      await q.query(
        `INSERT INTO bitacora (usuario_id, accion, entidad, entidad_id, detalle) VALUES (NULL, 'RANGOS_TEMPERATURA_ACTUALIZADOS', 'calidad', NULL, $1)`,
        [JSON.stringify({ origen: 'Actualización del sistema (rangos pedidos por calidad)', cambios })],
      );
    }
  }

  public async down(): Promise<void> {
    // Los rangos anteriores quedan en la bitácora; no se devuelven solos.
  }
}
