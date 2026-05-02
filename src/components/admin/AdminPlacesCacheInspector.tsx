import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { RefreshCw, Trash2, Eye, Search, Database, AlertTriangle, CheckCircle2 } from "lucide-react";

// Mirrors the canonical SerpAPI local_results keys we expect to be cached.
const EXPECTED_KEYS = [
  "position", "title", "place_id", "data_id", "data_cid", "provider_id",
  "reviews_link", "photos_link", "place_id_search",
  "rating", "reviews", "type", "types", "type_id", "type_ids",
  "address", "phone", "website", "open_state", "operating_hours",
  "gps_coordinates", "thumbnail", "serpapi_thumbnail",
  "description", "user_review", "extensions", "service_options",
] as const;

const CRITICAL_KEYS = new Set<string>(["title", "place_id", "gps_coordinates", "address", "type"]);

type CacheRow = {
  id: string;
  cache_key: string;
  query: string;
  city: string | null;
  source: string;
  results: any[];
  results_count: number;
  hit_count: number;
  created_at: string;
  expires_at: string;
  last_accessed_at: string;
};

function checkPlace(place: any): { missing: string[]; criticalMissing: number } {
  if (!place || typeof place !== "object") return { missing: [...EXPECTED_KEYS], criticalMissing: CRITICAL_KEYS.size };
  const missing: string[] = [];
  for (const k of EXPECTED_KEYS) {
    const v = place[k];
    let empty = v === undefined || v === null
      || (typeof v === "string" && v.trim() === "")
      || (Array.isArray(v) && v.length === 0);
    if (k === "gps_coordinates" && empty) {
      if (Number.isFinite(place?.latitude) || Number.isFinite(place?.longitude)) empty = false;
    }
    if (empty) missing.push(k);
  }
  let criticalMissing = 0;
  for (const k of missing) if (CRITICAL_KEYS.has(k)) criticalMissing++;
  return { missing, criticalMissing };
}

