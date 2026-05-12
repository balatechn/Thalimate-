import QRCode from 'qrcode';

/**
 * Build a UPI deep-link `upi://pay?...` per NPCI spec.
 */
export function buildUpiUrl(opts: {
  vpa: string;
  payeeName: string;
  amount: number; // paise
  txnRef: string;
  note?: string;
}): string {
  const params = new URLSearchParams({
    pa: opts.vpa,
    pn: opts.payeeName,
    am: (opts.amount / 100).toFixed(2),
    cu: 'INR',
    tn: opts.note ?? `ThaliMate ${opts.txnRef}`,
    tr: opts.txnRef,
  });
  return `upi://pay?${params.toString()}`;
}

export async function upiQrDataUrl(upiUrl: string): Promise<string> {
  return QRCode.toDataURL(upiUrl, { errorCorrectionLevel: 'M', margin: 1, width: 320 });
}

export async function upiQrPngBuffer(upiUrl: string): Promise<Buffer> {
  return QRCode.toBuffer(upiUrl, { errorCorrectionLevel: 'M', margin: 1, width: 320 });
}
