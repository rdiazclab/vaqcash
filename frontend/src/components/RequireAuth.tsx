import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Wordmark } from './Wordmark';

/**
 * While the session resolves we show the page frame, not a spinner. A visitor
 * without a session is sent to the login screen carrying where they were
 * headed, so signing in resumes the journey instead of restarting it.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'resolving') {
    return (
      <div className="min-h-[100dvh] bg-paper">
        <div className="border-b border-rule">
          <div className="mx-auto flex h-[68px] max-w-5xl items-center px-4 sm:px-6">
            <Wordmark />
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6">
          <div className="skeleton h-9 w-52" />
          <div className="skeleton mt-4 h-4 w-72" />
          <div className="skeleton mt-8 h-24 w-full rounded-[12px]" />
        </div>
      </div>
    );
  }

  if (status === 'anonymous') {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return <>{children}</>;
}
