// Supabase Edge Function: extract-evaluation-evidence
// Uses gemini-3.5-flash-lite to extract structured JSON evaluation evidence mapped to message IDs.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_EVIDENCE_MODEL = Deno.env.get("GEMINI_EVIDENCE_MODEL") || "gemini-3.5-flash-lite";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { messages, rubrics } = await req.json();

    const prompt = `
당신은 중학교 교사를 돕는 AI 평가 분석 보조도구입니다.
아래 학생 대화 메시지 기록을 읽고, 제공된 평가 기준(루브릭) 각각에 해당함을 보여주는 대화 발췌문과 message_id를 추출하세요.

[대화 메시지 기록]
${JSON.stringify(messages, null, 2)}

[평가 기준 루브릭]
${JSON.stringify(rubrics, null, 2)}

[응답 형식을 반드시 아래 구조화된 JSON 배열로만 반환하세요]
[
  {
    "criterion_name": "평가 기준명",
    "referenced_message_id": "실제 해당되는 message_id 값",
    "excerpt_quote": "대화 원문의 짧은 발췌문",
    "ai_explanation": "해당 대화가 왜 평가 기준에 부합하는지 설명"
  }
]
    `.trim();

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EVIDENCE_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );

    const data = await response.json();
    const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    const evidenceList = JSON.parse(rawJson);

    return new Response(JSON.stringify({ evidence: evidenceList }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
