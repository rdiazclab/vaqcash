import { Prisma, type PrismaClient } from '@prisma/client';
import { EmailTaken } from '../../../domain/errors';
import type { UserRecord, WalletRecord } from '../../../domain/models';
import type { CreateUserInput, UserRepository, UserWithSecret } from '../../../domain/ports/repositories';
import { toUser, toWallet } from './mappers';

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db: PrismaClient) {}

  async createWithWallet(input: CreateUserInput): Promise<{ user: UserRecord; wallet: WalletRecord }> {
    try {
      // Usuario y monedero en la misma transacción: no existe organizador sin wallet.
      return await this.db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: input.email,
            passwordHash: input.passwordHash,
            displayName: input.displayName,
          },
        });
        const wallet = await tx.wallet.create({
          data: { userId: user.id, currency: input.currency },
        });
        return { user: toUser(user), wallet: toWallet(wallet) };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw EmailTaken();
      }
      throw err;
    }
  }

  async findByEmailWithSecret(email: string): Promise<UserWithSecret | null> {
    const row = await this.db.user.findUnique({ where: { email } });
    return row ? { user: toUser(row), passwordHash: row.passwordHash } : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const row = await this.db.user.findUnique({ where: { id } });
    return row ? toUser(row) : null;
  }
}
