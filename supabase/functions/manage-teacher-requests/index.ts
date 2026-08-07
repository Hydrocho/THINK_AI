import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const token = req.headers.get("Authorization");
  if (!token) return json({ error: "로그인이 필요합니다." }, 401);
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: token } } });
  const { data: { user } } = await caller.auth.getUser();
  const admin = createClient(url, key);
  const { data: profile } = user ? await admin.from("profiles").select("role, approval_status").eq("id", user.id).single() : { data: null };
  if (!profile || profile.role !== "admin" || profile.approval_status !== "approved") return json({ error: "마스터 교사만 교사 요청을 관리할 수 있습니다." }, 403);
  const body = await req.json().catch(() => null);
  if (body?.action === "list") {
    const { data, error } = await admin.from("profiles").select("id, display_name, email, created_at, approval_status").eq("role", "teacher").in("approval_status", ["pending", "approved"]).order("created_at", { ascending: false });
    if (error) return json({ error: error.message }, 400);
    return json({ pending: data.filter((teacher) => teacher.approval_status === "pending"), approved: data.filter((teacher) => teacher.approval_status === "approved") });
  }
  if (!body?.profileId || !["approve", "reject"].includes(body.action)) return json({ error: "요청 형식이 올바르지 않습니다." }, 400);
  const approval_status = body.action === "approve" ? "approved" : "rejected";
  const { data: teacher, error } = await admin.from("profiles").update({ approval_status }).eq("id", body.profileId).eq("role", "teacher").eq("approval_status", "pending").select("id, display_name, email, created_at, approval_status").maybeSingle();
  if (error) return json({ error: error.message }, 400);
  if (!teacher) return json({ error: "승인 대기 중인 교사 요청을 찾을 수 없습니다." }, 409);
  return json({ teacher });
});
