import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  CheckCircle,
  Envelope,
  EnvelopeOpen,
  Lock,
  QrCode,
  Wallet as WalletIcon,
} from '@phosphor-icons/react';
import { useAuth } from '../auth/AuthContext';
import { ButtonLink } from '../ui/Button';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Wordmark } from '../components/Wordmark';

export function Landing() {
  const { status } = useAuth();
  const reduceMotion = useReducedMotion();

  return (
    <div className="min-h-[100dvh] bg-paper">
      {/* Nav: one line at every width, 68px tall. */}
      <header className="border-b border-rule">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center px-4 sm:px-6">
          <Wordmark tone="brand" />
          <div className="ml-auto flex items-center gap-2">
            <a
              href="#como-funciona"
              className="hidden min-h-11 items-center rounded-full px-3 text-[14px] text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:inline-flex"
            >
              Cómo funciona
            </a>
            <ThemeToggle />
            {status === 'authenticated' ? (
              <ButtonLink to="/cajitas" variant="outline">
                Mis cajitas
              </ButtonLink>
            ) : (
              <ButtonLink to="/login" variant="outline">
                Entrar
              </ButtonLink>
            )}
          </div>
        </div>
      </header>

      <main>
        <Hero reduceMotion={Boolean(reduceMotion)} />
        <TheTrick />
        <HowItWorks />
        <AccountSection />
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 sm:flex-row sm:items-center sm:px-6">
          <Wordmark tone="brand" />
          <p className="text-[13px] text-ink-muted sm:ml-auto">
            Los aportes se guardan sellados. Los montos solo se muestran cuando el organizador abre
            la cajita.
          </p>
        </div>
      </footer>
    </div>
  );
}

/**
 * Asymmetric split. The right column is the real sealed dashboard components at
 * small scale, not a drawing of them, so the hero shows the product in the
 * state the whole design is about.
 */
function Hero({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pb-20 lg:pt-16">
      <div>
        <h1 className="max-w-[18ch] text-balance text-4xl font-semibold leading-[1.05] tracking-tighter text-ink md:text-5xl lg:text-6xl">
          El dinero llega junto. La sorpresa, intacta.
        </h1>
        <p className="mt-5 max-w-[46ch] text-base leading-relaxed text-ink-muted">
          Recoges los aportes de todo el grupo por un link. Nadie ve los montos hasta que abres la
          cajita.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            to="/registro"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-accent px-6 text-[15px] font-medium text-accent-ink transition-transform duration-150 active:scale-[0.98] hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Crear mi cajita
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <p className="text-[14px] text-ink-muted">
            ¿Ya tienes cuenta?{' '}
            <Link
              to="/login"
              className="rounded font-medium text-ink underline decoration-rule decoration-2 underline-offset-4 transition-colors hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Entrar
            </Link>
          </p>
        </div>
      </div>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        aria-hidden="true"
        className="rounded-[12px] border border-rule bg-surface p-5 sm:p-6"
      >
        <div className="flex items-center gap-2 text-ink-muted">
          <Lock size={15} aria-hidden="true" />
          <span className="text-[12px] font-medium uppercase tracking-[0.14em]">Total sellado</span>
        </div>
        <p className="num mt-2 text-4xl font-semibold leading-none tracking-tighter text-ink sm:text-5xl">
          ? ? ?
        </p>
        <div className="mt-5 grid grid-cols-4 gap-2.5">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="envelope-sealed flex h-[74px] items-center justify-center rounded-[12px]"
            >
              <Envelope size={22} weight="duotone" className="text-ink-muted" />
            </div>
          ))}
        </div>
        <p className="mt-5 border-t border-rule pt-4 text-[13px] leading-snug text-ink-muted">
          4 sobres recibidos. El organizador tampoco ve los montos.
        </p>
      </motion.div>
    </section>
  );
}