const AdminPlacesCacheInspector = () => {
  const [rows, setRows] = useState<CacheRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [cityFilter, setCityFilter] = useState("");
  const [idFilter, setIdFilter] = useState(""); // matches place_id or data_id within results
  const [selectedRow, setSelectedRow] = useState<CacheRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("places_cache")
        .select("id, cache_key, query, city, source, results, results_count, hit_count, created_at, expires_at, last_accessed_at")
        .order("last_accessed_at", { ascending: false })
        .limit(200);
      if (cityFilter.trim()) query = query.ilike("city", `%${cityFilter.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      setRows((data as any) || []);
    } catch (e: any) {
      toast.error(`Failed to load cache: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const filteredRows = useMemo(() => {
    if (!idFilter.trim()) return rows;
    const needle = idFilter.trim().toLowerCase();
    return rows.filter(r =>
      Array.isArray(r.results) &&
      r.results.some((p: any) =>
        String(p?.place_id || "").toLowerCase().includes(needle) ||
        String(p?.data_id || "").toLowerCase().includes(needle)
      )
    );
  }, [rows, idFilter]);

  const summarize = (row: CacheRow) => {
    const items = Array.isArray(row.results) ? row.results : [];
    if (!items.length) return { total: 0, complete: 0, partial: 0, broken: 0, withRaw: 0, completeness: 0 };
    let complete = 0, partial = 0, broken = 0, withRaw = 0;
    let totalMissing = 0;
    for (const p of items) {
      const { missing, criticalMissing } = checkPlace(p);
      if (criticalMissing >= 2) broken++;
      else if (missing.length === 0) complete++;
      else partial++;
      totalMissing += missing.length;
      if (p?._raw && typeof p._raw === "object") withRaw++;
    }
    const maxPossible = items.length * EXPECTED_KEYS.length;
    const completeness = Math.round(((maxPossible - totalMissing) / maxPossible) * 100);
    return { total: items.length, complete, partial, broken, withRaw, completeness };
  };

  const purge = async (row: CacheRow) => {
    if (!confirm(`Purge cache for "${row.query}"?\nNext request will re-fetch fresh data from SerpAPI.`)) return;
    setBusyId(row.id);
    try {
      const { error } = await supabase.from("places_cache").delete().eq("id", row.id);
      if (error) throw error;
      toast.success("Cache entry purged");
      setRows(prev => prev.filter(r => r.id !== row.id));
      if (selectedRow?.id === row.id) setSelectedRow(null);
    } catch (e: any) {
      toast.error(`Purge failed: ${e?.message || e}`);
    } finally {
      setBusyId(null);
    }
  };

  // "Refresh" = expire the row so the next generation pass treats it as a miss
  // and fetches a fresh SerpAPI response (which then re-populates the cache).
  const markStale = async (row: CacheRow) => {
    setBusyId(row.id);
    try {
      const { error } = await supabase
        .from("places_cache")
        .update({ expires_at: new Date(Date.now() - 1000).toISOString(), hit_count: 999 })
        .eq("id", row.id);
      if (error) throw error;
      toast.success("Marked stale — next request will hit SerpAPI live");
      await load();
    } catch (e: any) {
      toast.error(`Failed: ${e?.message || e}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" /> SerpAPI Places Cache Inspector
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs text-muted-foreground">Filter by city</label>
              <Input
                placeholder="e.g. Abu Dhabi"
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") load(); }}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground">Filter by place_id / data_id (substring)</label>
              <Input
                placeholder="ChIJ... or 0x3e5..."
                value={idFilter}
                onChange={(e) => setIdFilter(e.target.value)}
              />
            </div>
            <Button onClick={load} disabled={loading} size="sm" className="gap-1">
              <Search className="h-3.5 w-3.5" />
              {loading ? "Loading…" : "Search"}
            </Button>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Query</TableHead>
                  <TableHead className="text-xs">City</TableHead>
                  <TableHead className="text-xs text-right">Places</TableHead>
                  <TableHead className="text-xs text-right">Hits</TableHead>
                  <TableHead className="text-xs">Completeness</TableHead>
                  <TableHead className="text-xs">Raw JSON</TableHead>
                  <TableHead className="text-xs">Expires</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">
                      {loading ? "Loading…" : "No cached entries found"}
                    </TableCell>
                  </TableRow>
                )}
                {filteredRows.map(row => {
                  const s = summarize(row);
                  const expired = new Date(row.expires_at).getTime() < Date.now();
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs max-w-[260px] truncate" title={row.query}>{row.query}</TableCell>
                      <TableCell className="text-xs">{row.city || "—"}</TableCell>
                      <TableCell className="text-xs text-right">{s.total}</TableCell>
                      <TableCell className="text-xs text-right">{row.hit_count}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono">{s.completeness}%</span>
                          {s.broken > 0 ? (
                            <Badge variant="destructive" className="text-[10px] gap-1"><AlertTriangle className="h-3 w-3" />{s.broken} broken</Badge>
                          ) : s.partial > 0 ? (
                            <Badge variant="secondary" className="text-[10px]">{s.partial} partial</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] gap-1"><CheckCircle2 className="h-3 w-3" />all good</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{s.withRaw}/{s.total}</TableCell>
                      <TableCell className="text-xs">
                        {expired ? <Badge variant="destructive" className="text-[10px]">expired</Badge> : new Date(row.expires_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setSelectedRow(row)}>
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 px-2" disabled={busyId === row.id} onClick={() => markStale(row)} title="Mark stale (force live refetch on next request)">
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="destructive" className="h-7 px-2" disabled={busyId === row.id} onClick={() => purge(row)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Showing up to 200 entries. "Mark stale" expires the row so the next itinerary generation re-fetches from SerpAPI and overwrites the cache.
          </p>
        </CardContent>
      </Card>

      <Dialog open={!!selectedRow} onOpenChange={(o) => !o && setSelectedRow(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {selectedRow?.query} — {selectedRow?.city || "no city"}
            </DialogTitle>
          </DialogHeader>
          {selectedRow && (
            <ScrollArea className="h-[70vh] pr-3">
              <div className="space-y-3">
                {(Array.isArray(selectedRow.results) ? selectedRow.results : []).map((p: any, i: number) => {
                  const { missing, criticalMissing } = checkPlace(p);
                  const hasRaw = !!p?._raw;
                  return (
                    <div key={i} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="text-sm font-medium">
                          {p?.title || "(untitled)"}
                          <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                            {p?.place_id || p?.data_id || "no-id"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {hasRaw ? (
                            <Badge variant="outline" className="text-[10px]">raw stored</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">no raw</Badge>
                          )}
                          {criticalMissing >= 2 ? (
                            <Badge variant="destructive" className="text-[10px]">critical incomplete</Badge>
                          ) : missing.length > 0 ? (
                            <Badge variant="secondary" className="text-[10px]">{missing.length} missing</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">complete</Badge>
                          )}
                        </div>
                      </div>
                      {missing.length > 0 && (
                        <div className="text-[11px] text-muted-foreground">
                          <span className="font-medium">Missing:</span> {missing.join(", ")}
                        </div>
                      )}
                      <pre className="text-[10px] bg-muted/40 rounded p-2 overflow-x-auto max-h-64">
                        {JSON.stringify(p, null, 2)}
                      </pre>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPlacesCacheInspector;
