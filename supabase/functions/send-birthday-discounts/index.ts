// Using built-in Deno.serve (no import needed)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get site settings for auto-discount config
    const { data: settings } = await supabase
      .from("site_settings")
      .select("points_config")
      .eq("id", "default")
      .single();

    const autoDiscount = settings?.points_config?._auto_discount;
    if (!autoDiscount) {
      return new Response(JSON.stringify({ message: "No auto-discount config found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = new Date();
    const todayMMDD = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    let totalSent = 0;

    // 1. Birthday discounts
    if (autoDiscount.birthday_enabled) {
      const { data: birthdayUsers } = await supabase
        .from("profiles")
        .select("id, full_name, email, birthdate")
        .not("birthdate", "is", null);

      const birthdayToday = (birthdayUsers || []).filter((u: any) => {
        if (!u.birthdate) return false;
        const bd = new Date(u.birthdate);
        const bdMMDD = `${String(bd.getMonth() + 1).padStart(2, "0")}-${String(bd.getDate()).padStart(2, "0")}`;
        return bdMMDD === todayMMDD;
      });

      for (const user of birthdayToday) {
        // Check if already sent today
        const { count } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("type", "birthday_discount")
          .gte("created_at", new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString());

        if ((count || 0) > 0) continue;

        // Generate unique discount code
        const code = `${autoDiscount.birthday_code_prefix || "BDAY"}-${user.id.substring(0, 6).toUpperCase()}`;

        // Create discount code in DB
        await supabase.from("discount_codes").insert({
          code,
          description: `Birthday discount for ${user.full_name || user.email}`,
          discount_percent: autoDiscount.birthday_discount_percent || 10,
          max_uses: 1,
          is_active: true,
          expires_at: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30).toISOString(),
          applicable_to: "all",
        });

        // Award bonus points
        if (autoDiscount.birthday_bonus_points > 0) {
          await supabase.from("user_points").insert({
            user_id: user.id,
            points: autoDiscount.birthday_bonus_points,
            reason: `🎂 Birthday bonus! +${autoDiscount.birthday_bonus_points} points`,
          });
          // Update total
          const { data: profile } = await supabase.from("profiles").select("total_points").eq("id", user.id).single();
          await supabase.from("profiles").update({
            total_points: (profile?.total_points || 0) + autoDiscount.birthday_bonus_points,
          }).eq("id", user.id);
        }

        // Send notification
        await supabase.from("notifications").insert({
          user_id: user.id,
          type: "birthday_discount",
          title: "🎂 عيد ميلاد سعيد!",
          message: `كل عام وأنت بخير! استخدم كود الخصم ${code} للحصول على ${autoDiscount.birthday_discount_percent}% خصم على حجزك القادم!`,
          metadata: {
            discount_code: code,
            discount_percent: autoDiscount.birthday_discount_percent,
            bonus_points: autoDiscount.birthday_bonus_points,
          },
        });
        totalSent++;
      }
    }

    // 2. Occasion discounts
    const occasions = autoDiscount.occasions || [];
    for (const occ of occasions) {
      if (!occ.enabled || occ.date !== todayMMDD) continue;

      // Get target users
      let query = supabase.from("profiles").select("id, full_name, email, country");
      if (occ.target === "country" && occ.target_country) {
        query = query.eq("country", occ.target_country);
      }
      const { data: targetUsers } = await query;

      for (const user of targetUsers || []) {
        // Check if already sent today for this occasion
        const { count } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("type", `occasion_${occ.id}`)
          .gte("created_at", new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString());

        if ((count || 0) > 0) continue;

        const code = `${occ.id.toUpperCase().substring(0, 8)}-${String(today.getFullYear()).substring(2)}`;

        // Create discount code (one per occasion, reusable)
        await supabase.from("discount_codes").upsert({
          code,
          description: `${occ.name} - ${today.getFullYear()}`,
          discount_percent: occ.discount_percent || 10,
          max_uses: 10000,
          is_active: true,
          expires_at: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7).toISOString(),
          applicable_to: "all",
        }, { onConflict: "code" });

        // Award bonus points
        if (occ.bonus_points > 0) {
          await supabase.from("user_points").insert({
            user_id: user.id,
            points: occ.bonus_points,
            reason: `🎉 ${occ.name} bonus! +${occ.bonus_points} points`,
          });
          const { data: profile } = await supabase.from("profiles").select("total_points").eq("id", user.id).single();
          await supabase.from("profiles").update({
            total_points: (profile?.total_points || 0) + occ.bonus_points,
          }).eq("id", user.id);
        }

        // Send notification
        await supabase.from("notifications").insert({
          user_id: user.id,
          type: `occasion_${occ.id}`,
          title: `🎉 ${occ.nameAr || occ.name}!`,
          message: `بمناسبة ${occ.nameAr || occ.name}، استخدم كود الخصم ${code} للحصول على ${occ.discount_percent}% خصم!`,
          metadata: {
            discount_code: code,
            discount_percent: occ.discount_percent,
            occasion_id: occ.id,
            bonus_points: occ.bonus_points,
          },
        });
        totalSent++;
      }
    }

    return new Response(JSON.stringify({ success: true, totalSent, date: todayMMDD }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
