'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MENU_CATEGORIES, DIETS } from '@thalimate/shared';

interface MenuItem {
  id?: string;
  name: string;
  description?: string | null;
  category: string;
  diet: string;
  price: number;
  imageUrl?: string | null;
  active: boolean;
}

interface Props {
  item?: MenuItem;
}

export default function MenuItemForm({ item }: Props) {
  const router = useRouter();
  const isEdit = !!item?.id;

  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [category, setCategory] = useState(item?.category ?? MENU_CATEGORIES[0]);
  const [diet, setDiet] = useState(item?.diet ?? DIETS[0]);
  // price stored as paise, display as rupees
  const [priceRupees, setPriceRupees] = useState(item ? String(item.price / 100) : '0');
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? '');
  const [active, setActive] = useState(item?.active ?? true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      name,
      description: description || undefined,
      category,
      diet,
      price: Math.round(parseFloat(priceRupees) * 100),
      imageUrl: imageUrl || undefined,
      active,
    };
    const url = isEdit ? `/api/admin/menu-items/${item!.id}` : '/api/admin/menu-items';
    const method = isEdit ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const errMsg = typeof data?.error === 'string' ? data.error : JSON.stringify(data?.error ?? 'Something went wrong');
      setError(errMsg);
      setSaving(false);
      return;
    }
    router.push('/admin/menu');
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm('Delete this item?')) return;
    await fetch(`/api/admin/menu-items/${item!.id}`, { method: 'DELETE' });
    router.push('/admin/menu');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
      <div className="space-y-1">
        <label className="text-sm font-medium">Name</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="e.g. Palak Paneer"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Optional"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            {MENU_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Diet</label>
          <select
            value={diet}
            onChange={(e) => setDiet(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            {DIETS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Price (₹)</label>
        <input
          required
          type="number"
          min="0"
          step="0.01"
          value={priceRupees}
          onChange={(e) => setPriceRupees(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="0 = included in thali"
        />
        <p className="text-xs text-muted-foreground">Enter 0 if included in thali price.</p>
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Image URL</label>
        <input
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="https://..."
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          id="active"
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="h-4 w-4"
        />
        <label htmlFor="active" className="text-sm font-medium">Active</label>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-primary px-5 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Item'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/menu')}
          className="rounded-md border px-5 py-2 text-sm hover:bg-muted"
        >
          Cancel
        </button>
        {isEdit && (
          <button
            type="button"
            onClick={handleDelete}
            className="ml-auto rounded-md border border-destructive px-5 py-2 text-sm text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
