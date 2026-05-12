import { prisma } from '@thalimate/db';
import { formatINR, formatISTDate } from '@thalimate/shared';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Thermal printer–friendly kitchen ticket.
 * 80mm wide; uses minimal CSS for receipt-like rendering.
 */
export default async function KitchenPrint({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const order = await prisma.order.findUnique({
    where: { code },
    include: { customer: true, items: true, address: true, plan: true },
  });
  if (!order) notFound();

  return (
    <html lang="en">
      <head>
        <title>Kitchen Ticket {order.code}</title>
        <style>{`
          @page { size: 80mm auto; margin: 4mm; }
          body { font-family: 'Courier New', monospace; width: 72mm; margin: 0; color: #000; }
          h1 { font-size: 16px; text-align: center; margin: 4px 0; }
          .center { text-align: center; }
          .row { display: flex; justify-content: space-between; }
          hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { text-align: left; padding: 2px 0; }
          .qty { width: 28px; }
          .price { text-align: right; }
          .big { font-size: 14px; font-weight: bold; }
          .note { font-style: italic; }
          @media print { .noprint { display: none; } }
        `}</style>
      </head>
      <body>
        <h1>ThaliMate</h1>
        <div className="center">KITCHEN TICKET</div>
        <hr />
        <div className="row">
          <strong>{order.code}</strong>
          <span>{formatISTDate(order.createdAt, 'dd/MM HH:mm')}</span>
        </div>
        <div>{order.mealTime} / {order.diet}</div>
        <div>Plan: {order.plan?.name}</div>
        <hr />
        <table>
          <thead>
            <tr><th className="qty">Qty</th><th>Item</th><th className="price">Cat</th></tr>
          </thead>
          <tbody>
            {order.items.map((it) => (
              <tr key={it.id}>
                <td className="qty big">{it.quantity}×</td>
                <td>{it.name}{it.isAddOn ? ' *' : ''}</td>
                <td className="price">{it.category}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr />
        {order.notes && <p className="note">Note: {order.notes}</p>}
        <hr />
        <div className="row big"><span>TOTAL</span><span>{formatINR(order.total)}</span></div>
        <div className="center" style={{ marginTop: 8 }}>--- DELIVERY ---</div>
        <div>{order.customer.name ?? ''}</div>
        <div>{order.customer.phone}</div>
        {order.address && (
          <div style={{ fontSize: 11 }}>
            {order.address.line1}{order.address.line2 ? `, ${order.address.line2}` : ''}
            {order.address.landmark ? ` (${order.address.landmark})` : ''}
            <br />
            {order.address.city} - {order.address.pincode}
          </div>
        )}
        <hr />
        <div className="center" style={{ fontSize: 10 }}>Thank you!</div>
        <button
          className="noprint"
          style={{ marginTop: 16, padding: 8, width: '100%' }}
          onClick={() => window.print()}
        >
          Print
        </button>
        <script dangerouslySetInnerHTML={{ __html: 'setTimeout(()=>window.print(),300)' }} />
      </body>
    </html>
  );
}
