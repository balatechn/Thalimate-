import { prisma } from '@thalimate/db';
import { notFound } from 'next/navigation';
import MenuItemForm from '../_components/MenuItemForm';

export default async function EditMenuItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await prisma.menuItem.findUnique({ where: { id } });
  if (!item) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Edit Menu Item</h1>
      <MenuItemForm item={item} />
    </div>
  );
}