/** The one place on the marketing site where carmine appears next to its absence. */
function TheTrick() {
  return (
    <section className="border-y border-rule bg-sunken">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
        <h2 className="max-w-[24ch] text-balance text-3xl font-semibold leading-tight tracking-tighter text-ink md:text-4xl">
          Sellado no es lo mismo que escondido
        </h2>
        <p className="mt-4 max-w-[60ch] text-base leading-relaxed text-ink-muted">
          Mientras la cajita está sellada, el servidor no envía ni un monto al navegador. No es un
          filtro visual: el dato no viaja.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <article className="rounded-[12px] border border-dashed border-rule bg-surface p-5 sm:p-6">
            <div className="flex items-center gap-2 text-ink-muted">
              <Lock size={15} aria-hidden="true" />
              <span className="text-[12px] font-medium uppercase tracking-[0.14em]">Antes</span>
            </div>
            <p className="num mt-3 text-3xl font-semibold leading-none tracking-tighter text-ink md:text-4xl">
              ? ? ?
            </p>
            <ul className="mt-5 space-y-2.5 text-[14px] leading-snug text-ink-muted">
              <li className="flex items-start gap-2">
                <Envelope size={16} weight="duotone" className="mt-0.5 shrink-0" aria-hidden="true" />
                Sobres cerrados, con fecha y nada más
              </li>
              <li className="flex items-start gap-2">
                <QrCode size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                Un link y un QR para todo el grupo
              </li>
            </ul>
          </article>

          <article className="rounded-[12px] border border-rule bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
            <div className="flex items-center gap-2 text-accent">
              <CheckCircle size={15} weight="fill" aria-hidden="true" />
              <span className="text-[12px] font-medium uppercase tracking-[0.14em]">Después</span>
            </div>
            <p className="num mt-3 text-3xl font-semibold leading-none tracking-tighter text-accent md:text-4xl">
              $ 450.000
            </p>
            <ul className="mt-5 space-y-2.5 text-[14px] leading-snug text-ink-muted">
              <li className="flex items-start gap-2">
                <EnvelopeOpen
                  size={16}
                  weight="duotone"
                  className="mt-0.5 shrink-0 text-accent"
                  aria-hidden="true"
                />
                Cada monto con su nombre y su mensaje
              </li>
              <li className="flex items-start gap-2">
                <WalletIcon size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                El saldo ya está en tu wallet
              </li>
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    icon: QrCode,
    title: 'Creas la cajita',
    body: 'Le pones nombre y recibes un link y un QR listos para pegar en el grupo de WhatsApp.',
  },
  {
    icon: Envelope,
    title: 'Cada uno sella su sobre',
    body: 'Aportan desde el teléfono con tarjeta, QR o link de pago. Pueden hacerlo sin mostrar su nombre.',
  },
  {
    icon: WalletIcon,
    title: 'Abres los sobres',
    body: 'Ves el total, cada monto y cada mensaje. El dinero queda acreditado en tu wallet.',
  },
];

function HowItWorks() {
  return (
    <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6 lg:py-20">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <h2 className="max-w-[20ch] self-start text-3xl font-semibold leading-tight tracking-tighter text-ink md:text-4xl">
          Tres momentos y ya está
        </h2>

        <ol className="divide-y divide-rule">
          {STEPS.map(({ icon: StepIcon, title, body }) => (
            <li key={title} className="flex gap-4 py-6 first:pt-0 last:pb-0">
              <StepIcon
                size={26}
                weight="duotone"
                className="mt-0.5 shrink-0 text-ink"
                aria-hidden="true"
              />
              <div>
                <h3 className="text-lg font-medium tracking-tight text-ink">{title}</h3>
                <p className="mt-1.5 max-w-[56ch] text-[15px] leading-relaxed text-ink-muted">
                  {body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function AccountSection() {
  return (
    <section id="cuenta" className="border-t border-rule bg-sunken">
      <div className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6 lg:py-20">
        <h2 className="max-w-[22ch] text-balance text-3xl font-semibold leading-tight tracking-tighter text-ink md:text-4xl">
          Abre tu cuenta de organizador
        </h2>
        <p className="mt-4 max-w-[52ch] text-base leading-relaxed text-ink-muted">
          Gratis y sin tarjeta. Tus invitados no necesitan registrarse para aportar.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink to="/registro" variant="accent">
            Crear cuenta
            <ArrowRight size={17} aria-hidden="true" />
          </ButtonLink>
          <ButtonLink to="/login" variant="outline">
            Ya tengo cuenta, entrar
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
