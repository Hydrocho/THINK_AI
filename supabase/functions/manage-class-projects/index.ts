import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const url=Deno.env.get("SUPABASE_URL")!, key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
async function teacher(req:Request){const token=req.headers.get("Authorization");if(!token)return {error:json({error:"로그인이 필요합니다."},401)};const caller=createClient(url,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:token}}});const {data:{user}}=await caller.auth.getUser();if(!user)return {error:json({error:"로그인이 필요합니다."},401)};const admin=createClient(url,key);const {data:profile}=await admin.from("profiles").select("role,approval_status").eq("id",user.id).single();if(!profile||!["teacher","admin"].includes(profile.role)||profile.approval_status!=="approved")return {error:json({error:"승인된 교사만 사용할 수 있습니다."},403)};return {admin,userId:user.id};}
serve(async req=>{if(req.method==="OPTIONS")return new Response("ok",{headers:cors});const b=await req.json().catch(()=>null);if(!b?.action)return json({error:"요청 형식이 올바르지 않습니다."},400);const admin=createClient(url,key);let userId="";if(b.action&&b.action.startsWith("seed_")){if(req.headers.get("Authorization")){try{const p=await teacher(req);if(p&&!p.error&&p.userId)userId=p.userId;}catch(e){}}if(!userId){const {data:exT}=await admin.from("profiles").select("id").eq("role","teacher").limit(1).maybeSingle();if(exT){userId=exT.id;}else{const email="teacher_admin@school.internal";const {data:ca}=await admin.auth.admin.createUser({email,password:"password123",email_confirm:true}).catch(()=>({data:null}));userId=ca?.user?.id||"";if(userId){await admin.from("profiles").upsert({id:userId,role:"teacher",display_name:"과학 교사",email,approval_status:"approved"});}}}}else{const p=await teacher(req);if(p.error)return p.error;userId=p.userId;}
if(b.action==="manage_live_teaching"){
  const {data,error}=await admin.rpc('manage_live_teaching',{p_actor:userId,p_class:b.classId,p_lesson:b.lessonId,p_action:b.operation,p_payload:b.payload||{}});
  return error?json({error:error.message},400):json(data);
}
if(b.action==="list_projects"){const {data,error}=await admin.from("projects").select("*,project_versions(id,version_number,lesson_plans(*))").eq("author_id",userId).order("updated_at",{ascending:false});return error?json({error:error.message},400):json({projects:data});}
if(b.action==="create_project"){if(!b.title?.trim())return json({error:"프로젝트명을 입력해 주세요."},400);const {data:project,error}=await admin.from("projects").insert({author_id:userId,title:b.title.trim(),subject:b.subject||null,grade_number:b.gradeNumber||null,description:b.description||""}).select().single();if(error)return json({error:error.message},400);const {data:version,error:ve}=await admin.from("project_versions").insert({project_id:project.id,version_number:1,created_by:userId,assessment_criteria:b.assessmentCriteria||""}).select().single();if(ve)return json({error:ve.message},400);const lessons=(b.lessons||[]).map((x:any,i:number)=>({project_version_id:version.id,lesson_order:i+1,title:x.title,core_question:x.coreQuestion,review_resource:x.reviewResource||"",ai_reference:x.aiReference||"",background_description:x.backgroundDescription||"",student_guidance:x.studentGuidance||"",think_stages:x.thinkStages||["T","H","I","N","K"],ai_question_limit:x.aiQuestionLimit||20,ai_response_mode:x.aiResponseMode||"THOUGHT_PROVOKING"}));if(lessons.length){const {error:le}=await admin.from("lesson_plans").insert(lessons);if(le)return json({error:le.message},400)}return json({project,version});}
if(b.action==="set_project_published"){const {error}=await admin.from("projects").update({is_published:!!b.isPublished,updated_at:new Date().toISOString()}).eq("id",b.projectId).eq("author_id",userId);return error?json({error:error.message},400):json({ok:true});}
if(b.action==="set_lesson_access"){if(!["hidden","read_only","writable"].includes(b.studentAccessMode))return json({error:"유효하지 않은 학생 활동 상태입니다."},400);const {data,error}=await admin.from("lesson_plans").update({student_access_mode:b.studentAccessMode}).eq("id",b.lessonId).select().single();return error?json({error:error.message},400):json({lesson:data});}
if(b.action==="set_think_stage_access"){if(!["T","H","I","N","K"].includes(b.stageCode)||!["hidden","read_only","writable"].includes(b.accessMode))return json({error:"유효하지 않은 THINK 단계 상태입니다."},400);const {data:lesson}=await admin.from("lesson_plans").select("think_stage_access").eq("id",b.lessonId).single();if(!lesson)return json({error:"주제를 찾을 수 없습니다."},404);const access={T:"hidden",H:"hidden",I:"hidden",N:"hidden",K:"hidden",...(lesson.think_stage_access||{}),[b.stageCode]:b.accessMode};const {data,error}=await admin.from("lesson_plans").update({think_stage_access:access}).eq("id",b.lessonId).select().single();return error?json({error:error.message},400):json({lesson:data});}
if(b.action==="set_active_class_lesson"){
  if(!b.classId||!("lessonId" in b))return json({error:"학급과 활성 주제 정보를 입력해 주세요."},400);
  if(b.lessonId!==null&&(typeof b.lessonId!=="string"||!b.lessonId))return json({error:"유효한 주제를 선택해 주세요."},400);
  const {data:classroom,error:classError}=await admin.from("classes").select("id").eq("id",b.classId).eq("teacher_id",userId).maybeSingle();
  if(classError)return json({error:classError.message},400);
  if(!classroom)return json({error:"학급을 찾을 수 없거나 권한이 없습니다."},404);
  if(b.lessonId!==null){
    const {data:lesson,error:lessonError}=await admin.from("lesson_plans").select("project_version_id").eq("id",b.lessonId).maybeSingle();
    if(lessonError)return json({error:lessonError.message},400);
    if(!lesson)return json({error:"주제를 찾을 수 없습니다."},404);
    const {data:classProjects,error:classProjectError}=await admin.from("class_projects").select("id").eq("class_id",b.classId).eq("source_version_id",lesson.project_version_id).limit(1);
    if(classProjectError)return json({error:classProjectError.message},400);
    if(!classProjects?.length)return json({error:"해당 학급에 연결된 주제만 활성화할 수 있습니다."},400);
  }
  const {data:updated,error}=await admin.from("classes").update({active_lesson_plan_id:b.lessonId||null}).eq("id",b.classId).eq("teacher_id",userId).select().maybeSingle();
  if(error)return json({error:error.message},400);
  if(!updated)return json({error:"학급을 찾을 수 없거나 권한이 없습니다."},404);
  return json({class:updated});
}
if(b.action==="set_class_stage_access"){if(!["T","H","I","N","K"].includes(b.stageCode)||!["hidden","read_only","writable"].includes(b.accessMode))return json({error:"유효하지 않은 THINK 단계 상태입니다."},400);const {data:classroom}=await admin.from("classes").select("id").eq("id",b.classId).eq("teacher_id",userId).single();if(!classroom)return json({error:"학급을 찾을 수 없거나 권한이 없습니다."},404);const {data,error}=await admin.from("class_lesson_stage_access").upsert({class_id:b.classId,lesson_plan_id:b.lessonId,stage_code:b.stageCode,access_mode:b.accessMode,updated_at:new Date().toISOString()},{onConflict:"class_id,lesson_plan_id,stage_code"}).select().single();return error?json({error:error.message},400):json({access:data});}
if(b.action==="delete_project"){if(!b.projectId)return json({error:"프로젝트 ID가 필요합니다."},400);try{await admin.from("class_projects").delete().or(`source_project_id.eq.${b.projectId},project_id.eq.${b.projectId}`);const {data:versions}=await admin.from("project_versions").select("id").eq("project_id",b.projectId);if(versions?.length){const vIds=versions.map((v:any)=>v.id);await admin.from("lesson_plans").delete().in("project_version_id",vIds);await admin.from("project_versions").delete().eq("project_id",b.projectId);}await admin.from("projects").delete().eq("id",b.projectId);if(b.title){await admin.from("projects").delete().eq("title",b.title);}return json({ok:true});}catch(e:any){return json({error:e.message},400);}}
if(b.action==="attach"){const {data:v}=await admin.from("project_versions").select("project_id,projects!inner(author_id)").eq("id",b.versionId).eq("projects.author_id",userId).single();if(!v)return json({error:"연결할 수업 프로젝트를 찾을 수 없거나 권한이 없습니다."},404);const {data:classroom}=await admin.from("classes").select("id").eq("id",b.classId).eq("teacher_id",userId).single();if(!classroom)return json({error:"연결할 학급을 찾을 수 없거나 권한이 없습니다."},404);const {data,error}=await admin.from("class_projects").insert({class_id:b.classId,source_project_id:v.project_id,source_version_id:b.versionId,attached_by:userId,title:b.title||"프로젝트"}).select().single();return error?json({error:error.message},400):json({classProject:data});}
if(b.action==="detach"){if(!b.classProjectId)return json({error:"연결 ID가 필요합니다."},400);const {data:cp}=await admin.from("class_projects").select("id,class_id,classes!inner(teacher_id)").eq("id",b.classProjectId).eq("classes.teacher_id",userId).single();if(!cp)return json({error:"연결 정보를 찾을 수 없거나 권한이 없습니다."},404);const {error}=await admin.from("class_projects").delete().eq("id",b.classProjectId);return error?json({error:error.message},400):json({ok:true});}
if(b.action==="add_lesson"){let versionId=b.versionId;if(!versionId&&b.projectId){const {data:v}=await admin.from("project_versions").select("id").eq("project_id",b.projectId).order("version_number",{ascending:false}).limit(1).single();if(v){versionId=v.id;}else{const {data:newV,error:ve}=await admin.from("project_versions").insert({project_id:b.projectId,version_number:1,created_by:userId}).select().single();if(ve)return json({error:ve.message},400);versionId=newV.id;}}if(!versionId)return json({error:"프로젝트 버전 정보를 찾을 수 없습니다."},400);if(!b.title?.trim())return json({error:"주제 제목을 입력해 주세요."},400);if(!b.coreQuestion?.trim())return json({error:"핵심 질문을 입력해 주세요."},400);const {data:existing}=await admin.from("lesson_plans").select("lesson_order").eq("project_version_id",versionId).order("lesson_order",{ascending:false}).limit(1);const nextOrder=(existing?.[0]?.lesson_order||0)+1;const {data:newLesson,error}=await admin.from("lesson_plans").insert({project_version_id:versionId,lesson_order:nextOrder,title:b.title.trim(),core_question:b.coreQuestion.trim(),review_resource:b.reviewResource||"",ai_reference:b.aiReference||"",background_description:b.backgroundDescription||"",student_guidance:b.studentGuidance||"",think_stages:b.thinkStages||["T","H","I","N","K"],ai_question_limit:b.aiQuestionLimit||20}).select().single();if(error)return json({error:error.message},400);const {data:v}=await admin.from("project_versions").select("project_id").eq("id",versionId).single();if(v?.project_id){await admin.from("projects").update({updated_at:new Date().toISOString()}).eq("id",v.project_id);}return json({lesson:newLesson});}
if(b.action==="update_lesson"){if(!b.lessonId)return json({error:"주제 ID가 필요합니다."},400);const payload:any={};if(typeof b.reviewResource==="string")payload.review_resource=b.reviewResource.trim();if(typeof b.aiReference==="string")payload.ai_reference=b.aiReference.trim();if(typeof b.backgroundDescription==="string")payload.background_description=b.backgroundDescription.trim();if(b.title?.trim())payload.title=b.title.trim();if(b.coreQuestion?.trim())payload.core_question=b.coreQuestion.trim();if(typeof b.aiQuestionLimit==="number")payload.ai_question_limit=b.aiQuestionLimit;const {data:updated,error}=await admin.from("lesson_plans").update(payload).eq("id",b.lessonId).select().single();if(error)return json({error:error.message},400);return json({lesson:updated});}
if(b.action==="delete_lesson"){if(!b.lessonId)return json({error:"주제 ID가 필요합니다."},400);const {error}=await admin.from("lesson_plans").delete().eq("id",b.lessonId);if(error)return json({error:error.message},400);return json({ok:true});}
if(b.action==="reorder_lessons"){if(!Array.isArray(b.lessonOrders))return json({error:"주제 순서 데이터가 필요합니다."},400);for(const item of b.lessonOrders){if(item.id&&typeof item.lesson_order==="number"){await admin.from("lesson_plans").update({lesson_order:item.lesson_order}).eq("id",item.id);}}return json({ok:true});}
if(b.action==="seed_genetics_dummy_data"){
  try {
  const grade=3, classNum=1, subject="과학";
  let {data:cls}=await admin.from("classes").select("id,active_lesson_plan_id").eq("teacher_id",userId).eq("grade_number",grade).eq("class_number",classNum).maybeSingle();
  if(!cls){
    const {data:newCls,error:ce}=await admin.from("classes").insert({teacher_id:userId,class_code:`class-${grade}-${classNum}-${subject}`,grade_number:grade,class_number:classNum,subject_name:subject}).select().single();
    if(ce)return json({error:ce.message},400);
    cls=newCls;
  }

  // 1. Determine active or 1st lesson plan for Class 3-1
  let targetLessonId=cls.active_lesson_plan_id;
  let targetLesson: any = null;
  if(targetLessonId){
    const {data:al}=await admin.from("lesson_plans").select("id,core_question,title,project_version_id").eq("id",targetLessonId).maybeSingle();
    targetLesson=al;
  }
  if(!targetLesson){
    const {data:cpList}=await admin.from("class_projects").select("source_version_id,title").eq("class_id",cls.id).limit(1);
    const verId=cpList?.[0]?.source_version_id;
    if(verId){
      const {data:fl}=await admin.from("lesson_plans").select("id,core_question,title,project_version_id").eq("project_version_id",verId).order("lesson_order",{ascending:true}).limit(1).maybeSingle();
      targetLesson=fl;
    }
  }

  // Fallback: create/find the standard Island curriculum 1st lesson if none attached
  if(!targetLesson){
    const projTitle="유전자 조작 기술 (친구 및 AI와 생각을 넓히고 나의 생각을 세우기)";
    let {data:proj}=await admin.from("projects").select("id").eq("author_id",userId).eq("title",projTitle).maybeSingle();
    if(!proj){
      const {data:np}=await admin.from("projects").insert({author_id:userId,title:projTitle,subject:subject,grade_number:grade,description:"유전자 조작 기술과 인간의 가치를 탐구하는 세 가지 주제로 구성된 프로젝트"}).select().single();
      proj=np;
    }
    let {data:ver}=await admin.from("project_versions").select("id").eq("project_id",proj.id).order("version_number",{ascending:false}).limit(1).maybeSingle();
    if(!ver){
      const {data:nv}=await admin.from("project_versions").insert({project_id:proj.id,version_number:1,created_by:userId}).select().single();
      ver=nv;
    }
    const coreQ="영화 속 사람들은 ‘아일랜드’에 가는 것을 행운이라고 믿는다. 나만 그곳의 진실을 알게 되었는데, 가장 친한 친구가 당첨되어 기뻐하고 있다면 나는 어떻게 할까? 친구가 “너는 내가 당첨된 게 질투 나는 거지?”라며 믿지 않는다면, 그다음에는 어떻게 할까?";
    let {data:les}=await admin.from("lesson_plans").select("id,core_question,title,project_version_id").eq("project_version_id",ver.id).eq("core_question",coreQ).maybeSingle();
    if(!les){
      const {data:nl}=await admin.from("lesson_plans").insert({project_version_id:ver.id,lesson_order:1,title:"1주제 · 진실을 알게 된 나라면?",core_question:coreQ,think_stages:["T","H","I","N","K"],ai_question_limit:20}).select().single();
      les=nl;
    }
    let {data:cp}=await admin.from("class_projects").select("id").eq("class_id",cls.id).eq("source_version_id",ver.id).maybeSingle();
    if(!cp){
      await admin.from("class_projects").insert({class_id:cls.id,source_project_id:proj.id,source_version_id:ver.id,attached_by:userId,title:projTitle});
    }
    targetLesson=les;
  }

  const les=targetLesson;
  await admin.from("classes").update({active_lesson_plan_id:les.id}).eq("id",cls.id);

  // 2. 30 Students rich and diverse responses
  const tLabels=["① 나의 생각","② 생각한 이유","③ 이유 설명하기","④ 더 궁금한 점","⑤ 알아볼 방법"];
  const dummyList=[
    {num:"01",name:"강민준",t:[
      "친구가 질투로 오해하더라도 감정적으로 맞서지 않고, 시설의 제한 구역을 몰래 조사하여 아일랜드의 실체를 증명할 사진이나 기록을 찾아 보여주겠다.",
      "말만으로는 친구가 믿기 어려울 만큼 아일랜드 당첨은 큰 희망이기 때문에, 눈으로 직접 확인할 수 있는 객관적 증거가 가장 설득력이 있다고 생각한다.",
      "친구가 나를 질투한다고 생각하는 것은 내 말을 의심하기 때문이므로, 반박할 수 없는 사실 자료를 제시해야 오해를 풀고 친구의 생명을 구할 수 있다.",
      "환자 이송 구역이나 수술실 통로의 보안 시스템을 들키지 않고 촬영하거나 기록을 입수할 방법이 있을까?",
      "경비원들의 순찰 시간대를 기록하고, 통제 구역 청소를 담당하는 사람에게 접근 가능한 통로를 물어본다."
    ]},
    {num:"02",name:"김서연",t:[
      "친구의 기쁜 감정을 먼저 공감해 주면서도, '너를 잃는 것이 두려워서 그러니 딱 하루만 내 말을 검증해 보자'고 진심으로 설득하겠다.",
      "흥분한 상태에서는 어떤 논리적인 말도 들리지 않으므로, 내 진심과 우정을 먼저 전달해야 친구의 마음의 벽이 열릴 것이기 때문이다.",
      "친구가 내 태도에서 질투가 아닌 깊은 걱정을 느끼게 되면, 의심을 품고 내 이야기에 귀를 기울이게 될 것이다.",
      "친구가 당첨 직후 바로 격리되어 다른 사람과의 접촉이 차단된다면 어떻게 대화를 이어갈 수 있을까?",
      "환송 행사 전 친구에게 전달할 수 있는 비밀 편지를 남기거나, 친한 동료를 통해 약속 시간을 잡는다."
    ]},
    {num:"03",name:"박도윤",t:[
      "혼자 힘으로는 친구를 막기 어려우므로, 시설 내에서 이상한 낌새를 눈치챈 다른 동료들이나 신뢰할 만한 관리자에게 도움을 요청하겠다.",
      "개인의 말은 질투로 치부되기 쉽지만, 여러 사람이 같은 의문을 제기하면 친구도 심각성을 깨달을 수밖에 없다.",
      "다수의 증언과 연대를 통해 진실의 신빙성을 높이고, 유사시 친구의 강제 이송을 물리적으로 막을 힘을 모을 수 있다.",
      "우리 시설 직원들 중에서 진짜 진실을 알면서도 죄책감을 느끼는 내부 고발자가 과연 존재할까?",
      "평소 우리에게 친절하거나 시스템에 의문을 품는 듯한 태도를 보인 관리자를 조심스럽게 관찰하고 접촉한다."
    ]},
    {num:"04",name:"이지아",t:[
      "친구가 당첨된 날 아일랜드로 가는 수송선 탑승 통로를 몰래 확인시켜 주어 그곳이 지상 낙원이 아님을 스스로 목격하게 하겠다.",
      "백 마디 말보다 현장을 한 번 목격하는 것이 훨씬 충격적이고 의심의 여지가 없기 때문이다.",
      "친구가 직접 끔찍한 현장을 보게 되면 질투라는 오해는 단번에 사라지고 자신을 구하려 했다는 것을 깨달을 것이다.",
      "출발 당일 삼엄한 경비망을 뚫고 통제 구역 입구까지 친구를 안전하게 데려갈 경로가 있을까?",
      "환기구나 배수 통로처럼 평소 경비가 허술한 시설 설비 지도를 구해 이동 경로를 미리 답사한다."
    ]},
    {num:"05",name:"정시우",t:[
      "친구가 질투한다고 화를 내더라도 친구의 목숨이 달린 일이므로, 일단 아일랜드로 가는 수송선에 타지 못하게 시간을 끌며 막겠다.",
      "친구가 나를 영원히 미워하더라도 살아서 미워하는 것이 죽어서 후회하는 것보다 백배 낫기 때문이다.",
      "생명이 걸린 긴급 상황에서는 오해를 푸는 것보다 일단 위험으로부터 격리시키는 것이 최우선이다.",
      "친구의 출발을 방해했을 때 나와 친구 모두에게 가해질 시설의 처벌 수위는 어느 정도일까?",
      "가벼운 부상을 유도해 출발을 연기시키는 방법이나 시설 내 경보 장치를 울리는 방법을 고민해 본다."
    ]},
    {num:"06",name:"최하은",t:[
      "우리가 평소 나눴던 깊은 신뢰와 우정을 걸고, '내가 너를 속일 이유가 없다'는 진심을 담은 대화로 끝까지 호소하겠다.",
      "아무리 완벽한 거짓말이라도 오랜 시간 함께 쌓아온 진실한 관계 앞에서는 흔들릴 수밖에 없다고 믿기 때문이다.",
      "친구가 진심을 담은 내 눈빛을 본다면 최소한 '혹시 정말일까?' 하는 의심을 갖게 될 것이다.",
      "친구가 시설의 세뇌 교육 때문에 내 말보다 시설 안내 방송을 더 신뢰한다면 어떻게 반박해야 할까?",
      "평소 시설의 안내 방송 중 앞뒤가 맞지 않았던 모순점들을 메모해 친구와 하나씩 짚어본다."
    ]},
    {num:"07",name:"조하준",t:[
      "시설의 메인 컴퓨터 단말기에 접근하여 복제인간들의 실제 목적(장기 기증용)이 기록된 디지털 파일을 복사해 보여주겠다.",
      "시스템 내부 데이터는 시설을 운영하는 자들이 직접 작성한 문서이므로 친구가 부정할 수 없다.",
      "공식 기록을 보여주면 질투라는 주장은 설 자리를 잃고 충격적인 진실 앞에 친구도 대비하게 될 것이다.",
      "컴퓨터 보안 비밀번호를 알아내거나 단말기 보안 잠금을 해제할 수 있는 권한 카드가 어디에 있을까?",
      "기술직 관리자들이 자리를 비우는 교대 시간대를 확인하고 단말기 입력 패턴을 관찰한다."
    ]},
    {num:"08",name:"윤서윤",t:[
      "친구가 '아일랜드에 가면 하고 싶은 일'을 묻고, 그 꿈이 실제로는 거짓된 환상이라는 논리적 모순점을 짚어주겠다.",
      "꿈을 부정하기보다는 그 꿈이 이루어질 수 없는 구조적 이유를 스스로 생각하게 만드는 것이 덜 반발을 사기 때문이다.",
      "친구가 이상함을 감지하기 시작하면 자신이 믿어왔던 환경에 대해 스스로 질문을 던지게 된다.",
      "친구가 환상에서 깨어났을 때 겪을 극심한 절망감과 공포를 어떻게 위로하고 감당할 수 있을까?",
      "진실을 알린 직후 친구와 함께 시설 밖 진짜 세상으로 탈출할 구체적인 계획을 함께 준비한다."
    ]},
    {num:"09",name:"장지호",t:[
      "당첨자가 떠난 뒤 남겨진 숙소의 소지품이나 흔적이 완전히 소각되거나 사라진다는 의심스러운 정황을 함께 조사하자고 하겠다.",
      "낙원으로 간다면 친구들에게 편지를 보내거나 기념품을 남길 텐데 단 한 번도 그런 적이 없다는 점은 결정적 증거다.",
      "친구가 당연하게 넘겼던 일상적 의문들을 구체적으로 짚어주면 친구 스스로 진실을 확인하고 싶어질 것이다.",
      "이전에 당첨되어 떠났던 사람들의 방을 청소했던 동료들을 만나 증언을 들을 수 있을까?",
      "당첨자 숙소 정리 작업을 담당했던 친구들을 찾아가 떠난 사람의 짐이 어디로 갔는지 물어본다."
    ]},
    {num:"10",name:"임지유",t:[
      "친구가 질투로 받아들인다면 감정 대립을 멈추고, '딱 하루만 내 말을 검증해 보고 그래도 거짓이면 떠나라'고 타협안을 제시하겠다.",
      "무작정 가지 말라고 하면 반발하지만, 공정한 검증 기회를 주면 친구도 위험 부담을 줄이기 위해 응할 수 있다.",
      "하루의 시간을 벌면 친구와 함께 증거를 확인하거나 안전한 대비책을 마련할 수 있다.",
      "출발 일정 연기를 시설에 요청했을 때 의심을 사지 않을 만한 핑계(가벼운 발열이나 알레르기)가 통할까?",
      "건강 검진 센터의 절차를 알아보고 출발을 하루 이틀 지연시킬 수 있는 건강 사유를 확인한다."
    ]},
    {num:"11",name:"한유준",t:[
      "아일랜드의 진실을 폭로하는 작은 메모나 안내문을 친구 숙소에 남겨 스스로 의문을 품고 조사하게 만들겠다.",
      "내가 직접 말하면 질투로 보이지만, 익명의 정보나 스스로 발견한 단서는 객관적으로 받아들일 확률이 높다.",
      "친구가 스스로 단서를 쫓아 의심을 시작하게 만들면 내 경고를 믿을 준비가 될 것이다.",
      "익명 메모가 시설 경비대에게 발각되어 숙소 전체 수색이 벌어지지 않도록 어떻게 숨겨 전달할까?",
      "친구가 매일 밤 읽는 책갈피 사이나 세면도구함 깊숙한 곳에 조심스럽게 메모를 끼워둔다."
    ]},
    {num:"12",name:"오아린",t:[
      "친구의 안전이 최우선이므로, 친구가 믿지 않더라도 시설의 보안 시스템을 피해 친구를 데리고 외부로 탈출을 시도하겠다.",
      "안에 남아 있으면 결국 당첨자 수술실로 끌려가므로, 탈출하여 바깥세상을 보여주는 것이 가장 확실하다.",
      "시설 밖의 진짜 공기와 도시를 보면 아일랜드가 거짓이었음을 온몸으로 알게 될 것이다.",
      "시설 외벽의 센서와 감시 카메라를 피해 지상으로 올라갈 수 있는 비상 탈출구가 어디에 있을까?",
      "환기 덕트와 자재 운반용 엘리베이터의 동선을 파악하고 전력 차단 시간을 확인한다."
    ]},
    {num:"13",name:"서준우",t:[
      "진실을 모른 채 기뻐하는 친구를 보면 마음이 찢어지겠지만, 친구가 나를 평생 원망하더라도 끝까지 진실을 말하겠다.",
      "진정한 친구라면 상대방이 듣기 싫어하더라도 생명이 위험할 때는 진실을 외면하지 않아야 한다.",
      "욕을 먹더라도 친구를 살릴 수만 있다면 어떤 오해나 비난도 감수할 가치가 있다.",
      "친구가 끝까지 내 말을 거부하고 경비원에게 나를 고발할 위험은 어떻게 대비해야 할까?",
      "친구에게 말하기 전 나를 보호할 수 있는 최소한의 도주 경로와 은신처를 미리 확보해 둔다."
    ]},
    {num:"14",name:"신수아",t:[
      "진실을 알고 있는 또 다른 관리자나 연구원을 찾아가 도움을 요청하고, 그 관리자가 친구에게 직접 진실을 증언하도록 하겠다.",
      "동료 복제인간의 말보다는 권한을 가진 내부 관계자의 한마디가 친구에게 훨씬 강력한 충격을 주기 때문이다.",
      "어른이자 관리자의 증언 앞에서는 친구도 질투라는 생각을 완전히 버릴 수밖에 없다.",
      "양심의 가책을 느끼고 우리를 도울 수 있는 인간 직원을 어떻게 안전하게 찾아낼 수 있을까?",
      "청소나 심부름을 하며 직원들의 표정과 대화 내용을 주의 깊게 관찰해 협조자를 물색한다."
    ]},
    {num:"15",name:"권예준",t:[
      "당첨된 친구를 축하해 주는 척하면서, 출발 직전 환송실 뒤편의 숨겨진 수술실 통로를 친구에게 직접 보여주겠다.",
      "축하해 주는 척 다가가면 친구의 방어벽이 완전히 풀려 의심 없이 나를 따라올 것이기 때문이다.",
      "친구가 긴장을 풀고 있을 때 현장의 증거를 보여주면 의심과 오해가 한순간에 확신으로 바뀔 것이다.",
      "환송실 뒤편 통로의 전자 도어락을 열 수 있는 임시 마스터키나 카드를 어떻게 구할 수 있을까?",
      "환송 행사 진행 요원이 문을 열고 닫을 때 비밀번호 키패드를 어깨너머로 확인한다."
    ]},
    {num:"16",name:"황채원",t:[
      "친구가 왜 그렇게 아일랜드를 가고 싶어 했는지 그 소망을 공감해 주면서도, 그 행운 뒤에 숨은 잔혹한 대가를 경고하겠다.",
      "친구의 행복해하는 마음을 무조건 깎아내리지 않아야 대화가 단절되지 않고 이어질 수 있기 때문이다.",
      "친구의 꿈을 이해해 주는 태도를 보이면, 친구도 내 경고가 악의가 아닌 순수한 애정임을 알게 될 것이다.",
      "친구가 환상 속 낙원에 너무 집착해서 현실의 위험을 부정하려 한다면 어떤 질문을 던져야 할까?",
      "아일랜드에 먼저 간 사람들이 단 한 번도 사진이나 편지를 보내오지 않은 이유를 친구에게 물어본다."
    ]},
    {num:"17",name:"안건우",t:[
      "친구에게 우리 둘의 어린 시절 기억이 전혀 없다는 사실을 상기시키며, 우리가 진짜 인간이 아닐 수도 있다는 의문을 던지겠다.",
      "내 말만 믿으라는 대신 친구 자신의 기억과 신체에 존재하는 결정적인 의문점을 짚어주는 것이 더 설득력 있다.",
      "자신의 과거가 조작되었다는 의문이 들기 시작하면 아일랜드의 존재도 의심하게 될 것이다.",
      "어릴 적 사진이나 유년기 기억이 모두에게 없다는 사실을 친구가 스스로 깨닫게 만들 대화법은 무엇일까?",
      "서로의 가장 어린 시절 기억을 꺼내어 비교해 보며 모두 똑같은 기억만 주입받았음을 확인한다."
    ]},
    {num:"18",name:"송지아",t:[
      "내가 시설에서 우연히 목격했던 장기 적출 현장의 끔찍한 세부 사항을 숨김없이 털어놓아 친구의 경계심을 깨우겠다.",
      "구체적이고 생생한 목격담은 지어낼 수 없는 현실감이 있어 듣는 사람에게 강한 경각심을 불러일으킨다.",
      "친구도 내 설명의 생생한 묘사를 들으면 단순한 질투나 장난이 아니라는 것을 직감할 것이다.",
      "내 이야기를 들은 친구가 패닉에 빠져 경비원들에게 소리를 지르거나 폭주하면 어떻게 진정시킬까?",
      "친구가 안정을 찾을 수 있도록 단둘만 있을 수 있는 가장 조용하고 안전한 장소로 데려가 이야기한다."
    ]},
    {num:"19",name:"류민재",t:[
      "친구가 믿지 않더라도 강제로라도 친구의 출발을 지연시키고, 그 사이에 진실을 입증할 확실한 증거를 찾아오겠다.",
      "일단 출발해 버리면 되돌릴 수 없으므로, 욕을 먹더라도 시간을 끄는 것이 살릴 수 있는 유일한 기회다.",
      "시간을 벌어두면 친구도 점차 차분해져 내 말의 진위 여부를 따져볼 여유가 생긴다.",
      "친구의 출발 명단 등록을 누락시키거나 바코드를 훼손할 수 있는 방법이 있을까?",
      "출발 대기실의 바코드 스캐너 기기를 일시적으로 고장 내거나 친구의 ID 태그를 훔쳐 숨긴다."
    ]},
    {num:"20",name:"전다은",t:[
      "친구가 가장 믿고 의지하는 다른 친한 친구들과 함께 모여 진지하게 대화의 자리를 마련하겠다.",
      "나 혼자의 말은 질투로 의심받지만, 평소 친구를 아끼는 여러 친구가 함께 걱정해 주면 태도가 달라진다.",
      "주변 사람들의 한결같은 걱정 어린 반응은 친구의 오해를 불식시키는 가장 따뜻한 힘이 된다.",
      "다른 친구들에게 이 진실을 먼저 알릴 때 그들이 공포에 질려 비밀을 누설하지 않도록 하려면 어떻게 해야 할까?",
      "가장 이성적이고 입이 무거운 친구 한두 명을 먼저 설득하여 협력 그룹을 만든다."
    ]},
    {num:"21",name:"홍진우",t:[
      "시설에서 매일 통제받는 식단과 건강 검진이 사실은 장기 보존을 위한 관리였다는 의학적 모순을 설명하겠다.",
      "우리가 매일 먹는 영양제와 엄격한 신체 검사가 낙원을 위한 것이 아니라 상품 관리였다는 논리는 매우 타당하다.",
      "매일 겪는 일상 속 의문들을 하나로 꿰어 설명하면 친구도 논리적으로 반박하지 못할 것이다.",
      "의료 센터에서 매일 측정하는 장기 활성도 데이터 수치를 어떻게 친구에게 보여줄 수 있을까?",
      "정기 검진 시 의사들이 나누는 차트 내용과 용어를 몰래 엿보고 의학 사전을 통해 확인한다."
    ]},
    {num:"22",name:"고은서",t:[
      "친구가 아일랜드로 가는 수송선에 오르기 전, 내 손을 잡고 '네가 살아있기를 바라는 내 마음을 한 번만 믿어달라'고 눈물로 호소하겠다.",
      "논리나 증거보다 때로는 목숨을 건 절박한 눈빛과 눈물이 사람의 마음을 돌리는 가장 큰 힘이 된다.",
      "친구가 내 절박한 눈물을 보면 질투 때문이 아니라 진짜 위기라는 것을 가슴으로 느끼게 된다.",
      "친구가 내 호소에 흔들릴 때 주변 경비원들이 눈치채지 못하도록 어떻게 자연스럽게 대화할까?",
      "작별 인사를 나누는 포옹 시간을 이용해 귓속말로 조용하지만 단호하게 진실을 전한다."
    ]},
    {num:"23",name:"문지후",t:[
      "친구가 떠난다면 나도 몰래 친구의 이동 경로를 끝까지 뒤쫓아가, 수술대에 눕기 직전이라도 구해내겠다.",
      "말로 설득하는 것이 실패하더라도 친구의 생명을 포기할 수는 없기 때문에 끝까지 포기하지 않겠다.",
      "친구는 자신이 속았다는 것을 알게 되는 순간 나에게 구출되면서 진정한 우정을 확인할 것이다.",
      "수술 구역까지 연결되는 폐쇄 회로 카메라 사각지대와 비상 통로를 사전에 파악할 수 있을까?",
      "시설 경비 시스템의 취약 구역을 평소 동료들과 함께 정찰해 탈출 및 잠입 루트를 확보한다."
    ]},
    {num:"24",name:"양하윤",t:[
      "친구가 떠나기 전에 시설 밖 세상의 오염이 거짓이라는 증거(살아있는 나비나 곤충)를 보여주어 시설의 말을 의심하게 하겠다.",
      "지구가 오염되어 아일랜드만 낙원이라는 시설의 핵심 거짓말이 깨지면 아일랜드의 환상도 함께 무너진다.",
      "살아있는 곤충을 보는 순간 친구는 시설의 모든 말이 조작되었음을 즉시 깨닫게 될 것이다.",
      "시설 환기구를 통해 우연히 들어온 벌레나 식물 씨앗을 안전하게 채집해 보관할 방법이 있을까?",
      "통제 구역 근처 환기 덕트 틈새를 조사하여 외부에서 유입된 생명체 흔적을 찾아 보관한다."
    ]},
    {num:"25",name:"손현우",t:[
      "시설 경비원들의 사적인 대화를 엿듣거나 녹음하여, 당첨자가 어디로 가는지 그들의 입으로 직접 말한 음성을 들려주겠다.",
      "시설 관리자들의 잔인한 대화 녹음은 그 어떤 증거보다 가장 강력한 충격을 주기 때문이다.",
      "친구가 관리자들의 육성을 듣는 순간 아일랜드는 천국이 아니라 도살장이라는 사실을 알게 될 것이다.",
      "음성을 녹음할 수 있는 작은 전자기기나 통신 단말기를 시설 내에서 어떻게 구할 수 있을까?",
      "폐기물 처리장이나 수리 센터에 버려진 고장 난 통신 장비를 수리해 녹음 도구로 활용한다."
    ]},
    {num:"26",name:"배소율",t:[
      "친구에게 '네가 진짜 아일랜드에 가더라도 하루만 늦게 간다고 해서 천국이 사라지지 않는다'며 출발을 미루자고 설득하겠다.",
      "천국에 가는 것을 완전히 막는 것이 아니라 하루만 늦추자는 제안은 친구 입장에서도 거절하기 어렵다.",
      "그 하루 동안 함께 진실을 조사하여 친구 스스로 결정을 바꿀 수 있는 기회를 마련한다.",
      "출발 대기 명단에서 이름을 하루 연기했을 때 시설 관리자들이 의심하지 않을 합당한 사유는 무엇일까?",
      "시설 규정집을 몰래 열람하여 당첨자 출발 연기가 허용되는 예외 조항을 찾아본다."
    ]},
    {num:"27",name:"조우진",t:[
      "진실을 밝히는 것이 내 목숨을 위험하게 할지라도, 가장 소중한 친구를 살리기 위해 시설 전체에 경보를 울려서라도 막겠다.",
      "조용한 대화로 친구를 설득할 시간이 없다면 시설 전체를 혼란에 빠뜨려서라도 이송을 무산시켜야 한다.",
      "비상 경보가 울리면 환송 행사는 중단되고, 그 혼란 속에서 친구와 함께 도망칠 기회가 생긴다.",
      "시설 중앙 화재경보기나 비상 전력 차단 레버의 위치와 조작 방법을 알아낼 수 있을까?",
      "비상 대피 안내도를 숙지하고 소방 방재실의 경비가 비는 타이밍을 파악한다."
    ]},
    {num:"28",name:"백예린",t:[
      "아일랜드에 당첨된 다른 구역의 사람들이 한 번도 돌아오지 않고 어떤 연락도 없었던 사실을 친구와 통계적으로 따져보겠다.",
      "매주 수십 명이 낙원으로 가는데 수년간 단 한 번도 영상 통화나 편지가 없었다는 것은 완벽한 논리적 결함이다.",
      "이 명백한 불일치를 친구에게 짚어주면 친구도 질투라는 생각을 버리고 차분히 이성을 되찾게 된다.",
      "과거 당첨자들의 명단과 출발 날짜를 기록한 자료를 모아 친구에게 보여줄 수 있을까?",
      "게시판에 공지되었던 역대 당첨자 명단을 수첩에 정리하여 그들의 실종 패턴을 도표로 정리한다."
    ]},
    {num:"29",name:"허재윤",t:[
      "친구가 믿지 않는다면, 내가 직접 관리자에게 끌려가는 시늉을 하거나 위험에 처한 척을 해서라도 친구의 시선을 돌려 출발을 막겠다.",
      "친구가 나를 진정한 친구로 생각한다면, 내가 위험에 처했을 때 나를 내버려두고 혼자 아일랜드로 떠나지 못할 것이기 때문이다.",
      "우정의 무게를 시험하는 것이지만, 친구의 착한 심성을 이용해 친구의 발을 묶어둘 수 있다.",
      "연기를 하다가 진짜 경비대에게 붙잡혀 처벌받지 않도록 안전한 타이밍을 어떻게 계산할까?",
      "친구와 단둘이 있을 때 상황을 연출하고 친구가 도움을 요청하러 가는 사이에 진실의 증거를 건넨다."
    ]},
    {num:"30",name:"유시아",t:[
      "친구의 의심을 풀기 위해 나 자신도 아일랜드 추첨 자격을 영구 포기하겠다고 시설에 선언하며 나의 순수한 의도를 증명하겠다.",
      "내가 질투 때문에 거짓말을 하는 것이 아니라는 가장 극단적이고 결백한 증거를 보여주기 위함이다.",
      "자신을 위해 모든 희망을 포기하는 내 모습을 보면 친구도 내 말의 무게와 진실성을 인정할 수밖에 없다.",
      "추첨 자격을 포기했을 때 시설에서 나를 불량 개체로 분류해 격리 수용하지는 않을까?",
      "자격 포기 신청서의 절차를 알아보고 친구가 보는 앞에서 공개적으로 서약하는 자리를 만든다."
    ]}
  ];

  const now=new Date().toISOString();

  // 3. Ensure all 30 student accounts exist and get auth_user_id
  for(const st of dummyList){
    const sNum=`301${st.num}`;
    let {data:ex}=await admin.from("student_accounts").select("id,auth_user_id").eq("student_number",sNum).maybeSingle();
    let authId=ex?.auth_user_id;
    if(!authId){
      try {
        const email=`student_${sNum}@school.internal`, password="password123";
        const ca=await admin.auth.admin.createUser({email,password,email_confirm:true}).catch(()=>null);
        authId=ca?.data?.user?.id||null;
        if(ex){
          await admin.from("student_accounts").update({auth_user_id:authId}).eq("id",ex.id);
        } else {
          await admin.from("student_accounts").insert({student_number:sNum,student_name:st.name,auth_user_id:authId});
        }
      } catch(e) {}
    }
    if(!ex && authId){
      const {data:reCheck}=await admin.from("student_accounts").select("id,auth_user_id").eq("student_number",sNum).maybeSingle();
      if(!reCheck) await admin.from("student_accounts").insert({student_number:sNum,student_name:st.name,auth_user_id:authId});
    }

    const tAnswers = st.t;
    const fullContent = tAnswers.map((ans:string,idx:number)=>`${tLabels[idx]}\n${ans}`).join('\n\n');

    // 4. Upsert into think_stage_responses (legacy & analytics table)
    await admin.from("think_stage_responses").upsert({
      lesson_plan_id:les.id,
      student_number:sNum,
      stage_code:"T",
      content:fullContent,
      updated_at:now,
      submitted_at:now
    },{onConflict:"lesson_plan_id,student_number,stage_code"});

    // 5. Upsert into think_records (primary think_workflow table)
    if(authId){
      await admin.from("think_records").upsert({
        class_id:cls.id,
        lesson_id:les.id,
        student_id:authId,
        stage:"T",
        content:fullContent,
        metadata:{tAnswers},
        revision:1,
        final_saved:true,
        submitted_at:now,
        updated_at:now
      },{onConflict:"class_id,lesson_id,student_id,stage"});
    }
  }

  // 6. Ensure T and H stages are accessible in this class lesson
  for(const stageCode of ["T","H"]){
    await admin.from("class_lesson_stage_access").upsert({
      class_id:cls.id,
      lesson_plan_id:les.id,
      stage_code:stageCode,
      access_mode:"writable",
      updated_at:now
    },{onConflict:"class_id,lesson_plan_id,stage_code"});
  }

  return json({success:true, classId:cls.id, lessonId:les.id, count:dummyList.length, lessonTitle:les.title});
  } catch(err: any) {
    return json({error: err.message || String(err)}, 400);
  }
}

if(b.action==="seed_segregation_principle_dummy_data"){
  try {
    const grade=3, classNum=1, subject="과학";
    let {data:cls}=await admin.from("classes").select("id").eq("teacher_id",userId).eq("grade_number",grade).eq("class_number",classNum).maybeSingle();
    if(!cls){
      const {data:newCls,error:ce}=await admin.from("classes").insert({teacher_id:userId,class_code:`class-${grade}-${classNum}-${subject}`,grade_number:grade,class_number:classNum,subject_name:subject}).select().single();
      if(ce)return json({error:ce.message},400);
      cls=newCls;
    }

    const dummyList=[
      {num:"01",name:"강민준",text:"모든 자손이 완전히 똑같은 유전 정보만 가진다면, 치명적인 전염병이 창궐했을 때 집단 전체가 살아남지 못하고 한순간에 멸종할 것 같습니다. 예전에 바나나 품종이 단일 유전자라 병충해 하나에 밭 전체가 파괴되었다는 이야기를 들었는데 비슷한 문제가 생길 것 같습니다."},
      {num:"02",name:"김서연",text:"환경 변화에 대한 적응력이 크게 떨어질 것입니다. 갑자기 지구 온난화나 한파 같은 급격한 기후 변화가 찾아왔을 때, 다양한 유전자를 가진 개체들이 있으면 그중 환경에 견디는 개체가 살아남지만 유전 정보가 모두 같다면 집단 전체가 전멸할 위험이 큽니다."},
      {num:"03",name:"박도윤",text:"유전병이나 치명적인 유전적 결함이 나타났을 때 그것을 극복할 방법이 없다는 것이 큰 문제입니다. 부모의 약점이 자손에게 100% 똑같이 물려져서 유전적 결함이 고착화될 것입니다."},
      {num:"04",name:"이지아",text:"생물 다양성이 사라져 생태계 전체의 균형이 무너질 것 같습니다. 모든 자손의 신체 조건과 면역 체계가 똑같다면 하나의 바이러스나 세균 감염에 획일적으로 취약해질 수밖에 없습니다."},
      {num:"05",name:"정시우",text:"새로운 환경에 적응하여 발전하는 '진화'가 일어날 수 없게 됩니다. 유전적 다양성과 형질 분리가 있어야 환경에 맞춰 우수한 개체가 선택되고 진화하는데, 형질이 고정되면 환경 변화에 대처하지 못합니다."},
      {num:"06",name:"최하은",text:"모든 개체가 먹는 음식, 필요한 영양소, 좋아하는 서식 환경이 완전히 동일하므로 집단 내부에서 먹이와 자원을 차지하기 위한 경쟁이 훨씬 극심해질 것입니다."},
      {num:"07",name:"조하준",text:"면역계 유전자가 모두 동일하면 특정 항원이나 바이러스에 대해 학급 전체 혹은 집단 전체가 한 번에 다 병에 걸려서 전멸할 것 같습니다. 유전적 다양성은 집단의 생존 확률을 높여주는 안전장치 역할을 하기 때문입니다."},
      {num:"08",name:"윤서윤",text:"자손들이 환경 변화에 대처하는 방식이 너무 단순해질 것 같습니다. 열이나 추위에 약한 유전자를 가진 개체 집단이라면 기온이 조금만 변해도 무리를 지어 생존하기 힘들 것입니다."},
      {num:"09",name:"장지호",text:"부모에게 유해한 유전자나 질병 관련 형질이 있을 때, 유전자 분리가 일어나지 않고 그대로 복제되어 자손에게 넘어가므로 집단 전체의 건강 상태가 지속적으로 악화될 수 있습니다."},
      {num:"10",name:"임지유",text:"농작물 단일 재배처럼 해충이나 곰팡이 균 하나가 침투하면 농장 전체가 피해를 입는 것처럼, 자손 집단 전체가 동일한 해충이나 질병에 취약해지는 무방비 상태가 될 것입니다."},
      {num:"11",name:"한유준",text:"생식세포 형성 과정에서 유전자 분리와 조합이 일어나지 않는다면 체세포 분열과 다를 바가 없어집니다. 자손 개체들 사이에 차이점이 전혀 없어서 생물로서의 다양성의 가치가 사라집니다."},
      {num:"12",name:"오아린",text:"환경이 고정되어 있지 않고 끊임없이 변하는데, 동일한 유전자만 가진 집단은 변화된 환경에서 오직 한 가지 반응밖에 할 수 없어 생존율이 극도로 낮아집니다."},
      {num:"13",name:"서준우",text:"특정 약물이나 독성 물질에 노출되었을 때 내성을 가진 개체가 단 하나도 생겨나지 않아서 집단 전체가 한꺼번에 해를 입는 문제가 발생합니다."},
      {num:"14",name:"신수아",text:"개체 간의 차이가 없어서 환경에 잘 적응하는 형질이 선택되는 자연선택 과정이 불가능해지고 결국 지구 환경 변화 속에서 생존 경쟁에 밀려 자연 소멸할 것입니다."},
      {num:"15",name:"권예준",text:"신체 구조나 생리적 기능이 100% 동일하면 섭취하는 영양분과 필요한 환경 조건이 완벽히 똑같아서 생태적 지위가 겹치므로 서로 밀어내는 부작용이 큽니다."},
      {num:"16",name:"황채원",text:"바이러스는 끊임없이 변종을 만드는데, 자손의 유전자가 모두 같다면 변종 바이러스가 들어왔을 때 항체를 만들어 적응할 수 있는 유전적 유연성이 없어져 위험합니다."},
      {num:"17",name:"안건우",text:"부모 세대의 유전적 약점이 개선되지 않고 그대로 자손에게 이어지는 것이 문제입니다. 분리의 원리를 통해 다양한 조합이 생겨나야 더 건강한 자손이 나올 수 있습니다."},
      {num:"18",name:"송지아",text:"다양하지 않은 집단은 외부 충격(천재지변, 기후변화, 전염병)에 매우 취약한 구조를 가집니다. 유전적 다양성은 생물종이 지구상에서 오래 지속될 수 있는 필수 조건입니다."},
      {num:"19",name:"류민재",text:"같은 곰팡이나 균에 노출되었을 때 저항성을 가진 특이 개체가 나오지 않으므로 전체 자손이 동일한 질병 패턴으로 고생하게 됩니다."},
      {num:"20",name:"전다은",text:"자손들이 다 똑같다면 환경 변화가 왔을 때 누군가는 살아남아 종을 번식시켜야 하는데, 그럴 가능성 자체가 제로가 되어 종의 집단 멸종 가능성이 매우 높아집니다."},
      {num:"21",name:"홍진우",text:"유전 정보가 모두 같다면 자손들 간의 신체 능력이나 면역력 차이가 없어 유익한 변이가 나타날 기회가 차단됩니다."},
      {num:"22",name:"고은서",text:"기후가 급격히 차가워지거나 뜨거워질 때 환경에 적응할 수 있는 신체적 특성을 지닌 개체가 발생하지 않아 집단 유지에 치명적입니다."},
      {num:"23",name:"문지후",text:"유전자의 획일화로 인해 특정 자원이나 먹이에 대한 쏠림 현상이 심해져 자원 고갈 속도가 촉진되고 집단 내부 생존율이 떨어집니다."},
      {num:"24",name:"양하윤",text:"부모와 똑같은 생식세포만 만든다면 유전병을 유발하는 열성 유전자가 배제될 기회가 사라지고 계속 전달되는 비극이 생깁니다."},
      {num:"25",name:"손현우",text:"자손들이 환경 변화에 대처하는 유연성이 상실되므로 세대를 거듭할수록 지구 환경의 소소한 변화에도 집단 전체가 큰 타격을 입게 됩니다."},
      {num:"26",name:"배소율",text:"생명체는 유전적 다양성을 통해 온갖 전염병과 기후 변화를 이겨내 왔는데, 똑같은 유전자만 존재하면 집단 생존력이 급격히 낮아집니다."},
      {num:"27",name:"조우진",text:"특정 바이러스 감염 시 항원 저항력을 가진 개체가 존재하지 않아 단 한 번의 감염으로 무리 전체가 사멸하는 위험이 존재합니다."},
      {num:"28",name:"백예린",text:"분리의 원리로 인해 대립유전자가 섞이고 조합되는 이점이 사라지므로 유전적 건강함과 적응력이 현저히 감소합니다."},
      {num:"29",name:"허재윤",text:"동일한 체질과 면역 특성을 가진 자손들만 태어난다면 작은 신체적 결함이나 질병에도 집단 전체가 민감하게 반응하여 살아남기 힘듭니다."},
      {num:"30",name:"유시아",text:"자손 집단의 유전적 다양성 부족은 결국 환경 적응력 상실과 집단 전멸이라는 가장 치명적인 생태학적 문제를 초래할 것입니다."}
    ];

    for(const st of dummyList){
      const sNum=`301${st.num}`;
      const {data:ex}=await admin.from("student_accounts").select("id").eq("student_number",sNum).maybeSingle();
      if(!ex){
        try {
          const email=`student_${sNum}@school.internal`, password="000000";
          const createdAuth=await admin.auth.admin.createUser({email,password,email_confirm:true});
          let authUserId=createdAuth?.data?.user?.id||null;
          await admin.from("student_accounts").insert({student_number:sNum,student_name:st.name,auth_user_id:authUserId});
        } catch(e) {}
      }
    }

    const projTitle="유전자 조작 기술, 축복일까? 재앙일까?";
    const coreQ="만약 부모가 한 가지 형질에 대해 모두 같은 유전 정보를 가진 생식세포만 만들어 모든 자손이 동일한 형질을 나타낸다고 가정해 보자. 다양하지 않은 자손 집단에는 어떤 문제가 생길 수 있을까?";
    
    let {data:matchingLessons}=await admin.from("lesson_plans").select("id,project_version_id").or("core_question.ilike.%만약 부모가 한 가지 형질에 대해 모두 같은 유전 정보%,title.ilike.%분리의 원리%");
    if(!matchingLessons || matchingLessons.length===0){
      let {data:proj}=await admin.from("projects").select("id").eq("author_id",userId).eq("title",projTitle).maybeSingle();
      if(!proj){
        const {data:np}=await admin.from("projects").insert({author_id:userId,title:projTitle,subject:subject,grade_number:grade,description:"유전자 조작 기술과 유전 특성을 탐구하는 수업 프로젝트"}).select().single();
        proj=np;
      }
      let {data:ver}=await admin.from("project_versions").select("id").eq("project_id",proj.id).order("version_number",{ascending:false}).limit(1).maybeSingle();
      if(!ver){
        const {data:nv}=await admin.from("project_versions").insert({project_id:proj.id,version_number:1,created_by:userId}).select().single();
        ver=nv;
      }
      const {data:nl}=await admin.from("lesson_plans").insert({project_version_id:ver.id,lesson_order:3,title:"3. 분리의 원리",core_question:coreQ,student_guidance:"자손 집단의 유전적 다양성이 중요한 이유를 생각해보세요.",think_stages:["T","H","I","N","K"],ai_question_limit:20}).select().single();
      matchingLessons=[nl];
    }

    const {data:allClasses}=await admin.from("classes").select("id").eq("grade_number",grade).eq("class_number",classNum);
    const targetClassIds=(allClasses||[]).map(c=>c.id);

    const now=new Date().toISOString();
    let totalUpserts=0;

    for(const les of matchingLessons){
      for(const cId of targetClassIds){
        await admin.from("classes").update({active_lesson_plan_id:les.id}).eq("id",cId);
        await admin.from("class_lesson_stage_access").upsert({class_id:cId,lesson_plan_id:les.id,stage_code:"T",access_mode:"writable",updated_at:now},{onConflict:"class_id,lesson_plan_id,stage_code"});
      }

      for(const st of dummyList){
        const sNum=`301${st.num}`;
        await admin.from("think_stage_responses").upsert({
          lesson_plan_id:les.id,
          student_number:sNum,
          stage_code:"T",
          content:st.text,
          updated_at:now,
          submitted_at:now
        },{onConflict:"lesson_plan_id,student_number,stage_code"});
        totalUpserts++;
      }
    }

    return json({success:true, matchingLessonsCount:matchingLessons.length, count:dummyList.length, totalUpserts});
  } catch(err: any) {
    return json({error: err.message || String(err)}, 400);
  }
}
return json({error:"지원하지 않는 작업입니다."},400);});
