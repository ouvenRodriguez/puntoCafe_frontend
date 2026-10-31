import { useState, type FormEvent } from 'react';
import axios from 'axios';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import homeHeroBg from '../assets/home-hero-bg.jpg';
import { BrandMark } from '../components/BrandMark';

export function LoginPage() {
  const { ready, token, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!ready) {
    return <p className="screen-status">Cargando…</p>;
  }

  if (token) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await login(email, password);
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <aside className="login-brand">
        <div className="login-brand-media" aria-hidden="true">
          <img src={homeHeroBg} alt="" />
        </div>

        <div className="login-brand-top">
          <BrandMark />
          <span>Punto Café</span>
        </div>

        <div className="login-brand-main">
          <h2 className="login-brand-title">
            El <span>café</span> de tu día, bajo control.
          </h2>
          <p className="login-brand-lead">
            Ventas, stock y gastos en un solo lugar, pensado para el ritmo de tu cafetería.
          </p>
        </div>

        <ul className="login-brand-points">
          <li>
            <PointIcon />
            Registra ventas en segundos
          </li>
          <li>
            <PointIcon />
            Mantén el inventario al día
          </li>
          <li>
            <PointIcon />
            Revisa el historial cuando quieras
          </li>
        </ul>
      </aside>

      <main className="login-panel">
        <form className="login-form" onSubmit={handleSubmit}>
          <header className="login-form-head">
            <h1>Bienvenido</h1>
            <p>Ingresa a tu cuenta para continuar con la gestión de tu cafetería.</p>
          </header>

          <label className="login-field">
            <span>Correo</span>
            <div className="login-input">
              <MailIcon />
              <input
                type="text"
                name="email"
                inputMode="email"
                autoComplete="username"
                placeholder="Ingresa tu correo electrónico"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
          </label>

          <label className="login-field">
            <span>Contraseña</span>
            <div className="login-input">
              <LockIcon />
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                placeholder="Ingresa tu contraseña"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                className="login-eye"
                type="button"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </label>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="login-submit" type="submit" disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>

          <p className="login-help">¿Problemas para entrar? Habla con el administrador.</p>
        </form>
      </main>
    </div>
  );
}

function readError(caught: unknown): string {
  if (!axios.isAxiosError(caught)) {
    return 'No se pudo iniciar sesión';
  }

  if (!caught.response) {
    return 'No se pudo conectar con el servidor. Revisa que el backend esté en marcha.';
  }

  const message = caught.response.data?.message;
  if (Array.isArray(message)) {
    return String(message[0]);
  }
  if (typeof message === 'string') {
    return message;
  }
  return 'No se pudo iniciar sesión';
}

function PointIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.2 12.2 2.4 2.4 5.2-5.2" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.2" />
      <path d="m4.5 7.5 7.5 5.5 7.5-5.5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5.5" y="10.5" width="13" height="9" rx="2" />
      <path d="M8.5 10.5V8.2a3.5 3.5 0 0 1 7 0v2.3" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.8 12s3.4-6.2 9.2-6.2S21.2 12 21.2 12s-3.4 6.2-9.2 6.2S2.8 12 2.8 12z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.8 12s3.4-6.2 9.2-6.2S21.2 12 21.2 12s-3.4 6.2-9.2 6.2S2.8 12 2.8 12z" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="m4 4 16 16" />
    </svg>
  );
}
