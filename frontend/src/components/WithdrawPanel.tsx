import { useState } from 'react';
import { ArrowUpRight, Info } from '@phosphor-icons/react';
import { api } from '../api/client';
import { ApiError, humanMessage } from '../api/errors';
import { formatMoney, parseAmountToMinor, toInputValue } from '../lib/money';
import { Button } from '../ui/Button';
import { TextField } from '../ui/Field';
import { FormError } from '../ui/States';

/**
 * Withdrawing is the only way money leaves the wallet, so it gets a real form
 * with a confirmation step rather than a one-tap button.
 *
 * The copy says plainly that nothing reaches a bank account. Pretending a
 * transfer happened would be the one lie this product cannot afford.
 */
type Step = 'idle' | 'form' | 'confirm' | 'done';

export function WithdrawPanel({
  balanceCents,
  currency,
  onWithdrawn,
}: {
  balanceCents: number;
  currency: string;
  onWithdrawn: () => void;
}) {
  const [step, setStep] = useState<Step>('idle');
  const [raw, setRaw] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [lastAmount, setLastAmount] = useState(0);

  const amountCents = parseAmountToMinor(raw, currency);
  const empty = balanceCents <= 0;

  function reset() {
    setStep('idle');
    setRaw('');
    setFieldError(null);
    setFormError(null);
  }

  function review(event: React.FormEvent) {
    event.preventDefault();
    if (amountCents === null) {
      setFieldError('Escribe cuánto quieres retirar.');
      return;
    }
    if (amountCents > balanceCents) {
      setFieldError(`Tu saldo es ${formatMoney(balanceCents, currency)}.`);
      return;
    }
    setFieldError(null);
    setStep('confirm');
  }

  async function confirm() {
    if (amountCents === null) return;
    setPending(true);
    setFormError(null);
    try {
      const result = await api.withdraw(amountCents);
      setLastAmount(result.amountCents);
      setStep('done');
      onWithdrawn();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'INSUFFICIENT_FUNDS') {
        const real = error.balanceCents;
        setFieldError(
          real === null
            ? 'No tienes saldo suficiente.'
            : `Tu saldo bajó a ${formatMoney(real, currency)} mientras confirmabas.`,
        );
        setStep('form');
        onWithdrawn();
      } else {
        setFormError(humanMessage(error));
        setStep('form');
      }
    } finally {
      setPending(false);
    }
  }

  if (empty) {
    return (
      <p className="mt-5 flex items-start gap-2.5 border-t border-rule pt-5 text-[14px] leading-snug text-ink-muted">
        <Info size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
        Cuando abras una cajita el total entra aquí y podrás retirarlo.
      </p>
    );
  }

  if (step === 'done') {
    return (
      <div className="mt-5 border-t border-rule pt-5">
        <p className="text-[15px] font-medium text-ink">
          Retiraste {formatMoney(lastAmount, currency)}.
        </p>
        <p className="mt-1.5 max-w-[52ch] text-[13px] leading-relaxed text-ink-muted">
          Retiro simulado: el saldo bajó y queda el movimiento, pero no salió dinero a ninguna
          cuenta bancaria real.
        </p>
        <Button variant="outline" className="mt-4" onClick={reset}>
          Listo
        </Button>
      </div>
    );
  }

  if (step === 'idle') {
    return (
      <div className="mt-5 flex flex-col gap-3 border-t border-rule pt-5 sm:flex-row sm:items-center">
        <Button
          variant="ink"
          className="max-sm:w-full"
          onClick={() => setStep('form')}
          data-testid="withdraw-open"
        >
          <ArrowUpRight size={17} aria-hidden="true" />
          Retirar saldo
        </Button>
        <p className="max-w-[44ch] text-[13px] leading-snug text-ink-muted">
          Retiro simulado. No sale dinero a ninguna cuenta bancaria real.
        </p>
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div className="mt-5 border-t border-rule pt-5">
        <p className="text-[15px] font-medium text-ink">
          Vas a retirar {formatMoney(amountCents ?? 0, currency)} de{' '}
          {formatMoney(balanceCents, currency)}.
        </p>
        <p className="mt-1.5 max-w-[52ch] text-[13px] leading-relaxed text-ink-muted">
          Queda el asiento en tus movimientos. Es un retiro simulado, no hay transferencia a un
          banco.
        </p>
        <FormError>{formError}</FormError>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button variant="ink" onClick={confirm} disabled={pending} data-testid="withdraw-confirm">
            {pending ? 'Retirando…' : 'Sí, retirar'}
          </Button>
          <Button variant="outline" onClick={() => setStep('form')} disabled={pending}>
            Cambiar monto
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={review} noValidate className="mt-5 border-t border-rule pt-5">
      <TextField
        label={`Cuánto quieres retirar (${currency})`}
        inputMode="decimal"
        value={raw}
        onChange={(event) => setRaw(event.target.value)}
        helper={`Disponible: ${formatMoney(balanceCents, currency)}.`}
        error={fieldError}
        mono
        required
        autoFocus
        className="max-w-xs"
      />
      <FormError>{formError}</FormError>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" variant="ink">
          Continuar
        </Button>
        <Button
          variant="quiet"
          onClick={() => setRaw(toInputValue(balanceCents, currency))}
          className="sm:ml-1"
        >
          Retirar todo
        </Button>
        <Button variant="outline" onClick={reset} className="sm:ml-auto">
          Cancelar
        </Button>
      </div>
      <p className="mt-3 text-[13px] leading-snug text-ink-muted">
        Retiro simulado. No sale dinero a ninguna cuenta bancaria real.
      </p>
    </form>
  );
}
