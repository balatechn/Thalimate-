import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingBag,
  ChefHat,
  Truck,
  Users,
  UtensilsCrossed,
  Megaphone,
  BarChart3,
  LogOut,
} from 'lucide-react';

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/admin/menu', label: 'Menu', icon: UtensilsCrossed },
  { href: '/admin/daily-menu', label: 'Daily Menu', icon: UtensilsCrossed },
  { href: '/admin/customers', label: 'Customers', icon: Users },
  { href: '/admin/marketing', label: 'Marketing', icon: Megaphone },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/kitchen', label: 'Kitchen Queue', icon: ChefHat },
  { href: '/delivery', label: 'Delivery', icon: Truck },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login?next=/admin');

  return (
    <div className="flex min-h-screen">
      <aside className="hidden md:flex w-64 flex-col border-r bg-card">
        <div className="flex h-16 items-center border-b px-6">
          <Link href="/admin" className="text-lg font-semibold">
            ThaliMate <span className="text-primary">Admin</span>
          </Link>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <form action="/api/auth/logout" method="post" className="border-t p-4">
          <button type="submit" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent w-full">
            <LogOut className="h-4 w-4" /> Sign out ({session.email})
          </button>
        </form>
      </aside>
      <main className="flex-1 p-6 md:p-8">{children}</main>
    </div>
  );
}
