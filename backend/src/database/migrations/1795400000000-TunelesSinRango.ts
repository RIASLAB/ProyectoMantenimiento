import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * D-46: corrección de D-42. Calidad no pidió dejar de registrar los túneles de congelación sino quitarles el rango:
 * vuelven a la ronda y a la planilla, sin límites (la lectura se anota pero no se marca fuera de rango).
 */
export class TunelesSinRango1795400000000 implements MigrationInterface {
  name = 'TunelesSinRango1795400000000';

  public async up(q: QueryRunner): Promise<void> {
    const tuneles: Array<{ id: string; cuarto: string; planta: string; vigente: boolean; minimo: string | null; maximo: string | null }> = await q.query(
      `SELECT p.id, a.nombre AS cuarto, a.area AS planta, p.vigente, p.minimo, p.maximo
         FROM puntos_control p JOIN activos a ON a.id = p.activo_id
        WHERE a.codigo LIKE 'CF-%' AND translate(upper(a.nombre), 'ÚÙ', 'UU') LIKE '%TUNEL%'`,
    );
    const cambios = tuneles.filter((t) => !t.vigente || t.minimo !== null || t.maximo !== null);
    if (!cambios.length) return;
    const n = (v: string | null) => (v === null ? '—' : String(Number(v)));
    const antes = (t: (typeof tuneles)[number]) =>
      [t.vigente ? null : 'no se registraba', t.minimo !== null || t.maximo !== null ? `${n(t.minimo)} a ${n(t.maximo)} °C` : null].filter(Boolean).join('; ');
    await q.query(`UPDATE puntos_control SET vigente = true, minimo = NULL, maximo = NULL, actualizado_en = now() WHERE id = ANY($1::uuid[])`, [cambios.map((t) => t.id)]);
    await q.query(
      `INSERT INTO bitacora (usuario_id, accion, entidad, entidad_id, detalle) VALUES (NULL, 'RANGOS_TEMPERATURA_ACTUALIZADOS', 'calidad', NULL, $1)`,
      [JSON.stringify({
        origen: 'Actualización del sistema (corrección pedida por calidad: los túneles se registran sin rango)',
        cambios: cambios.map((t) => ({ cuarto: t.cuarto, planta: t.planta, antes: antes(t), despues: 'Se registra, sin rango' })),
      })],
    );
  }

  public async down(): Promise<void> {
    // El estado anterior queda en la bitácora.
  }
}
