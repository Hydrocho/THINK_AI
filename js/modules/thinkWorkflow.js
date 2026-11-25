/* Persisted THINK workflow. All mutations are scoped to an immutable lesson
   context; a navigation cannot redirect an in-flight save to another lesson. */
(function () {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stages = ['T','H','I','N','K'];
  const names = {T:'나의 처음 생각',H:'친구와 생각 나누기',I:'인공지능과 생각 넓히기',N:'비판적으로 따져보기',K:'나의 최종 생각'};
  const exampleTopic='수업 중 휴대전화 사용을 허용해야 할까?';
  const tQuestions = [
    {title:'① 나의 생각',question:'이 문제에 대해 지금 어떻게 생각하나요?',example:'수업에 필요한 활동을 할 때는 휴대전화 사용을 허용하면 좋겠어요.'},
    {title:'② 생각한 이유',question:'왜 그렇게 생각하나요? 읽거나 겪은 일이 있다면 함께 써도 좋아요.',example:'수업에서 모르는 단어를 휴대전화로 찾아보고, 내용을 이해하는 데 도움을 받은 적이 있어요.'},
    {title:'③ 이유 설명하기',question:'방금 쓴 내용이 내 생각을 어떻게 뒷받침하나요?',example:'모르는 내용을 바로 찾아볼 수 있으면 수업을 이해하는 데 도움이 되므로, 필요한 활동에서는 휴대전화를 사용할 수 있으면 좋겠어요.'},
    {title:'④ 더 궁금한 점',question:'내 생각에서 다시 확인해 보고 싶은 부분은 무엇인가요? 질문으로 써도 좋아요.',example:'휴대전화가 공부에 도움이 되기도 하지만, 오히려 집중을 방해하지는 않을까요?'},
    {title:'⑤ 알아볼 방법',question:'그것을 알아내려면 무엇을 해 보면 좋을까요?',example:'친구들에게 수업 중 휴대전화가 도움이 됐던 경험과 집중을 방해했던 경험을 물어보고 비교해 보면 좋겠어요.'}
  ];
  // indices are persisted in student records and local drafts; slot 2 is historical.
  const activeTSlots = [0, 1, 3, 4];
  const activeTTitles = {3:'③ 더 궁금한 점',4:'④ 알아볼 방법'};
  const activeTTitle = i => activeTTitles[i] || tQuestions[i].title;
  const recordTTitle = (answers,i) => answers[2]?.trim() ? tQuestions[i].title : activeTTitle(i);
  const tAnswers = row => tQuestions.map((_,i)=>String(Array.isArray(row.metadata.tAnswers)?row.metadata.tAnswers[i]||'':i===0?row.content:''));
  function setTAnswers(ctx,answers) {
    const row=record(ctx,'T');
    row.metadata={...row.metadata,tAnswers:answers};
    // Keep plain legacy writing intact; structured writing remains readable in
    // peer snapshots, teacher summaries, and the K reference without API changes.
    row.content=answers.slice(1).some(value=>value.trim())
      ? answers.map((value,i)=>value.trim()?`${recordTTitle(answers,i)}\n${value}`:'').filter(Boolean).join('\n\n')
      : answers[0];
  }
  function referenceFields(fields) {
    return fields.filter(([,value])=>value).map(([label,value])=>
      `<p><strong>${escape(label)}</strong></p><p style="white-space:pre-wrap">${escape(value)}</p>`).join('');
  }
  function reviewReference(review={}) {
    const fields=referenceFields([['검색하여 확인한 내용',review.evidence],['확인한 뒤 내 생각',review.judgment]]);
    const link=review.sourceUrl;
    return fields+(link && isWebAddress(link)?`<p><a href="${escape(link)}" target="_blank" rel="noopener noreferrer">자료 출처 열기</a></p>`:'');
  }
  function finalReferences(ctx) {
    const available=(ctx.lesson.thinkStages||stages).filter(s=>s!=='K' && names[s] && ctx.access[s] && ctx.access[s]!=='hidden');
    if(!available.length)return '';
    const panels=available.map((s,i)=>{
      const row=record(ctx,s);
      let contents='';
      if(s==='T') {
        const answers=tAnswers(row);
        contents=referenceFields(answers.map((value,n)=>[recordTTitle(answers,n),value]));
      }
      if(s==='H') {
        const feedback=row.metadata.feedback||{};
        const priority=p=>Number(!!feedback[p.id]?.recommended || selectedHearts(feedback[p.id]).includes('newView'));
        contents=ctx.peers.map((peer,n)=>({peer,n})).sort((a,b)=>priority(b.peer)-priority(a.peer))
          .map(({peer,n})=>`<details><summary>친구 글 ${n+1}${feedback[peer.id]?.recommended?' ☆':''}</summary>${peerAnswers(peer.text)}</details>`).join('');
      }
      if(s==='I') {
        const [,learned,connection]=reflectionAnswers(row);
        contents=referenceFields([['새로 알게 된 점',learned],['내 생각에 연결하기',connection]]);
      }
      if(s==='N') contents=reviewReference(row.metadata.review);
      contents=contents||'<p>아직 참고할 글이 없습니다.</p>';
      if(s==='N') {
        const recommended=row.submitted_at && ctx.peerReviewEnabled!==false
          ? '<details class="think-recommended-reviews" ontoggle="ThinkWorkflow.showRecommendedReviews(this)"><summary><span aria-hidden="true">☆ </span>내가 추천한 친구의 검토</summary><div role="status"></div></details>'
          : '';
        return `<div data-k-reference="N" ${i?'hidden':''}><section class="think-writing-reference think-own-review"><h4>나의 검토</h4>${contents}</section>${recommended}</div>`;
      }
      return `<div class="think-writing-reference" data-k-reference="${s}" ${i?'hidden':''}>${contents}</div>`;
    });
    return `<details class="think-t-example"><summary>이전 활동 돌아보기</summary>
      <div class="think-reference-picker" role="group" aria-label="참고할 활동">${available.map((s,i)=>
        `<button type="button" data-k-choice="${s}" aria-pressed="${i===0}" onclick="ThinkWorkflow.showKReference(this.dataset.kChoice)">${s} · ${names[s]}</button>`).join('')}</div>${panels.join('')}</details>`;
  }
  function isWebAddress(value) {
    return /^https?:\/\/[^\s/]/i.test(value) && !/\s/.test(value) && URL.canParse(value);
  }
  function reviewDraft(ctx) {
    const row=record(ctx,'N');
    const saved=row.metadata.review;
    if(saved?.source.key==='reflectionPair')return saved;
    const [,learned,connection]=reflectionAnswers(record(ctx,'I'));
    const source={key:'reflectionPair',label:'I · 대화 후 내 생각',learned,connection};
    const target=[learned.trim() && '새로 알게 된 점\n'+learned,connection.trim() && '내 생각에 연결하기\n'+connection].filter(Boolean).join('\n\n');
    if(!target && saved?.source.key==='own')return saved;
    const draft=saved ? {...saved,previousTarget:{source:saved.source,text:saved.target}} : {method:'fact',evidence:'',judgment:''};
    return {...draft,source:target?source:{key:'own',label:'직접 작성한 생각',text:''},target};
  }
  function storeReview(ctx,draft) {
    const row=record(ctx,'N');
    if(!row.metadata.review && row.content)row.metadata.previousReview=row.content;
    row.metadata.review=draft;
    row.content=[`확인할 내용 (${draft.source.label})\n${draft.target}`,`확인한 내용\n${draft.evidence}${draft.sourceUrl?.trim() ? '\n링크 주소: '+draft.sourceUrl.trim() : ''}`,`확인한 뒤 내 생각\n${draft.judgment}`].join('\n\n');
    ctx.dirty.N=true;cache(ctx,'N');
  }
  function reviewForm(ctx,row,writable) {
    const draft=reviewDraft(ctx),disabled=writable?'':'disabled';
    const legacy=row.metadata.previousReview || (!row.metadata.review && row.content);
    const oldPeer=ctx.peers.find(p=>p.id===row.metadata.selectedPeerOpinion);
    let html=legacy?`<details class="think-t-example" ${writable?'':'open'}><summary>이전에 작성한 친구 글 검토</summary><p style="white-space:pre-wrap">${escape([oldPeer?.text,legacy].filter(Boolean).join('\n\n'))}</p></details>`:'';
    if(!writable && !row.metadata.review)return html||'<p>아직 작성한 검토 기록이 없습니다.</p>';
    const [,learned,connection]=reflectionAnswers(record(ctx,'I'));
    const pair=draft.source.key==='reflectionPair'?draft.source:{learned,connection};
    if(pair.learned?.trim() || pair.connection?.trim()) {
      html+=`<section class="form-group think-activity-card" data-stage="N"><h3 class="form-label">① AI와 대화 후 내 생각 다시 보기</h3>
        <dl class="think-writing-reference"><dt><strong>새로 알게 된 점</strong></dt><dd style="margin:4px 0 12px;white-space:pre-wrap">${escape(pair.learned || '아직 작성한 내용이 없어요.')}</dd>
        <dt><strong>내 생각에 연결하기</strong></dt><dd style="margin:4px 0 0;white-space:pre-wrap">${escape(pair.connection || '아직 작성한 내용이 없어요.')}</dd></dl></section>`;
    }
    if(draft.source.key!=='reflectionPair') {
      html+=`<div class="form-group think-activity-card" data-stage="N"><label class="form-label" for="reviewTarget">① 다시 살펴보고 싶은 내 생각</label>
        <textarea id="reviewTarget" data-review="target" class="form-textarea" rows="2" ${disabled} oninput="ThinkWorkflow.reviewInput()">${escape(draft.target)}</textarea></div>`;
    }
    html+=`<div class="form-group think-activity-card" data-stage="N"><h3 class="form-label">② 다른 자료와 비교해 보니 어땠나요?</h3>
      <p id="reviewPrompt" class="think-writing-hint">AI와 대화 후 "새로 알게 된 점"에 쓴 내용을 직접 자료를 찾아 확인해 보세요. 그리고 확인한 내용을 작성해주세요.</p>
      <details class="think-t-example"><summary>자료는 어디에서 찾을까요?</summary>
        <p><strong>정부·공공기관</strong> — 궁금한 내용과 관련 기관 이름을 함께 입력해 보세요. 예를 들어 ‘수업 중 휴대전화 사용 교육부’처럼 검색한 뒤, 해당 기관의 공식 누리집에서 자료를 열어 보세요.</p>
        <p><strong>대학·연구기관</strong> — 궁금한 내용 뒤에 ‘대학 연구’나 ‘연구소’를 붙여 검색해 보세요. 검색 결과에서 대학이나 연구소가 직접 소개한 연구 내용을 읽어 보세요.</p>
        <p><strong>뉴스 기사</strong> — 포털의 ‘뉴스’ 탭이나 언론사 누리집에서 핵심 낱말을 검색해 보세요. 과학 정보를 찾을 때는 어느 기관의 연구나 조사를 소개하는지 밝혀 둔 기사를 골라 보세요.</p>
      </details>`;
    if(ctx.lesson.reviewResource) {
      const material=ctx.lesson.reviewResource.split(/(https?:\/\/[^\s<>"']+)/g).map((part,i)=>
        i%2 ? `<a href="${escape(part)}" target="_blank" rel="noopener noreferrer">${escape(part)}</a>` : escape(part)).join('');
      html+=`<details class="think-t-example"><summary>확인 자료 보기</summary><p style="white-space:pre-wrap">${material}</p></details>`;
    }
    html+=`<label class="form-label" for="reviewEvidence">검색하여 확인한 내용</label>
      <textarea id="reviewEvidence" aria-describedby="reviewPrompt" data-review="evidence" class="form-textarea" rows="3" ${disabled} oninput="ThinkWorkflow.reviewInput()">${escape(draft.evidence)}</textarea>
      <label class="form-label" for="reviewSourceUrl">자료 출처 링크 주소</label>
      <input id="reviewSourceUrl" type="url" placeholder="확인한 웹페이지 주소를 붙여넣으세요" onpaste="ThinkWorkflow.pasteSourceUrl(event)" data-review="sourceUrl" class="form-input" value="${escape(draft.sourceUrl || '')}" ${disabled} oninput="ThinkWorkflow.reviewInput()"></div>
      <div class="form-group think-activity-card" data-stage="N"><h3 class="form-label"><label for="reviewJudgment">③ 확인한 뒤에도 내 생각은 같은가요?</label></h3>
      <p id="reviewJudgmentHint" class="think-writing-hint">${pair.connection?.trim()?'‘내 생각에 연결하기’에 쓴 글을 다시 읽어 보세요. ':''}②에서 확인한 내용을 보니, 어떤 생각은 그대로이고 어떤 생각은 달라졌나요? 그 이유를 적어 보세요. 아직 판단하기 어려운 점을 써도 좋아요.</p>
      <textarea id="reviewJudgment" aria-describedby="reviewJudgmentHint" data-review="judgment" class="form-textarea" rows="3" ${disabled} oninput="ThinkWorkflow.reviewInput()">${escape(draft.judgment)}</textarea></div>`;
    return html;
  }
  const reactions = {similar:'내 생각과 비슷해요', newView:'새로운 관점이에요', curious:'더 궁금해요'};
  function selectedHearts(feedback = {}) {
    return feedback.reactions ?? (feedback.reaction ? [feedback.reaction] : []);
  }
  function toggleHeart(feedback, key) {
    const selected = selectedHearts(feedback);
    return selected.includes(key) ? selected.filter(item => item !== key) : [...selected, key];
  }
  function peerAnswers(text) {
    const blocks=text.trim().replace(/\r\n/g,'\n').split(/\n\n(?=[①②③④⑤] )/);
    const pairs=[];
    for(const block of blocks) {
      const question=tQuestions.find((item,i)=>[item.title,activeTTitle(i)].some(title=>block.startsWith(title+'\n')));
      if(!question) {
        const plain=escape(text);
        return text.length>200
          ? `<details class="think-peer-plain"><summary><span class="think-peer-preview">${escape(text.slice(0,200))}…</span>글 전체 보기</summary><p>${plain}</p></details>`
          : `<p class="think-peer-plain">${plain}</p>`;
      }
      pairs.push(`<div><dt><span class="peer-question-label">질문</span><span>${escape(question.question)}</span></dt>
        <dd>${escape(block.slice(question.title.length+1))}</dd></div>`);
    }
    return `<dl class="think-peer-answers">${pairs.join('')}</dl>`;
  }
  function peerCard(peer,index,feedback,disabled,review=false,final=false) {
    const handler=final?'finalReaction':review?'reviewReaction':'peerAction';
    let contents;
    if(review) {
      const fields=[['검토한 내용',peer.target],['자료에서 확인한 내용',peer.evidence],['확인한 뒤 내 생각',peer.judgment]];
      contents='<dl class="think-peer-answers">'+fields.filter(([,value])=>value).map(([label,value])=>`<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')+'</dl>';
      if(peer.sourceUrl && isWebAddress(peer.sourceUrl))contents+=`<p class="think-peer-plain"><a href="${escape(peer.sourceUrl)}" target="_blank" rel="noopener noreferrer">출처 열기</a></p>`;
    } else contents=final?`<p class="think-peer-plain" style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(peer.text)}</p>`:peerAnswers(peer.text);
    const buttons=Object.entries(reactions).map(([key,label])=>
      `<button type="button" data-reaction="${key}" aria-pressed="${selectedHearts(feedback).includes(key)}" ${disabled} onclick="ThinkWorkflow.${handler}(${index},'${key}')"><span aria-hidden="true">♡</span> ${label}</button>`).join('');
    return `<article class="think-peer-card" id="${final?'thinkFinal':'thinkPeer'}${index}"><h4>친구 글 ${index+1}</h4>${contents}
      <footer><div class="think-peer-actions" role="group" aria-label="친구 글 ${index+1}에 대한 내 반응">${buttons}</div>
      <button type="button" class="think-peer-recommend" aria-pressed="${!!feedback.recommended}" ${disabled} onclick="ThinkWorkflow.${handler}(${index},'recommend')"><span aria-hidden="true">☆</span> 우리 반과 함께 읽고 싶어요</button></footer></article>`;
  }
  function reflection(row) {
    return row.metadata.hasReflection ? row.content : '';
  }
  const reflectionPrompts=[
    ['① 내가 알아보려던 점','AI와 이야기하면서 가장 알고 싶었던 점은 무엇이었나요?'],
    ['② 새로 알게 된 점','대화 전에는 잘 몰랐는데, 이제 내 말로 설명할 수 있는 것은 무엇인가요?'],
    ['③ 내 생각에 연결하기','그 내용을 알고 나서, 처음 생각에서 달라진 점이나 더 분명해진 점은 무엇인가요?']
  ];
  function reflectionAnswers(row) {
    return Array.isArray(row.metadata.reflectionAnswers)
      ? reflectionPrompts.map((_,i)=>row.metadata.reflectionAnswers[i]||'')
      : ['', '', reflection(row)];
  }
  function setReflectionAnswers(ctx,answers) {
    const row=record(ctx,'I');
    row.metadata={...row.metadata,hasReflection:true,reflectionAnswers:answers};
    row.content=answers.map((answer,i)=>answer.trim() ? reflectionPrompts[i][0]+'\n'+answer : '').filter(Boolean).join('\n\n');
  }
  function chatHistory(ctx) {
    return `<div class="chat-messages">${ctx.turns.map(t=>`<div class="chat-bubble user">${escape(t.question)}</div><div class="chat-bubble ai" style="white-space:pre-wrap">${escape(t.answer||t.error||'응답을 기다리는 중…')}</div>`).join('')}</div>`;
  }
  let current = null, entering = false;
  const api = (ctx, action, stage='T', payload={}) => ctx.classId === 'student-demo-class'
    ? window.StudentDemo.invoke(action, stage, payload)
    : window.SupabaseService.invokeAccountFunction('think-workflow', {
    action, classId:ctx.classId, lessonId:ctx.lesson.id, stage, payload
  });
  const key = (ctx,stage) => `think-draft:${ctx.student}:${ctx.classId}:${ctx.lesson.id}:${stage}`;
  const blank = stage => ({stage,content:'',metadata:stage==='N'?{criteria:'validity'}:{},revision:0,submitted_at:null});
  const record = (ctx,stage) => ctx.records[stage] ||= blank(stage);
  const payloadText = r => JSON.stringify([r.content,r.metadata]);
  function cache(ctx,stage) {
    try { localStorage.setItem(key(ctx,stage),JSON.stringify({content:record(ctx,stage).content,metadata:record(ctx,stage).metadata,revision:record(ctx,stage).revision})); return true; } catch (_) {status(ctx,stage,'브라우저 임시 저장에 실패했습니다. 글을 복사하거나 저장해 주세요.');return false;}
  }
  function status(ctx,stage,message) {
    ctx.status[stage]=message;
    if(current===ctx && ctx.stage===stage) {
      const el=document.getElementById('thinkSaveStatus');
      if(el) el.textContent=message;
    }
  }
  function capture(ctx=current) {
    if(!ctx || current!==ctx || ctx.renderedStage!==ctx.stage) return;
    const stage=ctx.stage;
    if(stage==='T'||stage==='I') {
      const isT=stage==='T';
      const fields=[...document.querySelectorAll(isT?'[data-t-answer]':'[data-i-answer]')];
      if(fields.length===(isT?activeTSlots.length:reflectionPrompts.length) && fields.every(field=>!field.disabled)) {
        const row=record(ctx,stage);
        const previous=isT?tAnswers(row):reflectionAnswers(row);
        const answers=previous.slice();
        fields.forEach((field,i)=>{answers[isT?activeTSlots[i]:i]=field.value;});
        if(answers.some((answer,i)=>answer!==previous[i])) {
          if(isT)setTAnswers(ctx,answers);else setReflectionAnswers(ctx,answers);
          ctx.dirty[stage]=true;cache(ctx,stage);
        }
      }
      return;
    }
    if(stage==='N') {
      const fields=[...document.querySelectorAll('[data-review]')];
      const draft=reviewDraft(ctx);
      if(fields.some(f=>!f.disabled && f.value!==(draft[f.dataset.review] ?? ''))) {
        for(const f of fields)draft[f.dataset.review]=f.value;
        storeReview(ctx,draft);
      }
      return;
    }
    const field=document.getElementById('thinkText');
    if(field && !field.disabled && record(ctx,stage).content!==field.value) {record(ctx,stage).content=field.value;ctx.dirty[stage]=true;cache(ctx,stage);}
  }
  async function open(ctx,stage) {
    if(ctx.access[stage]!=='writable' || ctx.leases[stage]) return;
    const row=await api(ctx,'open',stage);
    // A server-issued lease means this student was admitted while writing was open.
    const local=record(ctx,stage);
    if(ctx.dirty[stage] && local.revision!==row.revision) throw new Error('다른 창의 기록이 변경되었습니다. 작성한 글을 복사한 뒤 다시 입장해 주세요.');
    if(!ctx.dirty[stage]) ctx.records[stage]=row;
    else local.revision=row.revision;
    if(stage==='N') record(ctx,stage).metadata.criteria ||= 'validity';
    ctx.leases[stage]=row.lease;
    ctx.saved[stage]=payloadText(row);
    if(ctx.dirty[stage]) scheduleWritingSave(ctx,stage);
  }
  function scheduleWritingSave(ctx,stage) {
    cache(ctx,stage);
  }
  async function restoreDraft(ctx,stage) {
    if(!['T','I','N','K'].includes(stage))return;
    let draft;
    try {
      const saved=localStorage.getItem(key(ctx,stage))||sessionStorage.getItem(key(ctx,stage));
      draft=JSON.parse(saved||'null');
    } catch {return;}
    if(!draft || typeof draft.content!=='string' || !draft.metadata)return;
    if(JSON.stringify([draft.content,draft.metadata])===ctx.saved[stage])return;
    const restore=await window.ModalService.confirm({
      title:'임시 저장된 글',message:'이 기기에 저장하지 않은 글이 있습니다. 불러오시겠습니까?',
      confirmLabel:'불러오기',cancelLabel:'불러오지 않기'
    });
    if(current!==ctx || ctx.stage!==stage)return;
    if(restore) {
      const row=record(ctx,stage);
      row.content=draft.content;row.metadata=draft.metadata;ctx.dirty[stage]=true;
      cache(ctx,stage);
    } else {
      delete ctx.dirty[stage];
      delete ctx.records[stage];
      delete ctx.leases[stage];
      await open(ctx,stage);
    }
  }
  function save(ctx,stage,{submit=false,final=false,automatic=false}={}) {
    const work=async()=>{
      if(automatic && ctx.timer!=null)return;
      const row=record(ctx,stage);
      if(!ctx.leases[stage]) {
        if(ctx.dirty[stage]||submit) throw new Error('작성 권한을 확인하지 못했습니다. 글을 복사한 뒤 다시 입장해 주세요.');
        return;
      }
      if(!submit&&!final&&!ctx.retry[stage]&&ctx.saved[stage]===payloadText(row)) return;
      const request=ctx.retry[stage]||{requestId:crypto.randomUUID(),lease:ctx.leases[stage],revision:row.revision,
        content:row.content,metadata:structuredClone(row.metadata),submit,final};
      ctx.retry[stage]=request;
      status(ctx,stage,'저장 중…');
      let result;
      try {
        let payload=request;
        if(stage==='H'){
          const previous=JSON.parse(ctx.saved.H)[1].feedback||{};
          const changes=Object.fromEntries(Object.entries(request.metadata.feedback||{}).filter(([id,value])=>JSON.stringify(value)!==JSON.stringify(previous[id])));
          payload={requestId:request.requestId,lease:request.lease,revision:request.revision,changes,final:request.final};
        }
        result=await api(ctx,'save',stage,payload);
      }
      catch(error) {
        if(stage==='H' && current===ctx) {
          clearTimeout(ctx.peerRetry);
          ctx.peerRetry=setTimeout(()=>{if(current===ctx && ctx.leases.H && ctx.retry.H)save(ctx,'H').catch(()=>{});},15000);
        }
        cache(ctx,stage);
        status(ctx,stage,stage==='H'?'반응을 저장하지 못했습니다. 자동으로 다시 시도합니다.':'자동 저장을 확인하지 못했습니다. 작성한 글은 이 화면에 남아 있습니다.');
        throw error;
      }
      ctx.retry[stage]=null;
      row.revision=result.revision; row.submitted_at=result.submitted_at;
      ctx.saved[stage]=JSON.stringify([request.content,request.metadata]);
      ctx.dirty[stage]=ctx.saved[stage]!==payloadText(row);
      if(ctx.dirty[stage]) cache(ctx,stage); else if(result.submitted_at) { try {localStorage.removeItem(key(ctx,stage));sessionStorage.removeItem(key(ctx,stage));} catch(_){} }
      status(ctx,stage,ctx.dirty[stage]?'저장 대기 중…':result.final_saved?'마감되어 마지막 내용을 저장했습니다.':result.submitted_at?(stage==='H'?'모든 반응 저장 완료':''):'저장 완료');
      if(current===ctx && stage==='H') document.querySelector('.think-step-item[data-stage="H"]')?.classList.toggle('completed',!!result.submitted_at);
      if(result.final_saved) { delete ctx.leases[stage]; delete ctx.closing[stage]; if(ctx.access[stage]==='writable')ctx.access[stage]='read_only'; }
      // A retry may have acknowledged an earlier request. Save the latest buffer too.
      if((ctx.dirty[stage] && (!automatic || ctx.timer==null)) || (submit&&!request.submit) || (final&&!request.final)) return work();
    };
    const queued=(ctx.queues[stage]||Promise.resolve()).catch(()=>{}).then(work);
    ctx.queues[stage]=queued;
    return queued;
  }
  function writingOpen(ctx,stage) {
    return stage===ctx.stage && !!ctx.leases[stage] && (['T','K'].includes(stage) || (stage==='N' && !ctx.readingReviews) || (stage==='I' && (ctx.reflecting ?? !!reflection(record(ctx,'I')))));
  }
  async function allowLeavingWriting(ctx) {
    if(!ctx)return true;
    capture(ctx);
    if(!writingOpen(ctx,ctx.stage)||!ctx.dirty[ctx.stage]||ctx.saved[ctx.stage]===payloadText(record(ctx,ctx.stage)))return true;
    if(ctx.leavingPrompt||ctx.submitting)return false;
    ctx.leavingPrompt=true;
    try {
      const choice=await window.ModalService.writingExit();
      if(choice==='submit')return await flow.submit();
      return choice==='draft' && cache(ctx,ctx.stage);
    } finally {ctx.leavingPrompt=false;}
  }
  async function flush(ctx,leaving=false) {
    if(!ctx) return;
    clearTimeout(ctx.timer);ctx.timer=null;
    capture(ctx);
    for(const stage of stages)if(ctx.dirty[stage])cache(ctx,stage);
  }
  async function refresh(ctx,initial=false,turnId=null,suppliedSnapshot=null) {
    if(ctx.refreshing) return;
    ctx.refreshing=true;
    try {
      const snapshot=suppliedSnapshot || await api(ctx,initial?'snapshot':'stage_snapshot',turnId?'I':ctx.stage,turnId?{turnId}:{});
      if(current!==ctx) return;
      capture(ctx);
      const previous=ctx.access;
      const reviewOptionChanged=ctx.peerReviewEnabled!==(snapshot.peerReviewEnabled!==false);
      ctx.peerReviewEnabled=snapshot.peerReviewEnabled!==false;
      if(!ctx.peerReviewEnabled){ctx.readingReviews=false;ctx.reviewPosts=[];}
      const next=Object.fromEntries(stages.map(s=>[s,snapshot.access[s]||'hidden']));
      const changed=reviewOptionChanged||JSON.stringify(previous)!==JSON.stringify(next);
      ctx.access=next;
      const peerChanged=snapshot.peers && JSON.stringify(ctx.peers)!==JSON.stringify(snapshot.peers);
      const chatChanged=!!snapshot.turns;
      if(snapshot.peers){
        ctx.firstCount=snapshot.firstCount ?? Math.min(6,snapshot.peers.length);
        ctx.peers=snapshot.peers;
      }
      if(snapshot.turns){
        if(turnId){
          for(const turn of snapshot.turns){
            const index=ctx.turns.findIndex(previous=>previous.id===turn.id);
            if(index<0)ctx.turns.push(turn);else ctx.turns[index]=turn;
          }
        } else ctx.turns=snapshot.turns;
        ctx.remaining=snapshot.remaining;
      }
      if(initial) {
        for(const row of snapshot.records) {ctx.records[row.stage]=row;ctx.saved[row.stage]=payloadText(row);}
      }
      if(next[ctx.stage]==='writable'&&!ctx.leases[ctx.stage]&&!ctx.closing[ctx.stage]) await open(ctx,ctx.stage);
      if(initial||changed||peerChanged||(chatChanged&&ctx.stage==='I')) render();
    } finally {ctx.refreshing=false;}
  }
  function render(preview=null, target=null) {
    const ctx=preview || current, box=target || document.getElementById('stepContentContainer');
    if(!ctx||!box) return;
    const s=ctx.stage,r=record(ctx,s),mode=ctx.access[s]||'hidden';
    const finishing=mode!=='writable' && ctx.renderedStage===s && writingOpen(ctx,s) && !ctx.closing[s];
    const writable=(mode==='writable'||finishing)&&!!ctx.leases[s]&&!ctx.closing[s];
    const disabled=writable?'':'disabled';
    const state=preview ? {} : window.AppState;
    state.currentStep=(ctx.lesson.thinkStages||stages).indexOf(s)+1;
    if(!preview) window.App.updateStepNav();
    if(!preview) document.querySelectorAll('.think-step-item[data-stage]').forEach(item => {
      item.classList.toggle('completed', !!ctx.records[item.dataset.stage]?.submitted_at);
    });
    ctx.renderedStage=s;
    let body='';
    const statusHtml=`<div role="status" id="thinkSaveStatus" style="margin:12px 0;white-space:pre-wrap">${escape(ctx.status[s]||'')}</div>`;
    const reflecting=s==='I' && (ctx.reflecting ?? !!reflection(r));
    if(mode==='hidden'&&!finishing) body='<p>선생님이 아직 열지 않았거나 마감한 단계입니다.</p>';
    else if(s==='T') {
      const answers=tAnswers(r);
      body='<div class="question-card think-writing-guide" data-stage="T"><strong>나의 처음 생각 정리하기</strong><p>AI나 친구의 의견을 보기 전에 내 생각을 적어 보세요. 짧게 써도 괜찮아요. 아직 잘 모르거나 확신이 없는 부분은 그대로 적어 주세요.</p></div>';
      body+=activeTSlots.map(i=>{
        const item=tQuestions[i];
        const id=i===0?'thinkText':`thinkTextT${i}`;
        return `<div class="form-group think-activity-card" data-stage="T"><label class="form-label" for="${id}">${activeTTitle(i)}</label><p id="thinkTQuestion${i}" class="think-writing-hint">${item.question}</p><textarea id="${id}" data-t-answer="${i}" class="form-textarea" rows="3" ${disabled} aria-describedby="thinkTQuestion${i}" oninput="ThinkWorkflow.input(this.value,${i})">${escape(answers[i])}</textarea><details class="think-t-example"><summary>예시 보기</summary><p><strong>예시 주제: ${exampleTopic}</strong></p><p>${item.example}</p><p>찬성하거나 반대해도 좋고, 특정한 조건에서만 허용해야 한다고 생각해도 괜찮아요. 예시를 따라 쓰지 않고 현재 수업의 질문에 대한 내 생각을 써 주세요.</p></details></div>`;
      }).join('');
      if(answers[2]?.trim()) body+=`<details class="think-t-example"><summary>이전에 작성한 이유 설명 보기</summary><p style="white-space:pre-wrap">${escape(answers[2])}</p></details>`;

    }
    else if(s==='N' && ctx.readingReviews && r.submitted_at) {
      body='<p>친구가 자료를 확인하고 내린 판단을 읽고, 해당하는 하트를 모두 고르세요. 다시 누르면 선택이 해제됩니다. 함께 읽고 싶은 글에는 ☆를 눌러 주세요.</p>';
      body+=`<button class="btn btn-secondary" onclick="ThinkWorkflow.reviewTab(true)" ${ctx.loadingReviews?'disabled':''}>새 글 확인</button>`;
      if(ctx.loadingReviews)body+='<p role="status">친구 검토를 불러오는 중…</p>';
      else if(ctx.reviewError)body+=`<p role="alert">${escape(ctx.reviewError)}</p>`;
      else if(!ctx.reviewPosts?.length)body+='<p>친구가 검토를 완료하면 여기에 표시됩니다.</p>';
      else body+=ctx.reviewPosts.map((p,i)=>peerCard(p,i,p,mode==='writable'&&!p.saving?'':'disabled',true)).join('');
    } else if(s==='N') body=reviewForm(ctx,r,writable);
    else if(s==='K') {
      if(ctx.readingFinals && mode!=='hidden'){
        body=preview?'교사가 공개하면 이 탭에서 친구들의 최종 글을 익명으로 읽을 수 있습니다.':
          `<button type="button" class="btn btn-secondary" data-final-refresh onclick="ThinkWorkflow.finalTab(true)">새 글 확인</button>`+
          (ctx.finalPosts.map((post,i)=>peerCard(post,i,post,mode==='writable'?'':'disabled',false,true)).join('')||'아직 친구가 제출한 최종 글이 없습니다.');
      } else {
      body+=finalReferences(ctx)+`<div class="form-group think-activity-card" data-stage="K">
        <label class="form-label" for="thinkText">나의 최종 글</label>
        <p id="thinkWritingHint" class="think-writing-hint">핵심 질문에 대한 주장을 분명히 밝히고, 그 주장을 뒷받침하는 근거와 이유를 담아 한 편의 글로 써 보세요.</p>
        <details class="think-t-example"><summary>주장문을 어떻게 쓸까요?</summary>
        <p><strong>[핵심 질문]</strong> 수업 중 휴대전화 사용을 허용해야 할까?</p>
        <p><strong>[주장]</strong> 핵심 질문에 대한 내 답은 무엇인가요?<br>
        (형식) “나는 ~해야 한다고 생각한다.”<br>
        (예시) 수업에 필요한 정보를 찾을 때는 휴대전화를 쓸 수 있어야 한다.</p>
        <p><strong>[근거]</strong> 내 주장을 뒷받침하는 경험, 사례, 자료는 무엇인가요?<br>
        (형식) “예를 들어, ~”<br>
        (예시) 영어 지문에서 모르는 단어를 사전 앱으로 찾아보니 막혔던 문장을 스스로 읽을 수 있었다.</p>
        <p><strong>[설명]</strong> 그 근거에서 무엇을 알 수 있나요? 근거와 주장을 이어 주세요.<br>
        (형식) “이 사례는 ~을 보여 준다.” / “왜냐하면 ~”<br>
        (예시) 이 경험은 짧은 검색만으로도 수업을 멈추거나 선생님께 묻지 않고 막힌 부분을 스스로 해결할 수 있다는 것을 보여 준다.</p>
        <p><strong>[보완] (선택)</strong> 반대 의견에 답하거나, 주장이 통하는 조건을 붙여 보세요.<br>
        (형식) “물론 ~라는 의견도 있다. 하지만 ~” / “다만 ~해야 한다.”<br>
        (예시) 다만 알림이 집중을 방해할 수 있으므로, 검색을 마치면 바로 휴대전화를 가방에 넣어야 한다.</p>
        <p><strong>한 문단으로 이으면</strong></p>
        <blockquote>수업에 필요한 정보를 찾을 때는 휴대전화를 쓸 수 있어야 한다. 예를 들어, 영어 지문에서 모르는 단어를 사전 앱으로 찾아보니 막혔던 문장을 스스로 읽을 수 있었다. 이 경험은 짧은 검색만으로도 수업을 멈추거나 선생님께 묻지 않고 막힌 부분을 스스로 해결할 수 있다는 것을 보여 준다. 다만 알림이 집중을 방해할 수 있으므로, 검색을 마치면 바로 휴대전화를 가방에 넣어야 한다.</blockquote></details>
        <textarea id="thinkText" class="form-textarea" rows="8" ${disabled} aria-describedby="thinkWritingHint" oninput="ThinkWorkflow.input(this.value)">${escape(r.content)}</textarea></div>`;
      }
    } else if(s==='H') {
      const cards=ctx.peers.map((p,i)=>peerCard(p,i,r.metadata.feedback?.[p.id]||{},disabled));
      body=cards.length ? `<p><strong>친구 글마다 해당하는 하트를 모두 고르세요. 다시 누르면 선택이 해제됩니다. 그리고 우리 반과 함께 읽고 싶은 글에는 ☆를 눌러 주세요.</strong></p>`+
        cards.join('') : '<p>친구가 T단계 글을 저장하면 여기에 표시됩니다.</p>';
    } else if(reflecting) {
      const answers=reflectionAnswers(r);
      const picker=writable && ctx.turns.length ? `<select class="form-select" aria-label="내가 보낸 질문 가져오기" onchange="ThinkWorkflow.importReflectionQuestion(this)">
        <option value="">내가 보낸 질문 가져오기</option>${ctx.turns.map((turn,i)=>`<option value="${i}">${escape(turn.question)}</option>`).join('')}</select>` : '';
      if(ctx.turns.length) body+=`<details class="think-t-example"><summary>AI와 나눈 대화 보기</summary>${chatHistory(ctx)}</details>`;
      body+=reflectionPrompts.map(([title,prompt],i)=>{
        const id=i===0?'thinkText':`thinkReflection${i}`;
        return `<div class="form-group think-activity-card" data-stage="I"><label class="form-label" for="${id}">${title}</label>
          <p class="think-writing-hint" id="${id}Prompt">${prompt}</p>${i===0?picker:''}
          <textarea id="${id}" data-i-answer="${i}" class="form-textarea" rows="3" ${disabled} aria-describedby="${id}Prompt${i===1?' thinkReflectionHelp':''}" oninput="ThinkWorkflow.input(this.value,${i})">${escape(answers[i])}</textarea>
          ${i===1?'<p class="think-writing-hint" id="thinkReflectionHelp">아직 헷갈린다면, 어느 부분이 헷갈리는지 써도 좋아요.</p>':''}</div>`;
      }).join('');
    } else if(s==='I') {
      const curiosity=tAnswers(record(ctx,'T'))[3].trim();
      const importButton=writable && !ctx.chatBusy && ctx.remaining>0 && !ctx.turns.length && curiosity
        ? `<button id="thinkImportQuestion" type="button" class="btn btn-secondary" ${ctx.chatDraft?'disabled':''}>내가 T단계에서 쓴 궁금한 점 가져오기</button>` : '';
      const hint=ctx.turns.some(turn=>turn.status==='succeeded')
        ? '어느 부분을 더 설명해 주면 좋을까요? 내 생각과 다른 점을 물어봐도 좋아요.'
        : '궁금한 점을 입력하세요.';
      const guide=`<details id="thinkChatGuide" class="think-t-example"${ctx.chatGuideOpen?' open':''}>
        <summary>AI와의 대화 가이드</summary>
        <p>궁금한 것부터 골라 AI에게 물어보세요.</p>
        <ol>
          <li><strong>핵심 개념 알아보기</strong> — “이 질문에서 ‘___’는 어떤 뜻이야? 예를 하나 들어 줘.”</li>
          <li><strong>찬성 입장 알아보기</strong> — “이 생각에 찬성하는 사람은 무엇을 중요하게 여겨? 그 이유는 뭐야?”</li>
          <li><strong>반대 입장 알아보기</strong> — “반대하는 사람은 무엇을 걱정해? 그 걱정을 뒷받침하는 근거가 있어?”</li>
        </ol>
        <p>여러 행동 중 하나를 고르는 질문이라면 “다른 선택을 할 수도 있을까? 그 이유는 뭐야?”라고 물어보세요.</p>
      </details>`;
      body=`<p>남은 질문: ${ctx.remaining}회 · 이름·전화번호 등 개인정보는 입력하지 마세요.</p>${guide}${chatHistory(ctx)}${importButton}<div class="chat-composer"><textarea placeholder="${hint}" id="thinkChatInput" class="form-input" aria-label="AI에게 질문" ${disabled} ${ctx.chatBusy?'disabled':''}>${escape(ctx.chatDraft||'')}</textarea><button class="btn btn-primary" onclick="ThinkWorkflow.chat()" ${disabled} ${ctx.chatBusy||ctx.remaining<=0?'disabled':''}>${ctx.chatBusy?'응답 중…':'전송'}</button></div>`;
    }
    const recovery=ctx.recovery[s]?`<details><summary>다른 저장본과 겹친 미저장 글 보기</summary><pre style="white-space:pre-wrap">${escape(ctx.recovery[s])}</pre></details>`:'';
    let primary='';
    if((mode!=='hidden'||finishing) && s!=='H' && !(s==='K'&&ctx.readingFinals)) {
      if(s==='I' && !reflecting) {
        if(writable || reflection(r)) primary=`<button class="btn btn-primary" onclick="ThinkWorkflow.reflectionView(true,true)" ${ctx.chatBusy?'disabled':''}>${writable?'내 생각 정리하기 →':'대화 후 내 생각 보기'}</button>`;
      } else if(s==='N' && ctx.readingReviews && r.submitted_at) {
        if((ctx.lesson.thinkStages||stages)[state.currentStep])primary=`<button class="btn btn-primary" onclick="ThinkWorkflow.navigate(${state.currentStep+1})">다음 단계로</button>`;
      } else if(s!=='I' || writable) primary=`<button class="btn btn-primary" onclick="ThinkWorkflow.submit()" ${disabled}>저장하기</button>`;
    }
    const backToChat=reflecting && mode==='writable' ? '<button type="button" class="btn btn-secondary" onclick="ThinkWorkflow.reflectionView(false,true)">대화로 돌아가기</button>' : '';
    const reviewTabs=s==='N'&&ctx.peerReviewEnabled!==false, finalTabs=s==='K', secondTab=finalTabs?!!ctx.readingFinals:reviewTabs?!!(ctx.readingReviews && (preview || r.submitted_at)):reflecting;
    if((finalTabs||reviewTabs||s==='I') && (mode!=='hidden'||finishing)) {
      const titles=finalTabs?['나의 최종 글','친구들의 최종 글 읽기']:reviewTabs?['내 생각 검토하기','친구의 검토 읽기']:['AI와 대화하기','대화 후 내 생각 정리하기'];
      const tabs=titles.map((title,i)=>{
        const selected=Number(secondTab)===i;
        const locked=finalTabs?(i===1&&mode==='hidden'):reviewTabs?(i===1&&!preview&&!r.submitted_at):(!selected&&(ctx.chatBusy||finishing));
        return `<button type="button" role="tab" id="think${s}Tab${i}" aria-selected="${selected}" aria-controls="think${s}Panel" tabindex="${selected?0:-1}" ${locked?'disabled':''} onclick="ThinkWorkflow.${finalTabs?'finalTab':reviewTabs?'reviewTab':'reflectionView'}(${i===1})">${title}</button>`;
      }).join('');
      const hint=finalTabs&&!secondTab?'<p class="think-writing-hint">제출한 글은 선생님이 공개한 뒤 같은 반 친구들이 익명으로 읽을 수 있습니다.</p>':reviewTabs&&!preview&&!r.submitted_at?'<p class="think-writing-hint">내 검토를 완료하면 친구들의 글을 읽을 수 있어요.</p>':'';
      if(preview && reviewTabs && secondTab){body='<div data-teacher-review-rankings></div>';primary='';}
      body=`<div class="think-i-tabs" data-stage="${s}" role="tablist" aria-label="${s}단계 활동">${tabs}</div>${hint}${finalTabs&&ctx.finalError?`<p id="thinkKReadStatus" role="status">${escape(ctx.finalError)}</p>`:''}<div id="think${s}Panel" role="tabpanel" aria-labelledby="think${s}Tab${Number(secondTab)}">${body}</div>`;
    }
    box.innerHTML=`${finishing?'<p>단계가 마감되었습니다. 작성 중인 글을 마무리하고 저장할 수 있어요.</p>':mode==='read_only'?'<p>읽기 전용 단계입니다.</p>':''}${body}${statusHtml}${recovery}<div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:16px">${backToChat}${primary}</div>`;
    if(preview) {
      const ids=new Set([...box.querySelectorAll('[id]')].map(element=>element.id));
      box.querySelectorAll('*').forEach(element => {
        const view=(s==='I'||reviewTabs||finalTabs) && element.getAttribute('onclick')?.match(/^ThinkWorkflow\.(?:reflectionView|reviewTab|finalTab)\((true|false)/);
        for(const attribute of [...element.attributes]) if(attribute.name.startsWith('on')) element.removeAttribute(attribute.name);
        if(element.id) element.id='teacherPreview-'+element.id;
        for(const attr of ['for','aria-controls','aria-labelledby','aria-describedby']) {
          if(element.hasAttribute(attr))element.setAttribute(attr,element.getAttribute(attr).split(/\s+/).map(id=>ids.has(id)?'teacherPreview-'+id:id).join(' '));
        }
        if(element.matches('textarea,input,select,button')) element.disabled=true;
        if(view) {
          element.disabled=false;
          element.dataset.previewView=view[1];
          element.addEventListener('click',()=>{if(reviewTabs && ctx.readingReviews===(view[1]==='true'))return;if(finalTabs)ctx.readingFinals=view[1]==='true';else if(reviewTabs)ctx.readingReviews=view[1]==='true';else ctx.reflecting=view[1]==='true';render(ctx,box);});
        }
      });
      box.querySelector('.think-i-tabs')?.addEventListener('keydown',event=>{
        if(s!=='I'&&!reviewTabs&&!finalTabs)return;
        const keys={ArrowLeft:!secondTab,ArrowRight:!secondTab,Home:false,End:true};
        if(!Object.hasOwn(keys,event.key))return;
        event.preventDefault();if(finalTabs)ctx.readingFinals=keys[event.key];else if(reviewTabs)ctx.readingReviews=keys[event.key];else ctx.reflecting=keys[event.key];render(ctx,box);
        box.querySelector('[role="tab"][aria-selected="true"]')?.focus();
      });
      const rankings=box.querySelector('[data-teacher-review-rankings]');
      if(rankings)ctx.onReviewRankings?.(rankings);
      return;
    }
    box.querySelector('.think-i-tabs')?.addEventListener('keydown',event=>{
      const keys={ArrowLeft:!secondTab,ArrowRight:!secondTab,Home:false,End:true};
      if(!Object.hasOwn(keys,event.key))return;
      event.preventDefault();
      document.getElementById('think'+s+'Tab'+Number(keys[event.key])).click();
    });
    const chatInput=document.getElementById('thinkChatInput');
    const guide=document.getElementById('thinkChatGuide');
    if(guide) guide.addEventListener('toggle',()=>{ctx.chatGuideOpen=guide.open;});
    if(s==='I' && chatInput) {
      const importButton=document.getElementById('thinkImportQuestion');
      importButton?.addEventListener('click',()=>{
        if(chatInput.value)return;
        chatInput.value=tAnswers(record(ctx,'T'))[3].trim();
        ctx.chatDraft=chatInput.value;
        importButton.disabled=true;
        chatInput.focus();
      });
      chatInput.addEventListener('input',()=>{
        ctx.chatDraft=chatInput.value;
        if(importButton)importButton.disabled=!!chatInput.value;
      });
      chatInput.addEventListener('keydown',event=>{
        if(event.key!=='Enter'||event.shiftKey||event.isComposing||event.keyCode===229)return;
        event.preventDefault();
        if(!event.repeat && !chatInput.disabled && ctx.remaining>0) flow.chat();
      });
    }
  }
  function observeQuestion(ctx,title) {
    const pin=document.getElementById('questionPin');
    if(!pin)return;
    const disclosure=pin.querySelector('details');
    pin.hidden=true;
    disclosure.open=false;
    for(const text of pin.querySelectorAll('span'))text.textContent=title.textContent;
    const update=()=>{
      if(current!==ctx)return;
      pin.hidden=!title.textContent || title.getBoundingClientRect().bottom>0;
      if(pin.hidden)disclosure.open=false;
    };
    window.addEventListener('scroll',update,{passive:true});
    window.addEventListener('resize',update);
    update();
    ctx.stopQuestionTracking=()=>{
      window.removeEventListener('scroll',update);
      window.removeEventListener('resize',update);
    };
  }
  async function enter(state,classId) {
    if(entering) return;entering=true;
    try {
      await flush(current,true);
      const old=current;
      const subject=state.subjectClasses?.find(c=>c.classId===classId);
      if(!subject?.activeLesson) return;
      if(old) {clearTimeout(old.timer);old.stopQuestionTracking?.();}
      const ctx={classId,lesson:subject.activeLesson,student:state.studentData.studentNumber,stage:(subject.activeLesson.thinkStages||stages)[0],
        access:{},records:{},leases:{},saved:{},dirty:{},retry:{},queues:{},status:{},closing:{},recovery:{},peers:[],turns:[],remaining:0};
      current=ctx;
      state.activeClassId=classId;state.activeLessonPlans=[ctx.lesson];state.currentLessonIndex=0;state.currentStep=1;
      state.peerOpinions=[];
      state.studentData={studentNumber:ctx.student,name:state.studentData.name,initialThought:'',finalThought:'',peerRationale:'',peerCriteria:'validity',chatMessages:[],remainingQuestions:0};
      document.getElementById('studentLobbySection').style.display='none';document.getElementById('studentAppSection').style.display='grid';
      document.getElementById('currentLessonLabel').textContent=`${ctx.lesson.number}주제 활동 진행 중`;
      document.getElementById('currentProjectTitle').textContent=ctx.lesson.projectTitle||'';
      document.getElementById('stepMainTitle').textContent=ctx.lesson.coreQuestion||'';
      observeQuestion(ctx,document.getElementById('stepMainTitle'));
      const background=document.getElementById('thinkBackground');
      const description=String(ctx.lesson.backgroundDescription||ctx.lesson.background_description||'').trim();
      background.querySelector('p').textContent=description;
      background.removeAttribute('open');
      background.hidden=!description;
      document.getElementById('stepContentContainer').textContent='수업 기록을 불러오는 중…';
      await refresh(ctx,true);
      await restoreDraft(ctx,ctx.stage);render();

    } catch(error) {alert(error.message);}
    finally {entering=false;}
  }
  const flow=window.ThinkWorkflow={
    renderTeacherPreview(lesson,stage,box,reflectionView=false,onReviewRankings=null) {
      const ctx={lesson,stage,access:Object.fromEntries(stages.map(s=>[s,'writable'])),records:{},leases:{},
        saved:{},dirty:{},status:{},closing:{},recovery:{},peers:[],turns:[],remaining:lesson.aiQuestionLimit||20,
        onReviewRankings,reflecting:reflectionView,firstCount:0,peerReviewEnabled:lesson.peerReviewEnabled!==false};
      ctx.leases[stage]='preview';
      render(ctx,box);
    },
    showKReference(stage) {
      document.querySelectorAll('[data-k-choice]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.kChoice===stage));});
      document.querySelectorAll('[data-k-reference]').forEach(panel=>{panel.hidden=panel.dataset.kReference!==stage;});
    },
    async finalTab(read) {
      const ctx=current;
      if(ctx?.stage!=='K'||ctx.finalPosts?.some(post=>post.saving))return;
      const request=ctx.finalRequest=(ctx.finalRequest||0)+1;
      if(read && ctx.access.K==='hidden')return;
      try {
        const posts=read?await api(ctx,'final_cards','K'):[];
        if(current!==ctx||ctx.stage!=='K'||ctx.finalRequest!==request)return;
        capture(ctx);
        ctx.finalError='';ctx.finalPosts=posts;
        ctx.readingFinals=read;
        render();
        document.getElementById('thinkKTab'+Number(read))?.focus();
      } catch(error) {
        if(current!==ctx||ctx.stage!=='K'||ctx.finalRequest!==request)return;
        capture(ctx);
        ctx.readingFinals=false;ctx.finalPosts=[];
        ctx.finalError=error.message;render();
        document.getElementById('thinkKTab1')?.focus();
      }
    },
    async finalReaction(index,action) {
      const ctx=current, post=ctx?.finalPosts?.[index], card=document.getElementById('thinkFinal'+index);
      if(ctx?.stage!=='K'||ctx.access.K!=='writable'||!card||!post||post.saving)return;
      const next={id:post.id,reactions:action==='recommend'?selectedHearts(post):toggleHeart(post,action),
        recommended:action==='recommend'?!post.recommended:post.recommended};
      post.saving=true;
      const buttons=[...card.querySelectorAll('button')];
      buttons.forEach(button=>button.disabled=true);
      const refresh=card.closest('[role="tabpanel"]').querySelector('[data-final-refresh]');
      refresh.disabled=true;
      try {
        await api(ctx,'final_feedback','K',next);
        Object.assign(post,next);
        buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.reaction?
          next.reactions.includes(button.dataset.reaction):next.recommended)));
      } catch(error){if(card.isConnected)alert(error.message);}
      finally {
        post.saving=false;
        buttons.forEach(button=>button.disabled=false);
        refresh.disabled=ctx.finalPosts.some(item=>item.saving);
      }
    },
    async showRecommendedReviews(details) {
      const ctx=current;
      if(ctx?.peerReviewEnabled===false)return;
      if(!details.open || ctx?.stage!=='K')return;
      const panel=details.querySelector('[role="status"]');
      panel.textContent='불러오는 중…';
      try {
        const posts=ctx.reviewPosts??await api(ctx,'review_list','N');
        if(current!==ctx || !details.isConnected)return;
        ctx.reviewPosts=posts;
        panel.innerHTML=posts.map((post,i)=>post.recommended?`<div><strong>친구 글 ${i+1}</strong>${reviewReference(post)}</div>`:'').join('')||'추천한 글이 없습니다.';
      } catch {panel.textContent='불러오지 못했습니다. 접었다가 다시 열어 주세요.';}
    },
    async reflectionView(show,fromBottom=false) {
      const ctx=current;
      if(!ctx || ctx.stage!=='I' || ctx.chatBusy || show===(ctx.reflecting ?? !!reflection(record(ctx,'I'))))return;
      capture(ctx);
      if(!show && !await allowLeavingWriting(ctx))return;
      ctx.reflecting=show;
      if(ctx.dirty.I)cache(ctx,'I');
      render();
      const tab=document.getElementById('thinkITab'+Number(show));
      tab?.focus({preventScroll:true});
      if(fromBottom && tab) {
        const tabs=tab.parentElement;
        tabs.scrollIntoView({block:'start'});
        const pin=document.getElementById('questionPin');
        if(pin && document.getElementById('stepMainTitle').getBoundingClientRect().bottom<=0) {
          pin.hidden=false;
          const overlap=pin.getBoundingClientRect().bottom+8-tabs.getBoundingClientRect().top;
          if(overlap>0)window.scrollBy(0,-overlap);
        }
      }
    },
    importReflectionQuestion(select) {
      const field=document.querySelector('[data-i-answer="0"]');
      if(!field || field.disabled || select.value==='')return;
      const turn=current.turns[Number(select.value)];
      if(!turn)return;
      field.value=turn.question;
      flow.input(field.value,0);
      select.value='';
      field.focus();
    },
    input(value,index=0) {
      const ctx=current;
      if(!ctx)return;
      const s=ctx.stage,row=record(ctx,s);
      if(s==='T'||s==='I') {
        const answers=s==='T'?tAnswers(row):reflectionAnswers(row);
        answers[index]=value;
        if(s==='T')setTAnswers(ctx,answers);else setReflectionAnswers(ctx,answers);
      } else row.content=value;
      ctx.dirty[s]=true;cache(ctx,s);
      scheduleWritingSave(ctx,s);
    },
    pasteSourceUrl(event) {
      const address=event.clipboardData.getData('text/plain').trim();
      event.preventDefault();
      if(!isWebAddress(address)) {
        alert('http:// 또는 https://로 시작하는 웹페이지 주소를 붙여넣어 주세요.');
        return;
      }
      event.currentTarget.value=address;
      flow.reviewInput();
    },
    reviewInput() {
      const ctx=current;capture(ctx);
      scheduleWritingSave(ctx,'N');
    },
    async reviewTab(show) {
      const ctx=current;
      if(ctx?.peerReviewEnabled===false)return;
      if(ctx?.stage!=='N')return;
      if(show && ctx.readingReviews && ctx.reviewPosts?.some(p=>p.saving))return;
      if(show && !ctx.readingReviews) {
        if(!await allowLeavingWriting(ctx))return;
        try {await flush(ctx);} catch {return;}
        if(current!==ctx || ctx.stage!=='N')return;
        if(!record(ctx,'N').submitted_at){ctx.readingReviews=false;render();return;}
      }
      const version=ctx.reviewLoad=(ctx.reviewLoad||0)+1;
      ctx.readingReviews=show;ctx.loadingReviews=show;ctx.reviewError='';
      render();
      document.getElementById('thinkNTab'+Number(show))?.focus({preventScroll:true});
      if(!show)return;
      try {
        const posts=await api(ctx,'review_list','N');
        if(version===ctx.reviewLoad)ctx.reviewPosts=posts;
      } catch(error) {if(version===ctx.reviewLoad)ctx.reviewError=error.message;}
      finally {if(version===ctx.reviewLoad){ctx.loadingReviews=false;if(current===ctx&&ctx.stage==='N')render();}}
    },
    async reviewReaction(index,action) {
      const ctx=current,post=ctx?.reviewPosts?.[index];
      if(!post || post.saving || ctx.loadingReviews || ctx.stage!=='N' || !ctx.readingReviews || ctx.access.N!=='writable')return;
      const change=action==='recommend'?{recommended:!post.recommended}:{reactions:toggleHeart(post,action)};
      post.saving=true;render();
      try {
        await api(ctx,'review_feedback','N',{id:post.id,...change});
        const latest=ctx.reviewPosts.find(p=>p.id===post.id);
        if(latest)Object.assign(latest,change);
        status(ctx,'N','반응 저장 완료');
      } catch(error){status(ctx,'N','반응 저장 실패: '+error.message);}
      finally {post.saving=false;if(current===ctx&&ctx.stage==='N')render();}
    },
    async peerAction(index,action) {
      const ctx=current,peer=ctx?.peers[index];
      if(!peer||ctx.stage!=='H'||ctx.access.H!=='writable'||!ctx.leases.H||ctx.closing.H)return;
      const row=record(ctx,'H'),feedback=row.metadata.feedback ||= {};
      const entry=feedback[peer.id] ||= {};
      if(action==='recommend') entry.recommended=!entry.recommended;
      else if(Object.hasOwn(reactions,action)) {
        const selected = toggleHeart(entry, action);
        if (selected.length) entry.reaction = selected[0];
        else delete entry.reaction;
        if (selected.length > 1) entry.reactions = selected;
        else delete entry.reactions;
      }
      else return;
      const card=document.getElementById(`thinkPeer${index}`);
      for(const button of card.querySelectorAll('[data-reaction]')) button.setAttribute('aria-pressed',String(selectedHearts(entry).includes(button.dataset.reaction)));
      card.querySelector('.think-peer-recommend').setAttribute('aria-pressed',String(!!entry.recommended));
      ctx.dirty.H=true;cache(ctx,'H');
      await save(ctx,'H').catch(()=>{});
    },
    async submit() {
      const ctx=current,s=ctx.stage;capture(ctx);
      if(['T','K'].includes(s)&&!record(ctx,s).content.trim()) {alert('생각과 이유를 작성해 주세요.');return;}
      if(s==='N') {
        const review=reviewDraft(ctx);
        if(review.sourceUrl?.trim() && !isWebAddress(review.sourceUrl.trim())) {
          alert('자료 출처에는 http:// 또는 https://로 시작하는 웹페이지 주소를 입력해 주세요.');
          document.getElementById('reviewSourceUrl')?.focus();
          return;
        }
        if(![review.target,review.evidence,review.judgment].every(v=>v.trim())) {
          alert('검토할 내용과 자료를 비교한 결과, 확인한 뒤의 생각을 적어 주세요.');return;
        }
        if(review!==record(ctx,s).metadata.review)storeReview(ctx,review);
      }
      if(s==='I' && !reflection(record(ctx,s)).trim()){alert('대화 후 내 생각을 적어 주세요.');return;}
      if(ctx.submitting)return;ctx.submitting=true;
      clearTimeout(ctx.timer);ctx.timer=null;
      try {
        await save(ctx,s,{submit:true,final:true});
        if(current!==ctx || ctx.stage!==s)return;
        if(!record(ctx,s).submitted_at)throw new Error('저장 미확인');
        status(ctx,s,'');
        render();
        document.querySelector('button[onclick="ThinkWorkflow.submit()"]')?.focus({preventScroll:true});
        await window.ModalService.alert({title:'저장 완료',message:'작성한 내용을 저장했습니다.',tone:'success'});
        return true;
      } catch {
        status(ctx,s,'저장을 확인하지 못했습니다. 작성한 글은 이 화면에 남아 있습니다. 같은 버튼을 다시 눌러 주세요.');
      } finally {ctx.submitting=false;}
    },
    async navigate(step) {
      const ctx=current;if(!ctx || ctx.navigating)return;
      const next=(ctx.lesson.thinkStages||stages)[step-1];
      if(!next)return;
      ctx.navigating=true;
      try {
        const previous=ctx.stage;
        const snapshot=await api(ctx,'stage_snapshot',next);
        if(!snapshot.access[next] || snapshot.access[next]==='hidden') {
          alert('선생님이 활동을 시작하면 참여할 수 있습니다.');return;
        }
        if(next!==previous && !await allowLeavingWriting(ctx))return;
        await flush(ctx,next!==previous);
        if(next!==previous){delete ctx.leases[previous];ctx.readingReviews=false;ctx.readingFinals=false;ctx.finalError='';ctx.finalPosts=[];ctx.finalRequest=(ctx.finalRequest||0)+1;}
        ctx.stage=next;
        await refresh(ctx,false,null,snapshot);
        await open(ctx,next);
        if(next!==previous)await restoreDraft(ctx,next);
        render();
      } catch(e){status(ctx,ctx.stage,e.message);render();}
      finally{ctx.navigating=false;}
    },
    async chat() {
      const ctx=current;if(!ctx||ctx.chatBusy)return;
      const question=document.getElementById('thinkChatInput')?.value.trim();if(!question)return;
      ctx.chatBusy=true;ctx.chatDraft=question;render();
      const requestId=ctx.chatRequest?.question===question?ctx.chatRequest.id:crypto.randomUUID();ctx.chatRequest={id:requestId,question};
      try {const turn=await api(ctx,'chat','I',{requestId,question});if(turn.status==='succeeded'){ctx.chatDraft='';ctx.chatRequest=null;}else status(ctx,'I',turn.error||'응답을 확인하고 있습니다…');}
      catch(e){status(ctx,'I',`전송 결과를 확인하지 못했습니다: ${e.message}. 같은 질문을 다시 전송하면 결과를 확인합니다.`);}
      finally{ctx.chatBusy=false;if(current===ctx){await refresh(ctx,false,requestId).catch(()=>{});render();}}
    },
    async stop() {await flush(current,true);if(current){clearTimeout(current.timer);current.stopQuestionTracking?.();}current=null;}
  };
  // Replace legacy nonpersistent handlers before ComponentLoader initializes App.
  window.App.installThinkDraftAutosave=function(){
    document.addEventListener('visibilitychange',()=>{if(document.hidden)flush(current).catch(()=>{});});
    window.addEventListener('beforeunload',e=>{capture();if(current&&Object.keys(current.dirty).some(s=>current.dirty[s])){e.preventDefault();e.returnValue='';}});
  };
  window.App.renderCurrentStep=render;
  window.App.goToStep=step=>flow.navigate(step);
  window.StudentLobbyModule.enterSubjectClass=enter;
  const exit=window.StudentLobbyModule.exitToLobby;
  window.StudentLobbyModule.exitToLobby=async()=>{try{if(!await allowLeavingWriting(current))return;await flow.stop();exit();await window.StudentLobbyModule.renderLobby(window.AppState);}catch(e){alert('저장을 확인하지 못했습니다. 잠시 후 수업 로비로 다시 이동해 주세요.');}};
  const logout=window.AuthModule.logout;
  window.AuthModule.logout=async()=>{try{await flow.stop();await logout.call(window.AuthModule);}catch(e){alert('저장을 마치지 못했습니다. 잠시 후 로그아웃을 다시 시도해 주세요.');}};
  window.SupabaseService.fetchTeacherStageResponses=(classId,lessonId,stageCode)=>api({classId,lesson:{id:lessonId}},'teacher',stageCode);
})();
