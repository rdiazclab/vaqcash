import { randomBytes, randomUUID } from 'node:crypto';
import type { IdGenerator } from '../domain/ports/id-generator';

export class CryptoIdGenerator implements IdGenerator {
  uuid(): string {
    return randomUUID();
  }

  slug(title: string): string {
    const base = title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    return `${base || 'cajita'}-${randomBytes(3).toString('hex')}`;
  }
}
