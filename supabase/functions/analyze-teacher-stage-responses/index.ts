import { createClient } from "@supabase/supabase-js";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
const stageCodes = ["T", "H", "I", "N", "K"];
const MAX_INPUT_CHARS = 30_000;
const MAX_RESPONSES = 80;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

function validateInsight(value: unknown) {
  const insight = value as Record<string, unknown>;
  const text = (key: string, max = 800) => typeof insight?.[key] === "string" ? insight[key].trim().slice(0, max) : "";
  const perspectives = Array.isArray(insight?.perspectives) ? insight.perspectives.slice(0, 6).map((item) => {
    const candidate = item as Record<string, unknown>;
    return { label: typeof candidate?.label === "string" ? candidate.label.trim().slice(0, 120) : "관점", count: Number.isFinite(Number(candidate?.count)) ? Math.max(0, Math.floor(Number(candidate.count))) : 0 };
  }).filter((item) => item.label) : [];
  const missingPerspectives = Array.isArray(insight?.missingPerspectives) ? insight.missingPerspectives.slice(0, 5).filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 180)).filter(Boolean) : [];
  const overview = text("overview");
  const nextQuestion = text("nextQuestion", 300);
  if (!overview || !nextQuestion) return null;
  return { overview, perspectives, missingPerspectives, nextQuestion };
}

async function approvedTeacher(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization) return { error: json({ error: "로그인이 필요합니다." }, 401) };
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: userError } = await caller.auth.getUser();
  if (userError || !user) return { error: json({ error: "로그인이 필요합니다." }, 401) };
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: profile, error: profileError } = await admin.from("profiles").select("role,approval_status").eq("id", user.id).maybeSingle();
  if (profileError) return { error: json({ error: profileError.message }, 400) };
  if (!profile || !["teacher", "admin"].includes(profile.role) || profile.approval_status !== "approved") return { error: json({ error: "승인된 교사만 사용할 수 있습니다." }, 403) };
  return { admin, teacherId: user.id };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST 요청만 지원합니다." }, 405);
  const permission = await approvedTeacher(req);
  if (permission.error) return permission.error;
  const { admin, teacherId } = permission;
  const body = await req.json().catch(() => null);
  if (!body?.classId || !body.lessonId || typeof body.classId !== "string" || typeof body.lessonId !== "string" || !stageCodes.includes(body.stageCode)) return json({ error: "요청 정보가 올바르지 않습니다." }, 400);
  if (!geminiApiKey) return json({ error: "Gemini 분석 키가 설정되지 않았습니다." }, 503);

  const { data: classroom, error: classError } = await admin.from("classes").select("id").eq("id", body.classId).eq("teacher_id", teacherId).maybeSingle();
  if (classError) return json({ error: classError.message }, 400);
  if (!classroom) return json({ error: "학급을 찾을 수 없거나 열람 권한이 없습니다." }, 404);
  const { data: lesson, error: lessonError } = await admin.from("lesson_plans").select("id,project_version_id,core_question").eq("id", body.lessonId).maybeSingle();
  if (lessonError) return json({ error: lessonError.message }, 400);
  if (!lesson) return json({ error: "차시를 찾을 수 없습니다." }, 404);
  const { data: classProject, error: projectError } = await admin.from("class_projects").select("id").eq("class_id", body.classId).eq("source_version_id", lesson.project_version_id).limit(1).maybeSingle();
  if (projectError) return json({ error: projectError.message }, 400);
  if (!classProject) return json({ error: "이 학급에 연결된 차시가 아닙니다." }, 404);
  const { data: responseRows, error: responseError } = await admin.from("think_records").select("content").eq("class_id", body.classId).eq("lesson_id", body.lessonId).eq("stage", body.stageCode).not("content", "is", null).order("updated_at", { ascending: false });
  if (responseError) return json({ error: responseError.message }, 400);
  const excerpts: string[] = [];
  let totalChars = 0;
  for (const row of responseRows || []) {
    const content = String(row.content || "").trim();
    if (!content || excerpts.length >= MAX_RESPONSES || totalChars >= MAX_INPUT_CHARS) continue;
    const excerpt = content.slice(0, Math.min(2_000, MAX_INPUT_CHARS - totalChars));
    excerpts.push(excerpt); totalChars += excerpt.length;
  }
  const includedCount = excerpts.length;
  const excludedResponseCount = Math.max(0, (responseRows || []).length - includedCount);
  const geminiPayload = {
    contents: [{ parts: [{ text: `당신은 교사의 수업 성찰을 돕는 조력자입니다. 아래에는 총 ${includedCount}개의 익명 학생 글이 있습니다. 학생별 등급·서열·점수·작성자 추정·인용은 하지 마세요. 학급 전체 경향만 한국어 JSON으로 답하세요. JSON 형식: {"overview":"...","perspectives":[{"label":"...","count":0}],"missingPerspectives":["..."],"nextQuestion":"..."}. 핵심 질문: ${lesson.core_question || ""}\n\n${excerpts.map((content, index) => `익명 응답 ${index + 1}: ${content}`).join("\n\n")}` }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
  };
  const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(geminiPayload) });
  if (!geminiResponse.ok) return json({ error: "Gemini 분석 요청에 실패했습니다." }, 502);
  const geminiResult = await geminiResponse.json();
  const rawText = geminiResult?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  let parsed: unknown;
  try { parsed = JSON.parse(rawText.replace(/^```json\s*|\s*```$/g, "")); } catch { return json({ error: "Gemini 분석 형식을 확인하지 못했습니다." }, 502); }
  const insight = validateInsight(parsed);
  if (!insight) return json({ error: "Gemini 분석 결과가 올바르지 않습니다." }, 502);
  return json({ ...insight, includedResponseCount: includedCount, excludedResponseCount, generatedAt: new Date().toISOString() });
});
