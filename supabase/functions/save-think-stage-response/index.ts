import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { parseStudentClass } from "../_shared/student-class.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const token = req.headers.get("Authorization");
  if (!token) return json({ error: "로그인이 필요합니다." }, 401);
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: token } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "로그인이 필요합니다." }, 401);

  const body = await req.json().catch(() => null);
  if (!body?.lessonPlanId || !["T", "H", "I", "N", "K"].includes(body.stageCode) || typeof body.content !== "string") {
    return json({ error: "저장 데이터가 올바르지 않습니다." }, 400);
  }
  if (body.submit && body.stageCode !== "K") return json({ error: "최종 제출은 K 단계에서만 가능합니다." }, 400);

  const admin = createClient(url, key);
  const { data: student } = await admin.from("student_accounts")
    .select("student_number")
    .eq("auth_user_id", user.id)
    .single();
  if (!student) return json({ error: "학생 계정을 찾을 수 없습니다." }, 403);
  const parsedClass = parseStudentClass(student.student_number);
  if (!parsedClass) {
    return json({ error: "학번으로 연결되는 학급이 없어 현재 수업 답변을 저장할 수 없습니다." }, 403);
  }

  const { data: lesson, error: lessonError } = await admin.from("lesson_plans")
    .select("id,project_version_id")
    .eq("id", body.lessonPlanId)
    .maybeSingle();
  if (lessonError) return json({ error: lessonError.message }, 400);
  if (!lesson) return json({ error: "현재 학급에 연결된 차시에서만 작성할 수 있습니다." }, 403);

  const { data: classProjects, error: classProjectError } = await admin.from("class_projects")
    .select("id,class_id,source_version_id,classes!inner(id,grade_number,class_number,active_lesson_plan_id)")
    .eq("source_version_id", lesson.project_version_id)
    .eq("classes.grade_number", parsedClass.grade)
    .eq("classes.class_number", parsedClass.classNumber)
    .eq("classes.active_lesson_plan_id", body.lessonPlanId)
    .limit(2);
  if (classProjectError) return json({ error: classProjectError.message }, 400);
  if (classProjects?.length !== 1) return json({ error: "현재 활성화된 학급 차시에서만 작성할 수 있습니다." }, 403);
  const classProject = classProjects[0];
  const classId = classProject.class_id;

  const { data: access } = await admin.from("class_lesson_stage_access")
    .select("access_mode")
    .eq("class_id", classId)
    .eq("lesson_plan_id", body.lessonPlanId)
    .eq("stage_code", body.stageCode)
    .maybeSingle();
  if (access?.access_mode !== "writable") return json({ error: "현재 작성할 수 없는 단계입니다." }, 403);

  const now = new Date().toISOString();
  const { data: existing } = await admin.from("think_stage_responses")
    .select("submitted_at")
    .eq("lesson_plan_id", body.lessonPlanId)
    .eq("student_number", student.student_number)
    .eq("stage_code", body.stageCode)
    .maybeSingle();
  const submittedAt = body.submit ? now : existing?.submitted_at || null;
  const { data, error } = await admin.from("think_stage_responses").upsert({
    lesson_plan_id: body.lessonPlanId,
    student_number: student.student_number,
    stage_code: body.stageCode,
    content: body.content,
    updated_at: now,
    submitted_at: submittedAt
  }, { onConflict: "lesson_plan_id,student_number,stage_code" }).select().single();
  return error ? json({ error: error.message }, 400) : json({ response: data });
});
