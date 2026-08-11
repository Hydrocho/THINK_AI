import { createClient } from "@supabase/supabase-js";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const stageCodes = ["T", "H", "I", "N", "K"];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

async function approvedTeacher(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization) return { error: json({ error: "로그인이 필요합니다." }, 401) };

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: userError } = await caller.auth.getUser();
  if (userError || !user) return { error: json({ error: "로그인이 필요합니다." }, 401) };

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role,approval_status")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return { error: json({ error: profileError.message }, 400) };
  if (!profile || !["teacher", "admin"].includes(profile.role) || profile.approval_status !== "approved") {
    return { error: json({ error: "승인된 교사만 학생 글을 열람할 수 있습니다." }, 403) };
  }

  return { admin, teacherId: user.id };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST 요청만 지원합니다." }, 405);

  const permission = await approvedTeacher(req);
  if (permission.error) return permission.error;
  const { admin, teacherId } = permission;

  const body = await req.json().catch(() => null);
  if (
    !body?.classId ||
    !body.lessonId ||
    typeof body.classId !== "string" ||
    typeof body.lessonId !== "string" ||
    !stageCodes.includes(body.stageCode)
  ) {
    return json({ error: "학급, 차시, THINK 단계 정보가 올바르지 않습니다." }, 400);
  }

  const { data: classroom, error: classError } = await admin
    .from("classes")
    .select("id,grade_number,class_number,subject_name")
    .eq("id", body.classId)
    .eq("teacher_id", teacherId)
    .maybeSingle();
  if (classError) return json({ error: classError.message }, 400);
  if (!classroom) return json({ error: "학급을 찾을 수 없거나 열람 권한이 없습니다." }, 404);

  const { data: lesson, error: lessonError } = await admin
    .from("lesson_plans")
    .select("id,project_version_id,lesson_order,title,core_question,think_stages")
    .eq("id", body.lessonId)
    .maybeSingle();
  if (lessonError) return json({ error: lessonError.message }, 400);
  if (!lesson) return json({ error: "차시를 찾을 수 없습니다." }, 404);

  const { data: classProject, error: classProjectError } = await admin
    .from("class_projects")
    .select("id,title,source_project_id,source_version_id")
    .eq("class_id", body.classId)
    .eq("source_version_id", lesson.project_version_id)
    .limit(1)
    .maybeSingle();
  if (classProjectError) return json({ error: classProjectError.message }, 400);
  if (!classProject) return json({ error: "이 학급에 연결된 차시가 아닙니다." }, 404);

  const studentPrefix = `${classroom.grade_number}${String(classroom.class_number).padStart(2, "0")}`;
  const { data: studentRows, error: studentError } = await admin
    .from("student_accounts")
    .select("student_number,student_name")
    .like("student_number", `${studentPrefix}%`)
    .order("student_number", { ascending: true });
  if (studentError) return json({ error: studentError.message }, 400);
  const roster = studentRows || [];

  const responseQuery = admin
    .from("think_stage_responses")
    .select("student_number,content,updated_at,submitted_at")
    .eq("lesson_plan_id", body.lessonId)
    .eq("stage_code", body.stageCode);
  const { data: responseRows, error: responseError } = roster.length
    ? await responseQuery.in("student_number", roster.map((student) => student.student_number))
    : { data: [], error: null };
  if (responseError) return json({ error: responseError.message }, 400);

  const { data: stageAccess, error: accessError } = await admin
    .from("class_lesson_stage_access")
    .select("access_mode")
    .eq("class_id", body.classId)
    .eq("lesson_plan_id", body.lessonId)
    .eq("stage_code", body.stageCode)
    .maybeSingle();
  if (accessError) return json({ error: accessError.message }, 400);

  const responseByStudentNumber = new Map(
    (responseRows || []).map((response) => [response.student_number, response]),
  );
  const students = roster.map((student) => {
    const response = responseByStudentNumber.get(student.student_number) || null;
    return {
      studentNumber: student.student_number,
      studentName: student.student_name,
      response: response ? {
        content: response.content,
        updatedAt: response.updated_at,
        submittedAt: response.submitted_at,
      } : null,
    };
  });

  return json({
    classInfo: {
      id: classroom.id,
      subjectName: classroom.subject_name,
      gradeNumber: classroom.grade_number,
      classNumber: classroom.class_number,
      projectId: classProject.source_project_id,
      projectTitle: classProject.title,
    },
    lesson: {
      id: lesson.id,
      number: lesson.lesson_order,
      title: lesson.title,
      coreQuestion: lesson.core_question,
      thinkStages: lesson.think_stages,
    },
    stageCode: body.stageCode,
    stageAccessMode: stageAccess?.access_mode || "hidden",
    students,
  });
});
