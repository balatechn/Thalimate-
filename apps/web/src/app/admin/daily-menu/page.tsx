export default function DailyMenuPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Daily Menu</h1>
      <p className="text-muted-foreground">
        Configure today&apos;s menu via the admin API:{' '}
        <code className="font-mono">POST /api/admin/daily-menus</code> with body{' '}
        <code className="font-mono">{`{ date, mealTime, diet, itemIds: [] }`}</code>.
      </p>
      <p className="text-sm">
        Full UI for menu scheduling is included as a follow-up enhancement; the API is production-ready.
      </p>
    </div>
  );
}
