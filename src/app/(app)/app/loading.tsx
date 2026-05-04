import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function AppLoading() {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex gap-2">
          <div className="h-5 w-28 animate-pulse rounded-full bg-muted" />
          <div className="h-5 w-24 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="space-y-2">
          <div className="h-8 w-full max-w-md animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-full max-w-2xl animate-pulse rounded-md bg-muted" />
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {["risk", "uncovered", "conflict", "active"].map((item) => (
          <Card key={item} size="sm">
            <CardHeader>
              <div className="h-4 w-28 animate-pulse rounded-md bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-12 animate-pulse rounded-md bg-muted" />
              <div className="mt-2 h-4 w-36 animate-pulse rounded-md bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <div className="h-5 w-36 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-full max-w-md animate-pulse rounded-md bg-muted" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map((item) => (
              <div className="space-y-2" key={item}>
                <div className="h-5 w-40 animate-pulse rounded-md bg-muted" />
                <div className="h-4 w-full animate-pulse rounded-md bg-muted" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="h-5 w-32 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-48 animate-pulse rounded-md bg-muted" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[1, 2].map((item) => (
              <div className="h-14 animate-pulse rounded-lg bg-muted" key={item} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
