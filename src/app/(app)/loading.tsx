import { Skeleton, Card } from "@/components/ui";

export default function Loading() {
  return (
    <div className="pb-10">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 px-6 pb-4 pt-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 px-6 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-7 w-20" />
          </Card>
        ))}
      </div>

      {/* Table */}
      <div className="px-6 pt-5">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="divide-y divide-[var(--border)]">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
