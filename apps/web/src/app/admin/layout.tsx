import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AdminSidebar } from './_components/AdminSidebar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login?next=/admin');

  return (
    <div className="flex min-h-screen">
      <AdminSidebar userEmail={session.email} />
      <main className="flex-1 p-6 md:p-8">{children}</main>
    </div>
  );
}
