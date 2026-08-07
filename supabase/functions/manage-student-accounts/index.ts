import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function approvedTeacher(req: Request) {
  const token = req.headers.get("Authorization");
  if (!token) return { error: json({ error: "로그인이 필요합니다." }, 401) };
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: token } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return { error: json({ error: "로그인이 필요합니다." }, 401) };
  const admin = createClient(url, serviceKey);
  const { data: profile } = await admin.from("profiles").select("role, approval_status").eq("id", user.id).single();
  if (!profile || !["teacher", "admin"].includes(profile.role) || profile.approval_status !== "approved") return { error: json({ error: "승인된 교사만 학생 계정을 관리할 수 있습니다." }, 403) };
  return { admin, teacherId: user.id };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST 요청만 지원합니다." }, 405);
  const permission = await approvedTeacher(req);
  if (permission.error) return permission.error;
  const { admin, teacherId } = permission;
  const body = await req.json().catch(() => null);
  if (!body?.action) return json({ error: "요청 형식이 올바르지 않습니다." }, 400);

  if (body.action === "reset_password") {
    if (!body.studentId || typeof body.newPassword !== "string" || body.newPassword.trim().length < 6) return json({ error: "새 비밀번호는 6자 이상이어야 합니다." }, 400);
    const { data: student } = await admin.from("student_accounts").select("id, student_number, student_name, auth_user_id").eq("id", body.studentId).single();
    if (!student) return json({ error: "학생 계정을 찾을 수 없습니다." }, 404);
    if (!student.auth_user_id) return json({ error: "로그인 계정이 연결되지 않은 학생입니다." }, 409);
    const { error } = await admin.auth.admin.updateUserById(student.auth_user_id, { password: body.newPassword });
    if (error) return json({ error: error.message }, 400);
    return json({ student });
  }

  if (body.action !== "batch_create" || !Number.isInteger(body.grade) || !Number.isInteger(body.classNumber) || !Array.isArray(body.students) || body.students.length === 0) return json({ error: "학생 일괄 생성 요청이 올바르지 않습니다." }, 400);
  const classCode = `${body.grade}${String(body.classNumber).padStart(2, "0")}`;
  const { data: existingClass } = await admin.from("classes").select("id").eq("class_code", classCode).limit(1).maybeSingle();
  let classId = existingClass?.id;
  if (!classId) {
    const { data: created, error } = await admin.from("classes").insert({ teacher_id: teacherId, class_code: classCode, grade_number: body.grade, class_number: body.classNumber }).select("id").single();
    if (error) return json({ error: error.message }, 400);
    classId = created.id;
  }
  const students = [];
  const duplicates = [];
  for (const item of body.students) {
    const suffix = String(item?.number || "").padStart(2, "0");
    const name = String(item?.name || "").trim();
    if (!/^\d{2}$/.test(suffix) || !name) return json({ error: "학생 번호와 이름을 모두 입력해 주세요." }, 400);
    const studentNumber = `${body.grade}${String(body.classNumber).padStart(2, "0")}${suffix}`;
    const { data: exists } = await admin.from("student_accounts").select("id").eq("student_number", studentNumber).maybeSingle();
    if (exists) { duplicates.push(studentNumber); continue; }
    const password = body.passwordRule === "STUDENT_NUM_EXCL" ? `${studentNumber}!` : String(body.password || "");
    if (password.length < 6) return json({ error: "초기 비밀번호는 6자 이상이어야 합니다." }, 400);
    const { data: authUser, error: authError } = await admin.auth.admin.createUser({ email: `student_${studentNumber}@school.internal`, password, email_confirm: true });
    if (authError) return json({ error: authError.message }, 400);
    const { data: student, error } = await admin.from("student_accounts").insert({ class_id: classId, student_number: studentNumber, student_name: name, auth_user_id: authUser.user.id }).select("id, student_number, student_name, created_at").single();
    if (error) return json({ error: error.message }, 400);
    students.push(student);
  }
  return json({ students, duplicates });
});
