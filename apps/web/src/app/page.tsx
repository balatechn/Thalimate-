import Link from 'next/link';

export default function Home() {
  return (
    <main className="container py-16">
      <section className="mx-auto max-w-2xl text-center space-y-6">
        <h1 className="text-5xl font-bold tracking-tight">
          ThaliMate <span className="text-primary">🍱</span>
        </h1>
        <p className="text-xl text-muted-foreground">
          Order delicious thalis directly through WhatsApp. No app needed.
        </p>
        <div className="flex justify-center gap-4 pt-4">
          <Link
            href="/admin"
            className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground hover:opacity-90"
          >
            Admin Dashboard
          </Link>
          <a
            href={`https://wa.me/${(process.env.UPI_VPA ?? '').replace(/\D/g, '')}?text=Hi`}
            className="inline-flex items-center justify-center rounded-md border border-input px-6 py-3 font-medium hover:bg-accent"
          >
            Order on WhatsApp
          </a>
        </div>
      </section>
    </main>
  );
}
