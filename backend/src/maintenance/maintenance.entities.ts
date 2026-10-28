import {
  Column, CreateDateColumn, Entity, Generated, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Asset } from '../assets/asset.entity';
import { EquipmentModel } from '../equipment/equipment.entities';
import { EstadoOrden, MomentoFoto, Prioridad, TipoOrden, UnidadFrecuencia } from '../common/enums';
import { numeric } from '../common/numeric.transformer';
import { SparePart } from '../inventory/spare-part.entity';
import { User } from '../users/user.entity';

/** Plan de mantenimiento preventivo por tiempo (MNT-05). */
@Entity('planes_mantenimiento')
export class MaintenancePlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Máquina del plan. Vacío en un plan por tipo de equipo (plantilla). */
  @ManyToOne(() => Asset, { nullable: true })
  @JoinColumn({ name: 'activo_id' })
  activo: Asset | null;

  @Column({ name: 'activo_id', type: 'uuid', nullable: true })
  activoId: string | null;

  /** Plan por tipo de equipo: se aplica a todas las máquinas de este modelo, también a las que se agreguen después. */
  @ManyToOne(() => EquipmentModel, { nullable: true })
  @JoinColumn({ name: 'modelo_id' })
  modeloEquipo: EquipmentModel | null;

  @Column({ name: 'modelo_id', type: 'uuid', nullable: true })
  modeloId: string | null;

  /** Plan de una máquina creado a partir del plan de su tipo; se edita desde el plan del tipo. */
  @ManyToOne(() => MaintenancePlan, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'plantilla_id' })
  plantilla: MaintenancePlan | null;

  @Index()
  @Column({ name: 'plantilla_id', type: 'uuid', nullable: true })
  plantillaId: string | null;

  /** Plantillas: fecha del primer mantenimiento de los equipos existentes al crearla. */
  @Column({ name: 'primera_fecha', type: 'date', nullable: true })
  primeraFecha: string | null;

  @Column({ length: 150 })
  nombre: string;

  /** Tareas a realizar en cada ejecución. */
  @Column({ type: 'text', nullable: true })
  tareas: string | null;

  @Column({ name: 'frecuencia_valor', type: 'int' })
  frecuenciaValor: number;

  @Column({ name: 'frecuencia_unidad', type: 'enum', enum: UnidadFrecuencia, enumName: 'unidad_frecuencia' })
  frecuenciaUnidad: UnidadFrecuencia;

  /** Días de anticipación con que se avisa el preventivo (MNT-06). */
  @Column({ name: 'dias_aviso', type: 'int', default: 7 })
  diasAviso: number;

  /** Técnico al que se asignan por defecto las OT generadas. */
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'tecnico_id' })
  tecnico: User | null;

  @Column({ name: 'tecnico_id', type: 'uuid', nullable: true })
  tecnicoId: string | null;

  /** Un plan inactivo deja de generar OT. */
  @Column({ default: true })
  vigente: boolean;

  @OneToMany(() => PlanPart, (p) => p.plan, { cascade: true })
  repuestos: PlanPart[];

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}

/** Kit de repuestos de un plan preventivo (MNT-08). */
@Entity('plan_repuestos')
export class PlanPart {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => MaintenancePlan, (p) => p.repuestos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plan_id' })
  plan: MaintenancePlan;

  @Column({ name: 'plan_id', type: 'uuid' })
  planId: string;

  @ManyToOne(() => SparePart)
  @JoinColumn({ name: 'repuesto_id' })
  repuesto: SparePart;

  @Column({ name: 'repuesto_id', type: 'uuid' })
  repuestoId: string;

  @Column({ type: 'numeric', precision: 14, scale: 3, transformer: numeric })
  cantidad: number;
}

