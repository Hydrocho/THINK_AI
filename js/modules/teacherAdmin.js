/* ==========================================================================
   Teacher Admin Module: Dashboard, Dynamic Project/Lesson Creation Wizard & AI Evidence
   ========================================================================== */

window.TeacherAdminModule = {
  navigation: {
    operation: { breadcrumb: '내 수업 › 수업 운영', title: '수업 운영', description: '학급별 프로젝트와 차시별 실시간 수업을 운영합니다.' },
    design: { breadcrumb: '내 수업 › 수업 설계', title: '수업 설계', description: '프로젝트 및 차시별 활동 계획을 작성하고 관리합니다.' },
    eval: { breadcrumb: '내 수업 › 수업 현황', title: '수업 현황', description: '학생들의 THINK 5단계 진행과 AI 대화 내역 및 근거를 평가합니다.' },
    students: { breadcrumb: '계정 관리 › 학생 관리', title: '학생 관리', description: '전체 학생 계정을 관리합니다.' },
    master: { breadcrumb: '계정 관리 › 교사 관리', title: '교사 관리', description: '교사 가입 요청을 승인하거나 거절합니다.' }
  },
  toggleSidebar: function () { document.getElementById('teacherAppSection')?.classList.toggle('sidebar-collapsed'); },
  renderDashboard: async function () {
    this.installLessonDraftUnloadGuard();
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
        console.warn("Notice checking profile role:", e);
      }
    }

    // 2. Render student evaluation table by default
    this.switchTab('operation');
  },

  switchTab: function (tabName) {
    if (tabName !== 'design' && !this.confirmDiscardLessonChanges()) return;
    const nav = this.navigation[tabName];
    if (nav) {
      const bc = document.getElementById('teacherBreadcrumb');
      if (bc) bc.innerText = nav.breadcrumb;
      const titleEl = document.getElementById('teacherPageTitle');
      if (titleEl) titleEl.innerText = nav.title;
      const descEl = document.getElementById('teacherPageDescription');
      if (descEl) descEl.innerText = nav.description;
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

    if (tabEval) tabEval.className = tabName === 'eval' ? 'teacher-nav-item active' : 'teacher-nav-item';
    if (tabStudents) tabStudents.className = tabName === 'students' ? 'teacher-nav-item active' : 'teacher-nav-item';
    if (tabMaster) tabMaster.className = tabName === 'master' ? 'teacher-nav-item active' : 'teacher-nav-item';
    if (tabOperation) tabOperation.className = tabName === 'operation' ? 'teacher-nav-item active' : 'teacher-nav-item';
    if (tabDesign) tabDesign.className = tabName === 'design' ? 'teacher-nav-item active' : 'teacher-nav-item';

    if (tabName === 'students') {
      window.StudentManagerModule.renderStudentManager();
    } else if (tabName === 'master') {
      window.MasterAdminModule.renderMasterPanel();
    } else if (tabName === 'operation') {
      this.showClassListSubView();
    } else if (tabName === 'design') {
      this.renderProjects();
    }
  },

  escapeHtml: function (value) {
    const el = document.createElement('div');
    el.textContent = value || '';
    return el.innerHTML;
  },

  renderProjects: async function () {
    const listSub = document.getElementById('projectListSubView');
    const detailSub = document.getElementById('projectDetailSubView');
    if (listSub) listSub.style.display = 'block';
    if (detailSub) detailSub.style.display = 'none';

    const el = document.getElementById('projectDesignList');
    if (!el) return;

    el.innerHTML = '<div style="padding: 32px; text-align: center; color: var(--text-subtle);">프로젝트를 불러오는 중입니다...</div>';

    try {
      const result = await window.SupabaseService.listProjects();
      const deletedIds = JSON.parse(localStorage.getItem('think_deleted_projects') || '[]');
      const projects = (result.projects || []).filter(p => !deletedIds.includes(p.id));
      this.cachedProjects = projects;

      if (projects.length === 0) {
        el.innerHTML = `
          <div class="project-empty-state">
            <div class="project-empty-icon">📂</div>
            <div class="project-empty-title">등록된 프로젝트가 없습니다</div>
            <div class="project-empty-desc">새 프로젝트를 생성하여 수업 및 차시 계획을 확장해 보세요.</div>
            <button class="btn btn-primary" onclick="TeacherAdminModule.createProjectPrompt()">＋ 첫 프로젝트 만들기</button>
          </div>
        `;
        return;
      }

      el.innerHTML = `
        <div class="project-card-grid">
          ${projects.map(p => {
            const lessons = p.project_versions?.[0]?.lesson_plans || [];
            const lessonCount = lessons.length;
            const lessonSummary = [...lessons]
              .sort((a, b) => (a.lesson_order || 0) - (b.lesson_order || 0))
              .slice(0, 3)
              .map((lesson, index) => `<span class="project-lesson-chip">${index + 1}차시 ${this.escapeHtml(lesson.title)}</span>`)
              .join('');
            const remainingLessons = Math.max(lessonCount - 3, 0);

            return `
              <div class="project-list-row">
              <div class="project-card" data-project-id="${p.id}" style="cursor: pointer;" onclick="TeacherAdminModule.openProjectDetailSubView('${p.id}')" title="클릭하여 차시별 활동 및 질문 상세 설계">
                <div class="project-card-header">
                    <h4 class="project-card-title">${this.escapeHtml(p.title)}</h4>
                    ${lessonCount ? `<div class="project-lesson-summary">${lessonSummary}${remainingLessons ? `<span class="project-lesson-more">+ ${remainingLessons}개 차시</span>` : ''}</div>` : '<span class="project-lesson-empty">차시를 추가해 주세요.</span>'}
                </div>
                <div class="project-card-details">
                  <div class="project-card-meta">
                    <span class="project-card-meta-item">📖 ${lessonCount}개 차시</span>
                  </div>
                </div>
                <div class="project-link-control" onclick="event.stopPropagation()"><span class="project-link-status">${p.is_published ? '학급 연결 가능' : '학급 연결 안 함'}</span><button type="button" class="project-link-switch ${p.is_published ? 'is-enabled' : ''}" aria-pressed="${p.is_published ? 'true' : 'false'}" aria-label="${p.is_published ? '학급 연결 가능 끄기' : '학급 연결 가능 켜기'}" onclick="TeacherAdminModule.setProjectPublished('${p.id}', ${!p.is_published})"></button></div>
                <button type="button" class="btn btn-danger project-delete-button" onclick="event.stopPropagation(); TeacherAdminModule.deleteProject('${p.id}', '${this.escapeHtml(p.title)}')" title="프로젝트 삭제">🗑️</button>
              </div>
              <div class="project-order-actions">
                <button type="button" class="project-order-button" onclick="TeacherAdminModule.moveProject(event, '${p.id}', -1)" ${projects.indexOf(p) === 0 ? 'disabled' : ''} aria-label="위로 이동">↑</button>
                <button type="button" class="project-order-button" onclick="TeacherAdminModule.moveProject(event, '${p.id}', 1)" ${projects.indexOf(p) === projects.length - 1 ? 'disabled' : ''} aria-label="아래로 이동">↓</button>
              </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } catch (err) {
      console.error('Failed to render projects:', err);
      el.innerHTML = `<div style="color: var(--danger-text); padding: 16px;">프로젝트를 불러오는 중 오류가 발생했습니다.</div>`;
    }
  },
  setProjectPublished: async function (projectId, isPublished) {
    try {
      await window.SupabaseService.setProjectPublished(projectId, isPublished);
      const card = document.querySelector(`[data-project-id="${projectId}"]`);
      const status = card?.querySelector('.project-link-status');
      const toggle = card?.querySelector('.project-link-switch');
      if (status) status.textContent = isPublished ? '학급 연결 가능' : '학급 연결 안 함';
      if (toggle) {
        toggle.classList.toggle('is-enabled', isPublished);
        toggle.setAttribute('aria-pressed', String(isPublished));
        toggle.setAttribute('aria-label', isPublished ? '학급 연결 가능 끄기' : '학급 연결 가능 켜기');
        toggle.setAttribute('onclick', `TeacherAdminModule.setProjectPublished('${projectId}', ${!isPublished})`);
      }
      const cached = (this.cachedProjects || []).find(project => project.id === projectId);
      if (cached) cached.is_published = isPublished;
    }
    catch (error) { alert(`학급 연결 가능 상태 변경 실패: ${error.message}`); }
  },
  moveProject: async function (event, projectId, direction) {
    event.stopPropagation();
    const index = this.cachedProjects.findIndex(project => project.id === projectId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= this.cachedProjects.length) return;
    [this.cachedProjects[index], this.cachedProjects[targetIndex]] = [this.cachedProjects[targetIndex], this.cachedProjects[index]];
    this.renderProjects();
  },
  createProjectPrompt: async function () {
    const title = await window.ModalService.prompt({ title: '새 프로젝트', message: '프로젝트 이름을 입력하세요.', label: '프로젝트명', confirmLabel: '만들기' });
    if (title === null || !title.trim()) return;
    await window.SupabaseService.createProject({ title: title.trim(), lessons: [] });
    this.renderProjects();
  },
  currentActiveClassId: null,

  showClassListSubView: function () {
    const listSubView = document.getElementById('classListSubView');
    const detailSubView = document.getElementById('classDetailSubView');
    const responsesSubView = document.getElementById('stageResponsesSubView');
    if (listSubView) listSubView.style.display = 'block';
    if (detailSubView) detailSubView.style.display = 'none';
    if (responsesSubView) responsesSubView.style.display = 'none';
    this.currentActiveClassId = null;
    if (this.expandedClassLessonIds) this.expandedClassLessonIds.clear();
    const breadcrumb = document.getElementById('teacherBreadcrumb');
    if (breadcrumb) breadcrumb.innerText = this.navigation.operation.breadcrumb;
    this.renderClassOperations();
  },

  showClassDetailSubView: function () {
    const listSubView = document.getElementById('classListSubView');
    const detailSubView = document.getElementById('classDetailSubView');
    const responsesSubView = document.getElementById('stageResponsesSubView');
    if (listSubView) listSubView.style.display = 'none';
    if (detailSubView) detailSubView.style.display = 'block';
    if (responsesSubView) responsesSubView.style.display = 'none';
  },

  openClassDetailSubView: async function (classId) {
    this.currentActiveClassId = classId;
    const listSubView = document.getElementById('classListSubView');
    const detailSubView = document.getElementById('classDetailSubView');
    const responsesSubView = document.getElementById('stageResponsesSubView');
    const container = document.getElementById('classDetailContent');
    const breadcrumb = document.getElementById('teacherBreadcrumb');

    if (listSubView) listSubView.style.display = 'none';
    if (detailSubView) detailSubView.style.display = 'block';
    if (responsesSubView) responsesSubView.style.display = 'none';
    if (container) container.innerHTML = '<div style="padding: 32px; text-align: center; color: var(--text-subtle);">학급 상세 수업 운영 정보를 불러오는 중입니다...</div>';


    try {
      const client = window.SupabaseService.getClient();
      const { data: cls } = await client.from('classes').select('*').eq('id', classId).single();
      if (breadcrumb && cls) {
        breadcrumb.innerText = `${this.navigation.operation.breadcrumb} › ${cls.grade_number}학년 ${cls.class_number}반 · ${cls.subject_name || '미지정'}`;
      }

      // Fetch attached project for this class
      const detachedIds = JSON.parse(localStorage.getItem('think_detached_class_projects') || '[]');
      const { data: rawClassProjects } = await client
        .from('class_projects')
        .select('*,projects(*,project_versions(*,lesson_plans(*)))')
        .eq('class_id', classId)
        .order('attached_at', { ascending: false });

      const classProjects = (rawClassProjects || []).filter(cp => !detachedIds.includes(cp.id));

      const { data: stageAccesses } = await client
        .from('class_lesson_stage_access')
        .select('lesson_plan_id,stage_code,access_mode')
        .eq('class_id', classId);

      const activeProjects = (classProjects || []).flatMap(classProject => classProject.projects ? [{
        ...classProject.projects,
        classProjectId: classProject.id,
        sourceVersionId: classProject.source_version_id,
        title: classProject.title || classProject.projects.title
      }] : []);
      const sortedLessons = activeProjects.flatMap(project => {
        const projectVersion = project.project_versions?.find(version => version.id === project.sourceVersionId);
        const projectLessons = projectVersion?.lesson_plans || [];
        return [...projectLessons]
          .sort((a, b) => (a.lesson_order || 0) - (b.lesson_order || 0))
          .map(lesson => ({
            ...lesson,
            projectId: project.classProjectId,
            projectTitle: project.title,
            projectLessonCount: projectLessons.length
          }));
      });

      if (!activeProjects.length) {
        container.innerHTML = `
          <div class="project-empty-state" style="margin-top: 20px;">
            <div class="project-empty-icon">🗂️</div>
            <div class="project-empty-title">연결된 프로젝트가 없습니다</div>
            <div class="project-empty-desc">학급 연결 가능 프로젝트를 이 학급에 연결하면 차시와 단계 공개 상태를 학급별로 운영할 수 있습니다.</div>
            <button class="btn btn-primary" onclick="TeacherAdminModule.attachProjectToActiveClassPrompt()">프로젝트 연결하기</button>
          </div>
        `;
        return;
      }

      const stageLabels = { T: '🟢 T (나의 처음 생각)', H: '🔵 H (친구와 생각 나누기)', I: '🟣 I (인공지능과 생각 넓히기)', N: '🟠 N (비판적으로 따져보기)', K: '🔴 K (나의 최종 생각)' };

      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 24px;">
          ${activeProjects.map(project => {
            const projectVersion = project.project_versions?.find(version => version.id === project.sourceVersionId);
            const lessons = [...(projectVersion?.lesson_plans || [])].sort((a, b) => (a.lesson_order || 0) - (b.lesson_order || 0));

            return `
              <section class="class-project-card-group" style="background: var(--bg-card); border: 2px solid var(--border-light); border-radius: var(--radius-lg); padding: 20px; box-shadow: var(--shadow-sm);">
                <div class="class-project-lesson-section-title" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-left: 5px solid var(--primary-500); background: var(--primary-50); border-radius: var(--radius-md); color: var(--primary-800); font-weight: 800; margin-bottom: 16px;">
                  <div style="display: flex; align-items: center; gap: 8px; font-size: 1.05rem;">
                    <span>🗂️ ${this.escapeHtml(project.title)}</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <small style="font-size: 0.85rem; font-weight: 700; color: var(--text-subtle);">📖 ${lessons.length}개 차시</small>
                    <button type="button" class="btn btn-secondary" style="padding: 5px 12px; font-size: 0.82rem; border-color: var(--border-light); background: #ffffff; color: var(--danger-text); font-weight: 700;" onclick="TeacherAdminModule.detachProjectFromClass('${project.classProjectId}')" title="이 학급에서 프로젝트 연결 해제">
                      🔗 연결 해제
                    </button>
                  </div>
                </div>

                ${lessons.length === 0 ? `
                  <div style="padding: 20px; text-align: center; color: var(--text-subtle); font-size: 0.9rem;">등록된 차시 계획이 없습니다.</div>
                ` : `
                  <div style="display: flex; flex-direction: column; gap: 14px;">
                    ${lessons.map((l, i) => {
                      const stages = l.think_stages || l.thinkStages || ['T','H','I','N','K'];
                      const earliestStage = (stages && stages.length > 0) ? stages[0] : 'T';
                      const stageState = Object.fromEntries((stageAccesses || []).filter(item => item.lesson_plan_id === l.id).map(item => [item.stage_code, item.access_mode]));
                      const isExpanded = !!(this.expandedClassLessonIds && this.expandedClassLessonIds.has(l.id));
                      const isActiveLesson = cls?.active_lesson_plan_id === l.id;

                      const miniBadgesHtml = stages.map(st => {
                        const currentMode = stageState[st] || 'hidden';
                        const modeKey = (currentMode === 'writable') ? 'writable' : 'read_only';
                        const modeMeta = {
                          writable: { label: `${st} ✍️`, bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' },
                          read_only: { label: `${st} 🔒`, bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' }
                        }[modeKey];

                        return `<span data-stage-access-lesson-id="${l.id}" data-stage-access-stage-code="${st}" data-stage-access-summary style="padding: 2px 7px; border-radius: 12px; font-size: 0.76rem; font-weight: 700; background: ${modeMeta.bg}; color: ${modeMeta.color}; border: 1px solid ${modeMeta.border}; white-space: nowrap;">${modeMeta.label}</span>`;
                      }).join('');

                      return `
                        <div class="class-lesson-card ${isActiveLesson ? 'is-active-card' : ''}">
                          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">

                            <div style="display: flex; align-items: center; gap: 12px;">
                              <span style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; background: var(--bg-sidebar); color: var(--text-main); font-weight: 800; font-size: 0.9rem;">
                                ${l.lesson_order || i + 1}
                              </span>
                              <div>
                                <div style="font-weight: 700; font-size: 1rem; color: var(--text-main);">
                                  ${this.escapeHtml(l.title)}
                                </div>
                                <div style="font-size: 0.85rem; color: var(--text-subtle); margin-top: 4px;">
                                  💡 핵심 질문: "${this.escapeHtml(l.core_question || '질문 미입력')}"
                                </div>
                              </div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                              <button type="button"
                                      class="class-lesson-active-toggle ${isActiveLesson ? 'is-active' : ''}"
                                      data-active-class-lesson-id="${l.id}"
                                      aria-pressed="${isActiveLesson}"
                                      onclick="TeacherAdminModule.setActiveClassLesson('${classId}','${l.id}')">
                                <span class="class-lesson-active-toggle-track" aria-hidden="true"><span class="class-lesson-active-toggle-thumb"></span></span>
                                <span>수업 활성화</span>
                              </button>
                              <button type="button"
                                      class="stage-response-view-button"
                                      onclick="TeacherAdminModule.openTeacherStageResponses('${classId}', '${l.id}', '${earliestStage}')">
                                학생 작성 글 보기
                              </button>
                            </div>
                          </div>

                          <!-- THINK Stage Toggle Header -->
                          <div id="think-stage-toggle-${l.id}"
                               class="think-stage-toggle-header"
                               onclick="TeacherAdminModule.toggleClassLessonThinkStage('${l.id}')"
                               style="margin-top: 14px; padding: 10px 14px; background: var(--bg-sidebar); border: 1px solid var(--border-light); border-radius: var(--radius-md); cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 12px; transition: all 0.2s ease; user-select: none;">
                            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex: 1; min-width: 0;">
                              <span style="font-weight: 700; font-size: 0.88rem; color: var(--text-main); display: inline-flex; align-items: center; gap: 4px;">
                                ⚡ THINK 5단계 공개 설정
                              </span>
                              <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                                ${miniBadgesHtml}
                              </div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 6px; font-size: 0.82rem; font-weight: 700; color: var(--primary-700); white-space: nowrap; flex-shrink: 0;">
                              <span id="think-stage-label-${l.id}">${isExpanded ? '접기' : '상세 설정 펼치기'}</span>
                              <span id="think-stage-chevron-${l.id}" style="font-size: 0.75rem; transform: ${isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'}; transition: transform 0.2s ease; display: inline-block;">▼</span>
                            </div>
                          </div>

                          <!-- Structured THINK Stage Access Table (Collapsible Container) -->
                          <div id="think-stage-container-${l.id}" style="display: ${isExpanded ? 'block' : 'none'}; margin-top: 10px; border: 1px solid var(--border-light); border-radius: var(--radius-md); overflow: hidden; background: #ffffff;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 0.86rem; text-align: left;">
                              <thead>
                                <tr style="background: var(--bg-sidebar); border-bottom: 1px solid var(--border-light); color: var(--text-subtle); font-weight: 700; font-size: 0.82rem;">
                                  <th style="padding: 10px 14px; white-space: nowrap; width: 220px;">구분</th>
                                  <th style="padding: 10px 14px;">핵심 목적</th>
                                  <th style="padding: 10px 14px; text-align: right; width: 440px;">상태 설정</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${stages.map(st => {
                                  const stageInfoMap = {
                                    T: { label: 'T (나의 처음 생각)', color: '#ea580c', desc: '외부 의견을 접하기 전에 자신의 초기 생각과 근거 형성' },
                                    H: { label: 'H (친구와 생각 나누기)', color: '#16a34a', desc: '동료와의 설명·질문·비교를 통해 자신의 생각을 구체화' },
                                    I: { label: 'I (인공지능과 생각 넓히기)', color: '#0284c7', desc: 'AI를 활용하여 대안과 관점 확장하고 중간 해결안 구성' },
                                    N: { label: 'N (비판적으로 따져보기)', color: '#dc2626', desc: 'AI 답변과 여러 해결 방안을 비판적으로 검토하고 재구성' },
                                    K: { label: 'K (나의 최종 생각)', color: '#9333ea', desc: '전체 활동을 바탕으로 자신의 최종 생각을 재구성하고 표현' }
                                  };
                                  const info = stageInfoMap[st] || { label: `${st} (단계)`, color: 'var(--primary-600)', desc: '' };
                                  const currentMode = stageState[st] || 'hidden';

                                  return `
                                    <tr style="border-bottom: 1px solid var(--border-light);">
                                      <td style="padding: 11px 14px; font-weight: 700; color: ${info.color}; white-space: nowrap;">
                                        ${info.label}
                                      </td>
                                      <td style="padding: 11px 14px; color: var(--text-subtle); font-size: 0.84rem;">
                                        ${info.desc}
                                      </td>
                                      <td style="padding: 9px 14px; text-align: right;">
                                        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap;">
                                        <div class="stage-access-pill-group">
                                          <button type="button" class="pill-btn ${(currentMode === 'read_only' || currentMode === 'hidden') ? 'active-readonly' : ''}" data-stage-access-lesson-id="${l.id}" data-stage-access-stage-code="${st}" data-stage-access-mode="read_only" onclick="TeacherAdminModule.setClassStageAccess('${classId}','${l.id}','${st}','read_only')">
                                            🔒 작성 잠금
                                          </button>
                                          <button type="button" class="pill-btn ${currentMode === 'writable' ? 'active-writable' : ''}" data-stage-access-lesson-id="${l.id}" data-stage-access-stage-code="${st}" data-stage-access-mode="writable" onclick="TeacherAdminModule.setClassStageAccess('${classId}','${l.id}','${st}','writable')">
                                            ✍️ 작성 가능
                                          </button>
                                        </div>
                                        <button type="button" class="stage-response-view-button" onclick="TeacherAdminModule.openTeacherStageResponses('${classId}', '${l.id}', '${st}')">학생 작성 글 보기</button>
                                        </div>
                                      </td>
                                    </tr>
                                  `;
                                }).join('')}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                `}
              </section>
            `;
          }).join('')}
        </div>
      `;
    } catch (err) {
      console.error('Failed to render class detail subview:', err);
      if (container) container.innerHTML = `<div style="color: var(--danger-text); padding: 16px;">학급 상세 정보를 불러오는 중 오류가 발생했습니다: ${err.message}</div>`;
    }
  },

  renderClassOperations: async function () {
    const el = document.getElementById('classOperationCards');
    if (!el) return;

    el.innerHTML = '<div style="padding: 32px; text-align: center; color: var(--text-subtle);">학급 운영 정보를 불러오는 중입니다...</div>';

    try {
      const client = window.SupabaseService.getClient();
      const session = await window.SupabaseService.getUserSession();
      const teacherId = session?.user?.id;

      let query = client.from('classes').select('id,class_code,grade_number,class_number,subject_name,active_lesson_plan_id,teacher_id').order('class_code');
      if (teacherId) {
        query = query.eq('teacher_id', teacherId);
      }
      const { data: classes } = await query;

      if (!classes || classes.length === 0) {
        el.innerHTML = `
          <div class="project-empty-state">
            <div class="project-empty-icon">🏫</div>
            <div class="project-empty-title">등록된 담당 학급이 없습니다</div>
            <div class="project-empty-desc">상단의 [＋ 새 학급 추가] 버튼을 눌러 담당할 학 학년/반을 개설해 보세요.</div>
            <button class="btn btn-primary" style="margin-top: 16px;" onclick="TeacherAdminModule.createClassPrompt()">
              ＋ 새 학급 추가
            </button>
          </div>
        `;
        return;
      }

      // Fetch attached projects
      const detachedIds = JSON.parse(localStorage.getItem('think_detached_class_projects') || '[]');
      const { data: rawClassProjects } = await client
        .from('class_projects')
        .select('*,projects(*,project_versions(*,lesson_plans(*)))')
        .order('attached_at', { ascending: false });
      const classProjects = (rawClassProjects || []).filter(cp => !detachedIds.includes(cp.id));

      el.innerHTML = `
        <div class="project-card-grid">
          ${classes.map(c => {
            const classCPs = (classProjects || []).filter(cp => cp.class_id === c.id);
            const attachedTitles = classCPs.map(cp => this.escapeHtml(cp.title || cp.projects?.title)).filter(Boolean);
            const className = `${c.grade_number}학년 ${c.class_number}반`;
            const subjectName = this.escapeHtml(c.subject_name || '미지정');

            return `
              <div class="project-card" style="display: flex; flex-direction: column; justify-content: space-between;">
                <div onclick="TeacherAdminModule.openClassDetailSubView('${c.id}')" style="cursor: pointer;">
                  <div class="project-card-header">
                    <h4 class="project-card-title">📘 ${subjectName} · ${className}</h4>
                  </div>

                  <div class="project-card-body" style="margin-top: 10px; padding-left: 24px; display: flex; flex-direction: column; gap: 8px;">
                    ${attachedTitles.length > 0
                      ? attachedTitles.map(title => `
                        <div style="font-size: 0.96rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 6px;">
                          <span>🗂️</span> ${title}
                        </div>
                      `).join('')
                      : '<div style="font-size: 0.88rem; font-weight: 600; color: var(--text-subtle);">연결된 프로젝트가 없습니다</div>'
                    }
                  </div>
                </div>

                <div>
                  <div class="project-card-actions" style="margin-top: 16px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-light); padding-top: 12px;">
                    <span class="project-card-meta-item" onclick="TeacherAdminModule.openClassDetailSubView('${c.id}')" style="cursor: pointer; color: var(--primary-700); font-weight: 700;">세부 운영 관리 →</span>
                    <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem; color: var(--danger-text);" onclick="event.stopPropagation(); TeacherAdminModule.deleteClassPrompt('${c.id}', '${className}')" title="학급 및 제출자료 정제 삭제">
                      🗑️ 학급 삭제
                    </button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } catch (err) {
      console.error('Failed to render class operations:', err);
      el.innerHTML = `<div style="color: var(--danger-text); padding: 16px;">학급 정보를 불러오는 중 오류가 발생했습니다.</div>`;
    }
  },

  pendingDeleteClassId: null,
  pendingDeleteClassName: null,

  deleteClassPrompt: function (classId, className) {
    this.pendingDeleteClassId = classId;
    this.pendingDeleteClassName = className;

    const lbl = document.getElementById('lblDeleteTargetClassName');
    if (lbl) lbl.innerText = className;

    const txt = document.getElementById('txtDeleteClassConfirm');
    if (txt) txt.value = '';

    const btn = document.getElementById('btnConfirmDeleteClass');
    if (btn) btn.disabled = true;

    window.ModalService.showCustom('deleteClassSafetyModal', 'txtDeleteClassConfirm');
  },

  closeDeleteClassSafetyModal: function () {
    this.pendingDeleteClassId = null;
    this.pendingDeleteClassName = null;
    window.ModalService.hideCustom('deleteClassSafetyModal');
  },

  validateDeleteClassConfirmInput: function (val) {
    const btn = document.getElementById('btnConfirmDeleteClass');
    if (!btn) return;
    const isValid = (val || '').trim() === '학급 삭제를 원합니다.';
    btn.disabled = !isValid;
  },

  handleConfirmDeleteClass: async function (e) {
    e.preventDefault();
    if (!this.pendingDeleteClassId) return;

    const classId = this.pendingDeleteClassId;
    const className = this.pendingDeleteClassName || '선택 학급';

    const btn = document.getElementById('btnConfirmDeleteClass');
    if (btn) { btn.disabled = true; btn.innerText = '삭제 중...'; }

    try {
      const session = await window.SupabaseService.getUserSession();
      const teacherId = session?.user?.id;

      await window.SupabaseService.deleteClassWithTargetData(classId, teacherId);

      this.closeDeleteClassSafetyModal();

      await window.ModalService.alert({
        title: '🎉 학급 정제 삭제 완료',
        message: `${className} 학급 및 해당 학급 활동 제출 자료가 안전하게 삭제되었습니다.\n(💡 학생 명부 계정은 보존되었습니다.)`,
        tone: 'success'
      });

      this.showClassListSubView();
    } catch (err) {
      console.error('Failed to delete class:', err);
      alert(`학급 삭제 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      if (btn) { btn.disabled = false; btn.innerText = '🗑️ 영구 삭제하기'; }
    }
  },

  attachProjectToActiveClassPrompt: async function () {
    if (!this.currentActiveClassId) {
      alert('선택된 학급이 없습니다.');
      return;
    }
    await this.attachProjectPrompt(this.currentActiveClassId);
    await this.openClassDetailSubView(this.currentActiveClassId);
  },

  detachProjectFromClass: async function (classProjectId) {
    const ok = await window.ModalService.confirm({ title: '연결 해제 확인', message: '이 학급에서 프로젝트 연결을 해제하시겠습니까?', confirmLabel: '해제하기', tone: 'danger' });
    if (!ok) return;

    const detachedIds = JSON.parse(localStorage.getItem('think_detached_class_projects') || '[]');
    if (!detachedIds.includes(classProjectId)) {
      detachedIds.push(classProjectId);
      localStorage.setItem('think_detached_class_projects', JSON.stringify(detachedIds));
    }

    if (window.SupabaseService && window.SupabaseService.detachProjectFromClass) {
      try {
        await window.SupabaseService.detachProjectFromClass(classProjectId);
      } catch (err) {}
    }

    if (this.currentActiveClassId) {
      await this.openClassDetailSubView(this.currentActiveClassId);
    }
    await this.renderClassOperations();
    await this.renderClassManagement();
  },

  createClassPrompt: function () {
    window.ModalService.showCustom('createClassModal', 'inpNewClassSubject');
  },

  closeClassModal: function () {
    window.ModalService.hideCustom('createClassModal');
  },

  handleCreateClassSubmit: async function (e) {
    e.preventDefault();
    const grade = parseInt(document.getElementById('selNewClassGrade').value) || 3;
    const classNum = parseInt(document.getElementById('selNewClassNumber').value) || 1;
    const subjectName = document.getElementById('inpNewClassSubject').value.trim();
    const className = `${grade}학년 ${classNum}반`;

    if (!subjectName) {
      await window.ModalService.alert({ title: '과목명 확인', message: '과목명을 입력해 주세요.', tone: 'info' });
      return;
    }

    const btn = document.getElementById('btnSubmitCreateClass');
    if (btn) { btn.disabled = true; btn.innerText = '개설 중...'; }

    try {
      const client = window.SupabaseService.getClient();
      const session = await window.SupabaseService.getUserSession();
      const teacherId = session?.user?.id;
      if (!teacherId) throw new Error('교사 로그인 정보를 확인할 수 없습니다.');

      // 1. Check if this teacher already owns the same grade/class/subject combination
      const { data: existingClasses, error: duplicateError } = await client
        .from('classes')
        .select('id')
        .eq('grade_number', grade)
        .eq('class_number', classNum)
        .eq('teacher_id', teacherId)
        .ilike('subject_name', subjectName)
        .limit(1);

      if (duplicateError) throw duplicateError;

      if (existingClasses?.length) {
        await window.ModalService.alert({
          title: '학급 중복 안내',
          message: `${className} ${subjectName} 과목은 이미 등록되어 있습니다.`,
          tone: 'info'
        });
        return;
      }

      // 2. Insert new class via SupabaseService (uses Service Role Edge Function to bypass RLS)
      await window.SupabaseService.createClass({ grade, classNumber: classNum, subjectName });

      this.closeClassModal();
      document.getElementById('inpNewClassSubject').value = '';
      await window.ModalService.alert({
        title: '🎉 학급 개설 완료',
        message: `${className} ${subjectName} 과목이 성공적으로 개설되었습니다. 해당 학년·반 학생에게 과목 카드로 표시됩니다.`,
        tone: 'success'
      });

      this.renderClassOperations();
      this.renderClassManagement();
    } catch (err) {
      console.error('Failed to create class:', err);
      alert(`학급 개설 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      if (btn) { btn.disabled = false; btn.innerText = '🏫 학급 개설하기'; }
    }
  },

  renderClassManagement: async function () {
    const el = document.getElementById('classManagementCards');
    if (!el) return;

    el.innerHTML = '<div style="padding: 32px; text-align: center; color: var(--text-subtle);">학급 관리 목록을 불러오는 중입니다...</div>';

    try {
      const client = window.SupabaseService.getClient();
      const { data: classes } = await client.from('classes').select('*').order('class_code');
      const { data: students } = await client.from('student_accounts').select('student_number');
      const detachedIds = JSON.parse(localStorage.getItem('think_detached_class_projects') || '[]');
      const { data: rawClassProjects } = await client.from('class_projects').select('*,projects(*)');
      const classProjects = (rawClassProjects || []).filter(cp => !detachedIds.includes(cp.id));

      if (!classes || classes.length === 0) {
        el.innerHTML = `
          <div class="project-empty-state">
            <div class="project-empty-icon">🏛️</div>
            <div class="project-empty-title">개설된 학급이 없습니다</div>
            <div class="project-empty-desc">상단의 [＋ 새 학급 추가] 버튼을 클릭해 1~3학년 1~10반 학급을 미리 개설하세요.</div>
            <button class="btn btn-primary" style="margin-top: 16px;" onclick="TeacherAdminModule.createClassPrompt()">
              ＋ 새 학급 추가
            </button>
          </div>
        `;
        return;
      }

      el.innerHTML = `
        <div class="project-card-grid">
          ${classes.map(c => {
            const prefix = `${c.grade_number}${c.class_number < 10 ? '0' + c.class_number : c.class_number}`;
            const studentCount = (students || []).filter(st => (st.student_number || '').startsWith(prefix)).length;
            const classCPs = (classProjects || []).filter(cp => cp.class_id === c.id);
            const attachedTitles = classCPs.map(cp => this.escapeHtml(cp.title || cp.projects?.title)).filter(Boolean);
            const subjectName = this.escapeHtml(c.subject_name || '미지정');

            return `
              <div class="project-card" style="display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                  <div class="project-card-header">
                    <h4 class="project-card-title">📘 ${subjectName} · ${c.grade_number}학년 ${c.class_number}반</h4>
                    <span class="project-status-badge ${attachedTitles.length ? 'published' : ''}">
                      ${attachedTitles.length ? `📎 수업 연결됨 (${attachedTitles.length}개)` : '⏸️ 미연결'}
                    </span>
                  </div>

                  <div class="project-card-body" style="margin-top: 14px;">
                    <div style="font-size: 0.95rem; font-weight: 700; color: var(--primary-700); margin-bottom: 6px;">
                      👥 소속 학생: ${studentCount}명 (학번 ${prefix}XX 시리즈)
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-main); margin-bottom: 4px;">
                      ${attachedTitles.length ? `🗂️ 연결 프로젝트: <strong>${attachedTitles.join(', ')}</strong>` : '연결된 수업 프로젝트가 없습니다.'}
                    </div>
                  </div>
                </div>

                <div>
                  <div class="project-card-actions" style="margin-top: 18px; display: flex; gap: 8px;">
                    <button class="btn btn-primary" style="flex: 1; padding: 7px 12px; font-size: 0.85rem;" onclick="TeacherAdminModule.switchTab('operation'); TeacherAdminModule.openClassDetailSubView('${c.id}');">
                      수업 운영으로 이동 →
                    </button>
                    <button class="btn btn-secondary" style="padding: 7px 10px; font-size: 0.85rem; color: var(--danger-text);" onclick="TeacherAdminModule.deleteClass('${c.id}', '${c.grade_number}학년 ${c.class_number}반')" title="학급 삭제">
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } catch (err) {
      console.error('Failed to render class management:', err);
      el.innerHTML = `<div style="color: var(--danger-text); padding: 16px;">학급 목록을 불러오는 중 오류가 발생했습니다.</div>`;
    }
  },

  deleteClass: async function (classId, className) {
    const ok = await window.ModalService.confirm({
      title: '학급 삭제 확인',
      message: `${className} 학급을 삭제하시겠습니까?\n학급 삭제 시 해당 학급의 수업 세션 및 연결 정보가 해제됩니다.`,
      confirmLabel: '삭제하기',
      tone: 'danger'
    });
    if (!ok) return;

    try {
      const client = window.SupabaseService.getClient();
      await client.from('classes').delete().eq('id', classId);
      await window.ModalService.alert({ title: '학급 삭제 완료', message: `${className} 학급이 삭제되었습니다.`, tone: 'success' });
      this.renderClassManagement();
      this.renderClassOperations();
    } catch (err) {
      alert(`학급 삭제 중 오류가 발생했습니다: ${err.message}`);
    }
  },

  attachProjectPrompt: async function (classId) {
    const client = window.SupabaseService.getClient();
    const detachedIds = JSON.parse(localStorage.getItem('think_detached_class_projects') || '[]');

    const result = await window.SupabaseService.listProjects();
    const projects = (result.projects || []).filter(project => project.is_published);
    if (!projects.length) {
      await window.ModalService.alert({ title: '연결 가능한 프로젝트가 없습니다', message: '수업 설계에서 프로젝트의 학급 연결 가능 토글을 켠 뒤 학급에 연결해 주세요.', tone: 'info' });
      return;
    }

    const { data: rawClassProjects } = await client
      .from('class_projects')
      .select('*')
      .eq('class_id', classId);

    const activeClassProjects = (rawClassProjects || []).filter(cp => !detachedIds.includes(cp.id));
    const currentAttachedProjectIds = activeClassProjects.map(cp => cp.source_project_id);

    const selectedProjectIds = await window.ModalService.selectCards({
      title: '프로젝트 연결 관리',
      message: '이 학급에서 사용할 프로젝트를 체크/해제하세요. 체크된 프로젝트만 학급에 연결됩니다.',
      multiSelect: true,
      initialValues: currentAttachedProjectIds,
      options: projects.map(project => {
        const lessons = project.project_versions?.[0]?.lesson_plans || [];
        const sortedLessons = [...lessons].sort((a, b) => (a.lesson_order || 0) - (b.lesson_order || 0));
        return {
          value: project.id,
          title: project.title,
          badge: `📖 ${lessons.length}개 차시`,
          lessons: sortedLessons.slice(0, 3).map(l => l.title),
          totalLessons: lessons.length
        };
      })
    });

    if (selectedProjectIds === null) return;

    const projectsToAdd = selectedProjectIds.filter(id => !currentAttachedProjectIds.includes(id));
    const projectIdsToRemove = currentAttachedProjectIds.filter(id => !selectedProjectIds.includes(id));

    for (const projectId of projectsToAdd) {
      const project = projects.find(item => item.id === projectId);
      const version = project?.project_versions?.[0];
      if (version) {
        await window.SupabaseService.attachProjectToClass(classId, version.id, project.title);
      }
    }

    for (const projectId of projectIdsToRemove) {
      const cpToRemoveList = activeClassProjects.filter(cp => cp.source_project_id === projectId);
      for (const cp of cpToRemoveList) {
        if (!detachedIds.includes(cp.id)) {
          detachedIds.push(cp.id);
        }
        if (window.SupabaseService && window.SupabaseService.detachProjectFromClass) {
          try {
            await window.SupabaseService.detachProjectFromClass(cp.id);
          } catch (e) {}
        }
      }
    }
    localStorage.setItem('think_detached_class_projects', JSON.stringify(detachedIds));

    this.renderClassOperations();
    this.renderClassManagement();
    if (this.currentActiveClassId === classId) {
      await this.openClassDetailSubView(classId);
    }
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
  const title = await window.ModalService.prompt({ title: '새 프로젝트', message: '프로젝트 이름을 입력하세요.', label: '프로젝트명', confirmLabel: '만들기' });
  if (title === null || !title.trim()) return;
  await window.SupabaseService.createProject({ title: title.trim(), lessons: [] });
  this.renderProjects();
};

window.TeacherAdminModule.showProjectListSubView = function () {
  if (!this.confirmDiscardLessonChanges()) return;
  const listSub = document.getElementById('projectListSubView');
  const detailSub = document.getElementById('projectDetailSubView');
  if (listSub) listSub.style.display = 'block';
  if (detailSub) detailSub.style.display = 'none';
  this.renderProjects();
};

window.TeacherAdminModule.openProjectDetailSubView = async function (projectId) {
  let project = (this.cachedProjects || []).find(p => p.id === projectId);
  
  if (!project) {
    const res = await window.SupabaseService.listProjects();
    this.cachedProjects = res.projects || [];
    project = this.cachedProjects.find(p => p.id === projectId);
  }
  if (!project) return;

  this.activeProjectId = projectId;
  const version = project.project_versions?.[0];
  const versionId = version?.id || '';
  const lessons = version?.lesson_plans || [];

  const titleEl = document.getElementById('projectDetailTitle');
  if (titleEl) titleEl.innerText = `🗂️ ${project.title}`;
  
  const actionsEl = document.getElementById('projectDetailHeaderActions');
  if (actionsEl) actionsEl.innerHTML = '';

  const versionInput = document.getElementById('detailVersionId');
  if (versionInput) versionInput.value = versionId;

  // Render Accordion List
  this.renderLessonAccordionList(lessons);

  // Switch Sub Views
  const listSub = document.getElementById('projectListSubView');
  const detailSub = document.getElementById('projectDetailSubView');
  if (listSub) listSub.style.display = 'none';
  if (detailSub) detailSub.style.display = 'block';

  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.TeacherAdminModule.renderLessonAccordionList = function (lessons) {
  this.lessonDrafts.clear();
  const container = document.getElementById('lessonAccordionContainer');
  if (!container) return;

  if (!lessons || lessons.length === 0) {
    container.innerHTML = `
      <div class="project-empty-state" style="margin-top: 0; padding: 36px 20px;">
        <div class="project-empty-icon">📝</div>
        <div class="project-empty-title">등록된 차시가 없습니다</div>
        <div class="project-empty-desc">상단의 '＋ 새 차시 추가' 버튼을 눌러 첫 차시 활동과 핵심 발문 질문을 등록하세요.</div>
        <button class="btn btn-primary" onclick="TeacherAdminModule.showAddLessonForm()">＋ 첫 차시 추가하기</button>
      </div>
    `;
    return;
  }

  const sorted = [...lessons].sort((a, b) => (a.lesson_order || 0) - (b.lesson_order || 0));

  container.innerHTML = sorted.map((l, i) => {
    const orderNum = l.lesson_order || (i + 1);
    const stages = l.think_stages || l.thinkStages || ['T','H','I','N','K'];

    return `
      <div class="lesson-accordion-item expanded" id="lesson-item-${l.id}" data-id="${l.id}" data-order="${orderNum}" draggable="true">
        <div class="lesson-accordion-header" onclick="TeacherAdminModule.toggleAccordion('${l.id}')">
          <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
            <span class="drag-handle" title="드래그하여 위아래 순서 변경" onclick="event.stopPropagation();">⋮⋮</span>
            <span class="role-tag" style="background: var(--primary-600); color: #ffffff; font-weight: 800; font-size: 0.8rem; padding: 3px 10px; border-radius: 6px;">${orderNum}차시</span>
            <span style="font-weight: 700; color: var(--text-main); font-size: 0.98rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(l.title)}</span>
          </div>
          <div class="lesson-accordion-actions" onclick="event.stopPropagation();">
            <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.78rem; color: var(--danger-text);" onclick="TeacherAdminModule.handleDeleteLesson('${l.id}')" title="차시 삭제">
              🗑️ 차시 삭제
            </button>
            <span class="accordion-chevron" style="font-size: 0.75rem; color: var(--text-subtle); padding: 4px;">▼</span>
          </div>
        </div>

        <div class="lesson-accordion-body">
          <form class="lesson-compact-form" data-draft-key="lesson-${l.id}" onsubmit="TeacherAdminModule.handleUpdateLesson(event, '${l.id}')">
            <div class="lesson-meta-row">
              <label class="lesson-inline-field lesson-title-field">
                <span>차시 제목</span>
                <input type="text" id="edit-title-${l.id}" class="form-input" value="${this.escapeHtml(l.title)}" required>
              </label>
            </div>

            <label class="lesson-question-row">
              <span>핵심 질문</span>
              <textarea id="edit-question-${l.id}" class="form-textarea" rows="1" required>${this.escapeHtml(l.core_question || '')}</textarea>
            </label>

            <div class="lesson-ai-settings-row">
              <label class="lesson-inline-field lesson-mode-field">
                <span>AI 응답 모드</span>
                <select id="edit-ai-mode-${l.id}" class="form-select">
                  <option value="THOUGHT_PROVOKING" ${(l.ai_response_mode || 'THOUGHT_PROVOKING') === 'THOUGHT_PROVOKING' ? 'selected' : ''}>사고 촉진형 (답 대신 질문/반례 제시)</option>
                  <option value="GENERAL" ${l.ai_response_mode === 'GENERAL' ? 'selected' : ''}>일반 대화형 (개념 직접 설명)</option>
                </select>
              </label>
              <label class="lesson-inline-field lesson-limit-field">
                <span>AI 질문</span>
                <input type="number" id="edit-limit-${l.id}" class="form-input" min="1" max="30" value="${l.ai_question_limit || 12}" required>
                <em>회</em>
              </label>
            </div>

            <div class="lesson-think-row">
              <div class="lesson-think-options">
                ${['T','H','I','N','K'].map(st => {
                  const isChecked = stages.includes(st);
                  const labels = {
                    T: 'T - 나의 처음 생각',
                    H: 'H - 친구와 생각 나누기',
                    I: 'I - 인공지능과 생각 넓히기',
                    N: 'N - 비판적으로 따져보기',
                    K: 'K - 나의 최종 생각'
                  };
                  return `
                    <label title="${labels[st]}">
                      <input type="checkbox" class="chk-edit-think-stage-${l.id}" value="${st}" ${isChecked ? 'checked' : ''}> ${labels[st]}
                    </label>
                  `;
                }).join('')}
              </div>
              <button type="submit" class="btn btn-primary lesson-save-button" disabled>💾 저장</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }).join('');

  // Attach Drag & Drop handlers
  this.attachDragAndDropHandlers(container);
  this.initializeLessonDraftTracking(container);
};

window.TeacherAdminModule.renderThinkStageAccessControls = function (container, lessons) {
  container.querySelectorAll('.lesson-think-options').forEach((options, index) => {
    const lesson = lessons[index];
    if (!lesson) return;
    const access = { T: 'hidden', H: 'hidden', I: 'hidden', N: 'hidden', K: 'hidden', ...(lesson.think_stage_access || {}) };
    const panel = document.createElement('div');
    panel.className = 'think-stage-access-panel';
    panel.innerHTML = ['T','H','I','N','K'].map(stage => `<span class="think-stage-access"><b>${stage}</b>${[['hidden','비공개'],['read_only','읽기 전용'],['writable','작성 가능']].map(([mode,label]) => `<button type="button" class="${access[stage] === mode ? 'active' : ''}" data-stage="${stage}" data-mode="${mode}">${label}</button>`).join('')}</span>`).join('');
    panel.addEventListener('click', async event => {
      const button = event.target.closest('button[data-stage]');
      if (!button) return;
      try { await window.SupabaseService.setThinkStageAccess(lesson.id, button.dataset.stage, button.dataset.mode); panel.querySelectorAll(`[data-stage="${button.dataset.stage}"]`).forEach(item => item.classList.toggle('active', item === button)); }
      catch (error) { alert(`THINK 단계 상태 변경 실패: ${error.message}`); }
    });
    options.after(panel);
  });
};

window.TeacherAdminModule.setClassStageAccess = async function (classId, lessonId, stageCode, accessMode) {
  const selector = `[data-stage-access-lesson-id="${lessonId}"][data-stage-access-stage-code="${stageCode}"]`;
  const buttons = [...document.querySelectorAll(`${selector}.pill-btn`)];
  const activeClassByMode = { hidden: 'active-hidden', read_only: 'active-readonly', writable: 'active-writable' };
  buttons.forEach(button => { button.disabled = true; });

  try {
    await window.SupabaseService.invokeAccountFunction('manage-class-projects', { action: 'set_class_stage_access', classId, lessonId, stageCode, accessMode });

    buttons.forEach(button => {
      button.classList.toggle(activeClassByMode[button.dataset.stageAccessMode], button.dataset.stageAccessMode === accessMode);
    });

    const modeMeta = {
      hidden: { icon: '🔒', bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' },
      read_only: { icon: '👁️', bg: '#e0f2fe', color: '#0369a1', border: '#bae6fd' },
      writable: { icon: '✍️', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' }
    }[accessMode];
    const summary = document.querySelector(`${selector}[data-stage-access-summary]`);
    if (summary) {
      summary.replaceChildren(document.createTextNode(`${stageCode} ${modeMeta.icon}`));
      summary.style.backgroundColor = modeMeta.bg;
      summary.style.color = modeMeta.color;
      summary.style.borderColor = modeMeta.border;
    }
  }
  catch (error) { alert(`학급 THINK 단계 상태 변경 실패: ${error.message}`); }
  finally { buttons.forEach(button => { button.disabled = false; }); }
};

window.TeacherAdminModule.openTeacherStageResponses = function (classId, lessonId, stageCode) {
  const listSubView = document.getElementById('classListSubView');
  const detailSubView = document.getElementById('classDetailSubView');
  const responsesSubView = document.getElementById('stageResponsesSubView');
  const container = document.getElementById('stageResponsesInPageContainer');
  const breadcrumb = document.getElementById('teacherBreadcrumb');

  if (listSubView) listSubView.style.display = 'none';
  if (detailSubView) detailSubView.style.display = 'none';
  if (responsesSubView) responsesSubView.style.display = 'block';

  if (breadcrumb) {
    const stageNameMap = { T: 'T (나의 처음 생각)', H: 'H (친구와 생각 나누기)', I: 'I (인공지능과 생각 넓히기)', N: 'N (비판적으로 따져보기)', K: 'K (나의 최종 생각)' };
    breadcrumb.innerText = `내 수업 › 수업 운영 › 학생 작성 글 보기 (${stageNameMap[stageCode] || stageCode})`;
  }

  if (container && window.TeacherStageResponsesModule?.renderInPageContainer) {
    window.TeacherStageResponsesModule.renderInPageContainer(container, classId, lessonId, stageCode);
  }
};


window.TeacherAdminModule.setActiveClassLesson = async function (classId, lessonId) {
  const buttons = [...document.querySelectorAll('[data-active-class-lesson-id]')];
  const selectedButton = buttons.find(button => button.dataset.activeClassLessonId === lessonId);
  const nextLessonId = selectedButton?.getAttribute('aria-pressed') === 'true' ? null : lessonId;
  buttons.forEach(button => { button.disabled = true; });

  try {
    await window.SupabaseService.setActiveClassLesson(classId, nextLessonId);
    buttons.forEach(button => {
      const isActive = button.dataset.activeClassLessonId === nextLessonId;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
      const card = button.closest('.class-lesson-card');
      if (card) {
        card.classList.toggle('is-active-card', isActive);
      }
    });

  } catch (error) {
    alert(`수업 활성화 변경 실패: ${error.message}`);
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
};

window.TeacherAdminModule.expandedClassLessonIds = new Set();

window.TeacherAdminModule.toggleClassLessonThinkStage = function (lessonId) {
  if (!this.expandedClassLessonIds) {
    this.expandedClassLessonIds = new Set();
  }
  const isExpanded = this.expandedClassLessonIds.has(lessonId);
  if (isExpanded) {
    this.expandedClassLessonIds.delete(lessonId);
  } else {
    this.expandedClassLessonIds.add(lessonId);
  }
  const nowExpanded = !isExpanded;

  const container = document.getElementById(`think-stage-container-${lessonId}`);
  const chevron = document.getElementById(`think-stage-chevron-${lessonId}`);
  const label = document.getElementById(`think-stage-label-${lessonId}`);

  if (container) {
    container.style.display = nowExpanded ? 'block' : 'none';
  }
  if (chevron) {
    chevron.style.transform = nowExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
  }
  if (label) {
    label.textContent = nowExpanded ? '접기' : '상세 설정 펼치기';
  }
};

window.TeacherAdminModule.toggleAccordion = function (lessonId) {
  const item = document.getElementById(`lesson-item-${lessonId}`);
  if (item) {
    if (item.classList.contains('expanded') && !this.confirmDiscardLessonChanges(`lesson-${lessonId}`)) return;
    item.classList.toggle('expanded');
  }
};

window.TeacherAdminModule.lessonDrafts = new Map();

window.TeacherAdminModule.getLessonDraftValue = function (form) {
  return JSON.stringify([...form.querySelectorAll('input, textarea, select')].map(field => ({
    name: field.id || field.value,
    value: field.type === 'checkbox' ? field.checked : field.value
  })));
};

window.TeacherAdminModule.initializeLessonDraftTracking = function (container) {
  container.querySelectorAll('.lesson-compact-form').forEach(form => {
    const key = form.dataset.draftKey;
    if (!key) return;
    const saveButton = form.querySelector('.lesson-save-button');
    const initialValue = this.getLessonDraftValue(form);
    this.lessonDrafts.set(key, { initialValue, dirty: false });
    if (saveButton) saveButton.disabled = true;

    const updateDirtyState = () => {
      const draft = this.lessonDrafts.get(key);
      if (!draft) return;
      draft.dirty = this.getLessonDraftValue(form) !== draft.initialValue;
      if (saveButton) saveButton.disabled = !draft.dirty;
      form.classList.toggle('has-unsaved-changes', draft.dirty);
    };
    form.querySelectorAll('input, textarea, select').forEach(field => {
      field.addEventListener('input', updateDirtyState);
      field.addEventListener('change', updateDirtyState);
    });
  });
};

window.TeacherAdminModule.isLessonDraftDirty = function (key) {
  if (key) return Boolean(this.lessonDrafts.get(key)?.dirty);
  return [...this.lessonDrafts.values()].some(draft => draft.dirty);
};

window.TeacherAdminModule.confirmDiscardLessonChanges = function (key) {
  if (!this.isLessonDraftDirty(key)) return true;
  const shouldDiscard = confirm('저장하지 않은 변경사항이 있습니다. 저장하지 않고 이동하시겠습니까?');
  if (!shouldDiscard) return false;
  if (key) this.lessonDrafts.delete(key);
  else this.lessonDrafts.clear();
  return true;
};

window.TeacherAdminModule.installLessonDraftUnloadGuard = function () {
  if (this.lessonDraftUnloadGuardInstalled) return;
  window.addEventListener('beforeunload', event => {
    if (!this.isLessonDraftDirty()) return;
    event.preventDefault();
    event.returnValue = '';
  });
  this.lessonDraftUnloadGuardInstalled = true;
};

window.TeacherAdminModule.showAddLessonForm = function () {
  const box = document.getElementById('addLessonFormBox');
  if (box) {
    const project = (this.cachedProjects || []).find(p => p.id === this.activeProjectId);
    const nextOrder = (project?.project_versions?.[0]?.lesson_plans?.length || 0) + 1;
    box.className = 'new-lesson-compact-card';
    box.innerHTML = `
      <div class="new-lesson-compact-header">
        <span class="role-tag">${nextOrder}차시</span>
        <strong>새 차시</strong>
      </div>
      <form class="lesson-compact-form" data-draft-key="new-lesson" onsubmit="TeacherAdminModule.handleAddLessonToProject(event)">
        <input type="hidden" id="detailVersionId" value="">
        <div class="lesson-meta-row">
          <label class="lesson-inline-field lesson-title-field">
            <span>차시 제목</span>
            <input type="text" id="detailLessonTitle" class="form-input" placeholder="예: 유전과 형질" required>
          </label>
        </div>
        <label class="lesson-question-row">
          <span>핵심 질문</span>
          <textarea id="detailCoreQuestion" class="form-textarea" rows="1" placeholder="학생들이 탐구할 핵심 질문을 입력하세요." required></textarea>
        </label>
        <div class="lesson-ai-settings-row">
          <label class="lesson-inline-field lesson-mode-field">
            <span>AI 응답 모드</span>
            <select id="detailAiMode" class="form-select">
              <option value="THOUGHT_PROVOKING">사고 촉진형 (답 대신 질문/반례 제시)</option>
              <option value="GENERAL">일반 대화형 (개념 직접 설명)</option>
            </select>
          </label>
          <label class="lesson-inline-field lesson-limit-field">
            <span>AI 질문</span>
            <input type="number" id="detailAiLimit" class="form-input" min="1" max="30" value="12" required>
            <em>회</em>
          </label>
        </div>
        <div class="lesson-think-row">
          <div class="lesson-think-options">
            <label><input type="checkbox" class="chk-add-think-stage" value="T" checked> T - 나의 처음 생각</label>
            <label><input type="checkbox" class="chk-add-think-stage" value="H" checked> H - 친구와 생각 나누기</label>
            <label><input type="checkbox" class="chk-add-think-stage" value="I" checked> I - 인공지능과 생각 넓히기</label>
            <label><input type="checkbox" class="chk-add-think-stage" value="N" checked> N - 비판적으로 따져보기</label>
            <label><input type="checkbox" class="chk-add-think-stage" value="K" checked> K - 나의 최종 생각</label>
          </div>
          <button type="button" class="btn btn-secondary new-lesson-cancel-button" onclick="TeacherAdminModule.hideAddLessonForm()">취소</button>
          <button type="submit" class="btn btn-primary lesson-save-button" id="btnSubmitAddLesson" disabled>💾 저장</button>
        </div>
      </form>
    `;
    this.initializeLessonDraftTracking(box);
    box.style.display = 'block';
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('detailLessonTitle')?.focus();
  }
};

window.TeacherAdminModule.hideAddLessonForm = function () {
  const box = document.getElementById('addLessonFormBox');
  if (!this.confirmDiscardLessonChanges('new-lesson')) return;
  this.lessonDrafts.delete('new-lesson');
  if (box) box.style.display = 'none';
};

window.TeacherAdminModule.handleAddLessonToProject = async function (e) {
  e.preventDefault();
  const title = document.getElementById('detailLessonTitle').value.trim();
  const coreQuestion = document.getElementById('detailCoreQuestion').value.trim();
  const aiResponseMode = document.getElementById('detailAiMode').value;
  const aiLimit = parseInt(document.getElementById('detailAiLimit').value) || 12;

  const selectedStages = [...document.querySelectorAll('.chk-add-think-stage:checked')].map(cb => cb.value);
  const thinkStages = selectedStages.length > 0 ? selectedStages : ['T', 'H', 'I', 'N', 'K'];

  const project = (this.cachedProjects || []).find(p => p.id === this.activeProjectId);
  if (!project) {
    alert('프로젝트 정보를 찾을 수 없습니다.');
    return;
  }

  const existingLessons = project.project_versions?.[0]?.lesson_plans || [];
  const updatedLessons = [
    ...existingLessons.map(l => ({
      title: l.title,
      coreQuestion: l.core_question,
      thinkStages: l.think_stages || l.thinkStages || ['T', 'H', 'I', 'N', 'K'],
      aiQuestionLimit: l.ai_question_limit,
      aiResponseMode: l.ai_response_mode || 'THOUGHT_PROVOKING'
    })),
    {
      title,
      coreQuestion,
      thinkStages,
      aiQuestionLimit: aiLimit,
      aiResponseMode
    }
  ];

  const btn = document.getElementById('btnSubmitAddLesson');
  if (btn) { btn.disabled = true; btn.innerText = '저장 중...'; }

  try {
    const res = await window.SupabaseService.saveProjectWithLessons({
      id: project.id,
      title: project.title,
      description: project.description || '',
      lessons: updatedLessons
    });

    if (res && res.error) {
      alert(`차시 저장 실패: ${res.error}`);
    } else {
      const listRes = await window.SupabaseService.listProjects();
      this.cachedProjects = listRes.projects || [];
      const newProj = this.cachedProjects.find(p => p.title === project.title) || this.cachedProjects[0];
      if (newProj) {
        this.openProjectDetailSubView(newProj.id);
      }
      this.lessonDrafts.delete('new-lesson');
      this.hideAddLessonForm();
      document.getElementById('detailLessonTitle').value = '';
      document.getElementById('detailCoreQuestion').value = '';
    }
  } catch (err) {
    console.error('Error adding lesson:', err);
    alert(`차시 저장 중 오류가 발생했습니다: ${err.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = '＋ 차시 저장 및 추가'; }
  }
};

window.TeacherAdminModule.handleUpdateLesson = async function (e, lessonId) {
  e.preventDefault();
  const title = document.getElementById(`edit-title-${lessonId}`).value.trim();
  const coreQuestion = document.getElementById(`edit-question-${lessonId}`).value.trim();
  const aiResponseMode = document.getElementById(`edit-ai-mode-${lessonId}`).value;
  const aiLimit = parseInt(document.getElementById(`edit-limit-${lessonId}`).value) || 12;

  const selectedStages = [...document.querySelectorAll(`.chk-edit-think-stage-${lessonId}:checked`)].map(cb => cb.value);
  const thinkStages = selectedStages.length > 0 ? selectedStages : ['T', 'H', 'I', 'N', 'K'];

  const project = (this.cachedProjects || []).find(p => p.id === this.activeProjectId);
  if (!project) return;

  const existingLessons = project.project_versions?.[0]?.lesson_plans || [];
  const updatedLessons = existingLessons.map(l => {
    if (l.id === lessonId) {
      return { title, coreQuestion, thinkStages, aiQuestionLimit: aiLimit, aiResponseMode };
    }
    return {
      title: l.title,
      coreQuestion: l.core_question,
      thinkStages: l.think_stages || l.thinkStages || ['T', 'H', 'I', 'N', 'K'],
      aiQuestionLimit: l.ai_question_limit,
      aiResponseMode: l.ai_response_mode || 'THOUGHT_PROVOKING'
    };
  });

  try {
    const res = await window.SupabaseService.saveProjectWithLessons({
      id: project.id,
      title: project.title,
      description: project.description || '',
      lessons: updatedLessons
    });

    if (res && res.error) {
      alert(`수정 실패: ${res.error}`);
    } else {
      const listRes = await window.SupabaseService.listProjects();
      this.cachedProjects = listRes.projects || [];
      const newProj = this.cachedProjects.find(p => p.title === project.title) || this.cachedProjects[0];
      if (newProj) {
        this.openProjectDetailSubView(newProj.id);
      }
      await window.ModalService.alert({ title: '수정 완료', message: '차시 정보가 업데이트되었습니다.', tone: 'success' });
    }
  } catch (err) {
    console.error('Error updating lesson:', err);
    alert(`차시 수정 중 오류가 발생했습니다: ${err.message}`);
  }
};

window.TeacherAdminModule.handleDeleteLesson = async function (lessonId) {
  const confirmDelete = confirm('이 차시를 삭제하시겠습니까?');
  if (!confirmDelete) return;

  const project = (this.cachedProjects || []).find(p => p.id === this.activeProjectId);
  if (!project) return;

  const existingLessons = project.project_versions?.[0]?.lesson_plans || [];
  const updatedLessons = existingLessons
    .filter(l => l.id !== lessonId)
    .map(l => ({
      title: l.title,
      coreQuestion: l.core_question,
      thinkStages: l.think_stages || l.thinkStages || ['T', 'H', 'I', 'N', 'K'],
      aiQuestionLimit: l.ai_question_limit,
      aiResponseMode: l.ai_response_mode || 'THOUGHT_PROVOKING'
    }));

  try {
    const res = await window.SupabaseService.saveProjectWithLessons({
      id: project.id,
      title: project.title,
      description: project.description || '',
      lessons: updatedLessons
    });

    if (res && res.error) {
      alert(`삭제 실패: ${res.error}`);
    } else {
      const listRes = await window.SupabaseService.listProjects();
      this.cachedProjects = listRes.projects || [];
      const newProj = this.cachedProjects.find(p => p.title === project.title) || this.cachedProjects[0];
      if (newProj) {
        this.openProjectDetailSubView(newProj.id);
      }
    }
  } catch (err) {
    console.error('Error deleting lesson:', err);
    alert(`차시 삭제 중 오류가 발생했습니다: ${err.message}`);
  }
};

window.TeacherAdminModule.attachDragAndDropHandlers = function (container) {
  let draggedItem = null;

  const items = container.querySelectorAll('.lesson-accordion-item');
  items.forEach(item => {
    item.addEventListener('dragstart', (e) => {
      draggedItem = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', async () => {
      if (!draggedItem) return;
      draggedItem.classList.remove('dragging');
      items.forEach(i => i.classList.remove('drag-over'));
      draggedItem = null;

      const project = (this.cachedProjects || []).find(p => p.id === this.activeProjectId);
      if (!project) return;
      const existingLessons = project.project_versions?.[0]?.lesson_plans || [];

      const updatedElements = [...container.querySelectorAll('.lesson-accordion-item')];
      const reorderedLessons = updatedElements.map(el => {
        const id = el.dataset.id;
        const found = existingLessons.find(l => l.id === id);
        return {
          title: found ? found.title : '',
          coreQuestion: found ? found.core_question : '',
          thinkStages: found ? (found.think_stages || found.thinkStages || ['T', 'H', 'I', 'N', 'K']) : ['T', 'H', 'I', 'N', 'K'],
          aiQuestionLimit: found ? found.ai_question_limit : 12,
          aiResponseMode: found ? (found.ai_response_mode || 'THOUGHT_PROVOKING') : 'THOUGHT_PROVOKING'
        };
      }).filter(l => l.title);

      try {
        await window.SupabaseService.saveProjectWithLessons({
          id: project.id,
          title: project.title,
          description: project.description || '',
          lessons: reorderedLessons
        });
        const listRes = await window.SupabaseService.listProjects();
        this.cachedProjects = listRes.projects || [];
        const newProj = this.cachedProjects.find(p => p.title === project.title) || this.cachedProjects[0];
        if (newProj) {
          this.openProjectDetailSubView(newProj.id);
        }
      } catch (err) {
        console.error('Error reordering lessons:', err);
      }
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggedItem || draggedItem === item) return;

      const bounding = item.getBoundingClientRect();
      const offset = e.clientY - bounding.top - (bounding.height / 2);

      if (offset < 0) {
        container.insertBefore(draggedItem, item);
      } else {
        container.insertBefore(draggedItem, item.nextSibling);
      }
    });
  });
};

window.TeacherAdminModule.deleteProject = async function (projectId, projectTitle) {
  const confirmed = confirm(`"${projectTitle}" 프로젝트를 정말로 삭제하시겠습니까?\n삭제된 프로젝트는 목록에서 제거됩니다.`);
  if (!confirmed) return;

  const deletedIds = JSON.parse(localStorage.getItem('think_deleted_projects') || '[]');
  if (!deletedIds.includes(projectId)) {
    deletedIds.push(projectId);
    localStorage.setItem('think_deleted_projects', JSON.stringify(deletedIds));
  }

  if (window.SupabaseService && window.SupabaseService.deleteProject) {
    try {
      await window.SupabaseService.deleteProject(projectId);
    } catch (e) {
      console.warn("DB project delete notice:", e.message);
    }
  }

  await this.renderProjects();
};
