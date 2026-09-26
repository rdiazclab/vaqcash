import { NotFound } from '../../domain/errors';
import type { UserRecord, WalletRecord } from '../../domain/models';
import type { UserRepository, WalletRepository } from '../../domain/ports/repositories';

export class GetMe {
  constructor(
    private readonly users: UserRepository,
    private readonly wallets: WalletRepository,
  ) {}

  async execute(userId: string): Promise<{ user: UserRecord; wallet: WalletRecord }> {
    const [user, wallet] = await Promise.all([
      this.users.findById(userId),
      this.wallets.findByUserId(userId),
    ]);
    if (!user || !wallet) throw NotFound('Usuario no encontrado');
    return { user, wallet };
  }
}
