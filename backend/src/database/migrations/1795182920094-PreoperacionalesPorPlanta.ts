import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * D-43: un formato puede llenarse en varias plantas (Excel "Preoperacionales de equipos" de Pollo, Desposte y
 * Salsamentaria entregados por calidad en noviembre de 2026: los formatos son los mismos en las plantas que los usan).
 * Pasa la planta de cada plantilla a `plantas`, asigna las plantas de cada preoperacional y, si los formatos de la
 * planta ya estaban cargados, agrega los tres nuevos de Salsamentaria (mezcladora, embutidora y horno).
 */
const P = 'Planta Pollo';
const D = 'Planta Desposte';
const S = 'Planta Salsamentaria';
const PLANTAS: Record<string, string[]> = {
  'Preoperacional cubicadora': [D],
  'Preoperacional tajadora': [D, S],
  'Preoperacional marinadora': [P, D],
  'Preoperacional sierra sin fin': [D, S],
  'Preoperacional molino': [D, S],
  'Preoperacional compresor de aire': [P, D],
  'Preoperacional lavadora de canastilla': [P, D],
  'Preoperacional empacadora al vacio': [D, S],
  'Preoperacional termoformadora': [D, S],
  'Preoperacional porcionadora': [D],
  'Preoperacional descuerador': [D],
  'Preoperacional afilador': [D],
  'Preoperacional basculas': [P, D, S],
};

const NUEVOS: Array<{ nombre: string; descripcion: string; recomendacion: string | null; codigo: string; version: string; fechaElaboracion: string | null; fechaActualizacion: string | null; items: unknown[] }> = [
  {
    "nombre": "Preoperacional mezcladora",
    "descripcion": "Periodicidad de uso: diario. Califique cada punto: B bueno, R regular, M malo, No tiene, NA no aplica.",
    "recomendacion": "No mojar la unidad de mando e instalar bolsa desecantes.",
    "codigo": "AC-PMT-FR072",
    "version": "3",
    "fechaElaboracion": "2020-11-10",
    "fechaActualizacion": "2024-11-15",
    "items": [
      {
        "texto": "Limpieza general del equipo.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "194eb3ef"
      },
      {
        "texto": "Motor.Conexiones electricas. Polo a tierra.Aislamiento .",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "0dbdc513"
      },
      {
        "texto": "Dispositivos de proteccion. Puertas-Estructura de la maquina",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "3c435f4c"
      },
      {
        "texto": "Inspeccion de las cuchillas y portacuchillas. Control del grado de afilado",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "85c21151"
      },
      {
        "texto": "Comprobar errores en los rotulos de aviso y de indicacion en la maquina.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "5982313e"
      },
      {
        "texto": "Verificar el funcionamiento del freno",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "aae542a1"
      },
      {
        "texto": "Estado del embolo de prensado",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "8b5239fb"
      },
      {
        "texto": "Estado y cierre del cargador",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "d1fd2b42"
      },
      {
        "texto": "Puerta de la caja portacuchillas",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "493de140"
      },
      {
        "texto": "Barras del cierre de la reja",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "3340a3f8"
      },
      {
        "texto": "Frenos de la maquina.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "eac2126c"
      },
      {
        "texto": "Elementos de sujeccion (Tuercas-tornillos-mariposas-seguros axiales).",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "6c8dacb1"
      },
      {
        "texto": "Interruptor de puesta en marcha y apagado.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "5561797b"
      },
      {
        "texto": "Panel de mando",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "66cc71e1"
      },
      {
        "texto": "Los puntos de peligro y partes en movimientos estan señalizadas.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "3003b874"
      },
      {
        "texto": "Presenta bordes cortantes o superficies irregulares.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "ec470373"
      },
      {
        "texto": "El operador tiene elementos de proteccion personal.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "d6cd305c"
      },
      {
        "texto": "El area es apta para realizar las actividades.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "3aa84476"
      },
      {
        "texto": "Extintor cerca del equipo.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "7128f82f"
      },
      {
        "texto": "La maquina se encuentra apta para su utilizacion",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "a4a706f4"
      }
    ]
  },
  {
    "nombre": "Preoperacional embutidora",
    "descripcion": "Periodicidad de uso: diario. Califique cada punto: B bueno, R regular, M malo, No tiene, NA no aplica.",
    "recomendacion": "No mojar la unidad de mando e instalar bolsa desecantes.",
    "codigo": "AC-PMT-FR072",
    "version": "3",
    "fechaElaboracion": "2020-11-10",
    "fechaActualizacion": "2024-11-15",
    "items": [
      {
        "texto": "Limpieza general del equipo.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "9e9fe9fd"
      },
      {
        "texto": "Motor.Conexiones electricas. Polo a tierra.Aislamiento .",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "d2640327"
      },
      {
        "texto": "Dispositivos de proteccion. Puertas-Estructura de la maquina",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "66185fed"
      },
      {
        "texto": "Inspeccion de las cuchillas y portacuchillas. Control del grado de afilado",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "92aee8f4"
      },
      {
        "texto": "Comprobar errores en los rotulos de aviso y de indicacion en la maquina.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "3abab3ce"
      },
      {
        "texto": "Verificar el funcionamiento del freno",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "a967e5b9"
      },
      {
        "texto": "Estado del embolo de prensado",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "d7915944"
      },
      {
        "texto": "Estado y cierre del cargador",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "64568fc5"
      },
      {
        "texto": "Puerta de la caja portacuchillas",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "83b43d98"
      },
      {
        "texto": "Barras del cierre de la reja",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "34c1ceef"
      },
      {
        "texto": "Frenos de la maquina.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "30ff2936"
      },
      {
        "texto": "Elementos de sujeccion (Tuercas-tornillos-mariposas-seguros axiales).",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "e2df45b0"
      },
      {
        "texto": "Interruptor de puesta en marcha y apagado.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "28a12a50"
      },
      {
        "texto": "Panel de mando",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "b6a3de10"
      },
      {
        "texto": "Los puntos de peligro y partes en movimientos estan señalizadas.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "2736671c"
      },
      {
        "texto": "Presenta bordes cortantes o superficies irregulares.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "13390278"
      },
      {
        "texto": "El operador tiene elementos de proteccion personal.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "8c55afdd"
      },
      {
        "texto": "El area es apta para realizar las actividades.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "aeb6edf0"
      },
      {
        "texto": "Extintor cerca del equipo.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "4e1532e2"
      },
      {
        "texto": "La maquina se encuentra apta para su utilizacion",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "e3308c7f"
      }
    ]
  },
  {
    "nombre": "Preoperacional horno",
    "descripcion": "Periodicidad de uso: diario. Califique cada punto: B bueno, R regular, M malo, No tiene, NA no aplica.",
    "recomendacion": "No mojar la unidad de mando e instalar bolsa desecantes.",
    "codigo": "AC-PMT-FR072",
    "version": "3",
    "fechaElaboracion": "2020-11-10",
    "fechaActualizacion": "2024-11-15",
    "items": [
      {
        "texto": "Limpieza general del equipo.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "07ab3c24"
      },
      {
        "texto": "Motor.Conexiones electricas. Polo a tierra.Aislamiento .",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "023d1263"
      },
      {
        "texto": "Dispositivos de proteccion. Puertas-Estructura de la maquina",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "d0bab9d0"
      },
      {
        "texto": "Inspeccion de las cuchillas y portacuchillas. Control del grado de afilado",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "e20010d8"
      },
      {
        "texto": "Comprobar errores en los rotulos de aviso y de indicacion en la maquina.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "890be913"
      },
      {
        "texto": "Verificar el funcionamiento del freno",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "c98a2b16"
      },
      {
        "texto": "Estado del embolo de prensado",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "3dabe93f"
      },
      {
        "texto": "Estado y cierre del cargador",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "b53eddf5"
      },
      {
        "texto": "Puerta de la caja portacuchillas",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "788fd3aa"
      },
      {
        "texto": "Barras del cierre de la reja",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "93ef8cc1"
      },
      {
        "texto": "Frenos de la maquina.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "00596ba4"
      },
      {
        "texto": "Elementos de sujeccion (Tuercas-tornillos-mariposas-seguros axiales).",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "ed087a90"
      },
      {
        "texto": "Interruptor de puesta en marcha y apagado.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "51943ea8"
      },
      {
        "texto": "Panel de mando",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "4702885e"
      },
      {
        "texto": "Los puntos de peligro y partes en movimientos estan señalizadas.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "152c94b2"
      },
      {
        "texto": "Presenta bordes cortantes o superficies irregulares.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "beb2f234"
      },
      {
        "texto": "El operador tiene elementos de proteccion personal.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "4fd9b81c"
      },
      {
        "texto": "El area es apta para realizar las actividades.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "4eba0475"
      },
      {
        "texto": "Extintor cerca del equipo.",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "a2e0ca95"
      },
      {
        "texto": "La maquina se encuentra apta para su utilizacion",
        "tipo": "ESCALA",
        "obligatorio": true,
        "id": "76dca77a"
      }
    ]
  }
];

