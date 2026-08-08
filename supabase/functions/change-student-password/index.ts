import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" }
});

async function currentStudent(req: Request) {
  const token = req.headers.get("Authorization");
  if (!token) return { error: json({ error: "로그인이 필요합니다." }, 401) };
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: token } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return { error: json({ error: "로그인이 필요합니다." }, 401) };

  const admin = createClient(url, serviceKey);
  const { data: profile } = await admin.from("profiles").select("role, approval_status").eq("id", user.id).single();
  if (!profile || profile.role !== "student" || profile.approval_status !== "approved") {
    return { error: json({ error: "학생 계정만 비밀번호를 변경할 수 있습니다." }, 403) };
  }
  const { data: student } = await admin.from("student_accounts").select("id, must_change_password").eq("auth_user_id", user.id).single();
  if (!student) return { error: json({ error: "학생 계정을 찾을 수 없습니다." }, 404) };
  return { admin, student };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST 요청만 지원합니다." }, 405);
  const permission = await currentStudent(req);
  if (permission.error) return permission.error;
  const { admin, student } = permission;
  const body = await req.json().catch(() => null);

  if (body?.action === "status") return json({ mustChangePassword: student.must_change_password });

  const password = typeof body?.password === "string" ? body.password : "";
  if (password.length < 6) return json({ error: "새 비밀번호는 6자 이상이어야 합니다." }, 400);
  if (password === "000000") return json({ error: "초기 비밀번호와 다른 비밀번호를 입력해 주세요." }, 400);

  const { data: account } = await admin.from("student_accounts").select("auth_user_id").eq("id", student.id).single();
  if (!account?.auth_user_id) return json({ error: "로그인 계정 연결 정보를 찾을 수 없습니다." }, 409);
  const { error: authError } = await admin.auth.admin.updateUserById(account.auth_user_id, { password });
  if (authError) return json({ error: authError.message }, 400);
  const { error: flagError } = await admin.from("student_accounts").update({ must_change_password: false }).eq("id", student.id);
  if (flagError) return json({ error: flagError.message }, 400);
  return json({ mustChangePassword: false });
});
