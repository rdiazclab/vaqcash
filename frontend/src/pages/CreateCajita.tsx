import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, QrCode } from '@phosphor-icons/react';
import { api } from '../api/client';
import { ApiError, humanMessage } from '../api/errors';
import type { CreateEventResponse } from '../api/types';
import { CURRENCY_LABEL, DEFAULT_CURRENCY, SUPPORTED_CURRENCIES, type Currency } from '../lib/money';
import { Button, ButtonLink } from '../ui/Button';
import { SelectField, TextAreaField, TextField } from '../ui/Field';
import { FormError } from '../ui/States';
import { CopyField } from '../ui/CopyField';
import { AppShell } from '../components/AppShell';

export function CreateCajita() {
  const [created, setCreated] = useState<CreateEventResponse | null>(null);

  return (
    <AppShell>
      <Link
        to="/cajitas"
        className="inline-flex min-h-11 items-center gap-2 text-[14px] text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Mis cajitas
      </Link>

      {created ? <ShareStep created={created} /> : <CreateForm onCreated={setCreated} />}
    </AppShell>
  );
}

function CreateForm({ onCreated }: { onCreated: (created: CreateEventResponse) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState<Currency>(DEFAULT_CURRENCY);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (title.trim().length < 3) {
      setTitleError('Ponle un nombre de al menos 3 caracteres.');
      return;
    }
    setTitleError(null);
    setPending(true);
    setFormError(null);
    try {
      onCreated(
        await api.createEvent({
          title: title.trim(),
          description: description.trim() || null,
          currency,
        }),
      );
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
        setTitleError(error.message);
      } else {
        setFormError(humanMessage(error));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-6 max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tighter text-ink md:text-4xl">Crear cajita</h1>
      <p className="mt-2 max-w-[54ch] text-[15px] leading-relaxed text-ink-muted">
        Solo el nombre es obligatorio. Al crearla recibes el link y el QR para compartir.
      </p>

      <form onSubmit={submit} noValidate className="mt-8 flex flex-col gap-5">
        <TextField
          label="Nombre de la cajita"
          placeholder="Grado de Mariana"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          helper="Es lo que verán tus invitados al abrir el link."
          error={titleError}
          required
          autoFocus
        />

        <SelectField
          label="Moneda"
          value={currency}
          onChange={(event) => setCurrency(event.target.value as Currency)}
          helper="Se fija al crear la cajita y no se puede cambiar después."
        >
          {SUPPORTED_CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {CURRENCY_LABEL[code]}
            </option>
          ))}
        </SelectField>

        <TextAreaField
          label="Descripción"
          optional
          placeholder="Sobres para el grado. Abrimos en la fiesta."
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          helper="Opcional. Una o dos frases para dar contexto al grupo."
        />

        <FormError>{formError}</FormError>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" variant="ink" disabled={pending}>
            {pending ? 'Creando…' : 'Crear cajita'}
            {pending ? null : <ArrowRight size={17} aria-hidden="true" />}
          </Button>
          <ButtonLink to="/cajitas" variant="outline">
            Cancelar
          </ButtonLink>
        </div>
      </form>
    </div>
  );
}

function ShareStep({ created }: { created: CreateEventResponse }) {
  return (
    <div className="mt-6 max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tighter text-ink md:text-4xl">
        {created.event.title} está lista
      </h1>
      <p className="mt-2 max-w-[54ch] text-[15px] leading-relaxed text-ink-muted">
        Comparte el link o el QR. Cada aporte llega sellado y ni tú ves el monto hasta que abras la
        cajita.
      </p>

      <div className="mt-8 rounded-[12px] border border-rule bg-surface p-5 sm:p-6">
        <CopyField label="Link para el grupo" value={created.shareUrl} />

        <div className="mt-6 flex flex-col items-start gap-5 border-t border-rule pt-6 sm:flex-row sm:items-center">
          <img
            src={created.qrDataUrl}
            alt={`Código QR que abre la cajita ${created.event.title}`}
            width={160}
            height={160}
            className="size-40 shrink-0 rounded-[12px] border border-rule bg-white p-2"
          />
          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-medium text-ink">
              <QrCode size={17} aria-hidden="true" />
              Para imprimir o proyectar
            </h2>
            <p className="mt-1.5 max-w-[42ch] text-[14px] leading-relaxed text-ink-muted">
              Sirve en la mesa de regalos o en la pantalla del salón. Apunta al mismo link.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <ButtonLink to={`/cajitas/${created.event.id}`} variant="ink">
          Ir al panel de la cajita
          <ArrowRight size={17} aria-hidden="true" />
        </ButtonLink>
        <ButtonLink to="/cajitas" variant="outline">
          Mis cajitas
        </ButtonLink>
      </div>
    </div>
  );
}
