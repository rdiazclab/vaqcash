import { PrismaClient } from '@prisma/client';
import { env } from '../../../config/env';

// Importing env first guarantees dotenv ran: Prisma Client (unlike the Prisma CLI)
// does not read .env on its own, so the URL is passed in explicitly.
export const prisma = new PrismaClient({
  datasources: { db: { url: env.databaseUrl } },
});

/** Cliente o cliente ligado a una transacción: los repositorios aceptan ambos. */
export type PrismaLike = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;
