import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import { ThemeProvider } from './lib/theme';
import { startMocks } from './mocks/enable';
import './styles/app.css';

/**
 * The mock worker has to be listening before the first request goes out, so the
 * app mounts only once it is ready.
 */
async function bootstrap() {
  await startMocks();

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
