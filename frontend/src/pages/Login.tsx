import { FormEvent, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button, Field, Input } from '../components/ui';

export function Login() {
  const { user, login, expired } = useAuth();
  const location = useLocation();
  const [usuario, setUsuario] = useState('');
  const [credencial, setCredencial] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) {
    const from = (location.state as { from?: string } | null)?.from ?? '/maquinas';
    return <Navigate to={from} replace />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(usuario, credencial);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
      setCredencial('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-panel">
        <div className="login-brand">
          <img src="/icon.svg" alt="" width={56} height={56} />
          <h1>Mantenimiento</h1>
          <p>Nutrialimentos Cárnicos S.A.S.</p>
        </div>

        {expired ? <div className="alert alert-warn">Su sesión terminó. Ingrese de nuevo.</div> : null}

        <form onSubmit={submit} className="stack">
          <Field label="Usuario">
            {(id) => (
              <Input id={id} value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" required autoFocus />
            )}
          </Field>
          <Field label="Contraseña o PIN" hint="Técnicos y operarios ingresan con su PIN de planta.">
            {(id) => (
              <Input id={id} type="password" value={credencial} onChange={(e) => setCredencial(e.target.value)} autoComplete="current-password" required />
            )}
          </Field>
          {error ? <div className="alert alert-bad" role="alert">{error}</div> : null}
          <Button type="submit" busy={busy} className="btn-block btn-lg">Ingresar</Button>
        </form>
      </div>
    </div>
  );
}
