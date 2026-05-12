'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type MealTime = 'LUNCH' | 'DINNER';
type Diet = 'REGULAR' | 'JAIN';

interface MenuItem {
  id: string;
  name: string;
  category: string;
  diet: string;
  price: number;
}

interface SlotData {
  slot: string;
  mealTime: MealTime;
  diet: Diet;
  menuId: string | null;
  active: boolean;
  itemIds: string[];
  soldOut: Record<string, boolean>;
}

interface Props {
  date: string;
  slots: SlotData[];
  allItems: MenuItem[];
}

const SLOT_LABELS: Record<string, string> = {
  'LUNCH-REGULAR': 'Lunch · Regular',
  'LUNCH-JAIN': 'Lunch · Jain',
  'DINNER-REGULAR': 'Dinner · Regular',
  'DINNER-JAIN': 'Dinner · Jain',
};

const CATEGORY_ORDER = ['SABZI', 'DAL', 'RICE', 'ROTI', 'SWEET', 'FARSAN', 'ADDON'];

export default function DailyMenuEditor({ date: initialDate, slots: initialSlots, allItems }: Props) {
  const router = useRouter();
  const [date, setDate] = useState(initialDate);
  const [slots, setSlots] = useState(initialSlots);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [errors, setSlotsError] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();

  function handleDateChange(newDate: string) {
    setDate(newDate);
    startTransition(() => {
      router.push(`/admin/daily-menu?date=${newDate}`);
    });
  }

  function toggleItem(slotIndex: number, itemId: string) {
    setSlots((prev) => {
      const next = [...prev];
      const slot = { ...next[slotIndex] };
      if (slot.itemIds.includes(itemId)) {
        slot.itemIds = slot.itemIds.filter((id) => id !== itemId);
        const so = { ...slot.soldOut };
        delete so[itemId];
        slot.soldOut = so;
      } else {
        slot.itemIds = [...slot.itemIds, itemId];
      }
      next[slotIndex] = slot;
      return next;
    });
  }

  function toggleSoldOut(slotIndex: number, itemId: string) {
    setSlots((prev) => {
      const next = [...prev];
      const slot = { ...next[slotIndex] };
      slot.soldOut = { ...slot.soldOut, [itemId]: !slot.soldOut[itemId] };
      next[slotIndex] = slot;
      return next;
    });
  }

  function toggleActive(slotIndex: number) {
    setSlots((prev) => {
      const next = [...prev];
      next[slotIndex] = { ...next[slotIndex], active: !next[slotIndex].active };
      return next;
    });
  }

  async function saveSlot(slotIndex: number) {
    const slot = slots[slotIndex];
    const key = slot.slot;
    setSaving((p) => ({ ...p, [key]: true }));
    setSlotsError((p) => ({ ...p, [key]: '' }));
    setSuccess((p) => ({ ...p, [key]: false }));

    try {
      const res = await fetch('/api/admin/daily-menus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          mealTime: slot.mealTime,
          diet: slot.diet,
          active: slot.active,
          itemIds: slot.itemIds,
          soldOut: slot.soldOut,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setSlotsError((p) => ({ ...p, [key]: d.error?.message || 'Save failed' }));
      } else {
        setSuccess((p) => ({ ...p, [key]: true }));
        setTimeout(() => setSuccess((p) => ({ ...p, [key]: false })), 3000);
      }
    } catch {
      setSlotsError((p) => ({ ...p, [key]: 'Network error' }));
    } finally {
      setSaving((p) => ({ ...p, [key]: false }));
    }
  }

  // Filter items by diet (Jain slots only show Jain items; Regular shows all)
  function itemsForSlot(diet: Diet) {
    return allItems.filter((item) => diet === 'JAIN' ? item.diet === 'JAIN' : true);
  }

  function groupByCategory(items: MenuItem[]) {
    const groups: Record<string, MenuItem[]> = {};
    for (const item of items) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }
    return CATEGORY_ORDER.filter((c) => groups[c]).map((c) => ({ category: c, items: groups[c] }));
  }

  return (
    <div className="space-y-4">
      {/* Date picker */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">Date:</label>
        <input
          type="date"
          value={date}
          onChange={(e) => handleDateChange(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {isPending && <span className="text-xs text-muted-foreground">Loading...</span>}
      </div>

      {/* 2x2 grid of slots */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {slots.map((slot, idx) => {
          const slotItems = itemsForSlot(slot.diet);
          const groups = groupByCategory(slotItems);
          const key = slot.slot;
          return (
            <div
              key={key}
              className="border rounded-lg overflow-hidden"
            >
              {/* Slot header */}
              <div className="flex items-center justify-between px-4 py-3 bg-muted/50">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{SLOT_LABELS[key]}</span>
                  <span className="text-xs text-muted-foreground">
                    ({slot.itemIds.length} items)
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={slot.active}
                      onChange={() => toggleActive(idx)}
                      className="rounded"
                    />
                    Active
                  </label>
                  <button
                    onClick={() => saveSlot(idx)}
                    disabled={saving[key]}
                    className="px-3 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {saving[key] ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>

              {/* Feedback */}
              {errors[key] && (
                <div className="px-4 py-2 text-xs text-red-600 bg-red-50">{errors[key]}</div>
              )}
              {success[key] && (
                <div className="px-4 py-2 text-xs text-green-700 bg-green-50">Saved!</div>
              )}

              {/* Item list grouped by category */}
              <div className="px-4 py-3 space-y-3 max-h-80 overflow-y-auto">
                {groups.length === 0 && (
                  <p className="text-xs text-muted-foreground">No active items available.</p>
                )}
                {groups.map(({ category, items }) => (
                  <div key={category}>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      {category}
                    </div>
                    <div className="space-y-1">
                      {items.map((item) => {
                        const checked = slot.itemIds.includes(item.id);
                        const soldOut = checked && slot.soldOut[item.id];
                        return (
                          <div key={item.id} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`${key}-${item.id}`}
                              checked={checked}
                              onChange={() => toggleItem(idx, item.id)}
                              className="rounded"
                            />
                            <label
                              htmlFor={`${key}-${item.id}`}
                              className={`flex-1 text-sm cursor-pointer ${soldOut ? 'line-through text-muted-foreground' : ''}`}
                            >
                              {item.name}
                              <span className="ml-1 text-xs text-muted-foreground">
                                ₹{(item.price / 100).toFixed(0)}
                              </span>
                            </label>
                            {checked && (
                              <button
                                onClick={() => toggleSoldOut(idx, item.id)}
                                className={`text-xs px-1.5 py-0.5 rounded ${
                                  soldOut
                                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                }`}
                              >
                                {soldOut ? 'Sold out' : 'Mark sold out'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
