import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(180),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(2).max(80),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(180),
  password: z.string().min(1).max(200),
});

export const createEventSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  // Sólo la forma: qué monedas existen lo decide domain/money.ts, que responde
  // 422 UNSUPPORTED_CURRENCY en vez de un VALIDATION_ERROR genérico.
  currency: z.string().trim().length(3).toUpperCase().optional(),
  revealAt: z.string().datetime({ offset: true }).optional().nullable(),
});

export const createContributionSchema = z
  .object({
    amountCents: z.number().int().positive().max(100_000_000),
    displayName: z.string().trim().min(2).max(60).optional().nullable(),
    isAnonymous: z.boolean().default(false),
    message: z.string().trim().max(280).optional().nullable(),
    method: z.enum(['CARD', 'QR', 'LINK']).default('CARD'),
  })
  .refine((v) => v.isAnonymous || !!v.displayName, {
    message: 'displayName es obligatorio cuando el aporte no es anónimo',
    path: ['displayName'],
  });

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
export type CreateEventBody = z.infer<typeof createEventSchema>;
export type CreateContributionBody = z.infer<typeof createContributionSchema>;

export const withdrawalSchema = z.object({
  amountCents: z.number().int().positive().max(1_000_000_000_000),
});

export type WithdrawalBody = z.infer<typeof withdrawalSchema>;