export class PreoperacionalesPorPlanta1795182920094 implements MigrationInterface {
  name = 'PreoperacionalesPorPlanta1795182920094';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "plantillas_checklist" ADD "plantas" text array NOT NULL DEFAULT '{}'`);
    await q.query(`UPDATE plantillas_checklist SET plantas = ARRAY[area] WHERE area IS NOT NULL AND btrim(area) <> ''`);
    for (const [nombre, plantas] of Object.entries(PLANTAS)) {
      await q.query(`UPDATE plantillas_checklist SET plantas = $2, area = $3 WHERE nombre = $1`, [nombre, plantas, plantas.join(' · ')]);
    }
    await q.query(
      `UPDATE plantillas_checklist SET descripcion = replace(descripcion, 'Equipo de referencia: FUSHENG · FU22A.', 'Equipos de referencia: FUSHENG · FU22A (Planta Desposte), SHANGHAI ROTORCOMP · LGCD-37D B VP (Planta Pollo).')
        WHERE nombre = 'Preoperacional compresor de aire'`,
    );
    const cargados = (await q.query(`SELECT 1 FROM plantillas_checklist WHERE nombre = 'Preoperacional cubicadora'`)).length > 0;
    if (!cargados) return; // Base nueva: los carga `npm run formatos:cargar` con todo lo demás.
    for (const n of NUEVOS) {
      await q.query(
        `INSERT INTO plantillas_checklist (nombre, area, plantas, descripcion, recomendacion, codigo, version, fecha_elaboracion, fecha_actualizacion, items, semanal)
         SELECT $1::varchar, $2, $3::text[], $4, $5, $6, $7, $8::date, $9::date, $10::jsonb, true
          WHERE NOT EXISTS (SELECT 1 FROM plantillas_checklist WHERE nombre = $1::varchar)`,
        [n.nombre, S, [S], n.descripcion, n.recomendacion, n.codigo, n.version, n.fechaElaboracion, n.fechaActualizacion, JSON.stringify(n.items)],
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "plantillas_checklist" DROP COLUMN "plantas"`);
  }
}
