// Supabase Edge Function: assign-peer-opinions
// Equal-exposure anonymous 4 peer opinion allocation algorithm.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { activity_id, reviewer_student_id, available_opinions } = await req.json();

    if (!reviewer_student_id || !available_opinions || available_opinions.length === 0) {
      return new Response(JSON.stringify({ error: "유효하지 않은 요청 데이터입니다." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Filter out reviewer's own opinion
    const peerOnly = available_opinions.filter((op: any) => op.author_student_id !== reviewer_student_id);

    // 2. Sort by least assigned count to guarantee equal exposure (difference <= 1)
    peerOnly.sort((a: any, b: any) => (a.assigned_count || 0) - (b.assigned_count || 0));

    // 3. Select top 4 least exposed peer opinions
    const selected = peerOnly.slice(0, 4);

    // 4. Map to dynamic display order (A, B, C, D)
    const assignments = selected.map((op: any, index: number) => ({
      activity_id,
      reviewer_student_id,
      author_student_id: op.author_student_id,
      submission_id: op.submission_id,
      display_order: index + 1,
      display_label: `의견 ${String.fromCharCode(65 + index)}`
    }));

    return new Response(JSON.stringify({ assignments }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
