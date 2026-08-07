// Supabase Edge Function: gemini-chat
// Handles student AI interactions with Gemini 3.5 Flash using paid tier (store=false)
// No personal identifiers are transmitted to Gemini API.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = Deno.env.get("GEMINI_CHAT_MODEL") || "gemini-3.5-flash";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { activity_title, core_question, student_message, previous_messages } = await req.json();

    if (!student_message) {
      return new Response(JSON.stringify({ error: "학생 메시지가 없습니다." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Construct privacy-preserved system prompt (No student name or ID!)
    const systemInstruction = `
[역할]
너는 중학교 3학년 수업 활동을 돕는 '사고 촉진형 AI 튜터'이다.

[수업 주제 및 질문]
활동: ${activity_title}
핵심 질문: ${core_question}

[응답 지침]
1. 정답이나 완결된 답을 대신 작성해주지 마라.
2. 학생의 현재 주장과 근거를 먼저 긍정적으로 확인해라.
3. 근거가 부족하면 추가 근거나 반례를 한 번에 하나씩 질문해라.
4. 중학교 3학년 수준의 친절하고 명확한 한국어를 사용해라.
5. 개인정보를 묻거나 저장하려 하지 마라.
    `.trim();

    // Prepare payload for Gemini Developer API (store=false principle)
    const payload = {
      contents: [
        { role: "user", parts: [{ text: systemInstruction }] },
        ...(previous_messages || []).map((msg: any) => ({
          role: msg.sender_role === "student" ? "user" : "model",
          parts: [{ text: msg.content }],
        })),
        { role: "user", parts: [{ text: student_message }] },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 800,
      },
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    const data = await response.json();
    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "죄송합니다. 답변을 생성하는 중에 오류가 발생했습니다.";

    return new Response(
      JSON.stringify({
        reply: aiText,
        model_used: GEMINI_MODEL,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
