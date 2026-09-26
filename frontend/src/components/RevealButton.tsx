import { useState } from 'react';
import { EnvelopeOpen, Warning } from '@phosphor-icons/react';
import { Button } from '../ui/Button';

/**
 * Two steps, because revealing cannot be undone. Deliberately monochrome: the
 * accent is the reward for pressing it, so it cannot be spent on the button.
 */
export function RevealButton({
  envelopeCount,
  pending,
  onConfirm,
}: {
  envelopeCount: number;
  pending: boolean;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (envelopeCount === 0) {
    return (
      <div className="rounded-[12px] border border-dashed border-rule bg-surface p-5">
        <p className="text-[14px] leading-relaxed text-ink-muted">
          Cuando llegue el primer sobre podrás abrir la cajita. Comparte el link para empezar.
        </p>
      </div>
    );
  }

  if (!confirming) {
    return (
      <div className="flex">
        <Button
          variant="ink"
          className="max-sm:w-full"
          onClick={() => setConfirming(true)}
          disabled={pending}
        >
          <EnvelopeOpen size={18} weight="duotone" aria-hidden="true" />
          Abrir {envelopeCount} {envelopeCount === 1 ? 'sobre' : 'sobres'}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-[12px] border border-rule bg-surface p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-2.5">
        <Warning size={18} className="mt-0.5 shrink-0 text-ink" aria-hidden="true" />
        <div>
          <p className="text-[15px] font-medium text-ink">
            Esto es definitivo. Se revelan los {envelopeCount} montos y el dinero pasa a tu wallet.
          </p>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-muted">
            Después de abrirla, la cajita deja de aceptar sobres nuevos.
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Button variant="ink" onClick={onConfirm} disabled={pending}>
          {pending ? 'Abriendo sobres…' : 'Sí, revelar ahora'}
        </Button>
        <Button variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
