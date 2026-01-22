export default function Loading() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-7xl items-center justify-center px-4">
      <div className="flex items-center gap-3 rounded-xl border border-base-200 bg-base-100 px-4 py-3 shadow-sm">
        <span className="loading loading-spinner loading-md text-primary" aria-hidden="true" />
        <span className="text-base-content/80">Loading…</span>
      </div>
    </div>
  );
}
