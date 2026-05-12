export default function MarketingPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Marketing Campaigns</h1>
      <p className="text-muted-foreground">
        Create WhatsApp broadcast campaigns. Customers must have opted in. Use the API or extend this page to schedule campaigns.
      </p>
      <div className="rounded-lg border p-6">
        <p className="text-sm text-muted-foreground">
          API: <code className="font-mono">POST /api/admin/campaigns</code> with body{' '}
          <code className="font-mono">{`{ name, template, segment?, scheduledAt? }`}</code>.
        </p>
      </div>
    </div>
  );
}
