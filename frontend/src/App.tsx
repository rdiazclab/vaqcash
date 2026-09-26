import { Navigate, Route, Routes } from 'react-router-dom';
import { Cajitas } from './pages/Cajitas';
import { CajitaDashboard } from './pages/CajitaDashboard';
import { CreateCajita } from './pages/CreateCajita';
import { GuestCheckout } from './pages/GuestCheckout';
import { Landing } from './pages/Landing';
import { Login, Register } from './pages/Auth';
import { Wallet } from './pages/Wallet';
import { RequireAuth } from './components/RequireAuth';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/registro" element={<Register />} />
      {/* Public: the guest arrives here from a WhatsApp link, never logged in. */}
      <Route path="/caja/:uuid" element={<GuestCheckout />} />

      <Route
        path="/cajitas"
        element={
          <RequireAuth>
            <Cajitas />
          </RequireAuth>
        }
      />
      <Route
        path="/cajitas/nueva"
        element={
          <RequireAuth>
            <CreateCajita />
          </RequireAuth>
        }
      />
      <Route
        path="/cajitas/:id"
        element={
          <RequireAuth>
            <CajitaDashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/wallet"
        element={
          <RequireAuth>
            <Wallet />
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
