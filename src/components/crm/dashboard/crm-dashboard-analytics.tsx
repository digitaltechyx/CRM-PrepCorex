"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { useCrmLeads } from "@/contexts/crm-leads-context";
import {
  buildLeadsCreatedSeries,
  buildOutcomeSplit,
  buildSourceCounts,
  buildStatusCounts,
  LEAD_VELOCITY_RANGES,
  leadVelocityRangeDescription,
  leadVelocityRangeToDays,
  type LeadVelocityRange,
} from "@/lib/crm-dashboard-lead-series";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart3, PieChart as PieChartIcon, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const areaConfig = {
  leads: {
    label: "New leads",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

const barConfig = {
  count: {
    label: "Leads",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

/** Solid HSL values so SVG `<Cell fill>` stays distinct (CSS `var(--chart-n)` often resolves poorly in Recharts). */
const PIE_SOURCE_COLORS = [
  "hsl(242 58% 48%)",
  "hsl(173 55% 38%)",
  "hsl(25 88% 52%)",
  "hsl(280 48% 52%)",
  "hsl(142 48% 40%)",
  "hsl(199 70% 46%)",
  "hsl(340 62% 52%)",
] as const;

export function CrmDashboardAnalytics() {
  const { leads, loading, error } = useCrmLeads();
  const [velocityRange, setVelocityRange] = useState<LeadVelocityRange>("14d");
  const velocityGradientId = `fillLeadsDash-${useId().replace(/:/g, "")}`;

  const velocitySeries = useMemo(
    () => buildLeadsCreatedSeries(leads, leadVelocityRangeToDays(velocityRange)),
    [leads, velocityRange]
  );
  const statusRows = useMemo(() => buildStatusCounts(leads), [leads]);
  const { sourceRows, sourceTotal } = useMemo(() => {
    const rows = buildSourceCounts(leads);
    const sorted = [...rows].sort((a, b) => b.count - a.count);
    const withFill = sorted.map((r, i) => ({
      ...r,
      fill: PIE_SOURCE_COLORS[i % PIE_SOURCE_COLORS.length]!,
    }));
    const total = withFill.reduce((s, r) => s + r.count, 0);
    return { sourceRows: withFill, sourceTotal: total };
  }, [leads]);
  const outcomes = useMemo(() => buildOutcomeSplit(leads), [leads]);

  if (error) return null;

  const hasLeads = leads.length > 0;
  const maxDay = velocitySeries.reduce((m, p) => Math.max(m, p.leads), 0);
  const velocityBadge =
    hasLeads && maxDay > 0
      ? velocityRange === "today" && velocitySeries.length === 1
        ? `${velocitySeries[0].leads} today`
        : `Peak ${maxDay}/day`
      : null;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-headline text-xl font-semibold tracking-tight text-foreground">
            Analytics
          </h2>
          <p className="text-sm text-muted-foreground">
            Lead velocity, pipeline mix, and acquisition sources — updated live from Firestore.
          </p>
        </div>
        <Link
          href="/dashboard/leads"
          className="text-sm font-medium text-primary hover:underline"
        >
          View pipeline →
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading analytics…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="border-border/80 bg-card/80 shadow-sm backdrop-blur-sm lg:col-span-2">
            <CardHeader className="space-y-3 pb-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <TrendingUp className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    Lead velocity
                  </CardTitle>
                  <CardDescription>{leadVelocityRangeDescription(velocityRange)}</CardDescription>
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                  <div
                    className="inline-flex rounded-lg border border-border/70 bg-muted/50 p-1 shadow-inner"
                    role="group"
                    aria-label="Lead velocity time range"
                  >
                    {LEAD_VELOCITY_RANGES.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setVelocityRange(r.id)}
                        className={cn(
                          "rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
                          velocityRange === r.id
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  {velocityBadge ? (
                    <span className="w-fit rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      {velocityBadge}
                    </span>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {!hasLeads ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  Import or add leads to see activity over time.
                </p>
              ) : (
                <ChartContainer config={areaConfig} className="aspect-auto h-[240px] w-full sm:h-[260px]">
                  <AreaChart
                    data={velocitySeries}
                    margin={{ left: 0, right: 8, top: 8, bottom: velocityRange === "30d" ? 8 : 0 }}
                  >
                    <defs>
                      <linearGradient id={velocityGradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="8%" stopColor="var(--color-leads)" stopOpacity={0.35} />
                        <stop offset="98%" stopColor="var(--color-leads)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={10}
                      interval="preserveStartEnd"
                      minTickGap={velocityRange === "30d" ? 36 : velocityRange === "14d" ? 20 : 8}
                    />
                    <YAxis
                      width={32}
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      allowDecimals={false}
                      domain={[0, "auto"]}
                    />
                    <ChartTooltip cursor={{ stroke: "hsl(var(--border))" }} content={<ChartTooltipContent />} />
                    <Area
                      dataKey="leads"
                      type="monotone"
                      fill={`url(#${velocityGradientId})`}
                      stroke="var(--color-leads)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/80 shadow-sm backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <PieChartIcon className="h-4 w-4 text-primary" aria-hidden />
                By source
              </CardTitle>
              <CardDescription>Where leads originated — hover a slice for details</CardDescription>
            </CardHeader>
            <CardContent>
              {!hasLeads ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No data yet.</p>
              ) : sourceRows.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No platform sources recorded.</p>
              ) : (
                <ChartContainer
                  config={
                    Object.fromEntries(
                      sourceRows.map((r) => [r.key, { label: r.name, color: r.fill }])
                    ) as ChartConfig
                  }
                  className="mx-auto aspect-square h-[240px] w-full max-w-[260px] sm:h-[260px] sm:max-w-[280px]"
                >
                  <PieChart margin={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <ChartTooltip
                      cursor={false}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0]?.payload as {
                          name: string;
                          count: number;
                          key: string;
                        };
                        if (!row) return null;
                        const pct =
                          sourceTotal > 0
                            ? Math.round((100 * row.count) / sourceTotal)
                            : 0;
                        return (
                          <div className="grid gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-2 text-xs shadow-xl">
                            <p className="font-semibold leading-none text-foreground">{row.name}</p>
                            <p className="tabular-nums text-muted-foreground">
                              {row.count} {row.count === 1 ? "lead" : "leads"} · {pct}%
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Pie
                      data={sourceRows}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="48%"
                      outerRadius="78%"
                      paddingAngle={2}
                      strokeWidth={2}
                      className="stroke-background"
                    >
                      {sourceRows.map((row) => (
                        <Cell key={row.key} fill={row.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/80 shadow-sm backdrop-blur-sm lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <BarChart3 className="h-4 w-4 text-primary" aria-hidden />
                Pipeline stages
              </CardTitle>
              <CardDescription>Count by Kanban column</CardDescription>
            </CardHeader>
            <CardContent>
              {!hasLeads ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No pipeline data yet.</p>
              ) : (
                <ChartContainer config={barConfig} className="aspect-auto h-[min(420px,52vh)] w-full">
                  <BarChart
                    data={statusRows}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid horizontal={false} className="stroke-border/40" />
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={128}
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tick={{ fontSize: 11 }}
                    />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} fill="var(--color-count)" maxBarSize={28} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/80 shadow-sm backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Outcomes</CardTitle>
              <CardDescription>Share of your book</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {!hasLeads ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No leads to summarize.</p>
              ) : (
                <>
                  <div
                    className="flex h-3 overflow-hidden rounded-full bg-muted"
                    title={`${outcomes.pctActive}% active · ${outcomes.pctClients}% clients · ${outcomes.pctDead}% closed lost`}
                  >
                    <div
                      className="bg-primary transition-all"
                      style={{ width: `${outcomes.pctActive}%` }}
                    />
                    <div
                      className="bg-emerald-500/90 dark:bg-emerald-500/80"
                      style={{ width: `${outcomes.pctClients}%` }}
                    />
                    <div
                      className="bg-muted-foreground/35"
                      style={{ width: `${outcomes.pctDead}%` }}
                    />
                  </div>
                  <ul className="space-y-3 text-sm">
                    <li className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                        Active pipeline
                      </span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {outcomes.active}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          ({outcomes.pctActive}%)
                        </span>
                      </span>
                    </li>
                    <li className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                        Clients
                      </span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {outcomes.clients}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          ({outcomes.pctClients}%)
                        </span>
                      </span>
                    </li>
                    <li className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50" />
                        Closed lost
                      </span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {outcomes.dead}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          ({outcomes.pctDead}%)
                        </span>
                      </span>
                    </li>
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
