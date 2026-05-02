import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { KeyRound, Loader2, Languages } from "lucide-react";

type DebugResult = {
  input: any;
  normalized: { query: string; city: string; lang: string };
  query_tokens: string[];
  cuisine_map: { input: string; normalized: string; canonical: string }[];
  category_map: { input: string; normalized: string; canonical: string }[];
  seed_components: { query_tokens: string; city: string; pref_cuisines: string; pref_categories: string };
  cache_key: string;
};

const AdminPlanningKeyDebug = () => {
  const [query, setQuery] = useState("best italian food");
  const [city, setCity] = useState("Rome");
  const [lang, setLang] = useState("en");
  const [cuisines, setCuisines] = useState("italian, café");
  const [categories, setCategories] = useState("restaurant, museum");
  const [loading, setLoading] = useState(false);
  const [a, setA] = useState<DebugResult | null>(null);
  const [b, setB] = useState<DebugResult | null>(null);

  // Second variant — used to verify "café" === "coffee shop" === "مقهى" etc.
  const [query2, setQuery2] = useState("best italian restaurant");
  const [city2, setCity2] = useState("Rome");
  const [cuisines2, setCuisines2] = useState("italiano, coffee shop");
  const [categories2, setCategories2] = useState("ristorante, museo");

  const split = (s: string) => s.split(",").map(x => x.trim()).filter(Boolean);

  const run = async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        supabase.functions.invoke("debug-bank-key", {
          body: { query, city, lang, cuisines: split(cuisines), categories: split(categories) },
        }),
        supabase.functions.invoke("debug-bank-key", {
          body: { query: query2, city: city2, lang, cuisines: split(cuisines2), categories: split(categories2) },
        }),
      ]);
      if (r1.error) throw r1.error;
      if (r2.error) throw r2.error;
      setA(r1.data as DebugResult);
      setB(r2.data as DebugResult);
    } catch (e: any) {
      toast.error(`Failed: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  const renderResult = (r: DebugResult | null, label: string) => {
    if (!r) return null;
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{label}</Badge>
            <span className="font-mono text-[11px] truncate">{r.cache_key}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div>
            <div className="text-muted-foreground text-[10px] mb-1">Normalized</div>
            <div className="font-mono text-[11px]">query: <span className="text-primary">{r.normalized.query || "—"}</span></div>
            <div className="font-mono text-[11px]">city: <span className="text-primary">{r.normalized.city || "—"}</span></div>
            <div className="font-mono text-[11px]">lang: <span className="text-primary">{r.normalized.lang}</span></div>
          </div>
          <div>
            <div className="text-muted-foreground text-[10px] mb-1">Query tokens</div>
            <div className="flex flex-wrap gap-1">
              {r.query_tokens.length === 0 && <span className="text-muted-foreground">—</span>}
              {r.query_tokens.map(t => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-[10px] mb-1">Cuisine canonicalization</div>
            {r.cuisine_map.length === 0 && <span className="text-muted-foreground">—</span>}
            {r.cuisine_map.map((m, i) => (
              <div key={i} className="font-mono text-[11px] flex items-center gap-1">
                <span>{m.input}</span><span className="text-muted-foreground">→</span>
                <span>{m.normalized}</span><span className="text-muted-foreground">→</span>
                <Badge variant="outline" className="text-[10px]">{m.canonical}</Badge>
              </div>
            ))}
          </div>
          <div>
            <div className="text-muted-foreground text-[10px] mb-1">Category canonicalization</div>
            {r.category_map.length === 0 && <span className="text-muted-foreground">—</span>}
            {r.category_map.map((m, i) => (
              <div key={i} className="font-mono text-[11px] flex items-center gap-1">
                <span>{m.input}</span><span className="text-muted-foreground">→</span>
                <span>{m.normalized}</span><span className="text-muted-foreground">→</span>
                <Badge variant="outline" className="text-[10px]">{m.canonical}</Badge>
              </div>
            ))}
          </div>
          <div>
            <div className="text-muted-foreground text-[10px] mb-1">Cache-key seed</div>
            <pre className="text-[10px] bg-muted/40 rounded p-2 overflow-x-auto">{JSON.stringify(r.seed_components, null, 2)}</pre>
          </div>
        </CardContent>
      </Card>
    );
  };

  const sameKey = a && b && a.cache_key === b.cache_key;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" /> Planning Bank Key Debugger
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Verify that synonyms (café ↔ coffee shop ↔ مقهى ↔ kahve) and language variants
            collapse to the same SerpApi bank cache_key. If both columns produce the same key,
            they will share results from the same bank.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Badge className="text-[10px]">Variant A</Badge>
              <div><Label className="text-xs">Query</Label><Input value={query} onChange={e=>setQuery(e.target.value)} /></div>
              <div><Label className="text-xs">City</Label><Input value={city} onChange={e=>setCity(e.target.value)} /></div>
              <div><Label className="text-xs">Cuisines (comma-separated)</Label><Input value={cuisines} onChange={e=>setCuisines(e.target.value)} /></div>
              <div><Label className="text-xs">Categories (comma-separated)</Label><Input value={categories} onChange={e=>setCategories(e.target.value)} /></div>
            </div>
            <div className="space-y-2">
              <Badge className="text-[10px]">Variant B</Badge>
              <div><Label className="text-xs">Query</Label><Input value={query2} onChange={e=>setQuery2(e.target.value)} /></div>
              <div><Label className="text-xs">City</Label><Input value={city2} onChange={e=>setCity2(e.target.value)} /></div>
              <div><Label className="text-xs">Cuisines</Label><Input value={cuisines2} onChange={e=>setCuisines2(e.target.value)} /></div>
              <div><Label className="text-xs">Categories</Label><Input value={categories2} onChange={e=>setCategories2(e.target.value)} /></div>
            </div>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1 max-w-[120px]">
              <Label className="text-xs flex items-center gap-1"><Languages className="h-3 w-3" /> Lang</Label>
              <Input value={lang} onChange={e=>setLang(e.target.value)} placeholder="en | ar | fr ..." />
            </div>
            <Button onClick={run} disabled={loading} size="sm">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Compute keys"}
            </Button>
            {a && b && (
              <Badge variant={sameKey ? "outline" : "destructive"} className="text-[10px]">
                {sameKey ? "✓ Same bank" : "✗ Different banks"}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {renderResult(a, "A")}
            {renderResult(b, "B")}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminPlanningKeyDebug;
