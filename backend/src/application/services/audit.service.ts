import type { Logger } from '../../domain/ports/logger';
import type { AuditEntry, AuditRepository } from '../../domain/ports/repositories';

/**
 * Escritura append-only del rastro de auditoría.
 *
 * Aquí vive la identidad REAL de quien aportó, incluso cuando la cajita lo
 * muestra como "Anónimo". Ninguna ruta de la API lee de aquí: el servicio no
 * ofrece lectura a propósito.
 */
export class AuditService {
  constructor(
    private readonly repo: AuditRepository,
    private readonly logger: Logger,
  ) {}

  /** Falla ruidosa: úsalo cuando el registro forme parte del hecho contable. */
  record(entry: AuditEntry): Promise<void> {
    return this.repo.record(entry);
  }

  /**
   * Falla silenciosa (pero logueada): un aporte cobrado no puede romperse
   * porque el log de auditoría no haya podido escribirse.
   */
  async safeRecord(entry: AuditEntry): Promise<void> {
    try {
      await this.repo.record(entry);
    } catch (err) {
      this.logger.error(`[audit] no se pudo registrar ${entry.action}`, err);
    }
  }
}
