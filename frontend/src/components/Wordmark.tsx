import { LogoMark, type LogoTone } from './Logo';

/**
 * Mark plus name.
 *
 * Inside the product the tone is always ink: the app shell sits on top of the
 * sealed dashboard and the checkout, and carmine there would spend the reveal
 * before it happens. Landing and login get the full-colour mark.
 */
export function Wordmark({
  tone = 'ink',
  className = '',
}: {
  tone?: LogoTone;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={26} tone={tone} className="text-ink" />
      <span className="text-[17px] font-semibold tracking-tight text-ink">VaqCash</span>
    </span>
  );
}
