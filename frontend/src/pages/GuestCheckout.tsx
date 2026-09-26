import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useReducedMotion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  CreditCard,
  Envelope,
  Link as LinkIcon,
  Lock,
  QrCode,
  SealCheck,
} from '@phosphor-icons/react';
import { api } from '../api/client';
import { ApiError, humanMessage } from '../api/errors';
import type { PaymentMethod, PublicBoxView, Receipt } from '../api/types';
import {
  amountPlaceholder,
  formatMoney,
  parseAmountToMinor,
  suggestedAmounts,
  toInputValue,
} from '../lib/money';
import { useAsync } from '../lib/useAsync';
import { Button } from '../ui/Button';
import { CheckField, TextAreaField, TextField } from '../ui/Field';
import { ErrorState, FormError } from '../ui/States';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Wordmark } from '../components/Wordmark';

/**
 * The guest arrives from WhatsApp on a phone. Every step of this screen is sized
 * to fit 360x640 without scrolling, which is why the flow is split in steps
 * instead of being one long form.
 *
 * It is entirely monochrome: the box is sealed while the guest is here, and the
 * guest never sees the reveal. Spending carmine here would spend the whole idea.
 */
type Step = 'amount' | 'payment' | 'processing' | 'receipt';

export function GuestCheckout() {
  const { uuid = '' } = useParams();
  const { status, data, error, reload } = useAsync(() => api.getPublicBox(uuid), [uuid]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper">
      <header className="flex h-[52px] shrink-0 items-center border-b border-rule px-4">
        <Wordmark />
        <div className="ml-auto">
          <ThemeToggle className="size-9" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-3">
        {status === 'loading' ? <BoxSkeleton /> : null}

        {status === 'error' ? (
          <div className="flex flex-1 items-center">
            <ErrorState
              title={
                error instanceof ApiError && error.code === 'NOT_FOUND'
                  ? 'Este link no lleva a ninguna cajita'
                  : 'No pudimos abrir la cajita'
              }
              body={
                error instanceof ApiError && error.code === 'NOT_FOUND'
                  ? 'Puede que el link esté incompleto. Pídele al organizador que lo comparta de nuevo.'
                  : humanMessage(error)
              }
              onRetry={error instanceof ApiError && error.code === 'NOT_FOUND' ? undefined : reload}
            />
          </div>
        ) : null}

        {status === 'ready' ? <Flow box={data} /> : null}
      </main>
    </div>
  );
}

