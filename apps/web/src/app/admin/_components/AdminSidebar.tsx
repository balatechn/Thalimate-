'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  ShoppingBag,
  ChefHat,
  Truck,
  Users,
  UtensilsCrossed,
  CalendarDays,
  Megaphone,
  BarChart3,
  LogOut,
} from 'lucide-react';

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/admin/menu', label: 'Menu Items', icon: UtensilsCrossed },
  { href: '/admin/daily-menu', label: 'Daily Menu', icon: CalendarDays },
  { href: '/admin/customers', label: 'Customers', icon: Users },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/admin/marketing', label: 'Marketing', icon: Megaphone },
  { href: '/kitchen', label: 'Kitchen Queue', icon: ChefHat },
  { href: '/delivery', label: 'Delivery', icon: Truck },
];

export function AdminSidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/admin" className="text-lg font-semibold">
          ThaliMate <span className="text-primary">Admin</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <form action="/api/auth/logout" method="post" className="border-t p-4">
        <button
          type="submit"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent w-full text-left transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span className="truncate">Sign out ({userEmail})</span>
        </button>
      </form>
    </aside>
  );
}
