import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, TrendingDown, Database, ShieldCheck, DollarSign, Activity, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer, Line, ComposedChart } from "recharts";

type UsageRow = {
  id: string;
  user_id: string | null;
  guest_id: string | null;
  endpoint: string;
  query: string;
  city: string | null;
  cache_hit: boolean;
  blocked_by_gate: boolean;
  results_count: number;
  cost_usd: number;
  context: string | null;
  created_at: string;
};

type DayBucket = {
  day: string;
  total: number;
  live: number;
  cached: number;
  blocked: number;
  spent: number;
  saved: number;
};

type UserBucket = {
  key: string; // user_id or `guest:<guest_id>`
  label: string;
  total: number;
  live: number;
  cached: number;
  blocked: number;
  spent: number;
  saved: number;
};

const RANGE_OPTIONS: { value: string; label: string; days: number }[] = [
  { value: "1", label: "Today", days: 1 },
  { value: "7", label: "Last 7 days", days: 7 },
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "90", label: "Last 90 days", days: 90 },
];

const PER_CALL_COST_FALLBACK = 0.005;

export default function AdminSerpAPIUsage() {
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [rangeDays, setRangeDays] = useState<number>(7);
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  const fetchUsage = async () => {
    setLoading(true);
    try {
      const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("serpapi_usage" as any)
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      const list = (data as unknown as UsageRow[]) || [];
      setRows(list);

      // Resolve user names for the unique user_ids in the result set.
      const ids = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean))) as string[];
      if (ids.length > 0) {
        const { data: profs } = await supabase.rpc("get_public_profiles", { _user_ids: ids });
        const map: Record<string, string> = {};
        (profs || []).forEach((p: any) => {
          map[p.id] = p.full_name || p.username || p.id.slice(0, 8);
        });
        setUserNames(map);
      } else {
        setUserNames({});
      }
    } catch (e: any) {
      console.error("Failed to load SerpAPI usage:", e);
      toast.error(e?.message || "Failed to load usage data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeDays]);

  // ── Aggregations ────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    let live = 0, cached = 0, blocked = 0, spent = 0, saved = 0;
    for (const r of rows) {
      if (r.blocked_by_gate) {
        blocked += 1;
        saved += PER_CALL_COST_FALLBACK;
      } else if (r.cache_hit) {
        cached += 1;
        saved += PER_CALL_COST_FALLBACK;
      } else {
        live += 1;
        spent += Number(r.cost_usd) || PER_CALL_COST_FALLBACK;
      }
    }
    return { total: rows.length, live, cached, blocked, spent, saved };
  }, [rows]);

  const byDay = useMemo<DayBucket[]>(() => {
    const map = new Map<string, DayBucket>();
    for (const r of rows) {
      const day = r.created_at.slice(0, 10);
      if (!map.has(day)) map.set(day, { day, total: 0, live: 0, cached: 0, blocked: 0, spent: 0, saved: 0 });
      const b = map.get(day)!;
      b.total += 1;
      if (r.blocked_by_gate) { b.blocked += 1; b.saved += PER_CALL_COST_FALLBACK; }
      else if (r.cache_hit) { b.cached += 1; b.saved += PER_CALL_COST_FALLBACK; }
      else { b.live += 1; b.spent += Number(r.cost_usd) || PER_CALL_COST_FALLBACK; }
    }
    return Array.from(map.values()).sort((a, b) => b.day.localeCompare(a.day));
  }, [rows]);

  const byUser = useMemo<UserBucket[]>(() => {
    const map = new Map<string, UserBucket>();
    for (const r of rows) {
      const key = r.user_id ? r.user_id : r.guest_id ? `guest:${r.guest_id}` : "anonymous";
      const label = r.user_id
        ? userNames[r.user_id] || `${r.user_id.slice(0, 8)}…`
        : r.guest_id
          ? `Guest ${r.guest_id.slice(0, 8)}…`
          : "Anonymous";
      if (!map.has(key)) map.set(key, { key, label, total: 0, live: 0, cached: 0, blocked: 0, spent: 0, saved: 0 });
      const b = map.get(key)!;
      b.total += 1;
      if (r.blocked_by_gate) { b.blocked += 1; b.saved += PER_CALL_COST_FALLBACK; }
      else if (r.cache_hit) { b.cached += 1; b.saved += PER_CALL_COST_FALLBACK; }
      else { b.live += 1; b.spent += Number(r.cost_usd) || PER_CALL_COST_FALLBACK; }
    }
    return Array.from(map.values()).sort((a, b) => b.spent - a.spent);
  }, [rows, userNames]);

  const cacheHitRate = totals.total > 0
    ? ((totals.cached + totals.blocked) / totals.total) * 100
    : 0;

  // Chronological per-day series with hit-rate for charting
  const chartData = useMemo(() => {
    return [...byDay]
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((d) => {
        const avoided = d.cached + d.blocked;
        const rate = d.total > 0 ? (avoided / d.total) * 100 : 0;
        return {
          day: d.day.slice(5), // MM-DD
          live: d.live,
          cached: d.cached,
          blocked: d.blocked,
          hitRate: Number(rate.toFixed(1)),
          saved: Number(d.saved.toFixed(3)),
        };
      });
  }, [byDay]);

  const exportToXLSX = () => {
    try {
      if (rows.length === 0) {
        toast.error("No data to export");
        return;
      }
      const wb = XLSX.utils.book_new();

      // Summary sheet
      const summary = [
        ["SerpAPI Usage Report"],
        ["Generated", new Date().toLocaleString()],
        ["Range (days)", rangeDays],
        [],
        ["Metric", "Value"],
        ["Total calls", totals.total],
        ["Live (paid)", totals.live],
        ["Cache hits", totals.cached],
        ["Gate-blocked", totals.blocked],
        ["Spent (USD)", Number(totals.spent.toFixed(4))],
        ["Estimated savings (USD)", Number(totals.saved.toFixed(4))],
        ["Cache hit rate (%)", Number(cacheHitRate.toFixed(2))],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");

      // Per-day
      const daySheet = [
        ["Day", "Total", "Live", "Cached", "Blocked", "Spent (USD)", "Saved (USD)"],
        ...byDay.map((d) => [d.day, d.total, d.live, d.cached, d.blocked, Number(d.spent.toFixed(4)), Number(d.saved.toFixed(4))]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(daySheet), "Per Day");

      // Per-user
      const userSheet = [
        ["User", "Key", "Total", "Live", "Cached", "Blocked", "Spent (USD)", "Saved (USD)"],
        ...byUser.map((u) => [u.label, u.key, u.total, u.live, u.cached, u.blocked, Number(u.spent.toFixed(4)), Number(u.saved.toFixed(4))]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(userSheet), "Per User");

      // Raw calls
      const rawSheet = [
        ["Time", "User ID", "User", "Guest ID", "Endpoint", "Query", "City", "Context", "Status", "Results", "Cost (USD)"],
        ...rows.map((r) => [
          new Date(r.created_at).toISOString(),
          r.user_id || "",
          r.user_id ? (userNames[r.user_id] || "") : r.guest_id ? `Guest ${r.guest_id.slice(0, 8)}` : "Anonymous",
          r.guest_id || "",
          r.endpoint,
          r.query,
          r.city || "",
          r.context || "",
          r.blocked_by_gate ? "Gated" : r.cache_hit ? "Cache" : "Live",
          r.results_count,
          Number(Number(r.cost_usd).toFixed(4)),
        ]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rawSheet), "Raw Calls");

      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `serpapi-usage-${rangeDays}d-${stamp}.xlsx`);
      toast.success("Exported XLSX");
    } catch (e: any) {
      console.error("Export failed:", e);
      toast.error(e?.message || "Export failed");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              SerpAPI Usage & Cost
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Tracks every Google Maps search made by the trip generator. Cached and gate-blocked
              calls don't hit SerpAPI — savings are estimated at ${PER_CALL_COST_FALLBACK.toFixed(4)} per call.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(rangeDays)} onValueChange={(v) => setRangeDays(Number(v))}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.days)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportToXLSX} disabled={loading || rows.length === 0}>
              <Download className="h-4 w-4 me-1" /> XLSX
            </Button>
            <Button variant="outline" size="sm" onClick={fetchUsage} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatBox icon={<Activity className="h-4 w-4" />} label="Total calls" value={String(totals.total)} />
            <StatBox icon={<DollarSign className="h-4 w-4 text-destructive" />} label="Live (paid)" value={String(totals.live)} sub={`$${totals.spent.toFixed(3)} spent`} />
            <StatBox icon={<Database className="h-4 w-4 text-primary" />} label="Cache hits" value={String(totals.cached)} />
            <StatBox icon={<ShieldCheck className="h-4 w-4 text-primary" />} label="Gate-blocked" value={String(totals.blocked)} />
            <StatBox icon={<TrendingDown className="h-4 w-4 text-primary" />} label="Estimated savings" value={`$${totals.saved.toFixed(3)}`} sub={`${cacheHitRate.toFixed(1)}% avoided`} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-primary" />
            Cache hit rate over time
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Bars show calls per day split by status. The line shows the percentage of calls
            avoided thanks to cache + gating (higher = bigger savings).
          </p>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="text-center text-muted-foreground py-12 text-sm">
              No usage in this range yet.
            </div>
          ) : (
            <ChartContainer
              config={{
                live: { label: "Live (paid)", color: "hsl(var(--destructive))" },
                cached: { label: "Cache hits", color: "hsl(var(--primary))" },
                blocked: { label: "Gate-blocked", color: "hsl(var(--muted-foreground))" },
                hitRate: { label: "Hit rate %", color: "hsl(var(--primary))" },
              }}
              className="h-[280px] w-full"
            >
              <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area yAxisId="left" type="monotone" dataKey="live" stackId="1" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive) / 0.4)" name="Live" />
                <Area yAxisId="left" type="monotone" dataKey="cached" stackId="1" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.4)" name="Cached" />
                <Area yAxisId="left" type="monotone" dataKey="blocked" stackId="1" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted-foreground) / 0.3)" name="Blocked" />
                <Line yAxisId="right" type="monotone" dataKey="hitRate" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} name="Hit rate %" />
              </ComposedChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Per-day breakdown</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Live</TableHead>
                <TableHead className="text-right">Cached</TableHead>
                <TableHead className="text-right">Blocked</TableHead>
                <TableHead className="text-right">Spent</TableHead>
                <TableHead className="text-right">Saved</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byDay.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No usage in this range yet.</TableCell></TableRow>
              )}
              {byDay.map((d) => (
                <TableRow key={d.day}>
                  <TableCell className="font-medium">{d.day}</TableCell>
                  <TableCell className="text-right">{d.total}</TableCell>
                  <TableCell className="text-right">{d.live}</TableCell>
                  <TableCell className="text-right">{d.cached}</TableCell>
                  <TableCell className="text-right">{d.blocked}</TableCell>
                  <TableCell className="text-right text-destructive">${d.spent.toFixed(3)}</TableCell>
                  <TableCell className="text-right text-primary">${d.saved.toFixed(3)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Per-user breakdown (top spenders)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Live</TableHead>
                <TableHead className="text-right">Cached</TableHead>
                <TableHead className="text-right">Blocked</TableHead>
                <TableHead className="text-right">Spent</TableHead>
                <TableHead className="text-right">Saved</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byUser.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No usage in this range yet.</TableCell></TableRow>
              )}
              {byUser.slice(0, 50).map((u) => (
                <TableRow key={u.key}>
                  <TableCell className="font-medium">
                    {u.label}
                    {u.key.startsWith("guest:") && <Badge variant="outline" className="ms-2 text-xs">guest</Badge>}
                  </TableCell>
                  <TableCell className="text-right">{u.total}</TableCell>
                  <TableCell className="text-right">{u.live}</TableCell>
                  <TableCell className="text-right">{u.cached}</TableCell>
                  <TableCell className="text-right">{u.blocked}</TableCell>
                  <TableCell className="text-right text-destructive">${u.spent.toFixed(3)}</TableCell>
                  <TableCell className="text-right text-primary">${u.saved.toFixed(3)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent calls (latest 100)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Query</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Results</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 100).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">
                    {r.user_id ? (userNames[r.user_id] || `${r.user_id.slice(0, 8)}…`) : r.guest_id ? `Guest ${r.guest_id.slice(0, 6)}…` : "—"}
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate text-xs" title={r.query}>{r.query}</TableCell>
                  <TableCell className="text-xs">{r.city || "—"}</TableCell>
                  <TableCell>
                    {r.blocked_by_gate ? (
                      <Badge variant="outline" className="text-primary border-primary/40">Gated</Badge>
                    ) : r.cache_hit ? (
                      <Badge variant="outline">Cache</Badge>
                    ) : (
                      <Badge variant="destructive">Live</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs">{r.results_count}</TableCell>
                  <TableCell className="text-right text-xs">${Number(r.cost_usd).toFixed(4)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No calls recorded yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatBox({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card/50 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}<span>{label}</span></div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
