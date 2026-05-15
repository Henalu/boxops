import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function RequestsLoading() {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="h-5 w-28 animate-pulse rounded-full bg-muted" />
        <div className="space-y-2">
          <div className="h-8 w-full max-w-sm animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-full max-w-2xl animate-pulse rounded-md bg-muted" />
        </div>
      </section>

      <Card>
        <CardHeader>
          <div className="h-5 w-56 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-full max-w-xl animate-pulse rounded-md bg-muted" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.8fr)]">
            <div className="h-10 animate-pulse rounded-md bg-muted" />
            <div className="h-10 animate-pulse rounded-md bg-muted" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div
                className="h-16 animate-pulse rounded-lg bg-muted"
                key={item}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <Card key={item} size="sm">
            <CardContent className="space-y-3">
              <div className="h-4 w-24 animate-pulse rounded-md bg-muted" />
              <div className="h-8 w-12 animate-pulse rounded-md bg-muted" />
              <div className="hidden h-4 w-32 animate-pulse rounded-md bg-muted md:block" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-3">
        {[1, 2, 3].map((item) => (
          <Card key={item} size="sm">
            <CardHeader>
              <div className="h-5 w-40 animate-pulse rounded-md bg-muted" />
              <div className="h-4 w-full max-w-lg animate-pulse rounded-md bg-muted" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="h-10 animate-pulse rounded-lg bg-muted" />
                <div className="h-10 animate-pulse rounded-lg bg-muted" />
                <div className="h-10 animate-pulse rounded-lg bg-muted" />
              </div>
              <div className="h-14 animate-pulse rounded-lg bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
