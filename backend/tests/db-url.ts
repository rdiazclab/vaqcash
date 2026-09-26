/** Dedicated test database, same container as dev, so dev data is never touched. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5434/sobres_test?schema=public';
