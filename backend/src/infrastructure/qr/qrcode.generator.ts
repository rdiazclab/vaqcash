import QRCode from 'qrcode';
import type { QrGenerator } from '../../domain/ports/qr-generator';

/** PNG en data URL, generado en el servidor para que el front no necesite librería. */
export class QrCodeGenerator implements QrGenerator {
  toDataUrl(text: string): Promise<string> {
    return QRCode.toDataURL(text, {
      type: 'image/png',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320,
    });
  }
}
