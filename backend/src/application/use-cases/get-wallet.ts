import { NotFound } from '../../domain/errors';
import type { WalletRecord } from '../../domain/models';
import type { WalletRepository, WalletTransactionView } from '../../domain/ports/repositories';

export class GetWallet {
  constructor(private readonly wallets: WalletRepository) {}

  async execute(userId: string): Promise<{ wallet: WalletRecord; transactions: WalletTransactionView[] }> {
    const wallet = await this.wallets.findByUserId(userId);
    if (!wallet) throw NotFound('Monedero no encontrado');
    const transactions = await this.wallets.listTransactions(wallet.id);
    return { wallet, transactions };
  }
}
