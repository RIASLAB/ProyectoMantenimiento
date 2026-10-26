import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, LessThan, Repository } from 'typeorm';
import * as webpush from 'web-push';
import { SessionUser } from '../common/auth.decorators';
import { Rol } from '../common/enums';
import { User } from '../users/user.entity';
import { Notification, PushSubscription } from './notification.entities';

export interface Aviso {
  tipo: string;
  titulo: string;
  cuerpo?: string | null;
  enlace?: string | null;
  /** Si se indica, el aviso llega una sola vez a cada persona (avisos programados). */
  clave?: string;
}

export interface Destino {
  /** Usuarios puntuales (se ignoran los vacíos y los inactivos). */
  usuarios?: Array<string | null | undefined>;
  /** Todos los usuarios activos con estos roles. */
  roles?: Rol[];
  /** Normalmente quien hizo la acción: no se avisa a sí mismo. */
  excluir?: string | null;
}

export interface SuscripcionPush {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Servicios de avisos al celular aceptados. Un endpoint de suscripción es una URL a la que el servidor hará
 * peticiones, así que solo se aceptan los servicios push conocidos (evita que se use para llamar a la red interna).
 */
const HOSTS_PUSH = [/\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.push\.apple\.com$/, /\.notify\.windows\.com$/];

const ABIERTAS = ['ABIERTA', 'ASIGNADA', 'EN_EJECUCION', 'ESPERANDO_REPUESTO'];
const numeroOT = (n: number) => `OT-${String(n).padStart(6, '0')}`;
const fechaCorta = (iso: string) => iso.split('-').reverse().join('/');
const recortar = (s: string | null | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s ?? null);

/** NOT-01/02: crea las notificaciones de cada evento y las envía al celular cuando hay avisos configurados. */
@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Notificaciones');
  private readonly clavePublica: string | null;
  private readonly hostsExtra: string[];
  private timers: NodeJS.Timeout[] = [];
  private despachando = false;

