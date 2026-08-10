import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { parseStudentClass } from "../_shared/student-class.ts";

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

  const parsedClass = parseStudentClass(student.student_number);
  if (!parsedClass) {
    return json({ studentName: student.student_name, subjectClasses: [], classResolution: "invalid_student_number" });
  }

  const { data: classes, error: classError } = await admin.from("classes")
    .select("id,grade_number,class_number,subject_name,active_lesson_plan_id")
    .eq("grade_number", parsedClass.grade)
    .eq("class_number", parsedClass.classNumber)
    .order("subject_name", { ascending: true });
  if (classError) return json({ error: classError.message }, 400);
  if (!classes?.length) {
    return json({ studentName: student.student_name, subjectClasses: [], classResolution: "class_not_found" });
  }

  const classIds = classes.map(classroom => classroom.id);
  const activeLessonIds = [...new Set(classes.map(classroom => classroom.active_lesson_plan_id).filter(Boolean))];

  const { data: classProjects, error: projectError } = await admin.from("class_projects")
    .select("class_id,source_project_id,source_version_id,title")
    .in("class_id", classIds);
  if (projectError) return json({ error: projectError.message }, 400);

  const { data: lessonRows, error: lessonError } = activeLessonIds.length
    ? await admin.from("lesson_plans")
      .select("id,project_version_id,lesson_order,title,core_question,think_stages,ai_question_limit,ai_response_mode")
      .in("id", activeLessonIds)
    : { data: [], error: null };
  if (lessonError) return json({ error: lessonError.message }, 400);

  const { data: accessRows, error: accessError } = activeLessonIds.length
    ? await admin.from("class_lesson_stage_access")
      .select("class_id,lesson_plan_id,stage_code,access_mode")
      .in("class_id", classIds)
      .in("lesson_plan_id", activeLessonIds)
    : { data: [], error: null };
  if (accessError) return json({ error: accessError.message }, 400);

  const projectsByClassVersion = new Map(
    (classProjects || []).map(project => [`${project.class_id}:${project.source_version_id}`, project])
  );
  const lessonsById = new Map((lessonRows || []).map(lesson => [lesson.id, lesson]));
  const stageAccessByClassLesson = new Map<string, Record<string, string>>();
  for (const access of accessRows || []) {
    const accessKey = `${access.class_id}:${access.lesson_plan_id}`;
    const thinkStageAccess = stageAccessByClassLesson.get(accessKey)
      || Object.fromEntries(stageCodes.map(stage => [stage, "hidden"]));
    thinkStageAccess[access.stage_code] = access.access_mode;
    stageAccessByClassLesson.set(accessKey, thinkStageAccess);
  }

  const subjectClasses = classes.map(classroom => {
    const lesson = classroom.active_lesson_plan_id
      ? lessonsById.get(classroom.active_lesson_plan_id)
      : null;
    const project = lesson
      ? projectsByClassVersion.get(`${classroom.id}:${lesson.project_version_id}`)
      : null;
    const activeLesson = lesson && project ? {
      id: lesson.id,
      number: lesson.lesson_order,
      title: lesson.title,
      coreQuestion: lesson.core_question,
      thinkStages: lesson.think_stages,
      aiQuestionLimit: lesson.ai_question_limit,
      aiResponseMode: lesson.ai_response_mode,
      thinkStageAccess: stageAccessByClassLesson.get(`${classroom.id}:${lesson.id}`)
        || Object.fromEntries(stageCodes.map(stage => [stage, "hidden"])),
      projectId: project.source_project_id,
      projectTitle: project.title
    } : null;

    return {
      classId: classroom.id,
      gradeNumber: classroom.grade_number,
      classNumber: classroom.class_number,
      subjectName: classroom.subject_name,
      activeLesson
    };
  });

  return json({ studentName: student.student_name, subjectClasses, classResolution: null });
});
