/**
 * The v2 API does not exist yet, so the whole app develops against MSW.
 * Turning VITE_USE_MOCKS off is the only change needed to point at the real one.
 */
export const USING_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

/** Seeded organizer, so the demo has content without clicking through a signup. */
export const DEMO_CREDENTIALS = { email: 'ana@vaqcash.app', password: 'vaqcash1234' };

export async function startMocks(): Promise<void> {
  if (!USING_MOCKS) return;
  const { worker } = await import('./browser');
  await worker.start({
    onUnhandledRequest: 'bypass',
    quiet: true,
    serviceWorker: { url: '/mockServiceWorker.js' },
  });
}
