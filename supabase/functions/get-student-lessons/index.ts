import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const stageCodes = ["T", "H", "I", "N", "K"];

serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const token = req.headers.get("Authorization");
  if (!token) return json({ error: "로그인이 필요합니다." }, 401);

  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: token } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "로그인이 필요합니다." }, 401);

  const admin = createClient(url, key);
  const { data: student } = await admin.from("student_accounts")
    .select("id,student_number,class_id")
    .eq("auth_user_id", user.id)
    .single();
  if (!student) return json({ error: "학생 계정을 찾을 수 없습니다." }, 403);

  const { data: session, error: sessionError } = await admin.from("class_sessions")
    .select("id,class_id,lesson_plan_id,opened_at,class_projects!inner(id,source_project_id,title),lesson_plans!inner(id,lesson_order,title,core_question,think_stages,ai_question_limit,ai_response_mode)")
    .eq("class_id", student.class_id)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .maybeSingle();
  if (sessionError) return json({ error: sessionError.message }, 400);

  let liveLesson = null;
  if (session) {
    const lesson = Array.isArray(session.lesson_plans) ? session.lesson_plans[0] : session.lesson_plans;
    const project = Array.isArray(session.class_projects) ? session.class_projects[0] : session.class_projects;
    const { data: accesses, error: accessError } = await admin.from("class_lesson_stage_access")
      .select("stage_code,access_mode")
      .eq("class_id", student.class_id)
      .eq("lesson_plan_id", session.lesson_plan_id);
    if (accessError) return json({ error: accessError.message }, 400);
    const thinkStageAccess = Object.fromEntries(stageCodes.map(stage => [stage, "hidden"]));
    for (const access of accesses || []) thinkStageAccess[access.stage_code] = access.access_mode;
    liveLesson = {
      classId: student.class_id,
      sessionId: session.id,
      projectId: project.source_project_id,
      projectTitle: project.title,
      lesson: {
        id: lesson.id,
        number: lesson.lesson_order,
        title: lesson.title,
        coreQuestion: lesson.core_question,
        thinkStages: lesson.think_stages,
        aiQuestionLimit: lesson.ai_question_limit,
        aiResponseMode: lesson.ai_response_mode,
        thinkStageAccess,
        projectTitle: project.title
      }
    };
  }

  const { data: responses, error: responseError } = await admin.from("think_stage_responses")
    .select("lesson_plan_id,stage_code,updated_at,submitted_at,lesson_plans!inner(title,project_versions!inner(projects!inner(title)))")
    .eq("student_number", student.student_number)
    .order("updated_at", { ascending: false });
  if (responseError) return json({ error: responseError.message }, 400);

  const historyByLesson = new Map<string, any>();
  for (const response of responses || []) {
    const existing = historyByLesson.get(response.lesson_plan_id);
    const lesson = Array.isArray(response.lesson_plans) ? response.lesson_plans[0] : response.lesson_plans;
    const version = Array.isArray(lesson.project_versions) ? lesson.project_versions[0] : lesson.project_versions;
    const project = Array.isArray(version.projects) ? version.projects[0] : version.projects;
    if (!existing) historyByLesson.set(response.lesson_plan_id, {
      lessonPlanId: response.lesson_plan_id,
      projectTitle: project?.title || "프로젝트",
      lessonTitle: lesson?.title || "차시",
      status: response.submitted_at ? "submitted" : "draft",
      updatedAt: response.updated_at
    });
    else if (response.submitted_at) existing.status = "submitted";
  }

  return json({ liveLesson, history: Array.from(historyByLesson.values()) });
});
