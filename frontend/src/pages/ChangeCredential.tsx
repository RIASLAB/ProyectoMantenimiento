import { useMutation } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button, ErrorBox, Field, Input, PageHeader } from '../components/ui';
import { ROL_LABEL } from '../format';

/**
 * Cambio de la propia contraseña o PIN. Es obligatorio al primer ingreso y cuando un administrador la restablece:
 * hasta hacerlo, el sistema no deja usar nada más (también lo exige la API).
 */
export function ChangeCredential({ obligatorio = false }: { obligatorio?: boolean }) {
  const { user, credencialCambiada, logout } = useAuth();
  const pin = user?.rol === 'TECNICO' || user?.rol === 'OPERARIO';
  const que = pin ? 'PIN' : 'contraseña';
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [hecho, setHecho] = useState(false);
  const distintas = repetir.length > 0 && nueva !== repetir;
  const m = useMutation({
    mutationFn: () => api.post('/auth/cambiar-credencial', { actual, nueva }),
    onSuccess: () => { setActual(''); setNueva(''); setRepetir(''); setHecho(true); credencialCambiada(); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); if (!distintas) m.mutate(); };
  const tipo = pin ? { inputMode: 'numeric' as const, pattern: '\\d{4,6}', maxLength: 6, autoComplete: 'off' } : { autoComplete: 'new-password', minLength: 8, maxLength: 128 };

  const form = (
    <form className="card form stack" onSubmit={submit} style={{ maxWidth: 480 }}>
      {obligatorio ? (
        <div className="alert alert-warn"><span>Su {que} la asignó un administrador. Por seguridad, elija {pin ? 'uno nuevo' : 'una nueva'} que solo usted conozca antes de continuar.</span></div>
      ) : null}
      {hecho ? <div className="alert alert-ok">Su {que} se cambió.</div> : null}
      <Field label={`${pin ? 'PIN' : 'Contraseña'} actual *`}>{(i) => <Input id={i} type="password" value={actual} onChange={(e) => setActual(e.target.value)} required autoComplete="current-password" />}</Field>
      <Field label={`${pin ? 'Nuevo PIN' : 'Nueva contraseña'} *`} hint={pin ? 'De 4 a 6 dígitos, que no sea fácil de adivinar (ej. 1111 o 1234)' : 'Al menos 8 caracteres, con letras y números'}>
        {(i) => <Input id={i} type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} required {...tipo} />}
      </Field>
      <Field label={`Repita ${pin ? 'el nuevo PIN' : 'la nueva contraseña'} *`} error={distintas ? 'No coincide' : undefined}>
        {(i) => <Input id={i} type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} required {...tipo} />}
      </Field>
      {m.isError ? <ErrorBox error={m.error} /> : null}
      <Button type="submit" busy={m.isPending} disabled={distintas} className="btn-block">Cambiar {que}</Button>
      {obligatorio ? <Button type="button" variant="ghost" onClick={logout}>Cerrar sesión</Button> : null}
    </form>
  );

  if (obligatorio) {
    return (
      <div className="login">
        <div className="stack" style={{ width: '100%', maxWidth: 480, margin: '0 auto', padding: 16 }}>
          <div className="cambio-head">
            <h1>Hola, {user?.nombre.split(' ')[0]}</h1>
            <p>{user ? ROL_LABEL[user.rol] : ''} · {user?.usuario}</p>
          </div>
          {form}
        </div>
      </div>
    );
  }
  return (
    <>
      <PageHeader title="Mi cuenta" subtitle={`${user?.nombre} · ${user ? ROL_LABEL[user.rol] : ''} · usuario ${user?.usuario}`} />
      {form}
    </>
  );
}
