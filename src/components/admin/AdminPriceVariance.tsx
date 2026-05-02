import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle2, RefreshCw, TrendingUp, Plane, Hotel } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PriceAlert {
  id: string;
  resource_type: "flight" | "hotel";
  origin: string | null;
  destination: string | null;
  provider: string | null;
  estimated_price: number | null;
  api_price: number | null;
  currency: string | null;
  variance_pct: number | null;
  threshold_pct: number;
  severity: "info" | "warning" | "critical";
  metadata: any;
  acknowledged: boolean;
  acknowledged_at: string | null;
  created_at: string;
}

const AdminPriceVariance = () => {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [severityFilter, setSeverityFilter] = useState<"all" | "warning" | "critical">("all");

  const load = async () => {
    setLoading(true);
    let query = supabase
      .from("price_variance_alerts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (filter === "open") query = query.eq("acknowledged", false);
    if (severityFilter !== "all") query = query.eq("severity", severityFilter);
    const { data, error } = await query;
    if (error) {
      toast.error("Failed to load alerts: " + error.message);
    } else {
      setAlerts((data || []) as PriceAlert[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, severityFilter]);

  const acknowledge = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("price_variance_alerts")
      .update({ acknowledged: true, acknowledged_at: new Date().toISOString(), acknowledged_by: user.id })
      .eq("id", id);
    if (error) {
      toast.error("Failed: " + error.message);
    } else {
      toast.success("Acknowledged");
      setAlerts(prev => prev.filter(a => a.id !== id));
    }
  };

  const stats = {
    total: alerts.length,
    critical: alerts.filter(a => a.severity === "critical").length,
    flights: alerts.filter(a => a.resource_type === "flight").length,
    hotels: alerts.filter(a => a.resource_type === "hotel").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <AlertTriangle className="text-amber-500" size={20} />
            Price Variance Alerts
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Automatic comparison between estimated and live API prices. Large gaps are flagged.
          </p>
        </div>
        <Button onClick={load} variant="outline" size="sm" className="gap-1">
          <RefreshCw size={12} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Open Alerts</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Critical</p>
          <p className="text-2xl font-bold text-rose-600">{stats.critical}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Flights</p>
          <p className="text-2xl font-bold">{stats.flights}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Hotels</p>
          <p className="text-2xl font-bold">{stats.hotels}</p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
          <Button size="sm" variant={filter === "open" ? "default" : "ghost"} className="h-7 text-[11px]" onClick={() => setFilter("open")}>Open</Button>
          <Button size="sm" variant={filter === "all" ? "default" : "ghost"} className="h-7 text-[11px]" onClick={() => setFilter("all")}>All</Button>
        </div>
        <div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
          <Button size="sm" variant={severityFilter === "all" ? "default" : "ghost"} className="h-7 text-[11px]" onClick={() => setSeverityFilter("all")}>All severities</Button>
          <Button size="sm" variant={severityFilter === "warning" ? "default" : "ghost"} className="h-7 text-[11px]" onClick={() => setSeverityFilter("warning")}>Warning</Button>
          <Button size="sm" variant={severityFilter === "critical" ? "default" : "ghost"} className="h-7 text-[11px]" onClick={() => setSeverityFilter("critical")}>Critical</Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : alerts.length === 0 ? (
        <Card className="p-8 text-center">
          <CheckCircle2 className="mx-auto mb-2 text-emerald-500" size={32} />
          <p className="text-sm font-medium">No alerts to display</p>
          <p className="text-xs text-muted-foreground mt-1">All prices look consistent.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {alerts.map(a => (
            <Card key={a.id} className={cn(
              "p-4 border-l-4",
              a.severity === "critical" ? "border-l-rose-500" : a.severity === "warning" ? "border-l-amber-500" : "border-l-blue-500",
            )}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {a.resource_type === "flight" ? <Plane size={14} /> : <Hotel size={14} />}
                    <span className="font-bold text-sm">
                      {a.origin || "?"} → {a.destination || "?"}
                    </span>
                    <Badge variant="outline" className={cn(
                      "text-[10px]",
                      a.severity === "critical" ? "text-rose-600 border-rose-200 bg-rose-50" :
                      a.severity === "warning" ? "text-amber-600 border-amber-200 bg-amber-50" :
                      "text-blue-600 border-blue-200 bg-blue-50"
                    )}>
                      {a.severity}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      <TrendingUp size={10} className="mr-1" />
                      {a.variance_pct?.toFixed(1)}% gap
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Estimate</p>
                      <p className="font-bold">{a.estimated_price?.toFixed(2)} {a.currency}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">API price</p>
                      <p className="font-bold">{a.api_price?.toFixed(2)} {a.currency}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Threshold</p>
                      <p className="font-bold">{a.threshold_pct}%</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Provider</p>
                      <p className="font-bold truncate">{a.provider || "—"}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    {new Date(a.created_at).toLocaleString("en-GB", { hour12: false })}
                  </p>
                </div>
                {!a.acknowledged && (
                  <Button size="sm" variant="outline" className="gap-1 h-7 text-[11px]" onClick={() => acknowledge(a.id)}>
                    <CheckCircle2 size={12} /> Acknowledge
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminPriceVariance;
