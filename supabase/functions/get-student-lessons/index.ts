import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { resolveStudentClass } from "../_shared/student-class.ts";

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
    .select("id,student_number,student_name")
    .eq("auth_user_id", user.id)
    .single();
  if (!student) return json({ error: "학생 계정을 찾을 수 없습니다." }, 403);
  const resolvedClass = await resolveStudentClass(admin, student.student_number);
  if (resolvedClass.error) return json({ error: resolvedClass.error }, 400);
  if (!resolvedClass.classroom) {
    return json({ classId: null, lessons: [], history: [], classResolution: resolvedClass.reason });
  }
  const classId = resolvedClass.classroom.id;

  const { data: classProjects, error: projectError } = await admin
    .from("class_projects")
    .select("id,source_project_id,source_version_id,title")
    .eq("class_id", classId)
    .order("attached_at", { ascending: true });
  if (projectError) return json({ error: projectError.message }, 400);

  const versionIds = (classProjects || []).map(project => project.source_version_id);
  const { data: lessonRows, error: lessonError } = versionIds.length
    ? await admin.from("lesson_plans")
      .select("id,project_version_id,lesson_order,title,core_question,think_stages,ai_question_limit,ai_response_mode")
      .in("project_version_id", versionIds)
      .order("lesson_order", { ascending: true })
    : { data: [], error: null };
  if (lessonError) return json({ error: lessonError.message }, 400);

  const { data: accessRows, error: accessError } = await admin.from("class_lesson_stage_access")
    .select("lesson_plan_id,stage_code,access_mode")
    .eq("class_id", classId);
  if (accessError) return json({ error: accessError.message }, 400);

  const projectsByVersion = new Map((classProjects || []).map(project => [project.source_version_id, project]));
  const stageAccessByLesson = new Map<string, Record<string, string>>();
  for (const access of accessRows || []) {
    const thinkStageAccess = stageAccessByLesson.get(access.lesson_plan_id)
      || Object.fromEntries(stageCodes.map(stage => [stage, "hidden"]));
    thinkStageAccess[access.stage_code] = access.access_mode;
    stageAccessByLesson.set(access.lesson_plan_id, thinkStageAccess);
  }
  const lessons = (lessonRows || [])
    .map(lesson => {
      const project = projectsByVersion.get(lesson.project_version_id);
      if (!project) return null;
      return {
        id: lesson.id,
        number: lesson.lesson_order,
        title: lesson.title,
        coreQuestion: lesson.core_question,
        thinkStages: lesson.think_stages,
        aiQuestionLimit: lesson.ai_question_limit,
        aiResponseMode: lesson.ai_response_mode,
        thinkStageAccess: stageAccessByLesson.get(lesson.id)
          || Object.fromEntries(stageCodes.map(stage => [stage, "hidden"])),
        projectId: project.source_project_id,
        projectTitle: project.title
      };
    })
    .filter((lesson): lesson is NonNullable<typeof lesson> => lesson !== null)
    .sort((left, right) => left.projectTitle.localeCompare(right.projectTitle) || left.number - right.number);

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

  return json({ classId, studentName: student.student_name, lessons, history: Array.from(historyByLesson.values()) });
});
