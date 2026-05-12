import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { TZ } from './constants';

/** paise -> "₹240" */
export function formatINR(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function formatISTDate(d: Date | string, fmt = 'dd MMM yyyy, hh:mm a'): string {
  return formatInTimeZone(new Date(d), TZ, fmt);
}

export function todayISTDateOnly(): Date {
  const d = formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd');
  return new Date(`${d}T00:00:00.000Z`);
}

export function generateOrderCode(seq: number, when = new Date()): string {
  const ymd = formatInTimeZone(when, TZ, 'yyyyMMdd');
  return `TM-${ymd}-${seq.toString().padStart(4, '0')}`;
}

export { format };
