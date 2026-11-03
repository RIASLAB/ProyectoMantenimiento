/**
 * Formatos de mantenimiento de Nutrialimentos Cárnicos (archivos FORMATOS MANTENIMIENTO entregados por la empresa),
 * convertidos a datos para cargarlos en el sistema con `npm run formatos:cargar`.
 * Generado a partir de los Excel; para cambiar un formato ya cargado, edítelo en la aplicación.
 */
import type { ChecklistItem } from '../../quality/quality.entities';

export interface PlantillaFormato {
  nombre: string;
  area: string | null;
  descripcion: string;
  recomendacion: string | null;
  codigo: string;
  version: string;
  fechaElaboracion: string | null;
  fechaActualizacion: string | null;
  items: Array<Omit<ChecklistItem, 'id'>>;
}

/** Preoperacionales por máquina (calificación B / R / M / No tiene / NA). */
export const PREOPERACIONALES: PlantillaFormato[] = [
  {
    nombre: "Preoperacional cubicadora",
    area: "Planta Desposte",
    descripcion: "Periodicidad de uso: diario. Califique cada punto: B bueno, R regular, M malo, No tiene, NA no aplica.",
    recomendacion: "No mojar la unidad de mando e instalar bolsa desecantes.",
    codigo: "AC-PMT-FR072",
    version: "3",
    fechaElaboracion: "2020-11-10",
    fechaActualizacion: "2024-11-15",
    items: [
      {
        texto: "Limpieza general del equipo.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Motor.Conexiones electricas. Polo a tierra.Aislamiento .",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Dispositivos de proteccion. Puertas-Estructura de la maquina",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Inspeccion de las cuchillas y portacuchillas. Control del grado de afilado",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Comprobar errores en los rotulos de aviso y de indicacion en la maquina.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Verificar el funcionamiento del freno",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Estado del embolo de prensado",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Estado y cierre del cargador",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Puerta de la caja portacuchillas",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Barras del cierre de la reja",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Frenos de la maquina.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Elementos de sujeccion (Tuercas-tornillos-mariposas-seguros axiales).",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Interruptor de puesta en marcha y apagado.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Panel de mando",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Los puntos de peligro y partes en movimientos estan señalizadas.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Presenta bordes cortantes o superficies irregulares.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El operador tiene elementos de proteccion personal.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El area es apta para realizar las actividades.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Extintor cerca del equipo.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "La maquina se encuentra apta para su utilizacion",
        tipo: "ESCALA",
        obligatorio: true
      }
    ]
  },
  {
    nombre: "Preoperacional tajadora",
    area: "Planta Desposte",
    descripcion: "Periodicidad de uso: diario. Califique cada punto: B bueno, R regular, M malo, No tiene, NA no aplica.",
    recomendacion: "Procesar solo producto refrigerado",
    codigo: "AC-PMT-FR072",
    version: "3",
    fechaElaboracion: "2020-11-10",
    fechaActualizacion: "2024-11-15",
    items: [
      {
        texto: "Limpieza general del equipo.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Conexiones electricas. Polo a tierra.Aislamiento .",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Dispositivos de proteccion.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Rodillo de acero segmentado",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Cinta transportadora de ingreso y dispositivos guias plasticos",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Cinta transportadora de salida",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Capucha y cubierta soldada. Placa rasadora guia",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Elementos de sujeccion (Tuercas-tornillos-Mariposas).",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Portacuchillas y afilado de la cuchilla.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Frenos de la maquina.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Interruptor de puesta en marcha y apagado.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Sensores de seguridad",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Boton de emergencia.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Pulsadores y señales luminosas",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Los puntos de peligro y partes en movimientos estan señalizadas.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Presenta bordes cortantes o superficies irregulares.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El operador tiene elementos de proteccion personal.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El area es apta para realizar las actividades.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Extintor cerca del equipo.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "La maquina se encuentra apta para su utilizacion",
        tipo: "ESCALA",
        obligatorio: true
      }
    ]
  },
  {
    nombre: "Preoperacional marinadora",
    area: "Planta Desposte",
    descripcion: "Periodicidad de uso: diario. Califique cada punto: B bueno, R regular, M malo, No tiene, NA no aplica. Equipo de referencia: HENNEKEN · HPI-450.",
    recomendacion: "Limpiar despues la maquina con agua despues del proceso.",
    codigo: "AC-PMT-FR080",
    version: "3",
    fechaElaboracion: "2020-11-10",
    fechaActualizacion: "2025-05-12",
    items: [
      {
        texto: "Limpieza general del equipo.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Motor, conexiones electricas, polo a tierra, aislamiento, uniones clavijas y cableado.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Dispositivos de proteccion, cubiertas,puertas y estructura de la maquina.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Conexiones del sistema neumàtico. Pistola para limpiar agujas.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Cilindro de levantamiento del cabezal de agujas y guia de los elevadores.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Inspeccione el bloque, los amortiguadores de goma,la agujas y la valvula de la salmuera.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Revizar las partes moviles de la maquina, lubricacion y nivel de aceite del lubricador.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Bomba de inyeccion.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Tanque agitador de salmuera. Conexiones.Rodillo. Interruptor on-off",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Estado de los elementos filtrantes.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Verifique y ajustar los estabilizadores de la maquina.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Verificar el estado de la tuberia, sellos,conexiones, valvulas y manometros.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Elementos de sujeccion (Tuercas-tornillos-Dados-Abrazaderas) y estado de las soldaduras.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Mecanismo de cargue y descargue de materia prima.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Panel de contro digital.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Interruptor de puesta en marcha y apagado.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Sensores de seguridad. Boton de emergencia. Boton de parada",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Los puntos de peligro y partes en movimientos estan señalizadas.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Presenta bordes cortantes o superficies irregulares.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El operador tiene elementos de proteccion personal.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El area es apta para realizar las actividades.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Extintor cerca del equipo.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "La maquina se encuentra apta para su utilizacion.",
        tipo: "ESCALA",
        obligatorio: true
      }
    ]
  },
  {
    nombre: "Preoperacional sierra sin fin",
    area: "Planta Desposte",
    descripcion: "Periodicidad de uso: diario. Califique cada punto: B bueno, R regular, M malo, No tiene, NA no aplica. Equipo de referencia: TORREY · SJ-295.",
    recomendacion: "Dientes de la cinta sierra siempre hacia abajo.",
    codigo: "AC-PMT-FR079",
    version: "4",
    fechaElaboracion: null,
    fechaActualizacion: null,
    items: [
      {
        texto: "El área de trabajo se encuentra despejada limpia y ordenada?",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El equipo se encuentra en optimas condiciones de limpieza para operar?",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Las conexiones y cableado eléctricos se encuentran en optimas condiciones?",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Los Dispositivos de proteccion, cubiertas, puertas y estructura de la maquina, están sujetos e impiden el desplazamiento?",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El Estado de la bandeja-Mesa-Guías es optimo y seguro?",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El Estado de la poleas se encuentran en óptimos para operar?",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Estado de la cinta?",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Al momento de encender la maquina percibe que el motor y rodamientos se encuentran en buen estado?",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Los Elementos de sujeción como (Tuercas-tornillos-Dados) se encuentran ajustados?",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Al verificar el estado del botón de puesta en marcha y apagado este se encuentra optimo para iniciar?",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El botón de parada de emergencia se encuentra en estado de funcionamiento?",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Los Sensores de seguridad funcionan correctamente?.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Los puntos de peligro y partes en movimientos están señalizados?.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "La maquina se encuentra apta para su utilización.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "La maquina presenta bordes cortantes o superficies irregulares que puedan ocasionar accidentes?.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Se cuenta con un extintor cerca del equipo a operar?.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El operador cuenta con todos los elementos de proteccion personal y estos están en buen estado?.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Certifico que me encuentro en optimo estado de salud para operar la maquina?",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Certifico que he sido instruido sobre los peligros asociados para operar la maquina",
        tipo: "ESCALA",
        obligatorio: true
      }
    ]
  },
  {
    nombre: "Preoperacional molino",
    area: "Planta Desposte",
    descripcion: "Periodicidad de uso: diario. Califique cada punto: B bueno, R regular, M malo, No tiene, NA no aplica. Equipo de referencia: KOLBE · TPM-160.",
    recomendacion: "No hacer funcionar nunca la máquina en vacío. Esta máquina permite únicamente picar carne fresca o semicongelada.",
    codigo: "AC-PMT-FR078",
    version: "3",
    fechaElaboracion: null,
    fechaActualizacion: null,
    items: [
      {
        texto: "El área de trabajo se encuentra despejada limpia y ordenada?",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El equipo se encuentra en optimas condiciones de limpieza para operar?",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Las conexiones y cableado eléctricos se encuentran en optimas condiciones?",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Los Dispositivos de proteccion, cubiertas, puertas y estructura de la maquina, están sujetos e impiden el desplazamiento?",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Los discos, cuchillas y sin fin se encuentran en optimas condiciones?",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "La tolva y mezclador se encuentran en optimas condciones?",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El dispositivo de afiliado del equipo es optimo?",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Al momento de encender la maquina percibe que el motor y rodamientos se encuentran en buen estado?",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Los Elementos de sujeción como (Tuercas-tornillos-Dados) se encuentran ajustados?",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Al verificar el estado del botón de puesta en marcha y apagado este se encuentra optimo para iniciar?",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El botón de parada de emergencia se encuentra en estado de funcionamiento?",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Los Sensores de seguridad funcionan correctamente?.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Los puntos de peligro y partes en movimientos están señalizados?.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "La maquina se encuentra apta para su utilización.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "La maquina presenta bordes cortantes o superficies irregulares que puedan ocasionar accidentes?.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Se cuenta con un extintor cerca del equipo a operar?.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El operador cuenta con todos los elementos de proteccion personal y estos están en buen estado?.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Certifico que me encuentro en optimo estado de salud para operar la maquina?",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Certifico que he sido instruido sobre los peligros asociados para operar la maquina",
        tipo: "ESCALA",
        obligatorio: true
      }
    ]
  },
  {
    nombre: "Preoperacional compresor de aire",
    area: "Planta Desposte",
    descripcion: "Periodicidad de uso: diario. Califique cada punto: B bueno, R regular, M malo, No tiene, NA no aplica. Equipo de referencia: FUSHENG · FU22A.",
    recomendacion: "Drenar dia por medio.",
    codigo: "AC-PMT-FR077",
    version: "3",
    fechaElaboracion: "2020-11-10",
    fechaActualizacion: "2025-05-12",
    items: [
      {
        texto: "Limpieza general del equipo.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Conexiones electricas. Polo a tierra. Aislamientos de los cables.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Dispositivos de proteccion, cubiertas,puertas y estructura de la maquina.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Nivel de aceite.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Conexiones-Mangueras-Racores-Abrazaderas.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Tablero de control.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Fugas en el equipo y linea del trasnporte de aire.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Elementos de medicion (Manometros-Termometros)",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Cilindro de almacenamiento.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Drenado del cilindro de almacenamiento",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Presion de succion secador de aire. (4.5-5.5 bar)",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Presion de condensacion secador de aire. (12-18 bar)",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Punto de rocio (azul-verde:Bueno)(Rojo:Malo)",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Ventiladores",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Elementos de sujeccion (Tuercas-tornillos-Dados).",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Interruptor de puesta en marcha y apagado.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Sensores de seguridad. Boton de emergencia. Boton de parada",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Los puntos de peligro y partes en movimientos estan señalizadas.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Presenta bordes cortantes o superficies irregulares.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El operador tiene elementos de proteccion personal.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El area es apta para realizar las actividades.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Extintor cerca del equipo.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "La maquina se encuentra apta para su utilizacion.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Horómetro (horas)",
        tipo: "NUMERO",
        obligatorio: false
      }
    ]
  },
  {
    nombre: "Preoperacional lavadora de canastilla",
    area: null,
    descripcion: "Periodicidad de uso: diario. Califique cada punto: B bueno, R regular, M malo, No tiene, NA no aplica. Equipo de referencia: XUCLA · ESFERA.",
    recomendacion: "Nunca meta las manos en el tanque de agua cuando la bomba se encuentre en operación.",
    codigo: "AC-PMT-FR076",
    version: "2",
    fechaElaboracion: "2020-11-10",
    fechaActualizacion: null,
    items: [
      {
        texto: "Limpieza general del equipo y filtros.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Conexiones electricas. Polo a tierra. Aislamientos de los cables.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Dispositivos de proteccion, cubiertas,puertas y estructura de la maquina.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Revise las conexiones de la maquina (Agua-Vapor). Valvulas de bola. Abrasaderas",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Estado de la cadena, protector y guia-Rodamiendo-Chumaceras.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Motobomba y carcasa",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Quemador.Exosto y aislamiento",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Tablero de control. Regulador de temperatura.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Tanque-tapa y flotador",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Boquillas de lavado",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Estado de la cortina de ingreso.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Motoreductor y carcasa.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Estado de la rejas de ingreso y salida.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Estado del tunel de salida de canastillas",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Elementos de sujeccion (Tuercas-tornillos-Dados).",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Interruptor de puesta en marcha y apagado. Arranque. Seccionador",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Sensores de seguridad. Boton de emergencia. Boton de parada",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Los puntos de peligro y partes en movimientos estan señalizadas.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Presenta bordes cortantes o superficies irregulares.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El operador tiene elementos de proteccion personal.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El area es apta para realizar las actividades.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Extintor cerca del equipo.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "La maquina se encuentra apta para su utilizacion.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Horómetro (horas)",
        tipo: "NUMERO",
        obligatorio: false
      }
    ]
  },
  {
    nombre: "Preoperacional empacadora al vacio",
    area: "Planta Desposte",
    descripcion: "Periodicidad de uso: diario. Califique cada punto: B bueno, R regular, M malo, No tiene, NA no aplica. Equipo de referencia: NEW DIAMOND VAC.",
    recomendacion: "El lado abierto de la bolsa podrà exceder el borde exterior del transportador guìa-bolsas por un maximo de 3 cm",
    codigo: "AC-PMT-FR075",
    version: "2",
    fechaElaboracion: "2020-11-10",
    fechaActualizacion: "2025-05-12",
    items: [
      {
        texto: "Limpieza general del equipo.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Motor.Conexiones electricas. Polo a tierra.Aislamiento .",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Dispositivos de proteccion, cubiertas,puertas y estructura de la maquina.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Conexiones del sistema neumàtico. Racore-Mangueras.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Cilindro de levantamiento de la campana.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Nivel de aceite de bomba de vacio",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Verificar funcionamiento de los pulsadores",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Grupo de barras sellantes.Cinta teflon. Resistencias.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Panel de contro digital. Temporizador multiescala.Tiempo de sellado-Vacio.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Elementos de sujeccion (Tuercas-tornillos-Dados).",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Interruptor de puesta en marcha y apagado.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Sensores de seguridad. Boton de emergencia. Boton de parada",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Los puntos de peligro y partes en movimientos estan señalizadas.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Presenta bordes cortantes o superficies irregulares.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El operador tiene elementos de proteccion personal.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El area es apta para realizar las actividades.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Extintor cerca del equipo.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "La maquina se encuentra apta para su utilizacion.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Horómetro (horas)",
        tipo: "NUMERO",
        obligatorio: false
      }
    ]
  },
  {
    nombre: "Preoperacional termoformadora",
    area: "Planta Desposte",
    descripcion: "Periodicidad de uso: diario. Califique cada punto: B bueno, R regular, M malo, No tiene, NA no aplica. Equipo de referencia: VARIOVAC · OPTIMUS.",
    recomendacion: "Lubricar las troqueladoras con grasa en base PTFE despues de cada limpieza.",
    codigo: "AC-PMT-FR074",
    version: "3",
    fechaElaboracion: "2020-11-10",
    fechaActualizacion: "2025-05-12",
    items: [
      {
        texto: "Limpieza general del equipo.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Motor.Conexiones electricas. Polo a tierra.Aislamiento .",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Dispositivos de proteccion, cubiertas,puertas y estructura de la maquina.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Estado de las cuchillas, troqueladora, guillotina. Control del grado de afilado.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Zona de aplicación, bastidor, mesa y estacion de prensado.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Estado de la cadena y guia. Cinta de evacuacion.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Nivel de aceite y agua de refrigeracion.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Valvulas de vacio, separador de liquidos y filtro de particulas.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Placas calefactoras, de llenado y divisor.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Soporte de rollo de laminas de entrada.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Generador de vapor",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Panel de contro digital.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Enrrollado de film de desperdicion.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Sistema de elevacion y herramienta de moldeado y sellado.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Elementos de sujeccion (Tuercas-tornillos-mariposas-seguros axiales).",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Interruptor de puesta en marcha y apagado.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Sensores de seguridad.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Frenos de la maquina.Boton de emergencia.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Los puntos de peligro y partes en movimientos estan señalizadas.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Presenta bordes cortantes o superficies irregulares.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El operador tiene elementos de proteccion personal.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El area es apta para realizar las actividades.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Extintor cerca del equipo.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "La maquina se encuentra apta para su utilizacion.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Horómetro (horas)",
        tipo: "NUMERO",
        obligatorio: false
      }
    ]
  },
  {
    nombre: "Preoperacional porcionadora",
    area: "Planta Desposte",
    descripcion: "Periodicidad de uso: diario. Califique cada punto: B bueno, R regular, M malo, No tiene, NA no aplica. Equipo de referencia: MARREL.",
    recomendacion: "No mojar la unidad de mando e instalar bolsa desecantes.",
    codigo: "AC-PMT-FR073",
    version: "2",
    fechaElaboracion: "2020-11-10",
    fechaActualizacion: null,
    items: [
      {
        texto: "Limpieza general del equipo.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Motor.Conexiones electricas. Polo a tierra.Aislamiento .",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Dispositivos de proteccion. Puertas-Estructura de la maquina",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Inspeccion de las cuchillas y portacuchillas. Control del grado de afilado",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Comprobar errores en los rotulos de aviso y de indicacion en la maquina.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Cinta transportadora",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Elementos de sujeccion (Tuercas-tornillos-mariposas-seguros axiales).",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Interruptor de puesta en marcha y apagado.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Sensores de seguridad",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Boton de emergencia.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Pulsadores y señales luminosas",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Los puntos de peligro y partes en movimientos estan señalizadas.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Presenta bordes cortantes o superficies irregulares.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El operador tiene elementos de proteccion personal.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El area es apta para realizar las actividades.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Extintor cerca del equipo.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "La maquina se encuentra apta para su utilizacion",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Horómetro (horas)",
        tipo: "NUMERO",
        obligatorio: false
      }
    ]
  },
  {
    nombre: "Preoperacional descuerador",
    area: "Planta Desposte",
    descripcion: "Periodicidad de uso: diario. Califique cada punto: B bueno, R regular, M malo, No tiene, NA no aplica. Equipo de referencia: MAJA · FP-240-6.",
    recomendacion: "Prohibido el procesado de piezas de carne planas en modo manual, tal como p.ej. trozos de tocino",
    codigo: "AC-PMT-FR072",
    version: "2",
    fechaElaboracion: "2020-11-10",
    fechaActualizacion: null,
    items: [
      {
        texto: "Limpieza general del equipo.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Conexiones electricas. Polo a tierra.Aislamiento .",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Dispositivos de proteccion.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Palanca de ajuste del portacuchillas.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Rodillo de apriete segmentado.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Cinta transportadora prolongada.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Resbaladera.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Cilindro de tranporte y descargue.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Elementos de sujeccion (Tuercas-tornillos-Mariposas).",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Portacuchillas y afilado de la cuchilla.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Frenos de la maquina.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Interruptor de pedal",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Interruptor de puesta en marcha y apagado.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Sensores de seguridad",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Boton de emergencia.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Pulsadores y señales luminosas",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Los puntos de peligro y partes en movimientos estan señalizadas.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Presenta bordes cortantes o superficies irregulares.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El operador tiene elementos de proteccion personal.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El area es apta para realizar las actividades.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Extintor cerca del equipo.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "La maquina se encuentra apta para su utilizacion",
        tipo: "ESCALA",
        obligatorio: true
      }
    ]
  },
  {
    nombre: "Preoperacional afilador",
    area: "Planta Desposte",
    descripcion: "Periodicidad de uso: diario. Califique cada punto: B bueno, R regular, M malo, No tiene, NA no aplica. Equipo de referencia: DICK · SM-110.",
    recomendacion: "Limpiar la hoja siempre antes de afilar. Sino va a utilizar durante 2 hr la maquina vaciar la caja de agua.",
    codigo: "AC-PMT-FR071",
    version: "2",
    fechaElaboracion: "2020-11-10",
    fechaActualizacion: null,
    items: [
      {
        texto: "Limpieza general del equipo",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Conexiones electricas. Polo a tierra.Aislamiento",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Chasis y capot plastico",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Hermeticidad de la caja de agua",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Estado de las muelas abrasivas",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Estado de las muelas para repasado fino.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Brida de centrar",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Limpiar y revisar el estado del liston y las guias de cuchillos.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Elementos de sujeccion (Tuercas-tornillos-Mariposas).",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Interruptor de puesta en marcha y apagado.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Interruptor de proteccion de sobre carga.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Condiciones de las unidades de cepillos.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Boton de emergencia.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Los puntos de peligro y partes en movimientos estan señalizadas.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Presenta bordes cortantes, superficies irregulares.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Distancia entre las muelas y las guias de los cuchillos",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Llenado de la camara derecha e izquierda de la caja de agua.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El operador tiene elementos de proteccion personal.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "El area es apta para realizar las actividades.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Extintor cerca del equipo.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Rotaccion de las muelas",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "La maquina se encuentra apta para su utilizacion",
        tipo: "ESCALA",
        obligatorio: true
      }
    ]
  },
  {
    nombre: "Preoperacional basculas",
    area: "Planta Desposte",
    descripcion: "Periodicidad de uso: diario. Califique cada punto: B bueno, R regular, M malo, No tiene, NA no aplica. Equipo de referencia: VECTOR · VI-405.",
    recomendacion: null,
    codigo: "AC-PMT-FR07",
    version: "3",
    fechaElaboracion: "2020-11-10",
    fechaActualizacion: null,
    items: [
      {
        texto: "Limpieza general del equipo",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Plataforma",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Base-soportes-tornillos",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Compartimiento y tapa.",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Cubirta-carcasa",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Tablero Digital",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Teclado",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Conexiones electricas",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Caja Protectora del tablero",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Cable de datos",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Sistema Mecanico",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Lubricacion",
        tipo: "ESCALA",
        obligatorio: true
      },
      {
        texto: "Calibracion de cero",
        tipo: "ESCALA",
        obligatorio: true
      }
    ]
  }
];

