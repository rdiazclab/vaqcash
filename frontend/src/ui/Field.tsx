import { useId } from 'react';

/**
 * Label above the control, always. Helper text lives in the markup even when
 * empty so the layout never shifts when an error appears, and the error is
 * wired with aria-describedby instead of only being coloured.
 */
interface FieldShell {
  label: string;
  helper?: string;
  error?: string | null;
  required?: boolean;
  /** Marked in the label, because "required" is the default expectation. */
  optional?: boolean;
  className?: string;
}

const CONTROL =
  'w-full min-h-11 rounded-[12px] border bg-sunken px-3.5 py-2.5 text-[15px] text-ink ' +
  'placeholder:text-ink-muted transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

export type TextFieldProps = FieldShell &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className'> & { mono?: boolean };

export function TextField({
  label,
  helper,
  error,
  required,
  optional,
  className = '',
  mono,
  id,
  ...rest
}: TextFieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const helperId = `${fieldId}-helper`;
  const errorId = `${fieldId}-error`;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label htmlFor={fieldId} className="text-[13px] font-medium text-ink">
        {label}
        {optional ? <span className="font-normal text-ink-muted"> (opcional)</span> : null}
      </label>
      <input
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={[helper ? helperId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined}
        className={`${CONTROL} ${mono ? 'num' : ''} ${error ? 'border-ink' : 'border-rule'}`}
        {...rest}
      />
      {helper ? (
        <p id={helperId} className="text-[13px] leading-snug text-ink-muted">
          {helper}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-[13px] font-medium leading-snug text-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export type TextAreaFieldProps = FieldShell &
  Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> & {
    /** Lets a cramped screen ask for a shorter box without a second component. */
    minHeightClass?: string;
  };

export function TextAreaField({
  label,
  helper,
  error,
  required,
  optional,
  className = '',
  minHeightClass = 'min-h-[88px]',
  id,
  ...rest
}: TextAreaFieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const helperId = `${fieldId}-helper`;
  const errorId = `${fieldId}-error`;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label htmlFor={fieldId} className="text-[13px] font-medium text-ink">
        {label}
        {optional ? <span className="font-normal text-ink-muted"> (opcional)</span> : null}
      </label>
      <textarea
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={[helper ? helperId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined}
        className={`${CONTROL} ${minHeightClass} resize-y leading-relaxed ${error ? 'border-ink' : 'border-rule'}`}
        {...rest}
      />
      {helper ? (
        <p id={helperId} className="text-[13px] leading-snug text-ink-muted">
          {helper}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-[13px] font-medium leading-snug text-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface CheckFieldProps {
  label: string;
  /** One line, in plain words, of what checking this box actually does. */
  helper: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function CheckField({ label, helper, checked, onChange }: CheckFieldProps) {
  const id = useId();
  return (
    <div className="flex items-start gap-3 rounded-[12px] border border-rule bg-surface p-3.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-describedby={`${id}-helper`}
        className="mt-0.5 size-5 shrink-0 accent-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      />
      <div className="min-w-0">
        <label htmlFor={id} className="block text-[14px] font-medium text-ink">
          {label}
        </label>
        <p id={`${id}-helper`} className="mt-1 text-[13px] leading-snug text-ink-muted">
          {helper}
        </p>
      </div>
    </div>
  );
}

export type SelectFieldProps = FieldShell &
  Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'className'>;

/** Same label-above-control contract as the text fields, native select inside. */
export function SelectField({
  label,
  helper,
  error,
  required,
  optional,
  className = '',
  id,
  children,
  ...rest
}: SelectFieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const helperId = `${fieldId}-helper`;
  const errorId = `${fieldId}-error`;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label htmlFor={fieldId} className="text-[13px] font-medium text-ink">
        {label}
        {optional ? <span className="font-normal text-ink-muted"> (opcional)</span> : null}
      </label>
      <select
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={[helper ? helperId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined}
        className={`${CONTROL} appearance-none bg-[length:16px] bg-[right_0.9rem_center] bg-no-repeat pr-10 ${error ? 'border-ink' : 'border-rule'}`}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%235E5E66' stroke-width='1.6'><path d='M4 6.5 8 10.5 12 6.5'/></svg>\")",
        }}
        {...rest}
      >
        {children}
      </select>
      {helper ? (
        <p id={helperId} className="text-[13px] leading-snug text-ink-muted">
          {helper}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-[13px] font-medium leading-snug text-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
