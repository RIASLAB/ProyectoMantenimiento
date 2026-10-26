import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { Rol, User } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Badge, Button, Empty, ErrorBox, Field, Icon, Input, Modal, PageHeader, Select, Spinner } from '../../components/ui';
import { ROL_LABEL } from '../../format';

const usaPin = (r: Rol) => r === 'TECNICO' || r === 'OPERARIO';

function UserModal({ user, open, onClose }: { user: User | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const editing = !!user;
  const [nombre, setNombre] = useState('');
  const [usuario, setUsuario] = useState('');
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<Rol>('OPERARIO');
  const [credencial, setCredencial] = useState('');

  useEffect(() => {
    if (!open) return;
    setNombre(user?.nombre ?? '');
    setUsuario(user?.usuario ?? '');
    setEmail(user?.email ?? '');
    setRol(user?.rol ?? 'OPERARIO');
    setCredencial('');
  }, [open, user]);

  const cambiaTipo = editing && usaPin(rol) !== usaPin(user!.rol);
  const pin = usaPin(rol);

  const m = useMutation({
    mutationFn: () =>
      editing
        ? api.patch(`/usuarios/${user!.id}`, {
            nombre,
            email: email || null,
            ...(rol !== user!.rol ? { rol } : {}),
            ...(credencial ? { credencial } : {}),
          })
        : api.post('/usuarios', { nombre, usuario, email: email || undefined, rol, credencial }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      onClose();
    },
  });

  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };

  return (
    <Modal
      open={open}
      title={editing ? `Editar ${user!.nombre}` : 'Nuevo usuario'}
      onClose={() => { m.reset(); onClose(); }}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="user-form" busy={m.isPending}>{editing ? 'Guardar' : 'Crear usuario'}</Button>
        </>
      }
    >
      <form id="user-form" className="stack" onSubmit={submit}>
        <Field label="Nombre completo *">{(i) => <Input id={i} value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={3} maxLength={120} />}</Field>
        <Field label="Usuario *" hint={editing ? 'El usuario no se puede cambiar.' : 'Con el que ingresará. Ej. jperez'}>
          {(i) => <Input id={i} value={usuario} onChange={(e) => setUsuario(e.target.value)} required disabled={editing} pattern="[a-zA-Z0-9._\-]{3,60}" autoCapitalize="none" />}
        </Field>
        <Field label="Correo">{(i) => <Input id={i} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Rol *">
          {(i) => (
            <Select id={i} value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
              {(Object.keys(ROL_LABEL) as Rol[]).map((r) => <option key={r} value={r}>{ROL_LABEL[r]}</option>)}
            </Select>
          )}
        </Field>
        <Field
          label={`${pin ? 'PIN' : 'Contraseña'}${!editing || cambiaTipo ? ' *' : ''}`}
          hint={
            editing && !cambiaTipo
              ? `Déjelo vacío para no cambiarlo. Si lo cambia, se desbloquea el usuario.`
              : pin ? 'De 4 a 6 dígitos, no consecutivos ni repetidos.' : 'Mínimo 8 caracteres, con letras y números.'
          }
        >
          {(i) => (
            <Input
              id={i}
              type="password"
              inputMode={pin ? 'numeric' : undefined}
              pattern={pin ? '\\d{4,6}' : undefined}
              minLength={pin ? 4 : 8}
              value={credencial}
              onChange={(e) => setCredencial(e.target.value)}
              required={!editing || cambiaTipo}
              autoComplete="new-password"
            />
          )}
        </Field>
        {m.isError ? <ErrorBox error={m.error} /> : null}
      </form>
    </Modal>
  );
}

export function Users() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [toggleError, setToggleError] = useState('');

  const q = useQuery({ queryKey: ['usuarios'], queryFn: () => api.get<User[]>('/usuarios') });
  const toggle = useMutation({
    mutationFn: (u: User) => api.patch(`/usuarios/${u.id}`, { activo: !u.activo }),
    onSuccess: () => { setToggleError(''); qc.invalidateQueries({ queryKey: ['usuarios'] }); },
    onError: (e) => setToggleError(e.message),
  });

  return (
    <>
      <PageHeader
        title="Usuarios"
        subtitle="Administradores y autorizadores ingresan con contraseña; técnicos y operarios con PIN."
        actions={<Button onClick={() => { setEditing(null); setOpen(true); }}><Icon name="plus" /> Nuevo usuario</Button>}
      />
      {toggleError ? <div className="alert alert-bad">{toggleError}</div> : null}
      {q.isPending ? <Spinner /> : q.isError ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : q.data.length === 0 ? <Empty title="Sin usuarios" /> : (
        <ul className="list">
          {q.data.map((u) => {
            const bloqueado = u.bloqueadoHasta && new Date(u.bloqueadoHasta) > new Date();
            return (
              <li key={u.id} className={`list-row static ${u.activo ? '' : 'is-off'}`}>
                <div className="list-main">
                  <strong>{u.nombre}{u.id === me?.id ? <span className="muted"> (usted)</span> : null}</strong>
                  <span className="muted">{u.usuario}{u.email ? ` · ${u.email}` : ''}</span>
                </div>
                <div className="list-meta">
                  <Badge tone="info">{ROL_LABEL[u.rol]}</Badge>
                  {!u.activo ? <Badge tone="muted">Inactivo</Badge> : bloqueado ? <Badge tone="bad">Bloqueado</Badge> : null}
                  <div className="row-actions">
                    <Button variant="ghost" onClick={() => { setEditing(u); setOpen(true); }}>Editar</Button>
                    {u.id !== me?.id ? (
                      <Button variant="ghost" busy={toggle.isPending && toggle.variables?.id === u.id} onClick={() => toggle.mutate(u)}>
                        {u.activo ? 'Desactivar' : 'Activar'}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <UserModal user={editing} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
