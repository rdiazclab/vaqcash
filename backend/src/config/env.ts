import 'dotenv/config';

const isProduction = process.env.NODE_ENV === 'production';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

/**
 * En producción no vale el default de desarrollo: un shareUrl apuntando a
 * localhost rompe los QR, y un JWT_SECRET conocido rompe la autenticación.
 */
function requiredInProduction(name: string, fallback: string): string {
  const value = process.env[name];
  if (!value && isProduction) throw new Error(`Falta la variable de entorno ${name}`);
  return value ?? fallback;
}

export const env = {
  isProduction,
  databaseUrl: required('DATABASE_URL'),
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: requiredInProduction('CORS_ORIGIN', '*'),
  publicWebUrl: requiredInProduction('PUBLIC_WEB_URL', 'http://localhost:5175'),
  jwtSecret: requiredInProduction('JWT_SECRET', 'dev-solo-para-desarrollo-no-usar-en-produccion'),
  payment: {
    latencyMs: Number(process.env.PAYMENT_LATENCY_MS ?? 1200),
    failureRate: Number(process.env.PAYMENT_FAILURE_RATE ?? 0),
  },
};