  /** Envío real al servicio push; se reemplaza en las pruebas. */
  enviar: (s: PushSubscription, payload: string, urgente: boolean) => Promise<unknown> = (s, payload, urgente) =>
    webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600, urgency: urgente ? 'high' : 'normal' });

  constructor(
    @InjectRepository(Notification) private readonly repo: Repository<Notification>,
    @InjectRepository(PushSubscription) private readonly subs: Repository<PushSubscription>,
    private readonly ds: DataSource,
    config: ConfigService,
  ) {
    const pub = config.get<string>('VAPID_PUBLIC_KEY');
    const priv = config.get<string>('VAPID_PRIVATE_KEY');
    const subject = config.get<string>('VAPID_SUBJECT');
    this.hostsExtra = (config.get<string>('PUSH_HOSTS_EXTRA') ?? '').split(',').map((h) => h.trim()).filter(Boolean);
    if (pub && priv && subject) {
      webpush.setVapidDetails(subject, pub, priv);
      this.clavePublica = pub;
    } else {
      this.clavePublica = null;
    }
  }

  get pushActivo() {
    return this.clavePublica !== null;
  }

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.TAREAS_PROGRAMADAS === 'off') return;
    this.log.log(this.pushActivo ? 'Avisos al celular activos' : 'Avisos al celular desactivados (faltan las claves VAPID); solo bandeja en la app');
    // Los avisos al celular salen en segundos (NOT-01: menos de 1 minuto).
    this.timers.push(setInterval(() => void this.despacharPush().catch((e) => this.log.error(e)), 5_000));
    // Preventivos próximos/vencidos y limpieza: al arrancar y cada hora.
    const tareas = () => void this.tareasPeriodicas().catch((e) => this.log.error(e));
    this.timers.push(setTimeout(tareas, 10_000), setInterval(tareas, 3_600_000));
  }

  onModuleDestroy() {
    this.timers.forEach((t) => clearInterval(t));
  }

  // ======================= Crear notificaciones =======================

  /** Crea la notificación para cada destinatario. Con `em` queda en la misma transacción que el evento. */
  async notificar(em: EntityManager | null, destino: Destino, aviso: Aviso): Promise<number> {
    const m = em ?? this.ds.manager;
    const ids = (destino.usuarios ?? []).filter((x): x is string => !!x);
    const where = [
      ...(ids.length ? [{ id: In(ids), activo: true }] : []),
      ...(destino.roles?.length ? [{ rol: In(destino.roles), activo: true }] : []),
    ];
    if (!where.length) return 0;
    const usuarios = await m.getRepository(User).find({ where, select: { id: true } });
    const para = [...new Set(usuarios.map((u) => u.id))].filter((id) => id !== destino.excluir);
    if (!para.length) return 0;
    const r = await m
      .createQueryBuilder()
      .insert()
      .into(Notification)
      .values(para.map((usuarioId) => ({
        usuarioId,
        tipo: aviso.tipo,
        titulo: recortar(aviso.titulo, 150)!,
        cuerpo: recortar(aviso.cuerpo, 500),
        enlace: aviso.enlace ?? null,
        clave: aviso.clave ?? null,
        pushPendiente: this.pushActivo,
      })))
      .orIgnore()
      .execute();
    return Array.isArray(r.raw) ? r.raw.length : 0;
  }

  /** Avisos de preventivos próximos y vencidos (MNT-06). Cada aviso llega una sola vez por OT y persona. */
  async revisarPreventivos(hoyStr: string) {
    const filas: Array<{ id: string; numero: number; fecha: string; asignado: string | null; codigo: string; nombre: string; plan: string | null }> = await this.ds.query(
      `SELECT o.id, o.numero, to_char(o.fecha_programada, 'YYYY-MM-DD') AS fecha, o.asignado_a_id AS asignado,
              a.codigo, a.nombre, p.nombre AS plan
         FROM ordenes_trabajo o
         JOIN activos a ON a.id = o.activo_id
         LEFT JOIN planes_mantenimiento p ON p.id = o.plan_id
        WHERE o.tipo = 'PREVENTIVO' AND o.estado::text = ANY($1)
          AND o.fecha_programada <= $2::date + COALESCE(p.dias_aviso, 7)`,
      [ABIERTAS, hoyStr],
    );
    let enviados = 0;
    for (const f of filas) {
      const vencido = f.fecha < hoyStr;
      const que = f.plan ?? 'Preventivo';
      enviados += await this.notificar(
        null,
        // Sin técnico asignado avisa a todo mantenimiento; vencido avisa también a los administradores.
        f.asignado ? { usuarios: [f.asignado], roles: vencido ? [Rol.ADMIN] : [] } : { roles: [Rol.ADMIN, Rol.TECNICO] },
        {
          tipo: vencido ? 'PREVENTIVO_VENCIDO' : 'PREVENTIVO_PROXIMO',
          titulo: vencido ? `Preventivo vencido: ${f.codigo} · ${f.nombre}` : `Preventivo para el ${fechaCorta(f.fecha)}: ${f.codigo} · ${f.nombre}`,
          cuerpo: `${numeroOT(f.numero)} · ${que}${vencido ? ` (era para el ${fechaCorta(f.fecha)})` : ''}`,
          enlace: `/ordenes/${f.id}`,
          clave: `${vencido ? 'preventivo-vencido' : 'preventivo-proximo'}:${f.id}`,
        },
      );
    }
    return enviados;
  }

  private async tareasPeriodicas() {
    const hoyStr = new Intl.DateTimeFormat('en-CA', { timeZone: process.env.APP_TZ ?? 'America/Bogota' }).format(new Date());
    await this.revisarPreventivos(hoyStr);
    // La bandeja guarda 90 días de lo leído y 180 de lo no leído.
    await this.repo.delete({ leidaEn: LessThan(new Date(Date.now() - 90 * 86_400_000)) });
    await this.repo.delete({ creadoEn: LessThan(new Date(Date.now() - 180 * 86_400_000)) });
  }

  // ======================= Bandeja (NOT-02) =======================

  async listar(actor: SessionUser, limite = 50, antesDe?: string) {
    const qb = this.repo
      .createQueryBuilder('n')
      .where('n.usuarioId = :u', { u: actor.id })
      .orderBy('n.creadoEn', 'DESC')
      .take(Math.min(Math.max(limite, 1), 100));
    if (antesDe) qb.andWhere('n.creadoEn < :a', { a: new Date(antesDe) });
    const [items, noLeidas] = await Promise.all([qb.getMany(), this.contar(actor)]);
    return { items, noLeidas };
  }

  contar(actor: SessionUser) {
    return this.repo.count({ where: { usuarioId: actor.id, leidaEn: IsNull() } });
  }

  async marcarLeida(id: string, actor: SessionUser) {
    const n = await this.repo.findOne({ where: { id, usuarioId: actor.id } });
    if (!n) throw new NotFoundException('Notificación no encontrada');
    if (!n.leidaEn) await this.repo.update(n.id, { leidaEn: new Date() });
    return { noLeidas: await this.contar(actor) };
  }

  async marcarTodas(actor: SessionUser) {
    await this.repo.update({ usuarioId: actor.id, leidaEn: IsNull() }, { leidaEn: new Date() });
    return { noLeidas: 0 };
  }

  // ======================= Avisos al celular (Web Push) =======================

  configuracionPush() {
    return { clavePublica: this.clavePublica };
  }

  async suscribir(s: SuscripcionPush, agente: string | undefined, actor: SessionUser) {
    if (!this.pushActivo) throw new BadRequestException('Los avisos al celular no están configurados en el servidor');
    let host: string;
    try {
      const u = new URL(s.endpoint);
      if (u.protocol !== 'https:') throw new Error();
      host = u.hostname;
    } catch {
      throw new BadRequestException('Suscripción inválida');
    }
    if (!HOSTS_PUSH.some((h) => h.test(host)) && !this.hostsExtra.includes(host)) {
      throw new BadRequestException('Servicio de avisos no reconocido');
    }
    // Si el celular lo usaba otra persona, la suscripción pasa al usuario actual.
    await this.subs.upsert(
      { usuarioId: actor.id, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, agente: agente?.slice(0, 300) ?? null },
      { conflictPaths: ['endpoint'] },
    );
    return { ok: true };
  }

  async desuscribir(endpoint: string, actor: SessionUser) {
    await this.subs.delete({ endpoint, usuarioId: actor.id });
    return { ok: true };
  }

  /** Notificación de prueba para que el usuario verifique que los avisos le llegan. */
  async prueba(actor: SessionUser) {
    await this.notificar(null, { usuarios: [actor.id] }, {
      tipo: 'PRUEBA', titulo: 'Prueba de avisos', cuerpo: 'Si ve esto en el celular, los avisos están funcionando.', enlace: '/notificaciones',
    });
    await this.despacharPush();
    return { ok: true, suscripciones: await this.subs.count({ where: { usuarioId: actor.id } }) };
  }

  /** Envía los avisos pendientes. Si un servicio push responde que la suscripción ya no existe, se borra. */
  async despacharPush() {
    if (!this.pushActivo || this.despachando) return 0;
    this.despachando = true;
    let enviados = 0;
    try {
      // Un aviso que no salió en 30 minutos ya no se manda al celular (sigue en la bandeja).
      await this.repo.update({ pushPendiente: true, creadoEn: LessThan(new Date(Date.now() - 30 * 60_000)) }, { pushPendiente: false });
      const pendientes = await this.repo
        .createQueryBuilder('n')
        .where('n.push_pendiente')
        .orderBy('n.creadoEn', 'ASC')
        .take(200)
        .getMany();
      if (!pendientes.length) return 0;
      const usuarios = [...new Set(pendientes.map((n) => n.usuarioId))];
      const todas = await this.subs.find({ where: { usuarioId: In(usuarios) } });
      const noLeidas = new Map<string, number>();
      for (const u of usuarios) noLeidas.set(u, await this.repo.count({ where: { usuarioId: u, leidaEn: IsNull() } }));

      for (const n of pendientes) {
        const payload = JSON.stringify({ id: n.id, titulo: n.titulo, cuerpo: n.cuerpo, enlace: n.enlace ?? '/notificaciones', tipo: n.tipo, noLeidas: noLeidas.get(n.usuarioId) });
        const urgente = ['FALLA_REPORTADA', 'TEMPERATURA_FUERA_DE_RANGO'].includes(n.tipo);
        for (const s of todas.filter((x) => x.usuarioId === n.usuarioId)) {
          try {
            await this.enviar(s, payload, urgente);
            enviados++;
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) await this.subs.delete(s.id);
            else this.log.warn(`No se pudo enviar el aviso (${status ?? (e as Error).message})`);
          }
        }
      }
      await this.repo.update({ id: In(pendientes.map((n) => n.id)) }, { pushPendiente: false });
    } finally {
      this.despachando = false;
    }
    return enviados;
  }
}
