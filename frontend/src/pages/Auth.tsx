import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react';
import { useAuth } from '../auth/AuthContext';
import { ApiError, humanMessage } from '../api/errors';
import { DEMO_CREDENTIALS, USING_MOCKS } from '../mocks/enable';
import { Button } from '../ui/Button';
import { TextField } from '../ui/Field';
import { FormError } from '../ui/States';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Wordmark } from '../components/Wordmark';

/**
 * Login and register are real, addressable screens: /login and /registro.
 * A guard that bounces someone here keeps their destination in ?next, so
 * signing in lands them where they were going instead of on a generic home.
 */
type Mode = 'login' | 'register';

const SAFE_NEXT = /^\/(?!\/)/;

export function Login() {
  return <AuthScreen mode="login" />;
}

export function Register() {
  return <AuthScreen mode="register" />;
}

function AuthScreen({ mode }: { mode: Mode }) {
  const { status, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  // Only same-site paths are honoured, so ?next cannot send anyone off-site.
  const raw = params.get('next') ?? '';
  const next = SAFE_NEXT.test(raw) ? raw : '/cajitas';
  const otherMode = mode === 'login' ? 'registro' : 'login';
  const otherHref = raw ? `/${otherMode}?next=${encodeURIComponent(raw)}` : `/${otherMode}`;

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (status === 'authenticated') return <Navigate to={next} replace />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const errors: Record<string, string> = {};
    if (mode === 'register' && displayName.trim().length < 2) {
      errors.displayName = 'Escribe tu nombre para que el grupo sepa quién organiza.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Revisa el correo.';
    if (password.length < 8) errors.password = 'Mínimo 8 caracteres.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setPending(true);
    setFormError(null);
    try {
      if (mode === 'register') {
        await register({ email: email.trim(), password, displayName: displayName.trim() });
      } else {
        await login({ email: email.trim(), password });
      }
      navigate(next, { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_TAKEN') {
        setFieldErrors({ email: 'Ya existe una cuenta con ese correo.' });
      } else if (error instanceof ApiError && error.code === 'UNAUTHORIZED') {
        // Credentials are wrong: say so inline, next to the fields, not in a toast.
        setFormError('Correo o contraseña incorrectos. Revísalos e inténtalo de nuevo.');
      } else {
        setFormError(humanMessage(error));
      }
    } finally {
      setPending(false);
    }
  }

  const bouncedHere = Boolean(raw) && location.pathname === '/login';

  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper">
      <header className="flex h-[68px] shrink-0 items-center border-b border-rule px-4 sm:px-6">
        <Link
          to="/"
          className="rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <Wordmark tone="brand" />
        </Link>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <Link
          to="/"
          className="mb-6 inline-flex min-h-9 w-fit items-center gap-2 text-[14px] text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Volver al inicio
        </Link>

        <h1 className="text-3xl font-semibold tracking-tighter text-ink md:text-4xl">
          {mode === 'login' ? 'Entrar a VaqCash' : 'Crear tu cuenta'}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
          {bouncedHere
            ? 'Necesitas una sesión para ver esa página. Entra y te llevamos de vuelta.'
            : mode === 'login'
              ? 'Usa el correo con el que creaste tus cajitas.'
              : 'Gratis y sin tarjeta. Tus invitados no necesitan cuenta para aportar.'}
        </p>

        <form
          onSubmit={submit}
          noValidate
          className="mt-7 flex flex-col gap-4 rounded-[12px] border border-rule bg-surface p-5 sm:p-6"
        >
          {mode === 'register' ? (
            <TextField
              label="Tu nombre"
              autoComplete="name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              error={fieldErrors.displayName}
              required
              autoFocus
            />
          ) : null}

          <TextField
            label="Correo"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={fieldErrors.email}
            required
            autoFocus={mode === 'login'}
          />

          <TextField
            label="Contraseña"
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            helper={mode === 'register' ? 'Al menos 8 caracteres.' : undefined}
            error={fieldErrors.password}
            required
          />

          <FormError>{formError}</FormError>

          <Button type="submit" variant="ink" block disabled={pending}>
            {pending ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </Button>

          {USING_MOCKS && mode === 'login' ? (
            <p className="text-[13px] leading-snug text-ink-muted">
              Cuenta de prueba: {DEMO_CREDENTIALS.email} / {DEMO_CREDENTIALS.password}
            </p>
          ) : null}
        </form>

        <p className="mt-6 text-center text-[14px] text-ink-muted">
          {mode === 'login' ? '¿Primera vez aquí?' : '¿Ya tienes cuenta?'}{' '}
          <Link
            to={otherHref}
            className="rounded font-medium text-ink underline decoration-rule decoration-2 underline-offset-4 transition-colors hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {mode === 'login' ? 'Crea una cuenta' : 'Entra con tu correo'}
          </Link>
        </p>
      </main>
    </div>
  );
}
