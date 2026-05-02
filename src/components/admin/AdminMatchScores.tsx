import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, Loader2, Sparkles, RefreshCw, Trophy, Clock, Database, Globe, Zap, StopCircle } from "lucide-react";
import { toast } from "sonner";

interface MatchEvent {
  id: string;
  title: string;
  venue: string | null;
  city: string;
  start_date: string;
  metadata: any;
}

const AdminMatchScores = () => {
  const [matches, setMatches] = useState<MatchEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, { score1: string; score2: string; status: string }>>({});
  const [groupFilter, setGroupFilter] = useState("all");
  const [aiUpdating, setAiUpdating] = useState(false);
  const [sportdbUpdating, setSportdbUpdating] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(60);
  const [tournamentFilter, setTournamentFilter] = useState("World Cup 2026");
  const [dataSource, setDataSource] = useState<"manual" | "sportdb" | "ai">("manual");
  const [autoUpdateActive, setAutoUpdateActive] = useState(false);
  const [autoIntervalRef, setAutoIntervalRef] = useState<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { fetchMatches(); }, [tournamentFilter]);

  // Cleanup auto interval
  useEffect(() => {
    return () => { if (autoIntervalRef) clearInterval(autoIntervalRef); };
  }, [autoIntervalRef]);

  const fetchMatches = async () => {
    const { data } = await supabase
      .from("global_events")
      .select("id, title, venue, city, start_date, metadata")
      .ilike("title", `%${tournamentFilter}%`)
      .order("start_date");

    if (data) {
      const matchEvents = data.filter((e: any) => e.metadata?.match_type);
      setMatches(matchEvents as MatchEvent[]);
      const sc: Record<string, { score1: string; score2: string; status: string }> = {};
      matchEvents.forEach((m: any) => {
        sc[m.id] = {
          score1: m.metadata?.score1?.toString() ?? "",
          score2: m.metadata?.score2?.toString() ?? "",
          status: m.metadata?.match_status || "scheduled",
        };
      });
      setScores(sc);
    }
    setLoading(false);
  };

  const saveScore = async (match: MatchEvent) => {
    setSaving(match.id);
    const sc = scores[match.id];
    const newMeta = {
      ...match.metadata,
      score1: sc.score1 !== "" ? parseInt(sc.score1) : undefined,
      score2: sc.score2 !== "" ? parseInt(sc.score2) : undefined,
      match_status: sc.status,
      last_updated: new Date().toISOString(),
      updated_by: "manual",
    };
    if (sc.score1 === "" || sc.score2 === "") {
      delete newMeta.score1; delete newMeta.score2;
      newMeta.match_status = "scheduled";
    }
    const { error } = await supabase.from("global_events").update({ metadata: newMeta }).eq("id", match.id);
    if (error) toast.error(error.message);
    else toast.success(`Score saved: ${match.metadata?.team1} ${sc.score1} - ${sc.score2} ${match.metadata?.team2}`);
    setSaving(null);
  };

  const saveBulk = async () => {
    setSaving("bulk");
    let count = 0;
    for (const match of filteredMatches) {
      const sc = scores[match.id];
      if (sc.score1 !== "" && sc.score2 !== "") {
        const newMeta = { ...match.metadata, score1: parseInt(sc.score1), score2: parseInt(sc.score2), match_status: sc.status, last_updated: new Date().toISOString(), updated_by: "manual" };
        await supabase.from("global_events").update({ metadata: newMeta }).eq("id", match.id);
        count++;
      }
    }
    toast.success(`Saved ${count} match scores`);
    setSaving(null);
    fetchMatches();
  };

  const fetchFromSportDB = async () => {
    setSportdbUpdating(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-match-scores", {
        body: { source: "sportdb", season: "2026" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`SportDB: Updated ${data?.updated || 0} matches (${data?.skipped || 0} skipped)`);
      fetchMatches();
    } catch (err: any) {
      toast.error(err.message || "SportDB update failed");
    } finally {
      setSportdbUpdating(false);
    }
  };

  const aiAutoUpdate = async () => {
    setAiUpdating(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const matchesToUpdate = matches.filter(m => {
        const sc = scores[m.id];
        return m.start_date <= today && (sc.score1 === "" || sc.score2 === "");
      });
      if (matchesToUpdate.length === 0) {
        toast.info("No matches to update");
        setAiUpdating(false);
        return;
      }
      const matchList = matchesToUpdate.slice(0, 10).map(m =>
        `${m.metadata?.team1} vs ${m.metadata?.team2} (${m.metadata?.match_type}, ${m.start_date}, ${m.venue})`
      ).join("\n");

      const { data: result, error } = await supabase.functions.invoke("chat", {
        body: {
          messages: [
            { role: "system", content: `You are a sports data assistant. Return ONLY valid JSON array like: [{"team1":"Team A","team2":"Team B","score1":2,"score2":1,"status":"finished"}]. Use "finished", "live", "halftime", or "scheduled" for status.` },
            { role: "user", content: `Find the scores for these matches:\n${matchList}` }
          ],
        },
      });
      if (error) throw error;
      const text = result?.choices?.[0]?.message?.content || "";
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const results = JSON.parse(jsonMatch[0]);
        let updated = 0;
        for (const r of results) {
          if (r.score1 !== null && r.score2 !== null) {
            const match = matchesToUpdate.find(m => m.metadata?.team1 === r.team1 && m.metadata?.team2 === r.team2);
            if (match) {
              const newMeta = { ...match.metadata, score1: r.score1, score2: r.score2, match_status: r.status || "finished", last_updated: new Date().toISOString(), updated_by: "ai" };
              await supabase.from("global_events").update({ metadata: newMeta }).eq("id", match.id);
              setScores(p => ({ ...p, [match.id]: { score1: r.score1.toString(), score2: r.score2.toString(), status: r.status || "finished" } }));
              updated++;
            }
          }
        }
        toast.success(`AI updated ${updated} match scores`);
      } else {
        toast.error("Could not parse AI response");
      }
    } catch (err: any) {
      toast.error(err.message || "AI update failed");
    } finally {
      setAiUpdating(false);
    }
  };

  const toggleAutoUpdate = () => {
    if (autoUpdateActive) {
      if (autoIntervalRef) clearInterval(autoIntervalRef);
      setAutoIntervalRef(null);
      setAutoUpdateActive(false);
      toast.info("Auto-update stopped");
    } else {
      const fn = dataSource === "sportdb" ? fetchFromSportDB : aiAutoUpdate;
      fn(); // Run once immediately
      const interval = setInterval(fn, refreshInterval * 1000);
      setAutoIntervalRef(interval);
      setAutoUpdateActive(true);
      toast.success(`Auto-update started (${dataSource === "sportdb" ? "SportDB" : "AI"}) every ${refreshInterval}s`);
    }
  };

  const groups = [...new Set(matches.map(m => m.metadata?.match_type).filter(Boolean))].sort();
  const filteredMatches = groupFilter === "all" ? matches : matches.filter(m => m.metadata?.match_type === groupFilter);

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-500" />
          Match Scores ({matches.length} matches)
        </h2>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={fetchMatches} className="gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Data Source & Controls */}
      <div className="bg-muted/50 rounded-lg p-3 border space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Label className="text-sm font-semibold">📡 Data Source:</Label>
          <Select value={dataSource} onValueChange={(v: any) => setDataSource(v)}>
            <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">✍️ Manual</SelectItem>
              <SelectItem value="sportdb">🌐 SportDB API</SelectItem>
              <SelectItem value="ai">🤖 AI (Gemini/GPT)</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={tournamentFilter}
            onChange={e => setTournamentFilter(e.target.value)}
            placeholder="Tournament filter..."
            className="w-48 h-8 text-sm"
          />
        </div>

        {/* Action buttons based on source */}
        <div className="flex flex-wrap items-center gap-2">
          {dataSource === "sportdb" && (
            <Button size="sm" onClick={fetchFromSportDB} disabled={sportdbUpdating} className="gap-1">
              {sportdbUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
              Fetch from SportDB
            </Button>
          )}
          {dataSource === "ai" && (
            <Button size="sm" onClick={aiAutoUpdate} disabled={aiUpdating} className="gap-1">
              {aiUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              AI Update Scores
            </Button>
          )}
          {dataSource === "manual" && (
            <Button size="sm" onClick={saveBulk} disabled={saving === "bulk"} className="gap-1">
              {saving === "bulk" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save All
            </Button>
          )}
        </div>

        {/* Auto-update controls */}
        {dataSource !== "manual" && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/50">
            <Button size="sm" variant={autoUpdateActive ? "destructive" : "default"} onClick={toggleAutoUpdate} className="gap-1">
              {autoUpdateActive ? <StopCircle className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
              {autoUpdateActive ? "Stop Auto-Update" : "Start Auto-Update"}
            </Button>
            {autoUpdateActive && (
              <Badge variant="outline" className="animate-pulse text-green-600 border-green-500">
                🟢 Live — every {refreshInterval}s via {dataSource === "sportdb" ? "SportDB" : "AI"}
              </Badge>
            )}
            <Select value={refreshInterval.toString()} onValueChange={v => setRefreshInterval(parseInt(v))}>
              <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30s</SelectItem>
                <SelectItem value="60">1 min</SelectItem>
                <SelectItem value="120">2 min</SelectItem>
                <SelectItem value="300">5 min</SelectItem>
                <SelectItem value="600">10 min</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Group filter */}
      <div className="flex flex-wrap gap-1">
        <Badge variant={groupFilter === "all" ? "default" : "outline"} className="cursor-pointer text-xs" onClick={() => setGroupFilter("all")}>All</Badge>
        {groups.map(g => (
          <Badge key={g} variant={groupFilter === g ? "default" : "outline"} className="cursor-pointer text-xs" onClick={() => setGroupFilter(g)}>{g}</Badge>
        ))}
      </div>

      {/* Match score entries */}
      <div className="space-y-2">
        {filteredMatches.map(match => {
          const sc = scores[match.id] || { score1: "", score2: "", status: "scheduled" };
          const isLive = sc.status === "live" || sc.status === "halftime";
          const updatedBy = match.metadata?.updated_by;
          return (
            <div key={match.id} className={`flex flex-wrap items-center gap-2 bg-card border rounded-lg p-2.5 ${isLive ? "border-green-500/50 bg-green-500/5" : "border-border"}`}>
              <Badge variant="outline" className="text-[10px] w-20 justify-center shrink-0">{match.metadata?.match_type}</Badge>
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span className="text-sm shrink-0">{match.metadata?.team1_flag}</span>
                <span className="text-xs font-medium truncate">{match.metadata?.team1}</span>
              </div>
              <div className="flex items-center gap-1">
                <Input type="number" min="0" max="99" className="w-12 h-8 text-center text-sm font-bold p-0" value={sc.score1}
                  onChange={e => setScores(p => ({ ...p, [match.id]: { ...p[match.id], score1: e.target.value } }))} placeholder="-" />
                <span className="text-muted-foreground font-bold text-xs">:</span>
                <Input type="number" min="0" max="99" className="w-12 h-8 text-center text-sm font-bold p-0" value={sc.score2}
                  onChange={e => setScores(p => ({ ...p, [match.id]: { ...p[match.id], score2: e.target.value } }))} placeholder="-" />
              </div>
              <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-end">
                <span className="text-xs font-medium truncate text-end">{match.metadata?.team2}</span>
                <span className="text-sm shrink-0">{match.metadata?.team2_flag}</span>
              </div>
              <Select value={sc.status} onValueChange={v => setScores(p => ({ ...p, [match.id]: { ...p[match.id], status: v } }))}>
                <SelectTrigger className="w-24 h-8 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="live">🔴 Live</SelectItem>
                  <SelectItem value="halftime">⏸ Half-time</SelectItem>
                  <SelectItem value="finished">✅ Finished</SelectItem>
                  <SelectItem value="postponed">⏰ Postponed</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => saveScore(match)} disabled={saving === match.id}>
                {saving === match.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              </Button>
              <div className="w-full text-[10px] text-muted-foreground mt-0.5">
                {match.venue} · {match.city} · {match.start_date} · {match.metadata?.kickoff}
                {match.metadata?.last_updated && (
                  <span className="ml-2 text-primary">
                    Updated: {new Date(match.metadata.last_updated).toLocaleString()}
                    {updatedBy && ` (${updatedBy === "sportdb" ? "🌐 SportDB" : updatedBy === "ai" ? "🤖 AI" : "✍️ Manual"})`}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {filteredMatches.length === 0 && <p className="text-center text-muted-foreground text-sm py-4">No matches found</p>}
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        Data sources: SportDB API (flashscore) · AI (Gemini/GPT) · Manual | Standings update in real-time
      </p>
    </div>
  );
};

export default AdminMatchScores;
