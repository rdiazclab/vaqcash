import { forwardRef } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

/**
 * Three intents, one radius (full), one tactile behaviour.
 *
 * `accent` is carmine and therefore restricted: the marketing CTA, the revealed
 * dashboard and the wallet. Never a sealed surface. The sealed states use `ink`,
 * which is exactly as loud without spending the colour.
 */
export type ButtonVariant = 'ink' | 'accent' | 'outline' | 'quiet';

const BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-medium ' +
  'transition-[transform,background-color,color,border-color] duration-150 ' +
  'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2';

const VARIANTS: Record<ButtonVariant, string> = {
  ink: 'bg-ink text-paper hover:opacity-90 focus-visible:outline-ink',
  accent: 'bg-accent text-accent-ink hover:opacity-90 focus-visible:outline-accent',
  outline: 'border border-rule bg-surface text-ink hover:bg-sunken focus-visible:outline-ink',
  quiet: 'text-ink-muted hover:bg-sunken hover:text-ink focus-visible:outline-ink',
};

interface Common {
  variant?: ButtonVariant;
  block?: boolean;
  className?: string;
}

const classesFor = ({ variant = 'ink', block, className = '' }: Common) =>
  [BASE, VARIANTS[variant], block ? 'w-full' : '', className].filter(Boolean).join(' ');

export type ButtonProps = Common & React.ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, block, className, type = 'button', ...rest },
  ref,
) {
  return <button ref={ref} type={type} className={classesFor({ variant, block, className })} {...rest} />;
});

export type ButtonLinkProps = Common & LinkProps;

export function ButtonLink({ variant, block, className, ...rest }: ButtonLinkProps) {
  return <Link className={classesFor({ variant, block, className })} {...rest} />;
}
