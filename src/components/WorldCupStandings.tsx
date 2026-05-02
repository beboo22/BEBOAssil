import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Trophy, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface TeamStanding {
  name: string;
  flag: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
}

interface GroupData {
  group: string;
  teams: TeamStanding[];
}

const WorldCupStandings = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const isAr = lang === "ar";
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const labels = {
    title: { ar: "مجموعات كأس العالم 2026", en: "World Cup 2026 Groups", zh: "2026世界杯小组", ru: "Группы ЧМ-2026", fr: "Groupes Coupe du Monde 2026", de: "WM 2026 Gruppen", es: "Grupos Mundial 2026", ur: "ورلڈ کپ 2026 گروپس" },
    team: { ar: "المنتخب", en: "Team", zh: "球队", ru: "Команда", fr: "Équipe", de: "Team", es: "Equipo", ur: "ٹیم" },
    played: { ar: "لعب", en: "P", zh: "场", ru: "И", fr: "MJ", de: "Sp", es: "PJ", ur: "کھ" },
    won: { ar: "ف", en: "W", zh: "胜", ru: "В", fr: "V", de: "S", es: "G", ur: "ج" },
    drawn: { ar: "ت", en: "D", zh: "平", ru: "Н", fr: "N", de: "U", es: "E", ur: "ب" },
    lost: { ar: "خ", en: "L", zh: "负", ru: "П", fr: "D", de: "N", es: "P", ur: "ہ" },
    gf: { ar: "له", en: "GF", zh: "进", ru: "ЗГ", fr: "BP", de: "T", es: "GF", ur: "ل" },
    ga: { ar: "عليه", en: "GA", zh: "失", ru: "ПГ", fr: "BC", de: "GT", es: "GC", ur: "خ" },
    pts: { ar: "نقاط", en: "Pts", zh: "分", ru: "О", fr: "Pts", de: "Pkt", es: "Pts", ur: "پ" },
    qualifies: { ar: "🟢 التأهل لدور الـ32", en: "🟢 Qualifies for Round of 32", zh: "🟢 晋级32强", ru: "🟢 Выход в 1/16", fr: "🟢 Qualifié pour les 32es", de: "🟢 Qualifiziert für Achtelfinale", es: "🟢 Clasifica a 32avos", ur: "🟢 32 کے مرحلے میں" },
  };

  const getLabel = (key: keyof typeof labels) => labels[key][lang as keyof typeof labels.title] || labels[key].en;

  useEffect(() => {
    fetchGroups();
    // Subscribe to realtime updates
    const channel = supabase
      .channel('wc-standings')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'global_events' }, (payload) => {
        if ((payload.new as any)?.title?.includes('World Cup 2026')) {
          fetchGroups();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchGroups = async () => {
    const { data } = await supabase
      .from("global_events")
      .select("metadata")
      .eq("is_active", true)
      .ilike("title", "%World Cup 2026%");

    if (!data) { setLoading(false); return; }

    const groupMap: Record<string, Record<string, TeamStanding>> = {};

    data.forEach((row: any) => {
      const meta = row.metadata;
      if (!meta?.match_type?.startsWith("Group")) return;
      const grp = meta.match_type;
      if (!groupMap[grp]) groupMap[grp] = {};

      // Add teams
      [{ name: meta.team1, flag: meta.team1_flag }, { name: meta.team2, flag: meta.team2_flag }].forEach(t => {
        if (!t.name) return;
        if (!groupMap[grp][t.name]) {
          groupMap[grp][t.name] = { name: t.name, flag: t.flag || "🏳️", played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 };
        }
      });

      // If match has results in metadata, compute standings
      if (meta.score1 !== undefined && meta.score2 !== undefined) {
        const s1 = Number(meta.score1);
        const s2 = Number(meta.score2);
        const t1 = groupMap[grp][meta.team1];
        const t2 = groupMap[grp][meta.team2];
        if (t1 && t2) {
          t1.played++; t2.played++;
          t1.gf += s1; t1.ga += s2;
          t2.gf += s2; t2.ga += s1;
          if (s1 > s2) { t1.won++; t1.points += 3; t2.lost++; }
          else if (s1 < s2) { t2.won++; t2.points += 3; t1.lost++; }
          else { t1.drawn++; t2.drawn++; t1.points++; t2.points++; }
        }
      }
    });

    const sorted = Object.entries(groupMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([group, teamMap]) => ({
        group,
        teams: Object.values(teamMap).sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          const gdA = a.gf - a.ga, gdB = b.gf - b.ga;
          if (gdB !== gdA) return gdB - gdA;
          return b.gf - a.gf;
        }),
      }));

    setGroups(sorted);
    setLoading(false);
  };

  if (loading || groups.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-bold flex items-center gap-2">
        <Trophy className="w-5 h-5 text-yellow-500" />
        {getLabel('title')}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {groups.map((g) => (
          <motion.div
            key={g.group}
            layout
            className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/30 transition-colors"
          >
            <button
              onClick={() => setExpandedGroup(expandedGroup === g.group ? null : g.group)}
              className="w-full flex items-center justify-between p-3 text-left"
            >
              <span className="font-bold text-sm text-foreground">{g.group}</span>
              <div className="flex items-center gap-1">
                <div className="flex -space-x-0.5">
                  {g.teams.slice(0, 4).map((t, i) => (
                    <span key={i} className="text-lg" title={t.name}>{t.flag}</span>
                  ))}
                </div>
                {expandedGroup === g.group ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </button>
            <AnimatePresence>
              {expandedGroup === g.group && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10px] text-muted-foreground bg-muted/50">
                          <th className="text-start p-2">{getLabel('team')}</th>
                          <th className="text-center p-1 w-7">{getLabel('played')}</th>
                          <th className="text-center p-1 w-7">{getLabel('won')}</th>
                          <th className="text-center p-1 w-7">{getLabel('drawn')}</th>
                          <th className="text-center p-1 w-7">{getLabel('lost')}</th>
                          <th className="text-center p-1 w-7">{getLabel('gf')}</th>
                          <th className="text-center p-1 w-7">{getLabel('ga')}</th>
                          <th className="text-center p-1 w-8">{getLabel('pts')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.teams.map((team, idx) => (
                          <tr key={team.name} className={`border-t border-border/50 ${idx < 2 ? "bg-green-500/5" : ""}`}>
                            <td className="p-2 flex items-center gap-1.5">
                              <span className="text-base shrink-0">{team.flag}</span>
                              <span className="font-medium text-foreground text-xs">{team.name}</span>
                            </td>
                            <td className="text-center p-1 text-muted-foreground text-xs">{team.played}</td>
                            <td className="text-center p-1 text-muted-foreground text-xs">{team.won}</td>
                            <td className="text-center p-1 text-muted-foreground text-xs">{team.drawn}</td>
                            <td className="text-center p-1 text-muted-foreground text-xs">{team.lost}</td>
                            <td className="text-center p-1 text-muted-foreground text-xs">{team.gf}</td>
                            <td className="text-center p-1 text-muted-foreground text-xs">{team.ga}</td>
                            <td className="text-center p-1 font-bold text-xs">{team.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="px-2 pb-2 flex items-center justify-between">
                      <p className="text-[10px] text-muted-foreground">{getLabel('qualifies')}</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground text-center mt-2">
        {isAr ? "المصدر: stadiumdb.com | البيانات تُحدّث لحظياً" : "Source: stadiumdb.com | Real-time updates"}
      </p>
    </div>
  );
};

export default WorldCupStandings;
