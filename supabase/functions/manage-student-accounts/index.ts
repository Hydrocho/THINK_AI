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

  if (body.action === "create_class") {
    const grade = Number(body.grade);
    const classNum = Number(body.classNumber);
    const subjectName = String(body.subjectName || "").trim();
    if (!Number.isInteger(grade) || !Number.isInteger(classNum)) {
      return json({ error: "학년과 반 번호를 정확히 선택해 주세요." }, 400);
    }
    if (!subjectName) {
      return json({ error: "과목명을 입력해 주세요." }, 400);
    }
    const classCode = `class-${grade}-${classNum}-${subjectName}`;

    const { data: existingClass, error: existingClassError } = await admin
      .from("classes")
      .select("id")
      .eq("teacher_id", teacherId)
      .eq("grade_number", grade)
      .eq("class_number", classNum)
      .eq("subject_name", subjectName)
      .maybeSingle();

    if (existingClassError) return json({ error: existingClassError.message }, 400);
    if (existingClass) {
      return json({ error: `${grade}학년 ${classNum}반 ${subjectName}은 이미 등록되어 있는 과목 학급입니다.` }, 409);
    }

    const { data: newClass, error } = await admin
      .from("classes")
      .insert({
        teacher_id: teacherId,
        class_code: classCode,
        grade_number: grade,
        class_number: classNum,
        subject_name: subjectName
      })
      .select()
      .single();

    if (error?.code === "23505") {
      return json({ error: `${grade}학년 ${classNum}반 ${subjectName}은 이미 등록되어 있는 과목 학급입니다.` }, 409);
    }
    if (error) return json({ error: error.message }, 400);

    return json({ class: newClass });
  }

  if (body.action === "delete_class") {
    if (!body.classId) return json({ error: "삭제할 학급을 선택해 주세요." }, 400);

    const { data: cls } = await admin.from("classes").select("id, grade_number, class_number").eq("id", body.classId).maybeSingle();
    if (!cls) return json({ success: true });

    const prefix = `${cls.grade_number}${cls.class_number < 10 ? '0' + cls.class_number : cls.class_number}`;

    const { data: classStudents } = await admin.from("student_accounts").select("id").like("student_number", `${prefix}%`);
    const classStudentIds = (classStudents || []).map((s: any) => s.id);

    const { data: teacherActivities } = await admin.from("activities").select("id").eq("teacher_id", teacherId);
    const activityIds = (teacherActivities || []).map((a: any) => a.id);

    if (classStudentIds.length > 0 && activityIds.length > 0) {
      await admin.from("messages").delete().in("activity_id", activityIds).in("student_id", classStudentIds);
      await admin.from("submissions").delete().in("activity_id", activityIds).in("student_id", classStudentIds);
      await admin.from("peer_reviews").delete().in("activity_id", activityIds).in("reviewer_student_id", classStudentIds);
      await admin.from("peer_assignments").delete().in("activity_id", activityIds).in("reviewer_student_id", classStudentIds);
      await admin.from("ai_evidence").delete().in("activity_id", activityIds).in("student_id", classStudentIds);
      await admin.from("teacher_assessments").delete().in("activity_id", activityIds).in("student_id", classStudentIds);
    }

    await admin.from("class_projects").delete().eq("class_id", body.classId);

    const { error: delClassErr } = await admin.from("classes").delete().eq("id", body.classId);
    if (delClassErr) return json({ error: delClassErr.message }, 400);

    return json({ success: true });
  }

  if (body.action === "delete_student") {
    if (!body.studentId) return json({ error: "삭제할 학생 계정을 선택해 주세요." }, 400);

    const { data: student } = await admin.from("student_accounts").select("id, student_number, auth_user_id").eq("id", body.studentId).maybeSingle();
    if (!student) return json({ success: true });

    // 1. Delete student submissions and activity history
    await admin.from("messages").delete().eq("student_id", body.studentId);
    await admin.from("submissions").delete().eq("student_id", body.studentId);
    await admin.from("peer_reviews").delete().eq("reviewer_student_id", body.studentId);
    await admin.from("peer_assignments").delete().or(`reviewer_student_id.eq.${body.studentId},author_student_id.eq.${body.studentId}`);
    await admin.from("ai_evidence").delete().eq("student_id", body.studentId);
    await admin.from("teacher_assessments").delete().eq("student_id", body.studentId);

    // 2. Delete auth user if exists
    if (student.auth_user_id) {
      await admin.auth.admin.deleteUser(student.auth_user_id).catch(() => null);
    } else if (student.student_number) {
      const email = `student_${student.student_number}@school.internal`;
      const { data: listData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const orphan = listData?.users?.find((u: any) => u.email === email);
      if (orphan) {
        await admin.auth.admin.deleteUser(orphan.id).catch(() => null);
      }
    }

    // 3. Delete student account record
    const { error: deleteAccErr } = await admin.from("student_accounts").delete().eq("id", body.studentId);
    if (deleteAccErr) return json({ error: deleteAccErr.message }, 400);

    return json({ success: true });
  }

  if (body.action !== "batch_create" || !Number.isInteger(body.grade) || !Number.isInteger(body.classNumber) || !Array.isArray(body.students) || body.students.length === 0) return json({ error: "학생 일괄 생성 요청이 올바르지 않습니다." }, 400);
  const { data: existingClass } = await admin.from("classes").select("id").eq("grade_number", body.grade).eq("class_number", body.classNumber).limit(1).maybeSingle();
  const classId = existingClass?.id;
  if (!classId) {
    return json({ error: `${body.grade}학년 ${body.classNumber}반 학급이 존재하지 않습니다. 먼저 학급을 개설해 주세요.` }, 400);
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
    const password = "000000";
    const email = `student_${studentNumber}@school.internal`;

    let authUser = null;
    const { data: createdAuthUser, error: authError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });

    if (authError) {
      // If auth user already exists (orphaned from previous delete or failed DB insert), search & clean up orphan auth user then retry
      if (authError.message?.includes("already registered") || authError.message?.includes("already been registered")) {
        let existingUser = null;
        let page = 1;
        while (!existingUser && page <= 10) {
          const { data: listData } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (!listData?.users || listData.users.length === 0) break;
          existingUser = listData.users.find((u: any) => u.email === email);
          if (listData.users.length < 1000) break;
          page++;
        }

        if (existingUser) {
          await admin.auth.admin.deleteUser(existingUser.id).catch(() => null);
          const retry = await admin.auth.admin.createUser({ email, password, email_confirm: true });
          if (retry.error) return json({ error: retry.error.message }, 400);
          authUser = retry.data;
        } else {
          return json({ error: authError.message }, 400);
        }
      } else {
        return json({ error: authError.message }, 400);
      }
    } else {
      authUser = createdAuthUser;
    }

    const { data: student, error } = await admin.from("student_accounts").insert({ student_number: studentNumber, student_name: name, auth_user_id: authUser.user.id, must_change_password: true }).select("id, student_number, student_name, created_at").single();
    if (error) {
      if (authUser?.user?.id) {
        await admin.auth.admin.deleteUser(authUser.user.id).catch(() => null);
      }
      return json({ error: error.message }, 400);
    }
    students.push(student);
  }
  return json({ students, duplicates });
});