/** Orden de trabajo correctiva o preventiva (MNT-01 a MNT-11). */
@Entity('ordenes_trabajo')
@Index(['activoId', 'creadoEn'])
@Index(['estado'])
export class WorkOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Consecutivo legible: se muestra como OT-000123. */
  @Column({ type: 'int', unique: true })
  @Generated('increment')
  numero: number;

  @Column({ type: 'enum', enum: TipoOrden, enumName: 'tipo_orden' })
  tipo: TipoOrden;

  @Column({ type: 'enum', enum: EstadoOrden, enumName: 'estado_orden', default: EstadoOrden.ABIERTA })
  estado: EstadoOrden;

  @Column({ type: 'enum', enum: Prioridad, enumName: 'prioridad_orden', default: Prioridad.MEDIA })
  prioridad: Prioridad;

  @ManyToOne(() => Asset)
  @JoinColumn({ name: 'activo_id' })
  activo: Asset;

  @Column({ name: 'activo_id', type: 'uuid' })
  activoId: string;

  @ManyToOne(() => MaintenancePlan, { nullable: true })
  @JoinColumn({ name: 'plan_id' })
  plan: MaintenancePlan | null;

  @Column({ name: 'plan_id', type: 'uuid', nullable: true })
  planId: string | null;

  @Column({ type: 'text' })
  descripcion: string;

  /** Fecha programada (preventivos). */
  @Column({ name: 'fecha_programada', type: 'date', nullable: true })
  fechaProgramada: string | null;

  @Column({ name: 'maquina_parada', default: false })
  maquinaParada: boolean;

  /** Inicio y fin de la parada de la máquina (MNT-02), base de los KPI de disponibilidad. */
  @Column({ name: 'inicio_parada', type: 'timestamptz', nullable: true })
  inicioParada: Date | null;

  @Column({ name: 'fin_parada', type: 'timestamptz', nullable: true })
  finParada: Date | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reportado_por_id' })
  reportadoPor: User | null;

  @Column({ name: 'reportado_por_id', type: 'uuid', nullable: true })
  reportadoPorId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'asignado_a_id' })
  asignadoA: User | null;

  @Column({ name: 'asignado_a_id', type: 'uuid', nullable: true })
  asignadoAId: string | null;

  @Column({ name: 'iniciada_en', type: 'timestamptz', nullable: true })
  iniciadaEn: Date | null;

  @Column({ name: 'cerrada_en', type: 'timestamptz', nullable: true })
  cerradaEn: Date | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'cerrada_por_id' })
  cerradaPor: User | null;

  @Column({ name: 'cerrada_por_id', type: 'uuid', nullable: true })
  cerradaPorId: string | null;

  @Column({ name: 'trabajo_realizado', type: 'text', nullable: true })
  trabajoRealizado: string | null;

  @Column({ name: 'costo_servicios_externos', type: 'numeric', precision: 14, scale: 2, default: 0, transformer: numeric })
  costoServiciosExternos: number;

  /** Costos congelados al cierre, para que el LCC no cambie si luego cambian tarifas o promedios. */
  @Column({ name: 'costo_repuestos', type: 'numeric', precision: 14, scale: 2, default: 0, transformer: numeric })
  costoRepuestos: number;

  @Column({ name: 'costo_mano_obra', type: 'numeric', precision: 14, scale: 2, default: 0, transformer: numeric })
  costoManoObra: number;

  @Column({ name: 'motivo_cancelacion', type: 'varchar', length: 300, nullable: true })
  motivoCancelacion: string | null;

  /** UUID generado en el dispositivo para evitar duplicados al sincronizar offline. */
  @Column({ name: 'client_id', type: 'uuid', nullable: true, unique: true })
  clientId: string | null;

  /** Identificador del cierre hecho desde el dispositivo: si el cierre se reenvía al sincronizar, no se repite. */
  @Column({ name: 'cierre_client_id', type: 'uuid', nullable: true, unique: true })
  cierreClientId: string | null;

  /** El cierre se hizo sin conexión y se sincronizó después (D-02: el consumo se registra aunque falte stock). */
  @Column({ name: 'cerrada_sin_conexion', default: false })
  cerradaSinConexion: boolean;

  @OneToMany(() => WorkOrderPart, (p) => p.orden, { cascade: true })
  repuestos: WorkOrderPart[];

  @OneToMany(() => WorkOrderLabor, (l) => l.orden, { cascade: true })
  manoObra: WorkOrderLabor[];

  @OneToMany(() => WorkOrderEvent, (e) => e.orden)
  eventos: WorkOrderEvent[];

  @OneToMany(() => WorkOrderPhoto, (f) => f.orden)
  fotos: WorkOrderPhoto[];

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}

