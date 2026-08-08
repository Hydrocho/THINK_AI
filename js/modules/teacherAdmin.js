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
            const isPublished = p.visibility === 'published';
            const lessons = p.project_versions?.[0]?.lesson_plans || [];
            const lessonCount = lessons.length;
            const updatedDate = p.updated_at ? new Date(p.updated_at).toLocaleDateString('ko-KR') : '';

            return `
              <div class="project-card" style="cursor: pointer;" onclick="TeacherAdminModule.openProjectDetailSubView('${p.id}')" title="클릭하여 차시별 활동 및 질문 상세 설계">
                <div>
                  <div class="project-card-header">
                    <h4 class="project-card-title">${this.escapeHtml(p.title)}</h4>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span class="project-status-badge ${isPublished ? 'published' : 'private'}">
                        ${isPublished ? '🟢 공개' : '🔒 초안'}
                      </span>
                      <button type="button" class="btn btn-danger" style="padding: 4px 8px; font-size: 0.8rem; line-height: 1; border-radius: 6px;" onclick="event.stopPropagation(); TeacherAdminModule.deleteProject('${p.id}', '${this.escapeHtml(p.title)}')" title="프로젝트 삭제">
                        🗑️
                      </button>
                    </div>
                  </div>
                  
                  <div class="project-card-body">
                    <p class="project-card-desc">${p.description ? this.escapeHtml(p.description) : '클릭하여 차시별 질문과 활동을 추가하세요.'}</p>
                  </div>
                </div>

                <div>
                  <div class="project-card-meta">
                    <span class="project-card-meta-item">📖 ${lessonCount}개 차시</span>
                    ${updatedDate ? `<span class="project-card-meta-item">🕒 ${updatedDate}</span>` : ''}
                  </div>

                  <div class="project-card-actions">
                    ${!isPublished ? `
                      <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.85rem;" onclick="event.stopPropagation(); TeacherAdminModule.publishProject('${p.id}')">
                        🚀 공개하기
                      </button>
                    ` : '<span style="font-size: 0.8rem; color: var(--success-text); font-weight: 600;">학급 연결 가능</span>'}
                  </div>
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
  publishProject: async function (id) { await window.SupabaseService.publishProject(id); this.renderProjects(); },
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
    if (listSubView) listSubView.style.display = 'block';
    if (detailSubView) detailSubView.style.display = 'none';
    this.currentActiveClassId = null;
    this.renderClassOperations();
  },

  openClassDetailSubView: async function (classId) {
    this.currentActiveClassId = classId;
    const listSubView = document.getElementById('classListSubView');
    const detailSubView = document.getElementById('classDetailSubView');
    const container = document.getElementById('classDetailContent');
    const titleEl = document.getElementById('classDetailTitle');

    if (listSubView) listSubView.style.display = 'none';
    if (detailSubView) detailSubView.style.display = 'block';
    if (container) container.innerHTML = '<div style="padding: 32px; text-align: center; color: var(--text-subtle);">학급 상세 수업 운영 정보를 불러오는 중입니다...</div>';

    try {
      const client = window.SupabaseService.getClient();
      const { data: cls } = await client.from('classes').select('*').eq('id', classId).single();
      if (titleEl && cls) {
        titleEl.innerHTML = `🏫 ${cls.grade_number}학년 ${cls.class_number}반 상세 수업 운영`;
      }

      // Fetch attached project for this class
      const { data: classProjects } = await client
        .from('class_projects')
        .select('*,projects(*,project_versions(*,lesson_plans(*)))')
        .eq('class_id', classId)
        .order('attached_at', { ascending: false });

      const attachedCP = classProjects?.[0];
      const attachedProject = attachedCP?.projects;
      const lessons = attachedCP?.projects?.project_versions?.[0]?.lesson_plans || [];
      const sortedLessons = [...lessons].sort((a, b) => (a.lesson_order || 0) - (b.lesson_order || 0));

      const { data: classSessions } = await client
        .from('class_sessions')
        .select('*,lesson_plans(*)')
        .eq('status', 'open');

      const openSession = (classSessions || []).find(cs => cs.class_project_id === attachedCP?.id);
      const openLessonPlanId = openSession?.lesson_plan_id;

      if (!attachedProject) {
        container.innerHTML = `
          <div class="project-empty-state" style="margin-top: 20px;">
            <div class="project-empty-icon">🗂️</div>
            <div class="project-empty-title">연결된 수업 프로젝트가 없습니다</div>
            <div class="project-empty-desc">상단의 [＋ 프로젝트 불러오기] 버튼을 누르거나 아래 버튼을 클릭하여 학급에 적용할 프로젝트를 연결하세요.</div>
            <button class="btn btn-primary" style="margin-top: 16px;" onclick="TeacherAdminModule.attachProjectToActiveClassPrompt()">
              ＋ 프로젝트 불러오기
            </button>
          </div>
        `;
        return;
      }

      const stageLabels = { T: '🟢 T (나의 처음 생각)', H: '🔵 H (친구와 생각 나누기)', I: '🟣 I (인공지능과 생각 넓히기)', N: '🟠 N (비판적으로 따져보기)', K: '🔴 K (나의 최종 생각)' };

      container.innerHTML = `
        <!-- Connected Project Header Card -->
        <div style="background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--radius-lg); padding: 20px 24px; margin-bottom: 28px; box-shadow: var(--shadow-sm); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
          <div>
            <div style="font-size: 0.8rem; font-weight: 700; color: var(--primary-700); text-transform: uppercase; margin-bottom: 4px;">
              현재 연결된 수업 프로젝트
            </div>
            <h4 style="font-size: 1.2rem; font-weight: 700; color: var(--text-main); margin: 0 0 6px 0;">
              🗂️ ${this.escapeHtml(attachedProject.title)}
            </h4>
            <div style="font-size: 0.85rem; color: var(--text-subtle);">
              총 ${sortedLessons.length}개 차시 포함 | 연결일: ${new Date(attachedCP.attached_at).toLocaleDateString()}
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" style="font-size: 0.85rem;" onclick="TeacherAdminModule.attachProjectToActiveClassPrompt()">
              🔄 프로젝트 교체
            </button>
            <button class="btn btn-secondary" style="font-size: 0.85rem; color: var(--danger-text);" onclick="TeacherAdminModule.detachProjectFromClass('${attachedCP.id}')">
              🗑️ 연결 해제
            </button>
            <button class="btn btn-secondary" style="font-size: 0.85rem; color: var(--danger-text);" onclick="TeacherAdminModule.deleteClassPrompt('${cls.id}', '${cls.grade_number}학년 ${cls.class_number}반')">
              🗑️ 학급 삭제
            </button>
          </div>
        </div>

        <!-- Lessons Accordion/Card Operations List -->
        <div style="margin-bottom: 16px; font-weight: 700; font-size: 1.05rem; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
          📖 차시별 수업 열기 및 관리 (${sortedLessons.length}개 차시)
        </div>

        <div style="display: flex; flex-direction: column; gap: 14px;">
          ${sortedLessons.map((l, i) => {
            const isOpen = l.id === openLessonPlanId;
            const stages = l.think_stages || l.thinkStages || ['T','H','I','N','K'];

            return `
              <div style="background: #ffffff; border: 2px solid ${isOpen ? 'var(--primary-500)' : 'var(--border-light)'}; border-radius: var(--radius-md); padding: 18px 22px; transition: all 0.2s ease;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; background: ${isOpen ? 'var(--primary-600)' : 'var(--bg-sidebar)'}; color: ${isOpen ? '#ffffff' : 'var(--text-main)'}; font-weight: 800; font-size: 0.9rem;">
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

                  <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="project-status-badge ${isOpen ? 'published' : 'private'}">
                      ${isOpen ? '🟢 현재 오픈 중' : '🔒 수업 대기'}
                    </span>
                    ${isOpen ? `
                      <button class="btn btn-secondary" style="padding: 8px 16px; font-size: 0.85rem; font-weight: 700;" onclick="TeacherAdminModule.toggleClassLessonSession('${attachedCP.id}', '${l.id}', false)">
                        ⏸️ 수업 닫기
                      </button>
                    ` : `
                      <button class="btn btn-primary" style="padding: 8px 16px; font-size: 0.85rem; font-weight: 700;" onclick="TeacherAdminModule.toggleClassLessonSession('${attachedCP.id}', '${l.id}', true)">
                        🚀 이 차시로 수업 열기
                      </button>
                    `}
                  </div>
                </div>

                <!-- THINK Stages Badges -->
                <div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--border-light); display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
                  <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-subtle); margin-right: 4px;">포함 단계:</span>
                  ${stages.map(st => `
                    <span style="display: inline-block; padding: 2px 8px; border-radius: 12px; background: var(--primary-50); color: var(--primary-800); font-size: 0.75rem; font-weight: 700; border: 1px solid var(--primary-200);">
                      ${stageLabels[st] || st}
                    </span>
                  `).join('')}
                </div>
              </div>
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

      let query = client.from('classes').select('id,class_code,grade_number,class_number,teacher_id').order('class_code');
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

      // Fetch attached projects & sessions
      const { data: classProjects } = await client
        .from('class_projects')
        .select('*,projects(*,project_versions(*,lesson_plans(*)))')
        .order('attached_at', { ascending: false });

      const { data: classSessions } = await client
        .from('class_sessions')
        .select('*,lesson_plans(*)')
        .eq('status', 'open');

      el.innerHTML = `
        <div class="project-card-grid">
          ${classes.map(c => {
            const attachedCP = (classProjects || []).find(cp => cp.class_id === c.id);
            const attachedProject = attachedCP?.projects;
            const lessons = attachedCP?.projects?.project_versions?.[0]?.lesson_plans || [];
            const openSession = (classSessions || []).find(cs => cs.class_project_id === attachedCP?.id);
            const openLesson = openSession?.lesson_plans;
            const className = `${c.grade_number}학년 ${c.class_number}반`;

            return `
              <div class="project-card" style="display: flex; flex-direction: column; justify-content: space-between;">
                <div onclick="TeacherAdminModule.openClassDetailSubView('${c.id}')" style="cursor: pointer;">
                  <div class="project-card-header">
                    <h4 class="project-card-title">🏫 ${className}</h4>
                    <span class="project-status-badge ${openSession ? 'published' : (attachedProject ? 'private' : '')}">
                      ${openSession ? '🟢 수업 진행 중' : (attachedProject ? '🔒 수업 대기' : '⏸️ 미연결')}
                    </span>
                  </div>

                  <div class="project-card-body" style="margin-top: 14px;">
                    <div style="font-size: 0.98rem; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
                      ${attachedProject ? `🗂️ ${this.escapeHtml(attachedProject.title)}` : '연결된 프로젝트가 없습니다'}
                    </div>
                    <p class="project-card-desc" style="font-size: 0.85rem; color: var(--text-subtle); margin: 0;">
                      ${openLesson ? `💡 열린 차시: <strong>${this.escapeHtml(openLesson.title)}</strong>` : (attachedProject ? '프로젝트가 연결되었습니다. 클릭하여 차시를 열어주세요.' : '클릭하여 세부 페이지에서 프로젝트를 연결하세요.')}
                    </p>
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

  toggleClassLessonSession: async function (classProjectId, lessonPlanId, shouldOpen) {
    try {
      if (shouldOpen) {
        await window.SupabaseService.openClassLesson(classProjectId, lessonPlanId);
        await window.ModalService.alert({ title: '수업 차시 오픈 완료', message: '선택하신 차시가 학생들에게 오픈되었습니다.', tone: 'success' });
      } else {
        const client = window.SupabaseService.getClient();
        await client.from('class_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('class_project_id', classProjectId).eq('status', 'open');
        await window.ModalService.alert({ title: '수업 차시 일시 정지', message: '수업 차시가 닫혔습니다.', tone: 'info' });
      }
      if (this.currentActiveClassId) {
        this.openClassDetailSubView(this.currentActiveClassId);
      }
    } catch (err) {
      alert(`수업 처리 중 오류가 발생했습니다: ${err.message}`);
    }
  },

  detachProjectFromClass: async function (classProjectId) {
    const ok = await window.ModalService.confirm({ title: '연결 해제 확인', message: '이 학급에서 프로젝트 연결을 해제하시겠습니까?', confirmLabel: '해제하기', tone: 'danger' });
    if (!ok) return;

    try {
      const client = window.SupabaseService.getClient();
      await client.from('class_projects').delete().eq('id', classProjectId);
      await window.ModalService.alert({ title: '연결 해제 완료', message: '학급 프로젝트 연결이 해제되었습니다.', tone: 'success' });
      if (this.currentActiveClassId) {
        this.openClassDetailSubView(this.currentActiveClassId);
      }
    } catch (err) {
      alert(`연결 해제 실패: ${err.message}`);
    }
  },

  createClassPrompt: function () {
    window.ModalService.showCustom('createClassModal', 'selNewClassGrade');
  },

  closeClassModal: function () {
    window.ModalService.hideCustom('createClassModal');
  },

  handleCreateClassSubmit: async function (e) {
    e.preventDefault();
    const grade = parseInt(document.getElementById('selNewClassGrade').value) || 3;
    const classNum = parseInt(document.getElementById('selNewClassNumber').value) || 1;
    const className = `${grade}학년 ${classNum}반`;
    const classCode = `class-${grade}-${classNum}`;
    const studentPrefix = `${grade}${classNum < 10 ? '0' + classNum : classNum}`;

    const btn = document.getElementById('btnSubmitCreateClass');
    if (btn) { btn.disabled = true; btn.innerText = '개설 중...'; }

    try {
      const client = window.SupabaseService.getClient();

      // 1. Check if class already exists
      const { data: existingClass } = await client
        .from('classes')
        .select('id')
        .eq('grade_number', grade)
        .eq('class_number', classNum)
        .maybeSingle();

      if (existingClass) {
        await window.ModalService.alert({
          title: '학급 중복 안내',
          message: `${className}은(는) 이미 등록되어 있는 학급입니다. 다른 학년/반을 선택해 주세요.`,
          tone: 'info'
        });
        return;
      }

      // 2. Insert new class via SupabaseService (uses Service Role Edge Function to bypass RLS)
      const newClass = await window.SupabaseService.createClass({ grade, classNumber: classNum });

      // 3. Auto-Assign existing students by student number prefix (e.g. 302XX)
      if (newClass && newClass.id) {
        try {
          await client
            .from('student_accounts')
            .update({ class_id: newClass.id })
            .like('student_number', `${studentPrefix}%`);
        } catch (enrollErr) {
          console.warn('Notice auto-assigning student_accounts:', enrollErr);
        }
      }

      this.closeClassModal();
      await window.ModalService.alert({
        title: '🎉 학급 개설 완료',
        message: `${className} 학급이 성공적으로 개설되었습니다.\n학번 ${studentPrefix}XX 시리즈 계정이 해당 학급에 자동으로 연결 및 배정됩니다.`,
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
      const { data: classProjects } = await client.from('class_projects').select('*,projects(*)');

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
            const attachedCP = (classProjects || []).find(cp => cp.class_id === c.id);
            const attachedProject = attachedCP?.projects;

            return `
              <div class="project-card" style="display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                  <div class="project-card-header">
                    <h4 class="project-card-title">🏫 ${c.grade_number}학년 ${c.class_number}반</h4>
                    <span class="project-status-badge ${attachedProject ? 'published' : ''}">
                      ${attachedProject ? '🟢 수업 연동' : '⏸️ 수업 미연결'}
                    </span>
                  </div>

                  <div class="project-card-body" style="margin-top: 14px;">
                    <div style="font-size: 0.95rem; font-weight: 700; color: var(--primary-700); margin-bottom: 6px;">
                      👥 소속 학생: ${studentCount}명 (학번 ${prefix}XX 시리즈)
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-main); margin-bottom: 4px;">
                      ${attachedProject ? `🗂️ 연결 프로젝트: <strong>${this.escapeHtml(attachedProject.title)}</strong>` : '연결된 수업 프로젝트가 없습니다.'}
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
    const result = await window.SupabaseService.listProjects();
    const projects = result.projects || [];
    if (!projects.length) {
      await window.ModalService.alert({ title: '프로젝트가 없습니다', message: '먼저 수업 설계에서 프로젝트를 만들어 주세요.', tone: 'info' });
      return;
    }
    const projectId = await window.ModalService.select({
      title: '프로젝트 불러오기',
      message: '학급에 연결할 프로젝트를 선택하세요.',
      label: '프로젝트 선택',
      options: projects.map(project => ({ value: project.id, label: project.title }))
    });
    if (projectId === null) return;
    const project = projects.find(item => item.id === projectId);
    const version = project?.project_versions?.[0];
    if (!version) return;
    await window.SupabaseService.attachProjectToClass(classId, version.id, project.title);
    await window.ModalService.alert({ title: '프로젝트 연결 완료', message: '학급에 프로젝트를 성공적으로 연결했습니다.', tone: 'success' });
    this.renderClassOperations();
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

window.TeacherAdminModule.showProjectListSubView = function () {
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
  const isPublished = project.visibility === 'published';
  if (actionsEl) {
    actionsEl.innerHTML = `
      <span class="project-status-badge ${isPublished ? 'published' : 'private'}">
        ${isPublished ? '🟢 공개 중' : '🔒 초안'}
      </span>
      ${!isPublished ? `
        <button class="btn btn-secondary" style="padding: 6px 14px; font-size: 0.85rem;" onclick="TeacherAdminModule.publishProject('${project.id}')">
          🚀 공개하기
        </button>
      ` : '<span style="font-size: 0.8rem; color: var(--success-text); font-weight: 600;">학급 연결 가능</span>'}
    `;
  }

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
    const stageBadges = stages.map(st => `<span style="font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; font-weight: 700; background: var(--primary-100); color: var(--primary-800); border: 1px solid var(--primary-200);">${st}</span>`).join(' ');

    return `
      <div class="lesson-accordion-item" id="lesson-item-${l.id}" data-id="${l.id}" data-order="${orderNum}" draggable="true">
        <div class="lesson-accordion-header" onclick="TeacherAdminModule.toggleAccordion('${l.id}')">
          <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
            <span class="drag-handle" title="드래그하여 위아래 순서 변경" onclick="event.stopPropagation();">⋮⋮</span>
            <div class="lesson-header-main">
              <div class="lesson-header-title">
                <span>${orderNum}차시 · ${this.escapeHtml(l.title)}</span>
                <span style="display: inline-flex; gap: 4px; align-items: center; margin-left: 6px;">${stageBadges}</span>
                <span class="role-tag" style="font-size: 0.75rem; font-weight: 500; padding: 2px 8px;">Gemini 질문 ${l.ai_question_limit || 12}회</span>
              </div>
              <div class="lesson-header-question">
                💡 ${this.escapeHtml(l.core_question || '핵심 질문 미입력')}
              </div>
            </div>
          </div>
          <div class="lesson-accordion-actions" onclick="event.stopPropagation();">
            <button class="btn btn-secondary" style="padding: 5px 12px; font-size: 0.8rem;" onclick="TeacherAdminModule.toggleAccordion('${l.id}')">
              ✏️ 편집
            </button>
            <button class="btn btn-danger" style="padding: 5px 10px; font-size: 0.8rem;" onclick="TeacherAdminModule.handleDeleteLesson('${l.id}')" title="차시 삭제">
              🗑️
            </button>
            <span class="accordion-chevron">▼</span>
          </div>
        </div>

        <div class="lesson-accordion-body">
          <form onsubmit="TeacherAdminModule.handleUpdateLesson(event, '${l.id}')" style="display: flex; flex-direction: column; gap: 14px;">
            <div class="form-group">
              <label class="form-label" style="font-weight: 600;">차시 제목</label>
              <input type="text" id="edit-title-${l.id}" class="form-input" value="${this.escapeHtml(l.title)}" required style="padding: 10px 12px;">
            </div>

            <div class="form-group">
              <label class="form-label" style="font-weight: 600;">학생용 핵심 발문 질문</label>
              <textarea id="edit-question-${l.id}" class="form-textarea" rows="3" required style="padding: 10px 12px; min-height: 80px;">${this.escapeHtml(l.core_question || '')}</textarea>
            </div>

            <div class="form-group">
              <label class="form-label" style="font-weight: 600;">포함할 THINK 단계 구성</label>
              <div style="display: flex; gap: 10px; flex-wrap: wrap; background: #ffffff; padding: 10px 14px; border: 1px solid var(--border-medium); border-radius: var(--radius-md);">
                ${['T','H','I','N','K'].map(st => {
                  const isChecked = stages.includes(st);
                  const labels = { T: '🟢 T (나의 처음 생각)', H: '🔵 H (친구와 생각 나누기)', I: '🟣 I (인공지능과 생각 넓히기)', N: '🟠 N (비판적으로 따져보기)', K: '🔴 K (나의 최종 생각)' };
                  return `
                    <label style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.85rem; font-weight: 600; cursor: pointer;">
                      <input type="checkbox" class="chk-edit-think-stage-${l.id}" value="${st}" ${isChecked ? 'checked' : ''} style="width: 15px; height: 15px; accent-color: var(--primary-600);"> ${labels[st]}
                    </label>
                  `;
                }).join('')}
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
              <div class="form-group">
                <label class="form-label" style="font-weight: 600;">학생별 AI 질문 제한 횟수</label>
                <input type="number" id="edit-limit-${l.id}" class="form-input" min="1" max="30" value="${l.ai_question_limit || 12}" required style="padding: 10px 12px;">
              </div>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px;">
              <button type="button" class="btn btn-secondary" onclick="TeacherAdminModule.toggleAccordion('${l.id}')">접기</button>
              <button type="submit" class="btn btn-primary" style="padding: 8px 16px; font-size: 0.9rem;">💾 수정 내용 저장</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }).join('');

  // Attach Drag & Drop handlers
  this.attachDragAndDropHandlers(container);
};

window.TeacherAdminModule.toggleAccordion = function (lessonId) {
  const item = document.getElementById(`lesson-item-${lessonId}`);
  if (item) {
    item.classList.toggle('expanded');
  }
};

window.TeacherAdminModule.showAddLessonForm = function () {
  const box = document.getElementById('addLessonFormBox');
  if (box) {
    box.style.display = 'block';
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('detailLessonTitle')?.focus();
  }
};

window.TeacherAdminModule.hideAddLessonForm = function () {
  const box = document.getElementById('addLessonFormBox');
  if (box) box.style.display = 'none';
};

window.TeacherAdminModule.handleAddLessonToProject = async function (e) {
  e.preventDefault();
  const title = document.getElementById('detailLessonTitle').value.trim();
  const coreQuestion = document.getElementById('detailCoreQuestion').value.trim();
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
      aiQuestionLimit: l.ai_question_limit
    })),
    {
      title,
      coreQuestion,
      thinkStages,
      aiQuestionLimit: aiLimit
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
  const aiLimit = parseInt(document.getElementById(`edit-limit-${lessonId}`).value) || 12;

  const selectedStages = [...document.querySelectorAll(`.chk-edit-think-stage-${lessonId}:checked`)].map(cb => cb.value);
  const thinkStages = selectedStages.length > 0 ? selectedStages : ['T', 'H', 'I', 'N', 'K'];

  const project = (this.cachedProjects || []).find(p => p.id === this.activeProjectId);
  if (!project) return;

  const existingLessons = project.project_versions?.[0]?.lesson_plans || [];
  const updatedLessons = existingLessons.map(l => {
    if (l.id === lessonId) {
      return { title, coreQuestion, thinkStages, aiQuestionLimit: aiLimit };
    }
    return {
      title: l.title,
      coreQuestion: l.core_question,
      thinkStages: l.think_stages || l.thinkStages || ['T', 'H', 'I', 'N', 'K'],
      aiQuestionLimit: l.ai_question_limit
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
      aiQuestionLimit: l.ai_question_limit
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
          aiQuestionLimit: found ? found.ai_question_limit : 12
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
