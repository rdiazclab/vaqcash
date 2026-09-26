import { QrCode } from '@phosphor-icons/react';
import { api } from '../api/client';
import { useAsync } from '../lib/useAsync';
import { CopyField } from '../ui/CopyField';

/**
 * Link and QR together, because an organizer uses both: the link in the group
 * chat, the QR on the gift table. The QR loads on its own so a slow or failing
 * QR never holds back the link, which is the part people actually need.
 */
export function ShareCard({ eventId, shareUrl }: { eventId: string; shareUrl: string }) {
  const { status, data } = useAsync(() => api.getQr(eventId), [eventId]);

  return (
    <section className="rounded-[12px] border border-rule bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
        <div className="min-w-0 flex-1">
          <CopyField label="Link para el grupo" value={shareUrl} />
        </div>

        <div className="flex shrink-0 items-center gap-4 border-t border-rule pt-5 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
          {status === 'ready' ? (
            <img
              src={data.qrDataUrl}
              alt="Código QR con el link de esta cajita"
              width={112}
              height={112}
              className="size-28 rounded-[12px] border border-rule bg-white p-1.5"
            />
          ) : (
            <div className="skeleton size-28 rounded-[12px]" aria-hidden="true" />
          )}
          <p className="max-w-[18ch] text-[13px] leading-snug text-ink-muted sm:hidden">
            <QrCode size={15} className="mr-1 inline align-[-2px]" aria-hidden="true" />
            Para la mesa de regalos
          </p>
        </div>
      </div>
    </section>
  );
}