/** Repuestos de la OT: planificados (del kit) y realmente usados (al cerrar). */
@Entity('ot_repuestos')
export class WorkOrderPart {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => WorkOrder, (o) => o.repuestos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orden_id' })
  orden: WorkOrder;

  @Column({ name: 'orden_id', type: 'uuid' })
  ordenId: string;

  @ManyToOne(() => SparePart)
  @JoinColumn({ name: 'repuesto_id' })
  repuesto: SparePart;

  @Column({ name: 'repuesto_id', type: 'uuid' })
  repuestoId: string;

  @Column({ name: 'cantidad_planificada', type: 'numeric', precision: 14, scale: 3, default: 0, transformer: numeric })
  cantidadPlanificada: number;

  @Column({ name: 'cantidad_usada', type: 'numeric', precision: 14, scale: 3, nullable: true, transformer: numeric })
  cantidadUsada: number | null;

  @Column({ name: 'costo_unitario', type: 'numeric', precision: 14, scale: 2, nullable: true, transformer: numeric })
  costoUnitario: number | null;
}

/** Horas trabajadas por técnico (MNT-10). */
@Entity('ot_mano_obra')
export class WorkOrderLabor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => WorkOrder, (o) => o.manoObra, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orden_id' })
  orden: WorkOrder;

  @Column({ name: 'orden_id', type: 'uuid' })
  ordenId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'tecnico_id' })
  tecnico: User;

  @Column({ name: 'tecnico_id', type: 'uuid' })
  tecnicoId: string;

  @Column({ type: 'numeric', precision: 8, scale: 2, transformer: numeric })
  horas: number;

  /** Tarifa vigente al cerrar (D-03 asumido: tarifa única configurable). */
  @Column({ name: 'tarifa_hora', type: 'numeric', precision: 14, scale: 2, transformer: numeric })
  tarifaHora: number;
}

/** Historial de cambios de estado de la OT (MNT-03). Solo inserción. */
@Entity('ot_eventos')
export class WorkOrderEvent {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @ManyToOne(() => WorkOrder, (o) => o.eventos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orden_id' })
  orden: WorkOrder;

  @Column({ name: 'orden_id', type: 'uuid' })
  ordenId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'usuario_id' })
  usuario: User | null;

  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  usuarioId: string | null;

  @Column({ name: 'estado_anterior', type: 'enum', enum: EstadoOrden, enumName: 'estado_orden', nullable: true })
  estadoAnterior: EstadoOrden | null;

  @Column({ name: 'estado_nuevo', type: 'enum', enum: EstadoOrden, enumName: 'estado_orden' })
  estadoNuevo: EstadoOrden;

  @Column({ type: 'varchar', length: 500, nullable: true })
  nota: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}

/** Fotos de la OT: al reportar, antes y después del trabajo (MNT-11). */
@Entity('ot_fotos')
export class WorkOrderPhoto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => WorkOrder, (o) => o.fotos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orden_id' })
  orden: WorkOrder;

  @Column({ name: 'orden_id', type: 'uuid' })
  ordenId: string;

  @Column({ type: 'enum', enum: MomentoFoto, enumName: 'momento_foto' })
  momento: MomentoFoto;

  @Column({ length: 255, select: false })
  archivo: string;

  @Column({ length: 100 })
  mime: string;

  @Column({ name: 'tamano_bytes', type: 'int' })
  tamanoBytes: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'subido_por_id' })
  subidoPor: User | null;

  @Column({ name: 'subido_por_id', type: 'uuid', nullable: true })
  subidoPorId: string | null;

  /** Evita subir dos veces la misma foto al sincronizar. */
  @Column({ name: 'client_id', type: 'uuid', nullable: true, unique: true })
  clientId: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}

export const MAINTENANCE_ENTITIES = [MaintenancePlan, PlanPart, WorkOrder, WorkOrderPart, WorkOrderLabor, WorkOrderEvent, WorkOrderPhoto];
