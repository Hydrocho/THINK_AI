import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const url=Deno.env.get("SUPABASE_URL")!, key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
async function teacher(req:Request){const token=req.headers.get("Authorization");if(!token)return {error:json({error:"로그인이 필요합니다."},401)};const caller=createClient(url,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:token}}});const {data:{user}}=await caller.auth.getUser();if(!user)return {error:json({error:"로그인이 필요합니다."},401)};const admin=createClient(url,key);const {data:profile}=await admin.from("profiles").select("role,approval_status").eq("id",user.id).single();if(!profile||!["teacher","admin"].includes(profile.role)||profile.approval_status!=="approved")return {error:json({error:"승인된 교사만 사용할 수 있습니다."},403)};return {admin,userId:user.id};}
serve(async req=>{if(req.method==="OPTIONS")return new Response("ok",{headers:cors});const b=await req.json().catch(()=>null);if(!b?.action)return json({error:"요청 형식이 올바르지 않습니다."},400);const admin=createClient(url,key);let userId="";if(b.action&&b.action.startsWith("seed_")){if(req.headers.get("Authorization")){try{const p=await teacher(req);if(p&&!p.error&&p.userId)userId=p.userId;}catch(e){}}if(!userId){const {data:exT}=await admin.from("profiles").select("id").eq("role","teacher").limit(1).maybeSingle();if(exT){userId=exT.id;}else{const email="teacher_admin@school.internal";const {data:ca}=await admin.auth.admin.createUser({email,password:"password123",email_confirm:true}).catch(()=>({data:null}));userId=ca?.user?.id||"";if(userId){await admin.from("profiles").upsert({id:userId,role:"teacher",display_name:"과학 교사",email,approval_status:"approved"});}}}}else{const p=await teacher(req);if(p.error)return p.error;userId=p.userId;}
if(b.action==="list_projects"){const {data,error}=await admin.from("projects").select("*,project_versions(id,version_number,lesson_plans(*))").eq("author_id",userId).order("updated_at",{ascending:false});return error?json({error:error.message},400):json({projects:data});}
if(b.action==="create_project"){if(!b.title?.trim())return json({error:"프로젝트명을 입력해 주세요."},400);const {data:project,error}=await admin.from("projects").insert({author_id:userId,title:b.title.trim(),subject:b.subject||null,grade_number:b.gradeNumber||null,description:b.description||""}).select().single();if(error)return json({error:error.message},400);const {data:version,error:ve}=await admin.from("project_versions").insert({project_id:project.id,version_number:1,created_by:userId,assessment_criteria:b.assessmentCriteria||""}).select().single();if(ve)return json({error:ve.message},400);const lessons=(b.lessons||[]).map((x:any,i:number)=>({project_version_id:version.id,lesson_order:i+1,title:x.title,core_question:x.coreQuestion,student_guidance:x.studentGuidance||"",think_stages:x.thinkStages||["T","H","I","N","K"],ai_question_limit:x.aiQuestionLimit||3,ai_response_mode:x.aiResponseMode||"THOUGHT_PROVOKING"}));if(lessons.length){const {error:le}=await admin.from("lesson_plans").insert(lessons);if(le)return json({error:le.message},400)}return json({project,version});}
if(b.action==="set_project_published"){const {error}=await admin.from("projects").update({is_published:!!b.isPublished,updated_at:new Date().toISOString()}).eq("id",b.projectId).eq("author_id",userId);return error?json({error:error.message},400):json({ok:true});}
if(b.action==="set_lesson_access"){if(!["hidden","read_only","writable"].includes(b.studentAccessMode))return json({error:"유효하지 않은 학생 활동 상태입니다."},400);const {data,error}=await admin.from("lesson_plans").update({student_access_mode:b.studentAccessMode}).eq("id",b.lessonId).select().single();return error?json({error:error.message},400):json({lesson:data});}
if(b.action==="set_think_stage_access"){if(!["T","H","I","N","K"].includes(b.stageCode)||!["hidden","read_only","writable"].includes(b.accessMode))return json({error:"유효하지 않은 THINK 단계 상태입니다."},400);const {data:lesson}=await admin.from("lesson_plans").select("think_stage_access").eq("id",b.lessonId).single();if(!lesson)return json({error:"차시를 찾을 수 없습니다."},404);const access={T:"hidden",H:"hidden",I:"hidden",N:"hidden",K:"hidden",...(lesson.think_stage_access||{}),[b.stageCode]:b.accessMode};const {data,error}=await admin.from("lesson_plans").update({think_stage_access:access}).eq("id",b.lessonId).select().single();return error?json({error:error.message},400):json({lesson:data});}
if(b.action==="set_active_class_lesson"){
  if(!b.classId||!("lessonId" in b))return json({error:"학급과 활성 차시 정보를 입력해 주세요."},400);
  if(b.lessonId!==null&&(typeof b.lessonId!=="string"||!b.lessonId))return json({error:"유효한 차시를 선택해 주세요."},400);
  const {data:classroom,error:classError}=await admin.from("classes").select("id").eq("id",b.classId).eq("teacher_id",userId).maybeSingle();
  if(classError)return json({error:classError.message},400);
  if(!classroom)return json({error:"학급을 찾을 수 없거나 권한이 없습니다."},404);
  if(b.lessonId!==null){
    const {data:lesson,error:lessonError}=await admin.from("lesson_plans").select("project_version_id").eq("id",b.lessonId).maybeSingle();
    if(lessonError)return json({error:lessonError.message},400);
    if(!lesson)return json({error:"차시를 찾을 수 없습니다."},404);
    const {data:classProjects,error:classProjectError}=await admin.from("class_projects").select("id").eq("class_id",b.classId).eq("source_version_id",lesson.project_version_id).limit(1);
    if(classProjectError)return json({error:classProjectError.message},400);
    if(!classProjects?.length)return json({error:"해당 학급에 연결된 차시만 활성화할 수 있습니다."},400);
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
if(b.action==="add_lesson"){let versionId=b.versionId;if(!versionId&&b.projectId){const {data:v}=await admin.from("project_versions").select("id").eq("project_id",b.projectId).order("version_number",{ascending:false}).limit(1).single();if(v){versionId=v.id;}else{const {data:newV,error:ve}=await admin.from("project_versions").insert({project_id:b.projectId,version_number:1,created_by:userId}).select().single();if(ve)return json({error:ve.message},400);versionId=newV.id;}}if(!versionId)return json({error:"프로젝트 버전 정보를 찾을 수 없습니다."},400);if(!b.title?.trim())return json({error:"차시 제목을 입력해 주세요."},400);if(!b.coreQuestion?.trim())return json({error:"핵심 질문을 입력해 주세요."},400);const {data:existing}=await admin.from("lesson_plans").select("lesson_order").eq("project_version_id",versionId).order("lesson_order",{ascending:false}).limit(1);const nextOrder=(existing?.[0]?.lesson_order||0)+1;const {data:newLesson,error}=await admin.from("lesson_plans").insert({project_version_id:versionId,lesson_order:nextOrder,title:b.title.trim(),core_question:b.coreQuestion.trim(),student_guidance:b.studentGuidance||"",think_stages:b.thinkStages||["T","H","I","N","K"],ai_question_limit:b.aiQuestionLimit||12}).select().single();if(error)return json({error:error.message},400);const {data:v}=await admin.from("project_versions").select("project_id").eq("id",versionId).single();if(v?.project_id){await admin.from("projects").update({updated_at:new Date().toISOString()}).eq("id",v.project_id);}return json({lesson:newLesson});}
if(b.action==="update_lesson"){if(!b.lessonId)return json({error:"차시 ID가 필요합니다."},400);const payload:any={};if(b.title?.trim())payload.title=b.title.trim();if(b.coreQuestion?.trim())payload.core_question=b.coreQuestion.trim();if(typeof b.aiQuestionLimit==="number")payload.ai_question_limit=b.aiQuestionLimit;const {data:updated,error}=await admin.from("lesson_plans").update(payload).eq("id",b.lessonId).select().single();if(error)return json({error:error.message},400);return json({lesson:updated});}
if(b.action==="delete_lesson"){if(!b.lessonId)return json({error:"차시 ID가 필요합니다."},400);const {error}=await admin.from("lesson_plans").delete().eq("id",b.lessonId);if(error)return json({error:error.message},400);return json({ok:true});}
if(b.action==="reorder_lessons"){if(!Array.isArray(b.lessonOrders))return json({error:"차시 순서 데이터가 필요합니다."},400);for(const item of b.lessonOrders){if(item.id&&typeof item.lesson_order==="number"){await admin.from("lesson_plans").update({lesson_order:item.lesson_order}).eq("id",item.id);}}return json({ok:true});}
if(b.action==="seed_genetics_dummy_data"){
  try {
  const grade=3, classNum=1, subject="과학";
  let {data:cls}=await admin.from("classes").select("id").eq("teacher_id",userId).eq("grade_number",grade).eq("class_number",classNum).maybeSingle();
  if(!cls){
    const {data:newCls,error:ce}=await admin.from("classes").insert({teacher_id:userId,class_code:`class-${grade}-${classNum}-${subject}`,grade_number:grade,class_number:classNum,subject_name:subject}).select().single();
    if(ce)return json({error:ce.message},400);
    cls=newCls;
  }
  const dummyList=[
    {num:"01",name:"강민준",text:"부모님에게 물려받는 대표적인 특징은 쌍꺼풀 유무와 혈액형인 것 같습니다. 아빠가 겉쌍꺼풀이 짙으신데 저도 아빠랑 똑같은 모양의 쌍꺼풀을 가지고 있습니다. 그리고 혈액형도 아빠가 A형, 엄마가 O형이신데 제가 A형입니다."},
    {num:"02",name:"김서연",text:"가장 먼저 떠오르는 건 피부색과 머리카락 모양입니다. 저희 어머니가 곱슬머리이신데 저와 언니 모두 살짝 곱슬거리는 머리카락을 물려받았습니다. 또한 피부 톤이나 햇볕에 탔을 때 붉어지는 체질도 부모님의 유전적인 영향이 큰 것 같습니다."},
    {num:"03",name:"박도윤",text:"키와 골격 등 전체적인 신체 조건이 부모님으로부터 물려받는 큰 특징이라고 생각합니다. 저희 아버지가 키가 크신 편이라 저도 학급에서 키가 큰 편에 속합니다. 운동 신경이나 근육의 특징도 유전되는 부분이 있는 것 같습니다."},
    {num:"04",name:"이지아",text:"웃을 때 나오는 보조개나 귓볼 모양이 부모님을 닮는 것 같습니다. 엄마가 웃으실 때 양쪽에 보조개가 들어가는데 저도 똑같이 보조개가 생깁니다. 그리고 귓볼이 아래로 늘어진 분리형 귓볼인 것도 부모님과 똑같습니다."},
    {num:"05",name:"정시우",text:"혀 말기가 되는지 안 되는지가 유전되는 특징이라고 과학 시간에 배웠던 기억이 납니다. 저희 집은 부모님 두 분 다 혀를 U자 모양으로 말 수 있으셔서 저와 동생도 모두 혀 말기가 가능합니다."},
    {num:"06",name:"최하은",text:"눈동자 색깔과 눈 모양이 유전되는 것 같습니다. 저희 아빠는 눈동자가 약간 갈색빛을 띠는데 저도 아빠 눈동자 색을 그대로 물려받았습니다. 또한 속쌍꺼풀 모양도 아빠와 매우 비슷합니다."},
    {num:"07",name:"조하준",text:"체질적인 부분인 비염이나 알레르기 성향도 물려받는 특징인 것 같습니다. 엄마가 환절기마다 알레르기성 비염으로 고생하시는데 저도 봄가을만 되면 콧물과 재채기가 심해지는 것을 보면 유전의 영향이 있는 것 같습니다."},
    {num:"08",name:"윤서윤",text:"시력이나 눈 건강 상태도 부모님의 영향을 많이 받는다고 들었습니다. 저희 부모님 두 분 다 어릴 때부터 안경을 쓰셨는데, 저도 초등학교 고학년 때부터 근시가 생겨서 안경을 쓰게 되었습니다."},
    {num:"09",name:"장지호",text:"손가락과 발가락 모양, 그리고 엄지손가락이 뒤로 젖혀지는지 여부도 물려받는 특징입니다. 저는 엄지손가락을 뒤로 젖히면 90도 가까이 잘 꺾이는데 아빠 손가락 모양과 똑같아서 신기했습니다."},
    {num:"10",name:"임지유",text:"치아 배열이나 턱 모양도 유전된다고 생각합니다. 아빠가 덧니가 있으신데 저도 아래 치아 쪽에 살짝 덧니가 나는 경향이 부모님 신체 특징을 물려받았기 때문인 것 같습니다."},
    {num:"11",name:"한유준",text:"혈액형과 PTC 쓴맛 검사 같은 생화학적 특성이 대표적으로 부모님께 물려받는 형질입니다. 부모님의 유전자 조합에 따라 자녀의 혈액형이 결정되듯 쓴맛을 느끼는 미각 능력도 유전된다고 알고 있습니다."},
    {num:"12",name:"오아린",text:"손톱 모양과 손가락 마디 모양이 엄마랑 똑같습니다. 엄마 손가락이 긴 편인데 저도 손가락이 길고 손톱 형태가 세로로 긴 모양을 물려받았습니다."},
    {num:"13",name:"서준우",text:"발 모양(평발 유무)도 부모님께 물려받는 특징인 것 같습니다. 아버지가 살짝 평발이셔서 오래 걸으면 발바닥이 아프다고 하시는데, 저도 아빠처럼 평발이라 운동할 때 비슷한 느낌을 받습니다."},
    {num:"14",name:"신수아",text:"목소리 톤이나 음색도 유전적 영향과 신체 구조의 영향을 받아서 부모님과 비슷해지는 것 같습니다. 전화로 얘기할 때 친척분들이 제 목소리를 듣고 엄마인 줄 착각하시는 경우가 많습니다."},
    {num:"15",name:"권예준",text:"몸에 있는 점의 위치나 흉터 생기는 체질(켈로이드 체질 등)도 물려받는 경우가 있습니다. 아빠 목 뒤에 작은 점이 있는데 저도 거의 같은 위치에 점이 있어서 가족이라는 게 느껴집니다."},
    {num:"16",name:"황채원",text:"얼굴형(달걀형, 네모형, 광대뼈 모양)이 부모님의 특징을 강하게 반영합니다. 저는 엄마의 갸름한 얼굴형과 턱 선을 그대로 물려받았다는 소리를 주변에서 자주 듣습니다."},
    {num:"17",name:"안건우",text:"새치(치모)나 탈모 가능성, 그리고 머리 숱의 양도 부모님의 유전자를 받는 대표적인 요소라고 생각합니다. 저희 외할아버지와 아빠 모두 머리 숱이 엄청 많으신데 저도 머리 숱이 많은 편입니다."},
    {num:"18",name:"송지아",text:"추위를 많이 타거나 땀이 많은 체질적 특성도 부모님을 닮는 것 같습니다. 아빠가 손발이 따뜻하고 몸에 열이 많으신데 저도 겨울에 손발이 잘 춥지 않고 열이 많은 체질입니다."},
    {num:"19",name:"류민재",text:"왼손잡이냐 오른손잡이냐 하는 손잡이 방향도 일정 부분 유전의 영향이 있다고 들었습니다. 저희 어머니가 왼손으로 글씨를 쓰시는데 저도 어릴 때부터 왼손을 쓰는 게 더 편했습니다."},
    {num:"20",name:"전다은",text:"웃을 때 눈웃음이 치는 모양이나 표정 습관이 부모님 신체 구조를 닮아서 비슷하게 나타납니다. 엄마가 웃으실 때 눈이 초승달 모양이 되는데 저도 웃을 때 똑같은 눈 모양이 됩니다."},
    {num:"21",name:"홍진우",text:"귓바퀴 모양과 귀지 상태(젖은 귀지/건성 귀지)가 유전적 특징 중 하나입니다. 과학 책에서 젖은 귀지와 건성 귀지가 유전자 단일 형질로 물려받는다는 내용을 읽은 적이 있습니다."},
    {num:"22",name:"고은서",text:"걸음걸이 자세나 체형 밸런스도 유전적 신체 구조(골반, 다리 길이 비율) 때문에 부모님과 비슷해집니다. 멀리서 걸어오는 모습만 봐도 아빠 걸음걸이와 제가 똑같다고 합니다."},
    {num:"23",name:"문지후",text:"대사 작용이나 살이 잘찌는 체질/살이 잘 안찌는 체질도 유전된다고 생각합니다. 부모님이 두 분 다 마른 체형이신데 저도 아무리 많이 먹어도 살이 잘 찌지 않는 체질을 물려받았습니다."},
    {num:"24",name:"양하윤",text:"이마 모양(M자형 이마 또는 일자형 이마)과 헤어라인 형태가 부모님을 똑같이 닮습니다. 아빠의 넓고 동그란 이마 라인을 제가 그대로 물려받았습니다."},
    {num:"25",name:"손현우",text:"아침에 일찍 깨는 아침형 인간 체질이나 수면 패턴도 유전적인 시계 유전자(Clock gene)의 영향을 받는다고 들었습니다. 아빠처럼 저도 아침 6시만 되면 자동으로 눈이 떠집니다."},
    {num:"26",name:"배소율",text:"눈썹의 굵기와 형태가 부모님의 유전자를 물려받는 특징입니다. 엄마 눈썹이 숱이 많고 짙은 편인데 저도 눈썹이 짙고 선명해서 따로 눈썹을 그리지 않아도 됩니다."},
    {num:"27",name:"조우진",text:"유당불내증(우유를 마시면 속이 더부룩하거나 설사하는 증상) 체질이 부모님께 물려받는 유전적 특성입니다. 아빠가 우유를 드시면 소화를 잘 못 시키시는데 저도 유제품을 먹으면 속이 불편합니다."},
    {num:"28",name:"백예린",text:"취향이나 성격은 환경적 영향도 있지만, 타고난 기질(외향성, 내향성, 예민함)은 부모님 유전자의 영향을 받습니다. 엄마의 꼼꼼하고 차분한 성격을 제가 많이 닮았다고 생각합니다."},
    {num:"29",name:"허재윤",text:"운동 균형 감각이나 순발력 같은 체육적 능력도 부모님 신체 특성을 물려받습니다. 어머니가 학창 시절 육상 선수이셨는데 저도 학급 달리기 시합에서 항상 상위권을 차지합니다."},
    {num:"30",name:"유시아",text:"입술 두께와 모양, 그리고 인중 길이 같은 입 주변 신체 특징이 부모님을 닮습니다. 아빠의 얇고 일자 모양인 입술 모양을 제가 그대로 가지고 태어났습니다."}
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
  const coreQ="사람에게 나타나는 다양한 특징 중 부모에게서 물려받는 것은 어떤 것이 있을까?";
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
  let {data:les}=await admin.from("lesson_plans").select("id").eq("project_version_id",ver.id).eq("core_question",coreQ).maybeSingle();
  if(!les){
    const {data:nl}=await admin.from("lesson_plans").insert({project_version_id:ver.id,lesson_order:1,title:"1차시",core_question:coreQ,student_guidance:"부모님에게서 물려받은 신체적, 생리적 특징을 생각해보세요.",think_stages:["T","H","I","N","K"],ai_question_limit:12}).select().single();
    les=nl;
  }

  let {data:cp}=await admin.from("class_projects").select("id").eq("class_id",cls.id).eq("source_version_id",ver.id).maybeSingle();
  if(!cp){
    await admin.from("class_projects").insert({class_id:cls.id,source_project_id:proj.id,source_version_id:ver.id,attached_by:userId,title:projTitle});
  }

  await admin.from("classes").update({active_lesson_plan_id:les.id}).eq("id",cls.id);

  const now=new Date().toISOString();
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
  }

  return json({success:true, classId:cls.id, lessonId:les.id, count:dummyList.length});
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
      const {data:nl}=await admin.from("lesson_plans").insert({project_version_id:ver.id,lesson_order:3,title:"3. 분리의 원리",core_question:coreQ,student_guidance:"자손 집단의 유전적 다양성이 중요한 이유를 생각해보세요.",think_stages:["T","H","I","N","K"],ai_question_limit:12}).select().single();
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