/** Hojas diarias de preoperatorio de cada planta (C / NC por equipo, agrupados por área). */
export const HOJAS_DIARIAS: PlantillaFormato[] = [
  {
    nombre: "Preoperatorio diario de equipos · Planta Pollo",
    area: "Planta Pollo",
    descripcion: "Funcionamiento de los equipos al iniciar el día: C cumple, NC no cumple, NA no aplica (equipo fuera de uso).",
    recomendacion: null,
    codigo: "AC-PMT-FR01",
    version: "1",
    fechaElaboracion: "2024-04-10",
    fechaActualizacion: "2025-04-10",
    items: [
      {
        texto: "Area de recibo de canales",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Bascula de recepcion de canales",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Suministro de aire",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporadores de despacho",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporadores cuartode pasillo",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Area de alistamiento",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Evaporador de alistamiento",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Cuarto de subproceso o tajado",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Bascula de tajado",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporado de tajado",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Area de refrigeracion",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Evaporador de area de refrigracion",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Area de congelacion",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Evaporador de area de congelacion",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Area de canales",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Evaporador area de canales #1",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporador area de canales #2",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Area de procesos",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Bascula salida de canales",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Despresadora de pollo #1",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Despresadora de pollo #2",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Despresadora de pollo #3",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Despresadora de pollo #4",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Despresadora de pollo #5",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Despresadora de pollo #6",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Despresadora de pollo #7",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Despresadora de pollo #8",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Banda #1 post despresadora",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Banda #2 pre marinado",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Marinadora de inyeccion",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Escurridor",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Banda #3 pot escurridor",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Banda #4 ingreso a iqf",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Banda #5 salida de iqf o glaseadora",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Banda #6 post glaseadora",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Banda #7 clasificadora",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Tanque salmuera #1",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Tanque salmuera #2",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Area iqf",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Espiral #1",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Espiral #2",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporador #1",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporador #2",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporador #3",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporador #4",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Area de producto terminado",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Bascula #1",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporador area de producto terminado",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Area de rompe bloques",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Evaporador area de rompe bloques",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Sierra sin fin #1",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Area de canastillas",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Canastillas limpias",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Maquina de lavado de canastillas",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Suministro de aire",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Compresor",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Secador de aire",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Unidad compresora",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Suministro de agua",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Bomba de agua",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Tanques de almacenamiento",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Mangueras",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Cuarto de maquinas",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Rack de media",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Rack de alta",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Compresor tornillo iqf",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Tableros electricos",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Tablero de chiller",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Trampa de grasas",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      }
    ]
  },
  {
    nombre: "Preoperatorio diario de equipos · Planta Desposte",
    area: "Planta Desposte",
    descripcion: "Funcionamiento de los equipos al iniciar el día: C cumple, NC no cumple, NA no aplica (equipo fuera de uso).",
    recomendacion: null,
    codigo: "AC-PMT-FR01",
    version: "8",
    fechaElaboracion: "2019-10-29",
    fechaActualizacion: "2026-10-01",
    items: [
      {
        texto: "Area de recibo de canales",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Bascula de recepcion de canales",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Suministro de aire",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporadores de pasillo (4-5)",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporadores cuarto de res",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporadores cuarto de cerdo #1",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporadores cuarto de cerdo #2",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporadores de subproducto",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporadoes de cuarto de hueso",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Area de desposte",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Banda transportadora grande",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Banda transportadora pequeña",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Sierra de mesa #1",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Sierra de mesa #2",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Afilador de cuchillos",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Tombola",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Descueradora",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Bascula de piso #1",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Bascula de piso #2",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Suministro de aire",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporadores sala de desposte",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Area de marinado",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Marinadora de inyeccion",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Agitador tanque de salmuera",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Bascula de piso",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Tombler grande",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Tombler pequeño",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporadores de sala de marinado",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Area de congelacion",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Evaporadores cuarto 1 conservacion",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporadores tunel de congelacion #1",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporadores tunel de congelacion #2",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporadores friss empaque",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Compresor friss empaque",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Unidad condensadora friss empaque",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Compresor tunel de congelacion #1",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Unidad cindensadora tunel de congelacion #1",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Compresor tunel de congelacion #2",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Unidad cindensadora tunel de congelacion #2",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Area de empaque al vacio-porcionado",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Empacadora la vacio #1",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Empacadora la vacio #2",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Termoformadora #1",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Termoformadora #2",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Porcionadora marell",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporadores",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Tunel de inmersion",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Basculas de pisos",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Molino",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Sierra de mesa",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Porcionadora maja",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Area de refrigeracion",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Cuarto de refrigeracion # 1",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Cuarto de refrigeracion # 2",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Cuarto de refrigeracion # 3",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Cuarto de refrigeracion # 4",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Cuarto de refrigeracion # 5",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporadores pasillo 1-2-3",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Unidad compresora rack",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Unidad condensadora rack",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Unidad compresora empaque al vacio-porcionado",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Condensadoras empaque al vacio-porcionado",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Unidad compresora refrigeracion # 5",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Condensadoras refrigeracion # 5",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Area de despachos",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Bascula de piso #1",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Bascula de piso #2",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporador de despacho",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporador de cuarto de devoluciones",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Detector de metales",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Area de canastillas",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Canastillas limpias",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Maquina de lavado de canastillas",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Suministro de aire",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Compresor de sfm",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Secador de aire",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Unidad compresora",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Suministro de agua",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Bomba de agua",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Tanques de almacenamiento",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Mangueras",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Cuarto de maquinas",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Sala de planta",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Planta electrica",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Cargador de planta electrica",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Subestacion",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Trampa de grasas",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      }
    ]
  },
  {
    nombre: "Preoperatorio diario de equipos · Planta Salsamentaria",
    area: "Planta Salsamentaria",
    descripcion: "Funcionamiento de los equipos al iniciar el día: C cumple, NC no cumple, NA no aplica (equipo fuera de uso).",
    recomendacion: null,
    codigo: "AC-PMT-FR01",
    version: "1",
    fechaElaboracion: "2026-02-02",
    fechaActualizacion: null,
    items: [
      {
        texto: "Area de procesos",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Bascula de procesos",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Suministro de aire",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Cuarto micropesaje",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporadores de procesos",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Cuarto de congelacion #1",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Cuarto de refrigeracion #1",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Cuarto de refrigeracion procesos",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Molino",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Mezclador",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Embutidora #1",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Embutidora#2",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Clipadora",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Banda clipadora",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Emulsificador",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Tombler",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Area de horno",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Bacula",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Cuarto quimico",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Horno",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Suministro de aire",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Area refrigeracion",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Precamara",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Cuarto conegalcion rapida",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Cuarto maduracion",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Cuarto de congelacion empaque",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Cuarto de refrigeracion empaque",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Cuarto de producto terminado",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Sala de proceso 2",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Cortadora de chorizo",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Suministro de aire",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporador",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Sala de empaque",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Empacadora al vacio",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Termoencogido",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Campana extractora",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Suministro de aire",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Sierra mesa",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Termoformadora",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Bomba de vacio",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Bascula",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporadores",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Tajadora",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Codificadora",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Area de despachos",
        tipo: "SECCION",
        obligatorio: false
      },
      {
        texto: "Pasillos",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Maquina de lavado de canastillas",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Evaporadores muelle",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Bascula",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      },
      {
        texto: "Puerta",
        tipo: "SI_NO",
        obligatorio: true,
        esperado: "SI",
        etiqueta: "C_NC",
        permiteNA: true
      }
    ]
  }
];

export const TABLEROS_ELECTRICOS: PlantillaFormato = {
  nombre: "Revisión de tableros eléctricos",
  area: null,
  descripcion: "Reporte de operación del tablero: lugar, equipo, serial y tipo de trabajo. Califique Sí/Bueno, No/Malo o No aplica.",
  recomendacion: null,
  codigo: "AC-ORC-ELEC01",
  version: "1",
  fechaElaboracion: "2024-02-05",
  fechaActualizacion: null,
  items: [
    {
      texto: "¿El acceso al tablero se encuentra despejado y sin obstaculos?",
      tipo: "SI_NO",
      obligatorio: true,
      esperado: "SI",
      etiqueta: "BUENO_MALO",
      permiteNA: true
    },
    {
      texto: "¿Tiene señalizacion de riesgo electrico en la puerta frontal?",
      tipo: "SI_NO",
      obligatorio: true,
      esperado: "SI",
      etiqueta: "BUENO_MALO",
      permiteNA: true
    },
    {
      texto: "¿Tiene señalizacion de la corriente nominal y tension de servicio?",
      tipo: "SI_NO",
      obligatorio: true,
      esperado: "SI",
      etiqueta: "BUENO_MALO",
      permiteNA: true
    },
    {
      texto: "¿Tiene señalizado el numero de fases?",
      tipo: "SI_NO",
      obligatorio: true,
      esperado: "SI",
      etiqueta: "BUENO_MALO",
      permiteNA: true
    },
    {
      texto: "¿Cuenta con diagrama unifilar?",
      tipo: "SI_NO",
      obligatorio: true,
      esperado: "SI",
      etiqueta: "BUENO_MALO",
      permiteNA: true
    },
    {
      texto: "¿Cuenta con diagrama electrico?",
      tipo: "SI_NO",
      obligatorio: true,
      esperado: "SI",
      etiqueta: "BUENO_MALO",
      permiteNA: true
    },
    {
      texto: "¿Todas las protecciones estan debidamente identificadas?",
      tipo: "SI_NO",
      obligatorio: true,
      esperado: "SI",
      etiqueta: "BUENO_MALO",
      permiteNA: true
    },
    {
      texto: "¿Cuenta con tapa al interior que evita el contacto con partes?",
      tipo: "SI_NO",
      obligatorio: true,
      esperado: "SI",
      etiqueta: "BUENO_MALO",
      permiteNA: true
    },
    {
      texto: "Estado de lamina y pintura electroestatica",
      tipo: "SI_NO",
      obligatorio: true,
      esperado: "SI",
      etiqueta: "BUENO_MALO",
      permiteNA: true
    },
    {
      texto: "Estado de soportes y/o anclajes",
      tipo: "SI_NO",
      obligatorio: true,
      esperado: "SI",
      etiqueta: "BUENO_MALO",
      permiteNA: true
    },
    {
      texto: "Estado de barrajes de conexión",
      tipo: "SI_NO",
      obligatorio: true,
      esperado: "SI",
      etiqueta: "BUENO_MALO",
      permiteNA: true
    },
    {
      texto: "Estado del totalizador",
      tipo: "SI_NO",
      obligatorio: true,
      esperado: "SI",
      etiqueta: "BUENO_MALO",
      permiteNA: true
    },
    {
      texto: "Estado de protecciones (breakers, guarda motores etc)",
      tipo: "SI_NO",
      obligatorio: true,
      esperado: "SI",
      etiqueta: "BUENO_MALO",
      permiteNA: true
    },
    {
      texto: "Estado de cableado (acometida-salidas) fase - neutro - tierra",
      tipo: "SI_NO",
      obligatorio: true,
      esperado: "SI",
      etiqueta: "BUENO_MALO",
      permiteNA: true
    },
    {
      texto: "¿Cuenta con proteccion de voltaje?",
      tipo: "SI_NO",
      obligatorio: true,
      esperado: "SI",
      etiqueta: "BUENO_MALO",
      permiteNA: true
    },
    {
      texto: "¿Cuenta con parada de emergencia?",
      tipo: "SI_NO",
      obligatorio: true,
      esperado: "SI",
      etiqueta: "BUENO_MALO",
      permiteNA: true
    },
    {
      texto: "¿Cuenta con polo a tierra?",
      tipo: "SI_NO",
      obligatorio: true,
      esperado: "SI",
      etiqueta: "BUENO_MALO",
      permiteNA: true
    },
    {
      texto: "¿Se ajustaron las conexiones en componentes electricos?",
      tipo: "SI_NO",
      obligatorio: true,
      esperado: "SI",
      etiqueta: "BUENO_MALO",
      permiteNA: true
    },
    {
      texto: "Orden y limpieza",
      tipo: "SI_NO",
      obligatorio: true,
      esperado: "SI",
      etiqueta: "BUENO_MALO",
      permiteNA: true
    }
  ]
};

/** Cuartos fríos y áreas de cada planta con registro de temperatura cada 3 horas. */
export const TEMPERATURAS: Array<{ planta: string; cuartos: string[]; codigo: string; version: string; fechaElaboracion: string | null; fechaActualizacion: string | null }> = [
  {
    planta: "Planta Pollo",
    cuartos: [
      "Muelle",
      "Alistamiento",
      "Procesos #1",
      "Fileteado",
      "Refrigeracion",
      "Congelacion#1",
      "Canales de pollo #1",
      "Canales de pollo #2",
      "Sala de proceso #1",
      "Sala de proceso #2",
      "Sala de proceso #3",
      "Producto terminado",
      "Pasillo #1",
      "Pasillo #2",
      "Pasillo #3",
      "IQF",
      "Cava conservacion",
      "Congelacion#2",
      "Friss #1"
    ],
    codigo: "AC-PMT-FR01",
    version: "2",
    fechaElaboracion: "2024-01-09",
    fechaActualizacion: "2025-10-08"
  },
  {
    planta: "Planta Desposte",
    cuartos: [
      "Cuarto de canal de res",
      "Cuarto de canal de cerdo #1",
      "Cuarto de canal de cerdo #2",
      "Cuarto conservacion",
      "Tunel de congelado #1",
      "Refrigeracion #1 res",
      "Refrigeracion #2 cerdo",
      "Refrigeracion #3",
      "Empaque secundario",
      "Cuarto subproducto",
      "Muelle hueso",
      "Sala desposte",
      "Sala marinado",
      "Passillo 1",
      "Muelle despacho",
      "Pasillo de canales (4-5)",
      "Cuarto cabezas y pezuñas",
      "Refrigeracion #5",
      "Area de empaque",
      "Cuarto frizz empaque",
      "Tunel de congelacion #2"
    ],
    codigo: "AC-PMT-FR02",
    version: "17",
    fechaElaboracion: "2024-10-07",
    fechaActualizacion: "2025-10-09"
  },
  {
    planta: "Planta Salsamentaria",
    cuartos: [
      "Cuarto congelacion",
      "Cuarto refrigeracion 1",
      "Cuarto congelacion rapida",
      "Cuarto de refrigeracion procesos",
      "Cuarto de maduracion",
      "Congelacion empaque #5",
      "Producto terminado",
      "Refrigeracion de empaque",
      "Pasillos",
      "Sala procesos",
      "Sala procesos 2",
      "Precamara # 2",
      "Sala empaque",
      "Sala de empaque # 2",
      "Muelle despachos"
    ],
    codigo: "AC-PMT-FR02",
    version: "1",
    fechaElaboracion: "2026-02-02",
    fechaActualizacion: null
  }
];

export const ILUMINACION: { recintos: Array<{ nombre: string; minimo: number; promedio: number; maximo: number }>; puntos: Array<{ nombre: string; recinto: string }> } = {
  recintos: [
    {
      nombre: "Industria alimenticia/ Áreas generales de trabajo",
      minimo: 200,
      promedio: 300,
      maximo: 600
    },
    {
      nombre: "Oficinas/ Oficinas de tipo general, mecanografía y computación",
      minimo: 300,
      promedio: 500,
      maximo: 750
    }
  ],
  puntos: [
    {
      nombre: "Inventarios",
      recinto: "Oficinas/ Oficinas de tipo general, mecanografía y computación"
    },
    {
      nombre: "Lavanderia",
      recinto: "Industria alimenticia/ Áreas generales de trabajo"
    },
    {
      nombre: "Despachos",
      recinto: "Industria alimenticia/ Áreas generales de trabajo"
    },
    {
      nombre: "Oficinas despachos",
      recinto: "Oficinas/ Oficinas de tipo general, mecanografía y computación"
    },
    {
      nombre: "Sala de porcionado",
      recinto: "Industria alimenticia/ Áreas generales de trabajo"
    },
    {
      nombre: "Sala de empaque",
      recinto: "Industria alimenticia/ Áreas generales de trabajo"
    },
    {
      nombre: "Sala de marinado",
      recinto: "Industria alimenticia/ Áreas generales de trabajo"
    },
    {
      nombre: "Sala de desposte",
      recinto: "Industria alimenticia/ Áreas generales de trabajo"
    },
    {
      nombre: "Area de molino",
      recinto: "Industria alimenticia/ Áreas generales de trabajo"
    },
    {
      nombre: "Cava 1",
      recinto: "Industria alimenticia/ Áreas generales de trabajo"
    },
    {
      nombre: "Cava 2",
      recinto: "Industria alimenticia/ Áreas generales de trabajo"
    },
    {
      nombre: "Cava 3",
      recinto: "Industria alimenticia/ Áreas generales de trabajo"
    },
    {
      nombre: "Area de canastillas sucias",
      recinto: "Industria alimenticia/ Áreas generales de trabajo"
    },
    {
      nombre: "Area de canastillas limpias",
      recinto: "Industria alimenticia/ Áreas generales de trabajo"
    },
    {
      nombre: "Area de afilado y desinfección",
      recinto: "Industria alimenticia/ Áreas generales de trabajo"
    },
    {
      nombre: "Cuarto de conservacion",
      recinto: "Industria alimenticia/ Áreas generales de trabajo"
    },
    {
      nombre: "Cuarto de frizado",
      recinto: "Industria alimenticia/ Áreas generales de trabajo"
    },
    {
      nombre: "Cuarto de congelacion 1",
      recinto: "Industria alimenticia/ Áreas generales de trabajo"
    },
    {
      nombre: "Cuarto de congelacion 2",
      recinto: "Industria alimenticia/ Áreas generales de trabajo"
    },
    {
      nombre: "Cuarto de refrigeracion 1",
      recinto: "Industria alimenticia/ Áreas generales de trabajo"
    },
    {
      nombre: "Cuarto de refrigeracion 2",
      recinto: "Industria alimenticia/ Áreas generales de trabajo"
    },
    {
      nombre: "Cuarto de refrigeracion 3",
      recinto: "Industria alimenticia/ Áreas generales de trabajo"
    },
    {
      nombre: "Cuarto de refrigeracion 4",
      recinto: "Industria alimenticia/ Áreas generales de trabajo"
    },
    {
      nombre: "Cuarto de alistamiento",
      recinto: "Industria alimenticia/ Áreas generales de trabajo"
    },
    {
      nombre: "Filtro sanitario 1",
      recinto: "Industria alimenticia/ Áreas generales de trabajo"
    },
    {
      nombre: "Filtro sanitario 2",
      recinto: "Industria alimenticia/ Áreas generales de trabajo"
    }
  ]
};
