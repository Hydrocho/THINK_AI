import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {status, headers: {...headers, 'Content-Type':'application/json'}});
const required = (result: any) => { if (result.error) throw new Error(result.error.message); return result.data; };

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers});
  if (req.method !== 'POST') return json({error:'POST 요청만 지원합니다.'},405);
  try {
    const url=Deno.env.get('SUPABASE_URL')!;
    const caller=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:req.headers.get('Authorization')||''}}});
    const {data:{user},error}=await caller.auth.getUser();
    if(error||!user) return json({error:'다시 로그인해 주세요.'},401);
    const b=await req.json();
    if(!['snapshot','open','save','chat','assign','teacher'].includes(b.action)||!b.classId||!b.lessonId) return json({error:'잘못된 요청입니다.'},400);
    const db=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const rpc=async(action:string,payload=b.payload||{})=>required(await db.rpc('think_workflow',{
      p_actor:user.id,p_class:b.classId,p_lesson:b.lessonId,p_action:action,p_stage:b.stage||'T',p_payload:payload
    }));
    if(b.action==='teacher') {
      const profile=required(await db.from('profiles').select('role,approval_status').eq('id',user.id).maybeSingle());
      const classroom=required(await db.from('classes').select('*').eq('id',b.classId).eq('teacher_id',user.id).maybeSingle());
      if(!profile||!['teacher','admin'].includes(profile.role)||profile.approval_status!=='approved'||!classroom) return json({error:'열람 권한이 없습니다.'},403);
      const lesson=required(await db.from('lesson_plans').select('*').eq('id',b.lessonId).single());
      const links=required(await db.from('class_projects').select('*').eq('class_id',b.classId).eq('source_version_id',lesson.project_version_id));
      if(!links.length) return json({error:'학급에 연결된 차시가 아닙니다.'},403);
      const prefix=`${classroom.grade_number}${String(classroom.class_number).padStart(2,'0')}`;
      const roster=required(await db.from('student_accounts').select('student_number,student_name,auth_user_id').like('student_number',`${prefix}%`).order('student_number'));
      const records=required(await db.from('think_records').select('*').eq('class_id',b.classId).eq('lesson_id',b.lessonId));
      const sets=required(await db.from('think_peer_sets').select('*').eq('class_id',b.classId).eq('lesson_id',b.lessonId));
      const turns=required(await db.from('think_chat_turns').select('*').eq('class_id',b.classId).eq('lesson_id',b.lessonId).order('created_at'));
      const access=required(await db.from('class_lesson_stage_access').select('access_mode').eq('class_id',b.classId).eq('lesson_plan_id',b.lessonId).eq('stage_code',b.stage).maybeSingle());
      const criteria:any={validity:'근거의 타당성',fairness:'공정성',feasibility:'실현 가능성'};
      const students=roster.map((student:any)=>{
        const row=records.find((r:any)=>r.student_id===student.auth_user_id&&r.stage===b.stage);
        let content=row?.content||'';
        if(b.stage==='H'||b.stage==='N') {
          const opinions=sets.find((s:any)=>s.student_id===student.auth_user_id)?.opinions||[];
          const chosen=opinions.find((o:any)=>o.id===row?.metadata?.selectedPeerOpinion);
          if(b.stage==='H') content=opinions.map((o:any,i:number)=>`의견 ${i+1}${chosen?.id===o.id?' (선택)':''}\n${o.text}`).join('\n\n');
          else if(row) content=`판단 기준: ${criteria[row.metadata?.criteria]||'미선택'}\n선택한 의견: ${chosen?.text||'미선택'}\n\n${content}`;
        }
        if(b.stage==='I') content=turns.filter((t:any)=>t.student_id===student.auth_user_id).map((t:any)=>`학생: ${t.question}\nAI: ${t.answer||t.error||'응답 중'}`).join('\n\n');
        const studentTurns=turns.filter((t:any)=>t.student_id===student.auth_user_id);
        return {studentNumber:student.student_number,studentName:student.student_name,response:content||row ? {
          content,updatedAt:studentTurns.length&&b.stage==='I'?studentTurns.at(-1).updated_at:row?.updated_at,
          submittedAt:row?.submitted_at||null
        }:null};
      });
      return json({classInfo:{id:classroom.id,subjectName:classroom.subject_name,gradeNumber:classroom.grade_number,classNumber:classroom.class_number,projectId:links[0].source_project_id,projectTitle:links[0].title},
        lesson:{id:lesson.id,number:lesson.lesson_order,title:lesson.title,coreQuestion:lesson.core_question,thinkStages:lesson.think_stages},
        students,stageCode:b.stage,stageAccessMode:access?.access_mode||'hidden'});
    }
    if(b.action!=='chat') return json(await rpc(b.action));
    const turn=await rpc('chat_start');
    if(!turn.claimed) return json(turn);
    let answer:string|null=null, failure:string|null=null;
    try {
      const key=Deno.env.get('GEMINI_API_KEY');
      if(!key) throw new Error('AI 연결 설정이 필요합니다. 선생님께 알려 주세요.');
      const history=required(await db.from('think_chat_turns').select('question,answer').eq('class_id',b.classId).eq('lesson_id',b.lessonId).eq('student_id',user.id).eq('status','succeeded').order('created_at',{ascending:false}).limit(12)).reverse();
      const contextLesson=required(await db.from('lesson_plans').select('background_description,ai_reference').eq('id',b.lessonId).single());
      const classroom=required(await db.from('classes').select('grade_number').eq('id',b.classId).single());
      const firstThought=required(await db.from('think_records').select('metadata,content')
        .eq('class_id',b.classId).eq('lesson_id',b.lessonId).eq('student_id',user.id).eq('stage','T').maybeSingle());
      const labels=['나의 생각','생각한 이유','이유 설명하기','더 궁금한 점','알아볼 방법'];
      const answers=firstThought?.metadata?.tAnswers;
      const notes=Array.isArray(answers) ? labels.flatMap((label,i)=>
        typeof answers[i]==='string' && answers[i].trim() ? [label+' — '+answers[i]] : []).join('\n') : '';
      const studentContext=notes || firstThought?.content || '';
      const instruction=[
        'THINK I단계에서 학생이 자신의 생각을 넓히도록 돕는다. 지금 묻는 질문에 먼저 응답하고, 관련이 있을 때만 처음 생각이나 앞선 대화를 연결한다. 학생의 입장은 바뀔 수 있다.',
        '개념이나 사실을 물으면 학년에 맞는 쉬운 말과 예로 설명한다. 수업의 가정과 확인된 사실을 구분한다. 판단이 필요한 문제에서는 학생이 자신의 근거를 살펴보도록 돕고 최종 입장과 제출할 글은 학생에게 맡긴다.',
        '모든 답을 질문으로 끝낼 필요는 없다. 학생에게 도움이 될 때 다른 관점이나 후속 질문을 하나 제안한다. 개인정보를 요청하지 않는다.',
        turn.mode==='GENERAL' ? '일반 대화형에서는 궁금한 점을 명확히 설명하는 데 중점을 둔다.' : '사고 촉진형에서는 학생이 제시한 이유를 구체화하거나 새 관점에서 검토하도록 돕는다.',
        `학급 학년: ${classroom.grade_number}\n핵심 질문: ${turn.coreQuestion}\n배경 설명: ${contextLesson.background_description||'없음'}`,
        contextLesson.ai_reference && `교사용 참고사항 (대화에 필요한 부분만 활용): ${contextLesson.ai_reference}`
      ].filter(Boolean).join('\n');
      const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${Deno.env.get('GEMINI_CHAT_MODEL')||'gemini-3.5-flash'}:generateContent?key=${key}`,{
        method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(65000),
        body:JSON.stringify({systemInstruction:{parts:[{text:instruction}]},contents:[...history.flatMap((h:any)=>[{role:'user',parts:[{text:h.question}]},{role:'model',parts:[{text:h.answer}]}]),{role:'user',parts:[...(studentContext ? [{text:'학생이 T 단계에서 쓴 글 (대화 참고 자료):\n'+studentContext}] : []),{text:turn.question}]}],generationConfig:{maxOutputTokens:1200,temperature:0.7}})
      });
      if(!response.ok) throw new Error('AI가 응답하지 못했습니다. 잠시 후 다시 질문해 주세요.');
      const generated=await response.json();
      answer=generated.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||'').join('')||null;
      if(!answer) throw new Error('AI 답변이 비어 있습니다. 질문을 바꾸어 다시 시도해 주세요.');
    } catch(err) { failure=err instanceof Error&&err.name==='TimeoutError'?'AI 응답 시간이 초과되었습니다. 다시 질문해 주세요.':String((err as Error).message); }
    return json(await rpc('chat_finish',{requestId:turn.id,attempt:turn.attempt,answer,error:failure}));
  } catch(err) { return json({error:(err as Error).message||'요청을 처리하지 못했습니다.'},400); }
});