function Flow({ box }: { box: PublicBoxView }) {
  const [step, setStep] = useState<Step>('amount');
  const [amountRaw, setAmountRaw] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [message, setMessage] = useState('');
  const [showMessage, setShowMessage] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('CARD');
  const [card, setCard] = useState({ number: '', expiry: '', cvc: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  // "cents" is the contract's name; the value is minor units of box.currency.
  const amountCents = parseAmountToMinor(amountRaw, box.currency);

  if (box.isRevealed && step !== 'receipt') {
    return (
      <div className="flex flex-1 items-center">
        <div className="w-full rounded-[12px] border border-rule bg-surface p-6 text-center">
          <Envelope size={30} weight="duotone" className="mx-auto text-ink-muted" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-ink">
            Esta cajita ya se abrió
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
            {box.title} cerró sus sobres, así que ya no acepta aportes nuevos.
          </p>
        </div>
      </div>
    );
  }

  function submitAmount(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    // The floor only catches typos and zeroes. What counts as a sensible
    // minimum is a business rule the contract does not state, so the server
    // owns it rather than this form inventing one.
    if (amountCents === null) next.amount = 'Escribe cuánto quieres aportar.';
    else if (amountCents < 100) next.amount = 'Ese monto es demasiado bajo.';
    if (!anonymous && displayName.trim().length < 2) next.displayName = 'Escribe tu nombre.';
    setErrors(next);
    if (Object.keys(next).length === 0) setStep('payment');
  }

  async function pay(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (method === 'CARD') {
      const digits = card.number.replace(/\D/g, '');
      if (digits.length < 15) next.number = 'El número debe tener 16 dígitos.';
      if (!/^\d{2}\/\d{2}$/.test(card.expiry)) next.expiry = 'Usa MM/AA.';
      if (card.cvc.replace(/\D/g, '').length < 3) next.cvc = '3 dígitos.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setFormError(null);
    setStep('processing');
    try {
      // The card details deliberately never leave the browser: the contract in
      // docs/API.md carries no PAN, and a real integration would tokenise first.
      const created = await api.contribute(box.uuid, {
        amountCents: amountCents!,
        displayName: anonymous ? undefined : displayName.trim(),
        isAnonymous: anonymous,
        message: message.trim() || undefined,
        method,
      });
      setReceipt(created);
      setStep('receipt');
    } catch (caught) {
      const ref = caught instanceof ApiError ? caught.paymentRef : null;
      setFormError(ref ? `${humanMessage(caught)} Referencia: ${ref}` : humanMessage(caught));
      setStep('payment');
    }
  }

  if (step === 'receipt' && receipt) return <ReceiptView receipt={receipt} />;
  if (step === 'processing') return <Processing amountCents={amountCents ?? 0} currency={box.currency} />;

  if (step === 'payment') {
    return (
      <form onSubmit={pay} noValidate className="flex flex-1 flex-col">
        <button
          type="button"
          onClick={() => setStep('amount')}
          className="inline-flex min-h-9 w-fit items-center gap-1.5 text-[13px] text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Cambiar monto
        </button>

        <h1 className="mt-2 text-xl font-semibold tracking-tight text-ink">Cómo quieres pagar</h1>
        <p className="num mt-1 text-[14px] text-ink-muted">
          {formatMoney(amountCents ?? 0, box.currency)} para {box.title}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {METHODS.map(({ value, label, icon: MethodIcon }) => {
            const selected = method === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                onClick={() => setMethod(value)}
                className={`flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-[12px] border text-[12px] font-medium transition-transform duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                  selected
                    ? 'border-ink bg-surface text-ink'
                    : 'border-rule bg-sunken text-ink-muted hover:text-ink'
                }`}
              >
                <MethodIcon size={20} aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          {method === 'CARD' ? (
            <div className="flex flex-col gap-3">
              <TextField
                label="Número de tarjeta"
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="4242 4242 4242 4242"
                value={card.number}
                onChange={(event) =>
                  setCard((current) => ({ ...current, number: formatCardNumber(event.target.value) }))
                }
                error={errors.number}
                mono
              />
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Caducidad"
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  placeholder="09/28"
                  value={card.expiry}
                  onChange={(event) =>
                    setCard((current) => ({ ...current, expiry: formatExpiry(event.target.value) }))
                  }
                  error={errors.expiry}
                  mono
                />
                <TextField
                  label="CVC"
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  placeholder="123"
                  value={card.cvc}
                  onChange={(event) =>
                    setCard((current) => ({
                      ...current,
                      cvc: event.target.value.replace(/\D/g, '').slice(0, 4),
                    }))
                  }
                  error={errors.cvc}
                  mono
                />
              </div>
            </div>
          ) : null}

          {method === 'QR' ? (
            <div className="flex items-start gap-4 rounded-[12px] border border-dashed border-rule bg-surface p-4">
              <QrCode size={56} className="shrink-0 text-ink" aria-hidden="true" />
              <p className="text-[13px] leading-snug text-ink-muted">
                Pago simulado por QR. Al confirmar, damos el cobro por aprobado sin escanear nada.
              </p>
            </div>
          ) : null}

          {method === 'LINK' ? (
            <div className="flex items-start gap-4 rounded-[12px] border border-dashed border-rule bg-surface p-4">
              <LinkIcon size={40} className="shrink-0 text-ink" aria-hidden="true" />
              <p className="text-[13px] leading-snug text-ink-muted">
                Pago simulado por link. Al confirmar, damos el cobro por aprobado sin salir de aquí.
              </p>
            </div>
          ) : null}
        </div>

        {formError ? (
          <div className="mt-4">
            <FormError>{formError}</FormError>
          </div>
        ) : null}

        <div className="mt-auto pt-4">
          <Button type="submit" variant="ink" block>
            <Lock size={16} aria-hidden="true" />
            Pagar {formatMoney(amountCents ?? 0, box.currency)}
          </Button>
          <p className="mt-2.5 text-center text-[12px] leading-snug text-ink-muted">
            Cobro simulado. No se mueve dinero real.
          </p>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submitAmount} noValidate className="flex flex-1 flex-col">
      <div className="flex items-center gap-1.5 text-[12px] text-ink-muted">
        <Lock size={13} aria-hidden="true" />
        Sobre sellado
      </div>
      <h1 className="mt-1.5 text-xl font-semibold leading-tight tracking-tight text-ink">
        {box.title}
      </h1>
      <p className="mt-1.5 text-[13px] leading-snug text-ink-muted">
        Tu monto queda sellado. Ni el organizador lo ve hasta que abra la cajita.
      </p>

      <div className="mt-3.5 flex flex-col gap-2.5">
        <TextField
          label={`Tu aporte (${box.currency})`}
          inputMode="decimal"
          placeholder={amountPlaceholder(box.currency)}
          value={amountRaw}
          onChange={(event) => setAmountRaw(event.target.value)}
          error={errors.amount}
          mono
          required
          autoFocus
        />

        {/* The presets step aside once the message box takes their room. */}
        <div className={showMessage ? 'hidden' : 'flex gap-2'}>
          {suggestedAmounts(box.currency).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setAmountRaw(toInputValue(preset, box.currency))}
              className="num min-h-11 flex-1 rounded-full border border-rule bg-surface text-[13px] text-ink transition-transform duration-150 active:scale-[0.98] hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {formatMoney(preset, box.currency)}
            </button>
          ))}
        </div>

        {!anonymous ? (
          <TextField
            label="Tu nombre"
            autoComplete="name"
            placeholder="Camila Ortiz"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            error={errors.displayName}
            required
          />
        ) : null}

        <CheckField
          label="Aportar de forma anónima"
          helper="Tu nombre no aparece en la cajita. VaqCash sí lo guarda, para poder devolverte el dinero."
          checked={anonymous}
          onChange={setAnonymous}
        />

        {showMessage ? (
          <TextAreaField
            label="Mensaje"
            optional
            placeholder="¡Felicidades!"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={180}
            minHeightClass="min-h-[56px]"
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowMessage(true)}
            className="min-h-11 w-fit text-[13px] text-ink underline decoration-rule decoration-2 underline-offset-4 transition-colors hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Agregar un mensaje
          </button>
        )}
      </div>

      <div className="mt-auto pt-4">
        <Button type="submit" variant="ink" block>
          Continuar al pago
          <ArrowRight size={17} aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}

const METHODS: { value: PaymentMethod; label: string; icon: typeof CreditCard }[] = [
  { value: 'CARD', label: 'Tarjeta', icon: CreditCard },
  { value: 'QR', label: 'QR', icon: QrCode },
  { value: 'LINK', label: 'Link', icon: LinkIcon },
];

function formatCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

function formatExpiry(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/** Believable while the simulated gateway takes its time. Never a bare spinner. */
function Processing({ amountCents, currency }: { amountCents: number; currency: string }) {
  const reduceMotion = useReducedMotion();
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (reduceMotion) {
      setStage(2);
      return;
    }
    const timers = [
      window.setTimeout(() => setStage(1), 500),
      window.setTimeout(() => setStage(2), 1050),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [reduceMotion]);

  const stages = ['Autorizando el cobro', 'Confirmando con el emisor', 'Sellando tu sobre'];

  return (
    <div className="flex flex-1 flex-col justify-center">
      <div className="rounded-[12px] border border-rule bg-surface p-6">
        <p className="num text-3xl font-semibold tracking-tighter text-ink">
          {formatMoney(amountCents, currency)}
        </p>
        <ul aria-live="polite" className="mt-6 flex flex-col gap-3">
          {stages.map((label, index) => (
            <li key={label} className="flex items-center gap-2.5 text-[14px]">
              {index < stage ? (
                <CheckCircle size={17} weight="fill" className="text-ink" aria-hidden="true" />
              ) : (
                <span
                  className={`inline-block size-[17px] rounded-full border ${
                    index === stage ? 'border-ink' : 'border-rule'
                  }`}
                  aria-hidden="true"
                />
              )}
              <span className={index <= stage ? 'text-ink' : 'text-ink-muted'}>{label}</span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[13px] leading-snug text-ink-muted">
          No cierres esta pantalla. Tarda unos segundos.
        </p>
      </div>
    </div>
  );
}

function ReceiptView({ receipt }: { receipt: Receipt }) {
  return (
    <div className="flex flex-1 flex-col justify-center">
      <div className="rounded-[12px] border border-rule bg-surface p-6 shadow-[var(--shadow-card)]">
        <SealCheck size={34} weight="duotone" className="text-ink" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-ink">Tu sobre está sellado</h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">
          Nadie verá tu monto hasta que el organizador abra {receipt.boxTitle}.
        </p>

        <dl className="mt-6 flex flex-col gap-3 border-t border-rule pt-5 text-[14px]">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-ink-muted">Tu aporte</dt>
            <dd className="num text-xl font-semibold tracking-tight text-ink">
              {formatMoney(receipt.amountCents, receipt.currency)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-ink-muted">Referencia</dt>
            <dd className="num truncate text-[13px] text-ink">{receipt.paymentRef ?? receipt.id}</dd>
          </div>
        </dl>

        <p className="mt-6 text-[12px] leading-snug text-ink-muted">
          Guarda la referencia por si necesitas reclamar el aporte.
        </p>
      </div>
    </div>
  );
}

function BoxSkeleton() {
  return (
    <div className="flex flex-1 flex-col" aria-busy="true">
      <div className="skeleton h-3 w-24" />
      <div className="skeleton mt-2.5 h-6 w-48" />
      <div className="skeleton mt-2.5 h-3.5 w-full max-w-xs" />
      <div className="mt-5 flex flex-col gap-3">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton h-11 w-full rounded-[12px]" />
        <div className="flex gap-2">
          <div className="skeleton h-11 flex-1 rounded-full" />
          <div className="skeleton h-11 flex-1 rounded-full" />
          <div className="skeleton h-11 flex-1 rounded-full" />
        </div>
        <div className="skeleton h-3 w-20" />
        <div className="skeleton h-11 w-full rounded-[12px]" />
        <div className="skeleton h-[76px] w-full rounded-[12px]" />
      </div>
      <div className="mt-auto pt-5">
        <div className="skeleton h-11 w-full rounded-full" />
      </div>
    </div>
  );
}
