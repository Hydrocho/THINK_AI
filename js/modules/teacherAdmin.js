/* ==========================================================================
   Teacher Admin Module: Dashboard, Dynamic Project/Lesson Creation Wizard & AI Evidence
   ========================================================================== */

window.TeacherAdminModule = {
  navigation: {
    operation: { breadcrumb: '내 수업 › 수업 운영', title: '수업 운영', description: '학급별 프로젝트와 차시를 운영합니다.' },
    design: { breadcrumb: '내 수업 › 수업 설계', title: '수업 설계', description: '프로젝트와 차시별 활동 계획을 작성합니다.' },
    eval: { breadcrumb: '내 수업 › 수업 현황', title: '수업 현황', description: '학생들의 THINK 단계 진행과 평가 상태를 확인합니다.' },
    students: { breadcrumb: '계정 관리 › 학생 관리', title: '학생 관리', description: '전체 학생 계정을 관리합니다.' },
    master: { breadcrumb: '계정 관리 › 교사 관리', title: '교사 관리', description: '교사 가입 요청을 승인하거나 거절합니다.' }
  },
  toggleSidebar: function () { document.getElementById('teacherAppSection')?.classList.toggle('sidebar-collapsed'); },
  renderDashboard: async function () {
    document.querySelector('.app-container')?.classList.add('teacher-dashboard-container');
    const userNav = document.getElementById('userNavArea');
    const userSlot = document.getElementById('teacherUserSlot');
    if (userNav && userSlot) userSlot.appendChild(userNav);
    // 1. Check user profile for master admin role
    if (window.SupabaseService && window.SupabaseService.isConnected()) {
      try {
        const session = await window.SupabaseService.getUserSession();
        if (session && session.user) {
          const profile = await window.SupabaseService.getUserProfile(session.user.id);
          const masterBtn = document.getElementById('tabTeacherMaster');
          if (profile && profile.role === 'admin' && masterBtn) {
            masterBtn.style.display = 'flex';
          }
        }
      } catch (e) {
        console.warn("Profile check warning:", e.message);
      }
    }

    // 2. Render student evaluation table by default
    this.switchTab('operation');
  },

  switchTab: function (tabName) {
    const nav = this.navigation[tabName];
    if (nav) {
      document.getElementById('teacherBreadcrumb').innerText = nav.breadcrumb;
      document.getElementById('teacherPageTitle').innerText = nav.title;
      document.getElementById('teacherPageDescription').innerText = nav.description;
    }
    const tabEval = document.getElementById('tabTeacherEval');
    const tabStudents = document.getElementById('tabTeacherStudents');
    const tabMaster = document.getElementById('tabTeacherMaster');
    const tabOperation = document.getElementById('tabTeacherOperation');
    const tabDesign = document.getElementById('tabTeacherDesign');

    const panelEval = document.getElementById('panelTeacherEval');
    const panelStudents = document.getElementById('panelTeacherStudents');
    const panelMaster = document.getElementById('panelTeacherMaster');
    const panelOperation = document.getElementById('panelTeacherOperation');
    const panelDesign = document.getElementById('panelTeacherDesign');

    if (panelOperation) panelOperation.style.display = tabName === 'operation' ? 'block' : 'none';
    if (panelDesign) panelDesign.style.display = tabName === 'design' ? 'block' : 'none';

    if (panelEval) panelEval.style.display = tabName === 'eval' ? 'block' : 'none';
    if (panelStudents) panelStudents.style.display = tabName === 'students' ? 'block' : 'none';
    if (panelMaster) panelMaster.style.display = tabName === 'master' ? 'block' : 'none';

    if (tabEval) tabEval.className = tabName === 'eval' ? 'think-step-item active' : 'think-step-item';
    if (tabStudents) tabStudents.className = tabName === 'students' ? 'think-step-item active' : 'think-step-item';
    if (tabMaster) tabMaster.className = tabName === 'master' ? 'think-step-item active' : 'think-step-item';
    if (tabOperation) tabOperation.className = tabName === 'operation' ? 'teacher-nav-item active' : 'teacher-nav-item';
    if (tabDesign) tabDesign.className = tabName === 'design' ? 'teacher-nav-item active' : 'teacher-nav-item';

    if (tabName === 'students') {
      window.StudentManagerModule.renderStudentManager();
    } else if (tabName === 'master') {
      window.MasterAdminModule.renderMasterPanel();
    } else if (tabName === 'operation') {
      this.renderClassOperations();
    } else if (tabName === 'design') {
      this.renderProjects();
    }
  },

  renderProjects: async function () {
    const el = document.getElementById('projectDesignList');
    const result = await window.SupabaseService.listProjects();
    el.innerHTML = (result.projects || []).map(p => `<div style="padding:14px;border-bottom:1px solid var(--border-light)"><strong>${p.title}</strong> <span class="role-tag">${p.visibility === 'published' ? '공개' : '초안'}</span><p>${p.description || ''}</p>${p.visibility === 'private' ? `<button class="btn btn-secondary" onclick="TeacherAdminModule.publishProject('${p.id}')">공개하기</button>` : ''}</div>`).join('') || '아직 만든 프로젝트가 없습니다.';
  },
  publishProject: async function (id) { await window.SupabaseService.publishProject(id); this.renderProjects(); },
  createProjectPrompt: async function () {
    const title = prompt('프로젝트명을 입력하세요.'); if (!title) return;
    const question = prompt('첫 차시의 핵심 질문을 입력하세요.'); if (!question) return;
    await window.SupabaseService.createProject({ title, lessons: [{ title: '1차시', coreQuestion: question }] });
    this.renderProjects();
  },
  renderClassOperations: async function () {
    const el = document.getElementById('classOperationCards');
    const client = window.SupabaseService.getClient();
    const { data: classes } = await client.from('classes').select('id,class_code,grade_number,class_number').order('class_code');
    el.innerHTML = (classes || []).map(c => `<div style="padding:16px;border:1px solid var(--border-light);border-radius:10px;margin-bottom:12px"><strong>${c.grade_number}학년 ${c.class_number}반</strong><p style="color:var(--text-subtle)">프로젝트를 연결하고 차시를 열어 수업을 시작합니다.</p><button class="btn btn-primary" onclick="TeacherAdminModule.attachProjectPrompt('${c.id}')">프로젝트 불러오기</button></div>`).join('') || '등록된 학급이 없습니다.';
  },
  attachProjectPrompt: async function (classId) {
    const result = await window.SupabaseService.listProjects(); const projects = result.projects || [];
    const options = projects.map((p,i) => `${i + 1}. ${p.title}`).join('\n'); const selected = Number(prompt(`불러올 프로젝트 번호를 입력하세요.\n${options}`)) - 1;
    const project = projects[selected]; const version = project?.project_versions?.[0]; if (!project || !version) return;
    await window.SupabaseService.attachProjectToClass(classId, version.id, project.title); alert('학급에 프로젝트를 연결했습니다.'); this.renderClassOperations();
  },

  renderEvalTable: async function () {
    const body = document.getElementById('teacherStudentTableBody');
    if (!body) return;

    let studentRows = [];

    if (window.SupabaseService && window.SupabaseService.isConnected()) {
      const dbStudents = await window.SupabaseService.fetchTeacherStudents();
      if (dbStudents && dbStudents.length > 0) {
        studentRows = dbStudents.map(st => {
          const subs = st.submissions || [];
          const hasFinal = subs.some(s => s.submission_type === 'final_reflection');
          const hasInitial = subs.some(s => s.submission_type === 'initial_thought');
          const stepText = hasFinal ? 'K (제출 완료)' : (hasInitial ? 'I (AI 대화 중)' : 'T (대기 중)');
          const assessment = (st.teacher_assessments && st.teacher_assessments[0]) ? st.teacher_assessments[0].assessment_level : '평가 대기 중';
          
          return {
            num: st.student_number,
            step: stepText,
            count: '실시간 카운트',
            rationale: '제출 사유 참조',
            assessment: assessment
          };
        });
      }
    }

    if (studentRows.length === 0) {
      body.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 32px; text-align: center; color: var(--text-subtle);">
            아직 수강 등록된 학생 제출 내역이 없습니다. 학생이 접속하여 THINK 5단계를 진행하면 실시간으로 현황이 업데이트됩니다.
          </td>
        </tr>
      `;
      return;
    }

    body.innerHTML = studentRows.map(st => `
      <tr style="border-bottom: 1px solid var(--border-light);">
        <td style="padding: 12px 16px; font-weight: 700;">${st.num}</td>
        <td style="padding: 12px 16px;"><span class="role-tag" style="font-size: 0.75rem;">${st.step}</span></td>
        <td style="padding: 12px 16px;">${st.count}</td>
        <td style="padding: 12px 16px;">${st.rationale}</td>
        <td style="padding: 12px 16px; font-weight: 700; color: var(--primary-700);">${st.assessment}</td>
        <td style="padding: 12px 16px;">
          <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.8rem;" onclick="alert('${st.num} 학생의 대화 내역 및 Gemini 발췌 근거 화면을 표시합니다.')">원문/근거 보기</button>
        </td>
      </tr>
    `).join('');
  },

  handleCreateLesson: async function (e) {
    e.preventDefault();
    const projTitle = document.getElementById('newProjectTitle').value.trim();
    const lessonNum = parseInt(document.getElementById('newLessonNum').value);
    const lessonTitle = document.getElementById('newLessonTitle').value.trim();
    const lessonQuestion = document.getElementById('newLessonQuestion').value.trim();
    const maxQ = parseInt(document.getElementById('newMaxQuestions').value);
    const aiMode = document.getElementById('newAiMode').value;

    const newLesson = {
      id: `custom-lesson-${Date.now()}`,
      number: lessonNum,
      title: `${lessonNum}차시 · ${lessonTitle}`,
      question: lessonQuestion,
      mode: aiMode,
      description: `T: 개인 작성 / H: 익명 비교 / I: Gemini 대화 (${maxQ}회 제한)`
    };

    // Save to Supabase DB if connected
    if (window.SupabaseService && window.SupabaseService.isConnected()) {
      await window.SupabaseService.createActivity({
        title: newLesson.title,
        core_question: newLesson.question,
        ai_mode: newLesson.mode,
        max_questions: maxQ
      });
    }

    // Add to global config
    window.APP_CONFIG.LESSONS.push(newLesson);
    
    // Update dropdown options
    const select = document.getElementById('lessonSelect');
    if (select) {
      const opt = document.createElement('option');
      opt.value = window.APP_CONFIG.LESSONS.length - 1;
      opt.innerText = newLesson.title;
      select.appendChild(opt);
    }

    // Close Modal and alert
    window.App.closeActivityModal();
    alert(`🎉 새로운 차시가 Supabase DB에 등록되었습니다!\n- 프로젝트: ${projTitle}\n- 차시: ${newLesson.title}\n수업 진입 PIN 번호: 782901`);
    
    this.renderDashboard();
  }
};

window.TeacherAdminModule.createProjectPrompt = async function () {
  const title = await window.ModalService.prompt({ title: '새 프로젝트', message: '프로젝트 이름을 입력하세요.', label: '프로젝트명', confirmLabel: '다음' });
  if (title === null) return;
  const question = await window.ModalService.prompt({ title: '첫 차시 핵심 질문', message: '첫 차시의 핵심 질문을 입력하세요.', label: '핵심 질문', confirmLabel: '만들기' });
  if (question === null) return;
  await window.SupabaseService.createProject({ title, lessons: [{ title: '1차시', coreQuestion: question }] });
  this.renderProjects();
};

window.TeacherAdminModule.attachProjectPrompt = async function (classId) {
  const result = await window.SupabaseService.listProjects();
  const projects = result.projects || [];
  if (!projects.length) {
    await window.ModalService.alert({ title: '프로젝트가 없습니다', message: '먼저 수업 설계에서 프로젝트를 만들어 주세요.', tone: 'info' });
    return;
  }
  const projectId = await window.ModalService.select({ title: '프로젝트 불러오기', message: '학급에 연결할 프로젝트를 선택하세요.', label: '프로젝트', options: projects.map(project => ({ value: project.id, label: project.title })) });
  if (projectId === null) return;
  const project = projects.find(item => item.id === projectId);
  const version = project?.project_versions?.[0];
  if (!version) return;
  await window.SupabaseService.attachProjectToClass(classId, version.id, project.title);
  await window.ModalService.alert({ title: '프로젝트 연결 완료', message: '학급에 프로젝트를 연결했습니다.', tone: 'success' });
  this.renderClassOperations();
};
