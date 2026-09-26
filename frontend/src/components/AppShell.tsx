import { NavLink, useNavigate } from 'react-router-dom';
import { SignOut } from '@phosphor-icons/react';
import { useAuth } from '../auth/AuthContext';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Wordmark } from './Wordmark';

const LINKS = [
  // Short enough to stay on one line next to the wordmark on a 360px phone.
  { to: '/cajitas', label: 'Cajitas' },
  { to: '/wallet', label: 'Wallet' },
];

/**
 * Organizer chrome. One line on every width: the label set is short enough that
 * it never needs a hamburger, and the nav bar stays under 72px tall.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper">
      <header className="sticky top-0 z-20 border-b border-rule bg-paper/90 backdrop-blur-sm">
        <div className="mx-auto flex h-[68px] max-w-5xl items-center gap-3 px-4 sm:px-6">
          <NavLink
            to="/cajitas"
            className="rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <Wordmark />
          </NavLink>

          <nav aria-label="Secciones" className="ml-2 flex items-center gap-1 sm:ml-4">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3 text-[14px] transition-colors ${
                    isActive ? 'bg-sunken font-medium text-ink' : 'text-ink-muted hover:text-ink'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/', { replace: true });
              }}
              aria-label={user ? `Salir de la cuenta de ${user.displayName}` : 'Salir'}
              className="inline-flex size-11 items-center justify-center rounded-full border border-rule bg-surface text-ink transition-transform duration-150 active:scale-[0.98] hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <SignOut size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-20 pt-8 sm:px-6">{children}</main>
    </div>
  );
}
