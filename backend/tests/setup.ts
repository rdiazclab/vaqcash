import { TEST_DATABASE_URL } from './db-url';

// Must be set before src/config/env.ts is imported by any test module.
// dotenv never overrides an already-present process.env value, so this wins
// over backend/.env and the dev database is never reachable from the suite.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.PAYMENT_LATENCY_MS = '0';
process.env.PAYMENT_FAILURE_RATE = '0';
process.env.CORS_ORIGIN = '*';
process.env.PUBLIC_WEB_URL = 'http://localhost:5175';
process.env.JWT_SECRET = 'secreto-solo-para-la-suite-de-tests';
