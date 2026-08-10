import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type StudentClassResolutionReason =
  | "invalid_student_number"
  | "class_not_found"
  | "ambiguous_class";

export function parseStudentClass(studentNumber: string) {
  if (!/^\d{5}$/.test(studentNumber)) return null;

  return {
    grade: Number(studentNumber.slice(0, 1)),
    classNumber: Number(studentNumber.slice(1, 3)),
  };
}

export async function resolveStudentClass(admin: SupabaseClient, studentNumber: string) {
  const parsed = parseStudentClass(studentNumber);
  if (!parsed) {
    return { classroom: null, reason: "invalid_student_number" as const, error: null };
  }

  const { data, error } = await admin
    .from("classes")
    .select("id")
    .eq("grade_number", parsed.grade)
    .eq("class_number", parsed.classNumber);

  if (error) return { classroom: null, reason: null, error: error.message };
  if (!data || data.length === 0) {
    return { classroom: null, reason: "class_not_found" as const, error: null };
  }
  if (data.length > 1) {
    return { classroom: null, reason: "ambiguous_class" as const, error: null };
  }

  return { classroom: data[0], reason: null, error: null };
}
