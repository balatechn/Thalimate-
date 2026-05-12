'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { cn } from '@/lib/utils';

const STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
] as const;

type OrderStatus = (typeof STATUSES)[number];

const STATUS_COLORS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  PAID:            'bg-blue-100 text-blue-800 border-blue-300',
  PREPARING:       'bg-purple-100 text-purple-800 border-purple-300',
  READY:           'bg-indigo-100 text-indigo-800 border-indigo-300',
  OUT_FOR_DELIVERY:'bg-orange-100 text-orange-800 border-orange-300',
  DELIVERED:       'bg-green-100 text-green-800 border-green-300',
  CANCELLED:       'bg-gray-100 text-gray-600 border-gray-300',
  REFUNDED:        'bg-red-100 text-red-700 border-red-300',
};

export function OrderStatusSelect({
  orderCode,
  currentStatus,
}: {
  orderCode: string;
  currentStatus: OrderStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<OrderStatus>(currentStatus);

  async function handleChange(next: OrderStatus) {
    if (next === status) return;
    setStatus(next);
    await fetch(`/api/admin/orders/${orderCode}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    startTransition(() => router.refresh());
  }

  return (
    <select
      value={status}
      disabled={isPending}
      onChange={(e) => void handleChange(e.target.value as OrderStatus)}
      className={cn(
        'rounded border px-2 py-1 text-xs font-medium cursor-pointer transition-colors',
        STATUS_COLORS[status],
        isPending && 'opacity-60',
      )}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s.replace(/_/g, ' ')}
        </option>
      ))}
    </select>
  );
}
