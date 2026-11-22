/* ==========================================================================
   Teacher Admin Module: Dashboard, Dynamic Project/Lesson Creation Wizard & AI Evidence
   ========================================================================== */

window.TeacherAdminModule = {
  navigation: {
    operation: { breadcrumb: '내 수업 › 학급 계획', title: '학급 계획', description: '학급별 수업 주제와 함께 진행할 THINK 단계를 계획합니다.' },
    live: { breadcrumb: '내 수업 › 실시간 수업', title: '실시간 수업', description: '학생과 같은 활동 화면으로 수업을 진행합니다.' },
    design: { breadcrumb: '내 수업 › 수업 설계', title: '수업 설계', description: '프로젝트 및 주제별 활동 계획을 작성하고 관리합니다.' },
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
    document.getElementById('teacherAppSection')?.classList.remove('teacher-live-focused');
    const nav = this.navigation[tabName];
    if (nav) {
      const bc = document.getElementById('teacherBreadcrumb');
      if (bc) bc.innerText = nav.breadcrumb;
      const titleEl = document.getElementById('teacherPageTitle');
      if (titleEl) titleEl.innerText = nav.title;
      const descEl = document.getElementById('teacherPageDescription');
      if (descEl) descEl.innerText = nav.description;
    }
    const livePanel = document.getElementById('panelTeacherLive');
    if (livePanel) livePanel.style.display = tabName === 'live' ? 'block' : 'none';
    document.getElementById('tabTeacherLive')?.classList.toggle('active', tabName === 'live');
    if (tabName === 'live') window.TeacherLiveModule.showClasses();
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

    if (tabName === 'eval') {
      this.renderEvalTable();
    } else if (tabName === 'students') {
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
      const projects = (result.projects || []).filter(p => !deletedIds.includes(p.id) && !deletedIds.includes(p.title));
      this.cachedProjects = projects;

      if (projects.length === 0) {
        el.innerHTML = `
          <div class="project-empty-state">
            <div class="project-empty-icon">📂</div>
            <div class="project-empty-title">등록된 프로젝트가 없습니다</div>
            <div class="project-empty-desc">새 프로젝트를 생성하여 수업 및 주제 계획을 확장해 보세요.</div>
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
          .map((lesson, index) => `<span class="project-lesson-chip">${this.escapeHtml(window.topicTitle(lesson.title, index + 1))}</span>`)
          .join('');
        const remainingLessons = Math.max(lessonCount - 3, 0);

        return `
              <div class="project-list-row">
              <div class="project-card" data-project-id="${p.id}" style="cursor: pointer;" onclick="TeacherAdminModule.openProjectDetailSubView('${p.id}')" title="클릭하여 주제별 활동 및 질문 상세 설계">
                <div class="project-card-header">
                    <h4 class="project-card-title">${this.escapeHtml(p.title)}</h4>
                    ${lessonCount ? `<div class="project-lesson-summary">${lessonSummary}${remainingLessons ? `<span class="project-lesson-more">+ ${remainingLessons}개 주제</span>` : ''}</div>` : '<span class="project-lesson-empty">주제를 추가해 주세요.</span>'}
                </div>
                <div class="project-card-details">
                  <div class="project-card-meta">
                    <span class="project-card-meta-item">📖 ${lessonCount}개 주제</span>
                  </div>
                </div>
                <div class="project-link-control" onclick="event.stopPropagation()"><span class="project-link-status">${p.is_published ? '학급 연결 가능' : '학급 연결 안 함'}</span><button type="button" class="project-link-switch ${p.is_published ? 'is-enabled' : ''}" aria-pressed="${p.is_published ? 'true' : 'false'}" aria-label="${p.is_published ? '학급 연결 가능 끄기' : '학급 연결 가능 켜기'}" onclick="TeacherAdminModule.setProjectPublished('${p.id}', ${!p.is_published})"></button></div>
                <button type="button" class="btn btn-danger project-delete-button" onclick="event.stopPropagation(); TeacherAdminModule.deleteProject('${p.id}', this.closest('.project-list-row').querySelector('.project-card-title').textContent)" title="프로젝트 삭제">🗑️</button>
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
    if (container) container.innerHTML = '<div style="padding: 32px; text-align: center; color: var(--text-subtle);">학급 계획 상세 정보를 불러오는 중입니다...</div>';


    try {
      const client = window.SupabaseService.getClient();
      const { data: cls } = await client.from('classes').select('*').eq('id', classId).single();
      if (breadcrumb && cls) {
        breadcrumb.innerText = `${this.navigation.operation.breadcrumb} › ${cls.grade_number}학년 ${cls.class_number}반 · ${cls.subject_name || '미지정'}`;
      }

      // Fetch attached project for this class
      const detachedIds = JSON.parse(localStorage.getItem('think_detached_class_projects') || '[]');
      const deletedProjects = JSON.parse(localStorage.getItem('think_deleted_projects') || '[]');
      const { data: rawClassProjects } = await client
        .from('class_projects')
        .select('*,projects(*,project_versions(*,lesson_plans(*)))')
        .eq('class_id', classId)
        .order('attached_at', { ascending: false });

      const classProjects = (rawClassProjects || []).filter(cp =>
        !detachedIds.includes(cp.id) &&
        !deletedProjects.includes(cp.source_project_id) &&
        !deletedProjects.includes(cp.projects?.id) &&
        !deletedProjects.includes(cp.title) &&
        !deletedProjects.includes(cp.projects?.title)
      );

      const { data: lessonPlans, error: planError } = await client.from('class_lesson_plans').select('*').eq('class_id', classId);
      if (planError) throw planError;

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
            <div class="project-empty-desc">학급 연결 가능 프로젝트를 이 학급에 연결하면 사용할 주제와 THINK 단계를 학급별로 계획할 수 있습니다.</div>
            <button class="btn btn-primary" onclick="TeacherAdminModule.attachProjectToActiveClassPrompt()">프로젝트 연결하기</button>
          </div>
        `;
        return;
      }

      container.innerHTML = `<p>수업에 사용할 주제와 단계를 체크하면 자동 저장됩니다. 활동은 실시간 수업에서 열 수 있습니다.</p>
        ${activeProjects.map(project => `<section class="class-project-card-group class-project-lesson-section" style="margin:20px 0;padding:20px;border:1px solid var(--border-light);border-radius:16px">
          <h3>${this.escapeHtml(project.title)}</h3>
          ${sortedLessons.filter(l => l.projectId === project.classProjectId).map(l => {
            const plan = (lessonPlans || []).find(p => p.lesson_plan_id === l.id);
            return window.TeacherLiveModule.planCard(classId, l, plan, cls?.active_lesson_plan_id === l.id);
          }).join('')}
        </section>`).join('')}`;
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

      let query = client.from('classes')
        .select('id,class_code,grade_number,class_number,subject_name,active_lesson_plan_id,teacher_id')
        .order('grade_number')
        .order('class_number')
        .order('subject_name');
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
      const deletedProjects = JSON.parse(localStorage.getItem('think_deleted_projects') || '[]');
      const { data: rawClassProjects } = await client
        .from('class_projects')
        .select('*,projects(*,project_versions(*,lesson_plans(*)))')
        .order('attached_at', { ascending: false });
      const classProjects = (rawClassProjects || []).filter(cp =>
        !detachedIds.includes(cp.id) &&
        !deletedProjects.includes(cp.source_project_id) &&
        !deletedProjects.includes(cp.projects?.id) &&
        !deletedProjects.includes(cp.title) &&
        !deletedProjects.includes(cp.projects?.title)
      );

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
                    <span class="project-card-meta-item" onclick="TeacherAdminModule.openClassDetailSubView('${c.id}')" style="cursor: pointer; color: var(--primary-700); font-weight: 700;">수업 계획 설정 →</span>
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
      } catch (err) { }
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
      const deletedProjects = JSON.parse(localStorage.getItem('think_deleted_projects') || '[]');
      const { data: rawClassProjects } = await client.from('class_projects').select('*,projects(*)');
      const classProjects = (rawClassProjects || []).filter(cp =>
        !detachedIds.includes(cp.id) &&
        !deletedProjects.includes(cp.source_project_id) &&
        !deletedProjects.includes(cp.projects?.id) &&
        !deletedProjects.includes(cp.title) &&
        !deletedProjects.includes(cp.projects?.title)
      );

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
                      학급 계획으로 이동 →
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
    const deletedProjects = JSON.parse(localStorage.getItem('think_deleted_projects') || '[]');

    const result = await window.SupabaseService.listProjects();
    const projects = (result.projects || []).filter(project => project.is_published && !deletedProjects.includes(project.id) && !deletedProjects.includes(project.title));
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
          badge: `📖 ${lessons.length}개 주제`,
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
          } catch (e) { }
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
    const container = document.getElementById('evalContent');
    const view = document.createElement('div');
    container.replaceChildren(view);
    view.textContent = '담당 학급의 주제를 불러오는 중입니다…';
    try {
      const { data, error } = await window.SupabaseService.getClient().rpc('teacher_class_progress');
      if (error) throw error;
      if (!data?.length) {
        view.textContent = '등록된 담당 학급이 없습니다.';
        return;
      }
      const classes = new Map();
      for (const row of data) {
        if (!classes.has(row.class_id)) classes.set(row.class_id, []);
        classes.get(row.class_id).push(row);
      }
      view.innerHTML = `<div class="class-progress-toolbar">
        <p>단계별 숫자는 제출 인원입니다. 누르면 학생별 기록을 볼 수 있습니다.</p>
        <button type="button" class="btn btn-secondary">현황 새로고침</button>
      </div>
      <div class="class-progress-scroll">
        <table class="class-progress-table">
          <colgroup><col class="class-progress-class-col"><col class="class-progress-active-col"><col class="class-progress-open-col"><col class="class-progress-reached-col"><col></colgroup>
          <thead><tr><th scope="col">학급</th><th scope="col">진행 중인 주제</th><th scope="col">작성 가능 단계</th><th scope="col">제출이 있는 주제 · 단계</th><th scope="col">주제별 제출 인원</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>`;
      view.querySelector('button').onclick = () => this.renderEvalTable();
      const body = view.querySelector('tbody');
      for (const rows of classes.values()) {
        const first = rows[0];
        const lessons = rows.filter(row => row.lesson_id);
        const active = lessons.find(row => row.active);
        const tr = body.insertRow();
        const label = row => window.topicTitle(row.lesson_title, row.lesson_order);
        const classroom = tr.insertCell();
        const className = document.createElement('strong');
        className.textContent = first.grade + '학년 ' + first.room + '반';
        const classMeta = document.createElement('span');
        classMeta.className = 'class-progress-muted';
        classMeta.textContent = first.subject + ' · ' + first.roster + '명';
        classroom.append(className, classMeta);
        const activeTopic = tr.insertCell();
        activeTopic.textContent = active ? label(active) : '열린 주제 없음';
        activeTopic.className = active ? 'class-progress-active' : 'class-progress-muted';
        const writable = tr.insertCell();
        writable.textContent = active?.writable?.join(' · ') || '없음';
        if (!active?.writable?.length) writable.className = 'class-progress-muted';
        const reached = tr.insertCell();
        const byProject = new Map();
        for (const lesson of lessons) {
          const stage = (lesson.stages || []).filter(code => lesson.submissions[code] > 0).at(-1);
          if (stage) byProject.set(lesson.project_title, { lesson, stage });
        }
        for (const [project, { lesson, stage }] of byProject) {
          const line = document.createElement('div');
          line.textContent = project + ' · ' + lesson.lesson_order + '주제 ' + stage + ' (' + lesson.submissions[stage] + '명 제출)';
          reached.append(line);
        }
        if (!byProject.size) {
          reached.textContent = '아직 제출 없음';
          reached.className = 'class-progress-muted';
        }
        const counts = tr.insertCell();
        if (!lessons.length) { counts.textContent = '연결된 주제 없음'; continue; }
        const select = document.createElement('select');
        select.className = 'form-select';
        select.setAttribute('aria-label', className.textContent + ' ' + first.subject + ' 제출 인원을 볼 주제');
        for (const lesson of lessons) select.add(new Option(lesson.project_title + ' · ' + label(lesson)));
        const latest = [...byProject.values()].at(-1)?.lesson;
        select.selectedIndex = lessons.indexOf(active || latest || lessons[0]);
        const links = document.createElement('div');
        links.className = 'class-progress-stage-links';
        const showCounts = () => {
          links.replaceChildren();
          const lesson = lessons[select.selectedIndex];
          for (const stage of lesson.stages || []) {
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'btn btn-secondary';
            button.textContent = stage + ' ' + (lesson.submissions[stage] || 0) + '명';
            button.title = stage + ' 단계 학생별 기록 보기';
            button.onclick = async () => {
              this.switchTab('operation');
              await this.openClassDetailSubView(first.class_id);
              await this.openTeacherStageResponses(first.class_id, lesson.lesson_id, stage);
            };
            links.append(button);
          }
        };
        select.onchange = showCounts;
        const controls = document.createElement('div');
        controls.className = 'class-progress-controls';
        controls.append(select, links);
        counts.append(controls);
        showCounts();
      }
    } catch (error) {
      view.textContent = '수업 현황을 불러오지 못했습니다. ' + error.message;
    }
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
      title: `${lessonNum}주제 · ${lessonTitle}`,
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
    alert(`🎉 새로운 주제가 Supabase DB에 등록되었습니다!\n- 프로젝트: ${projTitle}\n- 주제: ${newLesson.title}\n수업 진입 PIN 번호: 782901`);

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

window.TeacherAdminModule.bindProjectTitleEditor = function (project) {
  const input = document.getElementById('projectDetailTitle');
  const button = document.getElementById('projectTitleSave');
  input.value = project.title;
  input.readOnly = false;
  const sync = () => {
    const title = input.value.trim();
    const changed = title !== project.title;
    button.hidden = !changed;
    button.disabled = !title || input.readOnly;
    if (changed) this.lessonDrafts.set('project-title', { dirty: true });
    else this.lessonDrafts.delete('project-title');
  };
  input.oninput = sync;
  button.onclick = async () => {
    const title = input.value.trim();
    if (input.readOnly || !title || title === project.title) return;
    input.readOnly = true;
    sync();
    try {
      const { data, error } = await window.SupabaseService.getClient().rpc('rename_teaching_project', {
        p_id: project.id, p_previous: project.title, p_title: title
      });
      if (error) throw error;
      project.title = data;
      if (this.activeProjectId === project.id) input.value = data;
    } catch (error) {
      await window.ModalService.alert({ title: '이름 변경 실패', message: error.message, tone: 'danger' });
    } finally {
      if (this.activeProjectId === project.id) {
        input.readOnly = false;
        sync();
      }
    }
  };
  sync();
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

  const versionInput = document.getElementById('detailVersionId');
  if (versionInput) versionInput.value = versionId;

  // Render Accordion List
  this.renderLessonAccordionList(lessons);
  this.bindProjectTitleEditor(project);

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
        <div class="project-empty-title">등록된 주제가 없습니다</div>
        <div class="project-empty-desc">상단의 '＋ 새 주제 추가' 버튼을 눌러 첫 주제 활동과 핵심 발문 질문을 등록하세요.</div>
        <button class="btn btn-primary" onclick="TeacherAdminModule.showAddLessonForm()">＋ 첫 주제 추가하기</button>
      </div>
    `;
    return;
  }

  const sorted = [...lessons].sort((a, b) => (a.lesson_order || 0) - (b.lesson_order || 0));

  container.innerHTML = sorted.map((l, i) => {
    const orderNum = l.lesson_order || (i + 1);
    const stages = l.think_stages || l.thinkStages || ['T', 'H', 'I', 'N', 'K'];

    return `
      <div class="lesson-accordion-item expanded" id="lesson-item-${l.id}" data-id="${l.id}" data-order="${orderNum}">
        <div class="lesson-accordion-header" onclick="TeacherAdminModule.toggleAccordion('${l.id}')">
          <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
            <span class="drag-handle" draggable="true" title="드래그하여 위아래 순서 변경" onclick="event.stopPropagation();">⋮⋮</span>
            <span class="role-tag" style="background: var(--primary-600); color: #ffffff; font-weight: 800; font-size: 0.8rem; padding: 3px 10px; border-radius: 6px;">${orderNum}주제</span>
            <input type="text" id="edit-title-${l.id}" form="lesson-form-${l.id}" class="lesson-header-title" aria-label="${orderNum}주제 제목" title="주제 제목 수정" value="${this.escapeHtml(window.topicTitle(l.title))}" required onclick="event.stopPropagation()" onfocus="this.closest('.lesson-accordion-item').classList.add('expanded')">
          </div>
          <div class="lesson-accordion-actions" onclick="event.stopPropagation();">
            <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.78rem; color: var(--danger-text);" onclick="TeacherAdminModule.handleDeleteLesson('${l.id}')" title="주제 삭제">
              🗑️ 주제 삭제
            </button>
            <span class="accordion-chevron" style="font-size: 0.75rem; color: var(--text-subtle); padding: 4px;">▼</span>
          </div>
        </div>

        <div class="lesson-accordion-body">
          <form class="lesson-compact-form" id="lesson-form-${l.id}" data-draft-key="lesson-${l.id}" onsubmit="TeacherAdminModule.handleUpdateLesson(event, '${l.id}')">

            <label class="lesson-question-row">
              <span>핵심 질문</span>
              <textarea id="edit-question-${l.id}" class="form-textarea" rows="1" required>${this.escapeHtml(l.core_question || '')}</textarea>
            </label>

            <label class="lesson-background-row">
              <span>배경 설명 (선택)</span>
              <textarea id="edit-background-${l.id}" class="form-textarea" rows="3" placeholder="질문을 이해하는 데 필요한 상황·조건·사례를 입력하세요. 학생은 ‘배경 설명 보기’에서 확인합니다.">${this.escapeHtml(l.background_description || '')}</textarea>
            </label>

            <div class="lesson-ai-settings-row">
              <label class="lesson-inline-field lesson-mode-field">
                <span>AI 응답 모드</span>
                <select id="edit-ai-mode-${l.id}" class="form-select">
                  <option value="THOUGHT_PROVOKING" ${(l.ai_response_mode || 'THOUGHT_PROVOKING') === 'THOUGHT_PROVOKING' ? 'selected' : ''}>사고 촉진형 (학생의 근거와 관점 확장)</option>
                  <option value="GENERAL" ${l.ai_response_mode === 'GENERAL' ? 'selected' : ''}>일반 대화형 (개념 직접 설명)</option>
                </select>
              </label>
              <label class="lesson-inline-field lesson-limit-field">
                <span>AI 질문</span>
                <input type="number" id="edit-limit-${l.id}" class="form-input" min="1" max="30" value="${l.ai_question_limit || 20}" required>
                <em>회</em>
              </label>
            </div>

            ${this.renderAiActivitySettings("edit-" + l.id, l.ai_reference)}
            ${this.renderReviewResource("edit-"+l.id,l.review_resource)}
            <div class="lesson-think-row">
              <div class="lesson-think-options">
                ${['T', 'H', 'I', 'N', 'K'].map(st => {
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
    panel.innerHTML = ['T', 'H', 'I', 'N', 'K'].map(stage => `<span class="think-stage-access"><b>${stage}</b>${[['hidden', '비공개'], ['read_only', '읽기 전용'], ['writable', '작성 가능']].map(([mode, label]) => `<button type="button" class="${access[stage] === mode ? 'active' : ''}" data-stage="${stage}" data-mode="${mode}">${label}</button>`).join('')}</span>`).join('');
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

window.TeacherAdminModule.openTeacherStageResponses = function (classId, lessonId, stageCode, initialTab = 'writing') {
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
    breadcrumb.innerText = `내 수업 › 학급 계획 › 학생 작성 글 보기 (${stageNameMap[stageCode] || stageCode})`;
  }

  if (container && window.TeacherStageResponsesModule?.renderInPageContainer) {
    window.TeacherStageResponsesModule.renderInPageContainer(container, classId, lessonId, stageCode, initialTab);
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
    // Collapsing preserves the form and its unsaved input.
    item.classList.toggle('expanded');
  }
};

window.TeacherAdminModule.lessonDrafts = new Map();

window.TeacherAdminModule.getLessonDraftValue = function (form) {
  return JSON.stringify([...form.elements].filter(field => field.matches('input, textarea, select')).map(field => ({
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
      if (saveButton) saveButton.disabled = !draft.dirty || form.dataset.saving === 'true';
      form.classList.toggle('has-unsaved-changes', draft.dirty);
    };
    [...form.elements].filter(field => field.matches('input, textarea, select')).forEach(field => {
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
        <span class="role-tag">${nextOrder}주제</span>
        <strong>새 주제</strong>
      </div>
      <form class="lesson-compact-form" data-draft-key="new-lesson" onsubmit="TeacherAdminModule.handleAddLessonToProject(event)">
        <input type="hidden" id="detailVersionId" value="">
        <div class="lesson-meta-row">
          <label class="lesson-inline-field lesson-title-field">
            <span>주제 제목</span>
            <input type="text" id="detailLessonTitle" class="form-input" placeholder="예: 유전과 형질" required>
          </label>
        </div>
        <label class="lesson-question-row">
          <span>핵심 질문</span>
          <textarea id="detailCoreQuestion" class="form-textarea" rows="1" placeholder="학생들이 탐구할 핵심 질문을 입력하세요." required></textarea>
        </label>
        <label class="lesson-background-row">
          <span>배경 설명 (선택)</span>
          <textarea id="detailBackgroundDescription" class="form-textarea" rows="3" placeholder="질문을 이해하는 데 필요한 상황·조건·사례를 입력하세요. 학생은 ‘배경 설명 보기’에서 확인합니다."></textarea>
        </label>
        <div class="lesson-ai-settings-row">
          <label class="lesson-inline-field lesson-mode-field">
            <span>AI 응답 모드</span>
            <select id="detailAiMode" class="form-select">
              <option value="THOUGHT_PROVOKING">사고 촉진형 (학생의 근거와 관점 확장)</option>
              <option value="GENERAL">일반 대화형 (개념 직접 설명)</option>
            </select>
          </label>
          <label class="lesson-inline-field lesson-limit-field">
            <span>AI 질문</span>
            <input type="number" id="detailAiLimit" class="form-input" min="1" max="30" value="20" required>
            <em>회</em>
          </label>
        </div>
        ${this.renderAiActivitySettings("new-lesson")}
        ${this.renderReviewResource("new-lesson")}
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
  const backgroundDescription = document.getElementById('detailBackgroundDescription').value.trim();
  const aiResponseMode = document.getElementById('detailAiMode').value;
  const aiLimit = parseInt(document.getElementById('detailAiLimit').value) || 20;

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
      backgroundDescription: l.background_description || '',
      reviewResource: l.review_resource || '',
      aiReference: l.ai_reference || '',
      thinkStages: l.think_stages || l.thinkStages || ['T', 'H', 'I', 'N', 'K'],
      aiQuestionLimit: l.ai_question_limit,
      aiResponseMode: l.ai_response_mode || 'THOUGHT_PROVOKING'
    })),
    {
      title,
      coreQuestion,
      backgroundDescription,
      reviewResource: document.getElementById('new-lesson-review-resource').value.trim(),
      aiReference: document.getElementById('new-lesson-ai-reference').value.trim(),
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
      alert(`주제 저장 실패: ${res.error}`);
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
      document.getElementById('detailBackgroundDescription').value = '';
    }
  } catch (err) {
    console.error('Error adding lesson:', err);
    alert(`주제 저장 중 오류가 발생했습니다: ${err.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = '＋ 주제 저장 및 추가'; }
  }
};

window.TeacherAdminModule.handleUpdateLesson = async function (e, lessonId) {
  e.preventDefault();
  const title = document.getElementById(`edit-title-${lessonId}`).value.trim();
  const coreQuestion = document.getElementById(`edit-question-${lessonId}`).value.trim();
  const reviewResource = document.getElementById(`edit-${lessonId}-review-resource`).value.trim();
  const aiReference = document.getElementById(`edit-${lessonId}-ai-reference`).value.trim();
  const backgroundDescription = document.getElementById(`edit-background-${lessonId}`).value.trim();
  const aiResponseMode = document.getElementById(`edit-ai-mode-${lessonId}`).value;
  const aiLimit = parseInt(document.getElementById(`edit-limit-${lessonId}`).value) || 20;

  const selectedStages = [...document.querySelectorAll(`.chk-edit-think-stage-${lessonId}:checked`)].map(cb => cb.value);
  const thinkStages = selectedStages.length > 0 ? selectedStages : ['T', 'H', 'I', 'N', 'K'];

  const project = (this.cachedProjects || []).find(p => p.id === this.activeProjectId);
  if (!project) return;

  const lesson = project.project_versions?.[0]?.lesson_plans?.find(row => row.id === lessonId);
  if (!lesson) return;
  const form = e.currentTarget;
  const button = form.querySelector('.lesson-save-button');
  if (!title || !coreQuestion) { alert('주제 제목과 핵심 질문을 입력해 주세요.'); return; }
  if (form.dataset.saving === 'true') return;
  const draft = this.lessonDrafts.get(form.dataset.draftKey);
  const submittedValue = this.getLessonDraftValue(form);
  form.dataset.saving = 'true';
  button.disabled = true;
  try {
    const { error } = await window.SupabaseService.getClient().rpc('edit_teaching_lesson', {
      p_id: lessonId, p_title: title, p_question: coreQuestion, p_mode: aiResponseMode,
      p_limit: aiLimit, p_stages: thinkStages, p_background: backgroundDescription, p_ai_reference: aiReference,
      ...(reviewResource !== (lesson.review_resource || '') ? { p_review_resource: reviewResource } : {})
    });
    if (error) throw error;
    Object.assign(lesson, {
      title, core_question: coreQuestion, background_description: backgroundDescription, ai_reference: aiReference, review_resource: reviewResource, ai_response_mode: aiResponseMode,
      ai_question_limit: aiLimit, think_stages: thinkStages
    });

    draft.initialValue = submittedValue;
    await window.ModalService.alert({ title: '저장 완료', message: '주제 변경 사항을 저장했습니다.', tone: 'success' });
  } catch (error) {
    await window.ModalService.alert({ title: '주제 저장 실패', message: error.message, tone: 'danger' });
  } finally {
    delete form.dataset.saving;
    draft.dirty = this.getLessonDraftValue(form) !== draft.initialValue;
    button.disabled = !draft.dirty;
    form.classList.toggle('has-unsaved-changes', draft.dirty);
  }
};

window.TeacherAdminModule.handleDeleteLesson = async function (lessonId) {
  const confirmDelete = confirm('이 주제를 삭제하시겠습니까?');
  if (!confirmDelete) return;

  const project = (this.cachedProjects || []).find(p => p.id === this.activeProjectId);
  if (!project) return;

  const existingLessons = project.project_versions?.[0]?.lesson_plans || [];
  const updatedLessons = existingLessons
    .filter(l => l.id !== lessonId)
    .map(l => ({
      title: l.title,
      coreQuestion: l.core_question,
      backgroundDescription: l.background_description || '',
      reviewResource: l.review_resource || '',
      aiReference: l.ai_reference || '',
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
    alert(`주제 삭제 중 오류가 발생했습니다: ${err.message}`);
  }
};

window.TeacherAdminModule.attachDragAndDropHandlers = function (container) {
  let draggedItem = null;

  const items = container.querySelectorAll('.lesson-accordion-item');
  items.forEach(item => {
    item.querySelector('.drag-handle').addEventListener('dragstart', (e) => {
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
          backgroundDescription: found ? (found.background_description || '') : '',
          reviewResource: found?.review_resource || '',
          aiReference: found?.ai_reference || '',
          thinkStages: found ? (found.think_stages || found.thinkStages || ['T', 'H', 'I', 'N', 'K']) : ['T', 'H', 'I', 'N', 'K'],
          aiQuestionLimit: found ? found.ai_question_limit : 20,
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
  const client = window.SupabaseService?.getClient ? window.SupabaseService.getClient() : null;
  const detachedIds = JSON.parse(localStorage.getItem('think_detached_class_projects') || '[]');

  let attachedClasses = [];
  let attachedClassProjects = [];

  if (client) {
    try {
      const { data: rawCP } = await client
        .from('class_projects')
        .select('*, classes(*)');

      attachedClassProjects = (rawCP || []).filter(cp => {
        const isTargetProject = (cp.source_project_id === projectId) || (cp.project_id === projectId) || (cp.projects?.id === projectId);
        return isTargetProject && !detachedIds.includes(cp.id);
      });

      attachedClasses = attachedClassProjects
        .map(cp => cp.classes ? `${cp.classes.grade_number}학년 ${cp.classes.class_number}반 (${cp.classes.subject_name || '미지정'})` : null)
        .filter(Boolean);
    } catch (e) {
      console.warn("Error checking attached classes:", e);
    }
  }

  let confirmed = false;
  if (attachedClasses.length > 0) {
    const classListStr = attachedClasses.map(c => `• ${c}`).join('\n');
    const message = `"${projectTitle}" 프로젝트는 현재 아래 학급에 연결되어 운영 중입니다:\n\n${classListStr}\n\n프로젝트를 삭제하면 해당 학급과의 연결도 자동으로 해제됩니다. 정말로 삭제하시겠습니까?`;

    if (window.ModalService && window.ModalService.confirm) {
      confirmed = await window.ModalService.confirm({
        title: '프로젝트 삭제 및 연결 해제 확인',
        message: message,
        confirmLabel: '삭제 및 연결 해제',
        tone: 'danger'
      });
    } else {
      confirmed = confirm(message);
    }
  } else {
    const message = `"${projectTitle}" 프로젝트를 정말로 삭제하시겠습니까?\n삭제된 프로젝트는 목록에서 제거됩니다.`;
    if (window.ModalService && window.ModalService.confirm) {
      confirmed = await window.ModalService.confirm({
        title: '프로젝트 삭제 확인',
        message: message,
        confirmLabel: '삭제하기',
        tone: 'danger'
      });
    } else {
      confirmed = confirm(message);
    }
  }

  if (!confirmed) return;

  const deletedIds = JSON.parse(localStorage.getItem('think_deleted_projects') || '[]');
  if (projectId && !deletedIds.includes(projectId)) {
    deletedIds.push(projectId);
  }
  if (projectTitle && !deletedIds.includes(projectTitle)) {
    deletedIds.push(projectTitle);
  }
  localStorage.setItem('think_deleted_projects', JSON.stringify(deletedIds));

  for (const cp of attachedClassProjects) {
    if (!detachedIds.includes(cp.id)) {
      detachedIds.push(cp.id);
    }
    if (window.SupabaseService && window.SupabaseService.detachProjectFromClass) {
      try {
        await window.SupabaseService.detachProjectFromClass(cp.id);
      } catch (e) {
        console.warn("Notice detaching class project:", e.message);
      }
    }
  }
  localStorage.setItem('think_detached_class_projects', JSON.stringify(detachedIds));

  if (window.SupabaseService && window.SupabaseService.deleteProject) {
    try {
      await window.SupabaseService.deleteProject(projectId, projectTitle);
    } catch (e) {
      console.warn("DB project delete notice:", e.message);
    }
  }

  await this.renderProjects();
  await this.renderClassOperations();
  await this.renderClassManagement();
  if (this.currentActiveClassId) {
    await this.openClassDetailSubView(this.currentActiveClassId);
  }
};

window.TeacherAdminModule.removeDuplicateDummyClass = async function () {
  try {
    const client = window.SupabaseService.getClient();
    const { data: classes } = await client.from('classes').select('id,grade_number,class_number,subject_name,active_lesson_plan_id').eq('grade_number', 3).eq('class_number', 1);
    if (!classes || classes.length <= 1) {
      alert("중복된 학급이 없습니다. 현재 3학년 1반 학급이 1개만 존재합니다.");
      return;
    }
    let targetId = "899a0eaa-09f8-4a74-93b9-93bb52f2fc16";
    const foundDummy = classes.find(c => c.id === targetId);
    if (!foundDummy) {
      for (const c of classes) {
        if (c.active_lesson_plan_id === 'cdc3c645-30f8-4320-99e6-0f269936afe8') {
          targetId = c.id;
          break;
        }
      }
    }
    const confirmed = confirm("오른쪽에 새로 생겼던 '사람에게 나타나는 특징' 중복 학급을 삭제하고 정리하시겠습니까?\n(왼쪽 '유전자 검사' 수업은 안전하게 유지됩니다)");
    if (!confirmed) return;

    await window.SupabaseService.deleteClass(targetId);
    alert("✨ 중복 학급이 깔끔하게 삭제되었습니다!\n학생 화면을 새로고침하면 왼쪽 수업 카드만 정상적으로 표시됩니다.");
    await this.renderOperationOverview();
    await this.renderClassOperations();
  } catch (err) {
    alert(`중복 학급 삭제 실패: ${err.message}`);
  }
};

window.TeacherAdminModule.seedGeneticsLesson1TAnswers = async function () {
  try {
    const client = window.SupabaseService.getClient();
    const { data: lessons } = await client.from('lesson_plans').select('id,title,core_question').or('id.eq.f59c1755-7c64-4820-bdc1-81cfd02f3da9,core_question.ilike.%유전자 검사%').limit(1);
    const targetLesson = lessons?.[0];
    if (!targetLesson) {
      alert("유전자 검사 맞춤 설계 1주제 계획을 찾을 수 없습니다.");
      return;
    }
    const lessonId = targetLesson.id;
    const tLabels = ["① 나의 생각", "② 생각한 이유", "③ 이유 설명하기", "④ 더 궁금한 점", "⑤ 알아볼 방법"];
    const dummy30 = [
      {
        num: "01", name: "강민준", t: [
          "어릴 때 유전자 검사로 적성을 파악해 집중적으로 교육하는 것에 찬성한다.",
          "운동선수나 음악가처럼 특정 신체적·선천적 재능이 중요한 분야는 어릴 때 일찍 발견해 훈련할수록 성공 확률이 높아지기 때문이다.",
          "모든 것을 다 잘하려고 애쓰기보다 자신이 타고난 강점에 집중하면 시간과 노력을 아끼고 전문성을 극대화할 수 있다.",
          "유전자 검사에서 음악적 재능이 낮게 나왔지만 열정이 넘치는 아이의 경우, 교육 기회를 아예 박탈당하지 않을까?",
          "유전자 결과와 실제 훈련 성과를 장기간 추적 조사한 스포츠 과학 연구 사례를 찾아본다."
        ]
      },
      {
        num: "02", name: "김서연", t: [
          "초등학생 때 유전자 검사 결과만으로 학습 분야를 미리 정하는 것에 반대한다.",
          "유전자는 발현될 가능성일 뿐이고 사람의 뇌는 후천적인 경험과 끈기에 따라 끊임없이 변화하는데, 어릴 때 한계를 그어버릴 수 있기 때문이다.",
          "초등학생 시기는 다양한 경험을 통해 자신이 진짜 좋아하는 것을 발견할 자유가 보장되어야 한다.",
          "어릴 때 부모가 유전자 결과만 믿고 아이의 다른 관심사를 차단했을 때 아이의 정서에 미치는 부작용은 무엇일까?",
          "뇌의 가소성과 후천적 학습 효과를 다룬 교육심리학 서적과 뇌과학 논문을 읽어본다."
        ]
      },
      {
        num: "03", name: "박도윤", t: [
          "절대적인 기준으로 삼는 것은 반대하지만, 아이가 무엇을 배울지 고민할 때 보조적인 참고 자료로 활용하는 것에는 찬성한다.",
          "무작정 여러 학원을 돌며 스트레스를 받는 것보다, 아이의 신체적·생리적 특성을 이해하고 시작하면 도움이 될 수 있기 때문이다.",
          "단, 결정은 아이의 흥미가 우선이어야 하며 언제든지 다른 분야로 바꿀 수 있는 자유가 전제되어야 한다.",
          "학부모들이 유전자 검사 결과를 맹신하여 아이에게 강요하지 않도록 제도적으로 보호할 장치가 있을까?",
          "해외에서 유전자 검사를 진로 교육에 활용할 때 적용하는 윤리 가이드라인을 검색해 본다."
        ]
      },
      {
        num: "04", name: "이지아", t: [
          "아무리 과학적 기술이라도 아이가 꿈꿀 권리와 스스로 선택할 행복을 대신 결정할 수는 없으므로 반대한다.",
          "초등학교 때는 그림도 그리고 악기도 다루고 운동도 해보며 스스로 부딪혀보는 과정 자체가 성장의 중요한 즐거움이기 때문이다.",
          "성공과 효율성만 따져 어릴 때부터 진로를 고정하면 아이는 부모와 유전자의 아바타처럼 살게 되어 불행해진다.",
          "유전자 결과대로 자란 아이들이 성인이 되었을 때 자신의 삶에 대해 만족하는지 연구된 통계가 있을까?",
          "조기 영재 교육을 받았던 사람들의 성인기 삶의 만족도와 자아실현에 대한 다큐멘터리를 찾아본다."
        ]
      },
      {
        num: "05", name: "정시우", t: [
          "자신에게 맞지 않는 분야에서 겪는 불필요한 좌절을 줄일 수 있으므로 찬성한다.",
          "수학적 사고력이 부족한 아이에게 무리하게 고난도 수학 과외를 시키는 것보다, 뛰어난 언어 유전자를 살리는 것이 훨씬 효율적이기 때문이다.",
          "자신이 잘하는 영역에서 성취감을 빠르게 맛보면 공부에 대한 자신감과 자존감도 함께 높아질 수 있다.",
          "초등학교 시기의 유전자 검사 결과가 사춘기를 지나 성인이 될 때까지 얼마나 높은 정확도를 유지할까?",
          "유전자 분석 기관들의 신뢰도 평가 보고서와 유전율(Heritability) 통계 자료를 분석해 본다."
        ]
      },
      {
        num: "06", name: "최하은", t: [
          "비싼 유전자 검사와 맞춤형 사교육을 받을 수 있는 부유층만 혜택을 보아 교육 불평등이 심해질 것이므로 반대한다.",
          "태어날 때부터 '우수한 유전자'와 '평범한 유전자'로 아이들을 조기에 서열화하고 낙인찍는 부작용이 크기 때문이다.",
          "학교 현장에서 유전자 검사 결과에 따라 반을 나누거나 아이들을 차별하는 잔인한 문화가 생겨날 수 있다.",
          "유전자 정보가 학교 생활기록부나 사교육 시장에 유출되었을 때 발생할 개인정보 침해 문제는 어떻게 막을까?",
          "유전자 차별 금지법(GINA 등)이 교육 분야에 어떻게 적용되고 있는지 법률 사례를 조사해 본다."
        ]
      },
      {
        num: "07", name: "조하준", t: [
          "모든 학생에게 똑같은 주입식 교육을 강요하는 현행 시스템의 한계를 극복하기 위해 유전자 맞춤 교육이 필요하다.",
          "아이마다 스트레스 저항력, 기억력, 체력 특성이 다 다른데, 이를 과학적으로 파악해 알맞은 학습 속도를 맞춰줄 수 있기 때문이다.",
          "진로를 좁히는 용도가 아니라, 아이의 체질에 맞는 학습 환경(공부 시간, 휴식 주기)을 설계해 주는 용도라면 큰 도움이 된다.",
          "공부 분야뿐만 아니라 수면 패턴이나 집중력 유지 시간 같은 신체적 리듬도 유전자로 정확히 알 수 있을까?",
          "행동유전학에서 밝혀낸 유전자와 수면 패턴, 집중력 사이의 상관관계 논문을 읽어본다."
        ]
      },
      {
        num: "08", name: "윤서윤", t: [
          "유전자가 사람의 미래를 결정한다는 잘못된 믿음(유전자 결정론)에 빠질 수 있으므로 반대한다.",
          "아인슈타인이나 에디슨 같은 위인들도 어릴 때는 문제아 취급을 받았는데, 유전자 검사로 재단했다면 위대한 발견은 없었을 것이다.",
          "'너는 공부 유전자가 없으니 기술이나 배워라'는 식의 체념을 아이에게 심어주어 스스로 노력을 포기하게 만들 위험이 크다.",
          "부모나 교사의 기대와 믿음이 학생의 성적을 올린다는 '피그말리온 효과'와 유전자 낙인 효과를 비교하면 어떨까?",
          "교육학에서 라벨링(낙인) 효과가 학생의 학업 성취도에 미치는 악영향을 다룬 실험을 찾아본다."
        ]
      },
      {
        num: "09", name: "장지호", t: [
          "일반적인 진로 선택에는 반대하지만, 난독증이나 ADHD 같은 신경 발달적 어려움을 조기에 발견해 치료하는 목적이라면 찬성한다.",
          "학습 부진의 원인이 게으름이 아니라 유전적 뇌 기능 특성 때문임을 일찍 알면 아이를 다그치지 않고 적절한 치료를 도울 수 있기 때문이다.",
          "조기 진단을 통해 초등학교 입학 전부터 맞춤형 치료 교육을 제공하면 학습 격차를 줄일 수 있다.",
          "치료 목적의 검사와 재능 발굴 목적의 상업적 검사를 정부가 법적으로 명확히 분리하여 규제할 수 있을까?",
          "보건복지부의 DTC 유전자 검사 허용 항목 기준과 소아 청소년 검사 제한 규정을 찾아본다."
        ]
      },
      {
        num: "10", name: "임지유", t: [
          "초등학생 때의 관심사는 1년에도 몇 번씩 바뀌는데, 유전자라는 이름으로 진로를 조기에 묶어두는 것은 부당하다.",
          "초등학생 때 과학을 잘한다고 정해놓았는데 중고등학교 때 문학이나 예술에 눈을 뜬다면 이전의 맞춤 교육은 오히려 족쇄가 되기 때문이다.",
          "유전자 결과에 갇혀 다른 분야를 시도조차 해보지 못하게 만드는 것은 아이의 잠재력을 축소시키는 일이다.",
          "어릴 때 정해진 진로를 성인이 되어 바꿀 때 겪는 심리적 저항감과 사회적 비용은 얼마나 클까?",
          "청소년기 진로 변경 경험을 가진 사람들의 인터뷰와 진로 발달 단계 이론을 조사해 본다."
        ]
      },
      {
        num: "11", name: "한유준", t: [
          "인공지능과 첨단 과학이 발전하는 시대에 개인의 유전체 빅데이터를 교육에 활용하지 않는 것은 손해라고 생각해 찬성한다.",
          "개인 맞춤 의학이 발전하듯 개인 맞춤 교육도 당연한 흐름이며, 아이가 가장 재능 있는 곳에 자원을 집중할 수 있기 때문이다.",
          "국가 차원에서도 인재의 강점을 조기에 파악해 세계적인 경쟁력을 갖추도록 지원할 수 있다.",
          "유전자 검사 기술의 오류 확률이나 위양성(False Positive) 판정 위험은 얼마나 될까?",
          "유전자 분석 알고리즘의 통계적 오차율과 교차 검증 절차에 관한 기술 보고서를 확인한다."
        ]
      },
      {
        num: "12", name: "오아린", t: [
          "아동 발달 단계상 초등학교는 다양한 감각과 정서를 골고루 키워야 하는 전인 교육 시기이므로 반대한다.",
          "한 분야에만 치우친 조기 교육은 뇌의 균형 잡힌 발달을 저해하고 사회성과 공감 능력을 떨어뜨리기 때문이다.",
          "지능이나 특정 재능보다 더 중요한 것은 다른 사람과 협력하고 살아가는 인성 교육이다.",
          "조기 편중 교육을 받은 영재들이 겪는 사회 부적응이나 우울증 비율이 일반 학생보다 높은가?",
          "발달심리학에서 강조하는 아동기 전인 발달의 중요성과 놀이 교육 이론을 검토한다."
        ]
      },
      {
        num: "13", name: "서준우", t: [
          "가난한 가정의 아이라도 유전자 검사를 통해 숨겨진 재능을 발견하면 장학금을 받고 날개를 펼칠 수 있으므로 찬성한다.",
          "부모의 배경이나 인맥이 없어도 순수한 유전적 잠재력만으로 공정하게 기회를 얻는 사다리가 될 수 있기 때문이다.",
          "흙수저 출신이라도 천재적인 재능이 입증되면 사회적 지원을 집중시켜 계층 이동이 가능해진다.",
          "국가가 취약계층 아동에게 공공 유전자 검사와 무상 영재 교육을 지원하는 복지 제도가 생길 수 있을까?",
          "공공 교육 복지 정책으로서의 유전자 검사 지원 가능성에 관한 정책 토론 논문을 찾아본다."
        ]
      },
      {
        num: "14", name: "신수아", t: [
          "재능이 없는 것으로 나온 분야에서는 아이가 조금만 실수해도 '너는 유전자가 안 좋아서 그래'라며 주변에서 쉽게 포기하게 만들 것이므로 반대한다.",
          "실패를 딛고 일어서는 회복탄력성이 삶에서 가장 중요한데, 유전자가 핑계가 되어 도전 의식을 꺾기 때문이다.",
          "노력해서 극복할 수 있는 영역까지 유전자 탓으로 돌리는 무기력증이 사회 전체에 퍼질 수 있다.",
          "실패를 극복하는 '그릿(Grit, 투지)'과 유전자 검사 결과 중 실제 성공에 더 큰 영향을 미치는 요인은 무엇일까?",
          "앤절라 더크워스의 '그릿' 연구와 성공한 인물들의 노력-유전자 상관관계 데이터를 찾아본다."
        ]
      },
      {
        num: "15", name: "권예준", t: [
          "취미 활동을 정할 때 유전자 검사를 가볍게 참고하는 수준이라면 아이의 흥미 유발에 긍정적이므로 찬성한다.",
          "아이가 스스로 '나는 어떤 유전적 장점이 있을까?' 호기심을 갖고 자기 이해의 도구로 삼으면 학습 동기가 생기기 때문이다.",
          "결과를 강요하지 않고 재미있는 탐색 과정의 하나로 받아들인다면 유익한 계기가 된다.",
          "아이들이 자신의 유전자 결과를 게임 캐릭터 스탯처럼 유쾌하게 받아들이고 학습할 수 있는 교육용 앱이 있을까?",
          "유전체 데이터를 활용한 청소년 진로 탐색 게임이나 게이미피케이션 교육 프로그램을 알아본다."
        ]
      },
      {
        num: "16", name: "황채원", t: [
          "부모의 대리 만족을 위해 아이를 유전자 맞춤형 틀에 가두고 학대하는 '학습 아동학대'가 늘어날 것이므로 반대한다.",
          "학벌과 성공에 집착하는 사회 분위기 속에서 유전자 결과는 부모의 사교육 강요를 정당화하는 무서운 도구가 되기 때문이다.",
          "아이가 원치 않는 피아노나 코딩을 유전자 핑계로 하루 10시간씩 억지로 시키는 비극이 벌어질 수 있다.",
          "유전자 기반 사교육 강요를 아동 학대로 보고 처벌할 수 있는 법적 기준이 마련되어 있는가?",
          "아동 인권 단체들의 조기 사교육 반대 성명서와 교육권 보호 관련 헌법 재판소 판례를 조사한다."
        ]
      },
      {
        num: "17", name: "안건우", t: [
          "직업의 세계가 급변하고 새로운 직업이 쏟아져 나오는데, 현재 존재하는 직업군에 맞춰 유전자를 설계하는 것은 무의미하므로 반대한다.",
          "지금 초등학생이 어른이 되었을 때는 현재 직업의 절반이 사라질 텐데 과거의 기준(수학, 어학, 음악)으로 재능을 좁히는 것은 어리석기 때문이다.",
          "미래 사회에 필요한 것은 특정 지식이 아니라 융합적 사고력과 문제 해결력이다.",
          "미래 사회의 신직업들이 요구하는 역량과 유전자 검사 항목 사이에 어떤 연관성이 있을까?",
          "세계경제포럼(WEF)의 '미래 일자리 보고서'를 읽고 필요한 핵심 역량을 조사한다."
        ]
      },
      {
        num: "18", name: "송지아", t: [
          "유전자 검사 결과는 아이의 스트레스 취약성이나 감정 조절 능력을 배려하는 '정서 맞춤 지도'에 유용하므로 찬성한다.",
          "시험 불안이 높은 유전적 특성을 가진 아이에게는 압박 대신 칭찬 중심의 학습법을 적용해 마음의 상처를 줄일 수 있기 때문이다.",
          "학습 성과뿐만 아니라 아이의 마음 건강을 지키는 맞춤 상담에 매우 효과적이다.",
          "스트레스 민감도 관련 세로토닌 수용체 유전자(5-HTTLPR)가 실제 학습 지도에 어떻게 응용될 수 있을까?",
          "신경과학과 상담심리학이 결합된 맞춤형 정서 코칭 사례 연구를 검색해 본다."
        ]
      },
      {
        num: "19", name: "류민재", t: [
          "인간의 유전자는 2만 개가 넘고 이들이 서로 복잡하게 상호작용하는데, 몇 개 유전자만 보고 재능을 판정하는 것은 과학적 사기에 가깝다고 생각해 반대한다.",
          "현재 상업적 유전자 검사는 과장 광고가 많고 수학이나 지능 같은 복합 형질을 단 몇 개 마커로 설명할 수 없기 때문이다.",
          "부정확한 과학에 아이의 소중한 미래를 거는 것은 너무나 무책임하고 위험한 도박이다.",
          "현재 시중에서 판매되는 학습 관련 유전자 검사의 과학적 근거 수준(Evidence Level)은 객관적으로 어느 정도일까?",
          "한국유전체학회와 생명윤리학회에서 발표한 상업적 DTC 유전자 검사의 한계 보고서를 찾아본다."
        ]
      },
      {
        num: "20", name: "전다은", t: [
          "유전자 맞춤 교육을 도입하더라도 반드시 정기적인 '진로 재평가'와 '체험형 교차 교육'을 의무화해야 한다는 조건으로 찬성한다.",
          "6개월마다 아이의 실제 성취도와 만족도를 재조사해 방향을 수정할 수 있다면 부작용을 줄이면서 장점만 취할 수 있기 때문이다.",
          "유전자와 현실의 피드백을 계속 주고받으며 발전시키는 유연한 교육 시스템을 구축해야 한다.",
          "학교 현장에서 학생 맞춤형 교육과정을 매 학기 유연하게 변경할 수 있는 학점제 제도가 초등학교에도 가능할까?",
          "고교학점제와 덴마크의 자유학교 시스템처럼 유연한 교육과정 운영 모델을 비교 조사한다."
        ]
      },
      {
        num: "21", name: "홍진우", t: [
          "유전자 검사를 도입하면 '열등한 유전자' 판정을 받은 아이들이 친구들 사이에서 놀림감이 되는 학교폭력 문제가 생길 것이므로 반대한다.",
          "'너는 유전자 등급이 낮아서 공부 못하잖아'라며 새로운 형태의 사이버 불링과 따돌림이 발생할 것이 뻔하기 때문이다.",
          "아이들의 자존감을 무너뜨리고 학급 공동체의 연대감을 깨뜨리는 결과를 초래한다.",
          "학생 개인의 유전체 정보를 비밀로 보장하더라도 아이들 사이에서 소문이 퍼지는 것을 어떻게 통제할 수 있을까?",
          "학교 내 유전자 정보 유출 방지 시스템과 청소년 인권 침해 사례 연구를 확인한다."
        ]
      },
      {
        num: "22", name: "고은서", t: [
          "자신이 어떤 유전적 재능을 가졌는지 알고 시작하면 공부를 할 때 '나도 해낼 수 있다'는 내적 확신이 생기므로 찬성한다.",
          "많은 학생이 자신이 무엇을 잘하는지 몰라 방황하는데, 과학적 나침반이 있다면 열등감을 극복하고 몰입할 수 있기 때문이다.",
          "자기 효능감을 북돋워 주는 긍정적인 트리거로 작용할 수 있다.",
          "유전자 결과 피드백을 받은 학생들이 실제로 학업 몰입도와 성취 동기가 상승했는지 실험한 결과가 있을까?",
          "심리학에서 긍정적 피드백과 과학적 근거 제시가 학생의 동기 부여에 미치는 효과를 연구한 논문을 읽는다."
        ]
      },
      {
        num: "23", name: "문지후", t: [
          "선생님들이 유전자 검사 결과를 보고 학생을 편견을 가지고 대하는 '교사의 선입견' 문제가 발생할 것이므로 반대한다.",
          "선생님이 '이 아이는 과학 유전자가 없으니 질문해도 깊게 안 가르쳐야지' 하고 무의식적으로 기대를 접을 수 있기 때문이다.",
          "교육은 모든 가능성을 열어두고 믿어주는 것인데 교사가 먼저 학생을 포기하게 만드는 부작용이 있다.",
          "교사들에게 학생의 유전자 정보를 완전히 블라인드 처리하고 오직 본인과 학부모만 열람하게 하는 규정이 지켜질 수 있을까?",
          "교육 현장에서 교사의 블라인드 평가 제도가 편견 해소에 미치는 효과를 다룬 논문을 찾아본다."
        ]
      },
      {
        num: "24", name: "양하윤", t: [
          "체육, 음악, 미술, 외국어처럼 조기 감각 형성이 절대적인 예체능 및 언어 분야에 한해서만 선별적으로 적용하는 것에 찬성한다.",
          "일반 교과목은 후천적 노력이 크지만, 절대음감이나 근육 섬유 비율(단거리/장거리)은 유전적 영향이 매우 크기 때문이다.",
          "분야별 특성에 따라 차등 적용하면 예체능 지망생들의 시행착오를 획기적으로 줄여줄 수 있다.",
          "예체능 분야 중 유전적 기여도(Heritability)가 가장 높게 입증된 구체적인 신체 형질은 무엇일까?",
          "ACTN3 유전자(스프린터 유전자)와 심폐 지구력 유전자 연구 논문을 비교 검토한다."
        ]
      },
      {
        num: "25", name: "손현우", t: [
          "어릴 때 유전자 맞춤 교육으로 성공하더라도, 평생 자신이 진정으로 원했던 길인지 회의감에 빠지는 '정체성 위기'를 겪을 수 있어 반대한다.",
          "내 의지로 선택한 길이 아니라 유전자가 시켜서 만들어진 로봇 같은 성공은 진정한 자아실현이 아니기 때문이다.",
          "스스로 방황하고 실패하면서 선택한 길이라야 어른이 되어서도 후회가 없다.",
          "자신이 스스로 선택하지 않은 진로에서 성공한 사람들의 심리적 공허함과 정체성 혼란 사례를 연구해 볼 필요가 있다.",
          "심리학자 에릭슨의 청소년 자아정체성 형성 이론과 실존주의 심리학 서적을 읽어본다."
        ]
      },
      {
        num: "26", name: "배소율", t: [
          "유전자 검사를 진로 교육이 아니라 '학습 스타일(시각적/청각적/체험적)'을 파악해 공부 방법을 최적화하는 데만 써야 한다고 생각해 조건부 찬성한다.",
          "진로 분야를 정하는 것은 위험하지만, 시각 자료로 공부할 때 기억력이 좋은지, 들으면서 공부할 때 집중이 잘되는지 파악하는 것은 유익하기 때문이다.",
          "목표는 그대로 두되, 그 목표로 가는 길(공부법)을 편안하게 돕는 용도라면 찬성한다.",
          "학습 감각 스타일과 유전자 마커 사이의 상관관계를 입증한 공신력 있는 뇌과학 연구가 존재하는가?",
          "VARK 학습 양식 모델과 최신 신경생물학 연구의 연결 가능성을 조사한다."
        ]
      },
      {
        num: "27", name: "조우진", t: [
          "다양한 분야를 두루 경험해 보며 다방면의 능력을 연결하는 '융합형 인재'가 필요한 시대에 맞지 않는 편협한 발상이므로 반대한다.",
          "어릴 때 한 우물만 파게 만들면 다른 분야 사람들과 소통하지 못하는 외골수가 되기 십상이기 때문이다.",
          "스티브 잡스처럼 인문학과 기술을 넘나드는 창의성은 좁은 맞춤 교육에서 나올 수 없다.",
          "한 분야의 전문가보다 여러 분야의 지식을 연결하는 '제너럴리스트(Generalist)'의 생존력을 강조한 도서 '레인지(Range)'를 읽어본다.",
          "데이비드 엡스타인의 '늦깎이 천재들의 비밀(Range)'에 나오는 조기 전문화의 실패 사례들을 정리한다."
        ]
      },
      {
        num: "28", name: "백예린", t: [
          "아이가 스스로 자신의 유전자 검사 결과를 열람하고 교육 적용 여부를 결정할 수 있는 '만 14세 이후'로 시기를 늦춰야 한다고 생각해 초등학생 맞춤 교육은 반대한다.",
          "초등학생은 부모의 강요에 저항할 능력이 없으므로 자기결정권이 생기는 중학교 이후에 본인의 동의하에만 실시해야 하기 때문이다.",
          "아이의 인권과 자율적 의사결정권이 최우선으로 보호되어야 한다.",
          "국제 아동인권협약에서 규정한 아동의 자기결정권과 의료·유전자 정보 열람 연령 기준은 어떻게 되어 있을까?",
          "유엔 아동권리협약 제12조(의견 존중권)와 국내 유전체 검사 동의 연령 가이드라인을 확인한다."
        ]
      },
      {
        num: "29", name: "허재윤", t: [
          "가정마다 아이의 성향을 파악하느라 드는 수많은 사교육 상담비와 적성 검사 비용을 줄여주는 경제적 이점이 있으므로 찬성한다.",
          "비과학적인 혈액형이나 MBTI 상담에 돈을 쓰는 것보다 정확한 유전자 검사 한 번이 가계 경제에 훨씬 합리적이기 때문이다.",
          "정확한 방향성을 잡고 교육비를 효율적으로 지출할 수 있다.",
          "상업용 유전자 검사 비용과 기존 사교육 진로 컨설팅 비용의 경제적 비용-편익을 비교 분석해 본다.",
          "소비자경제학 관점에서 유전자 진로 검사의 가계 교육비 절감 효과 보고서를 찾아본다."
        ]
      },
      {
        num: "30", name: "유시아", t: [
          "유전자 검사는 한 인간이 가진 무수한 가능성 중 극히 일부일 뿐인데, 그것을 아이의 '전부'인 양 믿어버리는 어른들의 착각이 가장 무서우므로 반대한다.",
          "사랑과 관심, 좋은 선생님과의 만남, 감명 깊게 읽은 책 한 권이 한 아이의 인생을 완전히 바꿀 수 있다는 사실을 과학이 증명할 수 없기 때문이다.",
          "인간은 유전자 이상의 존재이며, 기적과 같은 변화를 만들어내는 존재다.",
          "유전적 한계를 극복하고 세계적인 업적을 이뤄낸 역사적 인물들의 감동적인 전기를 찾아본다.",
          "헬렌 켈러, 스티븐 호킹 등 신체적·유전적 역경을 이겨낸 인물들의 삶과 후천적 의지의 힘을 탐구한다."
        ]
      }
    ];

    const now = new Date().toISOString();
    let successCount = 0;
    for (const item of dummy30) {
      const sNum = `301${item.num}`;
      const fullContent = item.t.map((ans, idx) => `${tLabels[idx]}\n${ans}`).join('\n\n');
      const { error } = await client.from('think_stage_responses').upsert({
        lesson_plan_id: lessonId,
        student_number: sNum,
        stage_code: 'T',
        content: fullContent,
        updated_at: now,
        submitted_at: now
      }, { onConflict: 'lesson_plan_id,student_number,stage_code' });
      if (!error) successCount++;
    }

    alert(`🎉 3학년 1반 30명 전원의 T단계 글이 성공적으로 서버 DB에 저장되었습니다!\n\n- 대상 주제: ${window.topicTitle(targetLesson.title, 1)}\n- 성공: ${successCount} / 30명\n- 내용: 찬성/반대/조건부/행복권 등 다채로운 5문답 완비\n- 이제 H단계(친구 생각 나누기)에서 학생들에게 풍성한 의견이 배정됩니다.`);
    await this.renderOperationOverview();
  } catch (err) {
    alert(`T단계 데이터 생성 실패: ${err.message}`);
  }
};

window.TeacherAdminModule.runSeedGeneticsDummyData = async function () {
  await this.seedGeneticsLesson1TAnswers();
};


window.TeacherAdminModule.renderAiActivitySettings = function (prefix, reference = '') {
  const id = this.escapeHtml(prefix);
  return `
    <details class="lesson-ai-activity">
      <summary>I 단계 AI 참고사항 <span>${reference ? '저장됨' : '선택'}</span></summary>
      <div class="lesson-ai-activity-body">
        <label for="${id}-ai-reference">AI 대화 추가 참고사항 (선택)</label>
        <span class="think-writing-hint" id="${id}-ai-example">비워두셔도 좋습니다. 꼭 짚고 싶은 오개념이 있을 때만 입력하세요.<br>예) 유전적 소인(확률)과 실제 발현·노력의 차이를 구분해 주세요.</span>
        <textarea id="${id}-ai-reference" aria-describedby="${id}-ai-example" class="form-textarea" rows="2">${this.escapeHtml(reference || '')}</textarea>
      </div>
    </details>`;
};

window.TeacherAdminModule.renderReviewResource = function(prefix,value='') {
  return `<details class="lesson-ai-activity"><summary>N단계 확인 자료 <span>선택</span></summary>
    <label class="lesson-ai-activity-body">교과서 쪽수, 자료 내용 또는 링크
    <textarea id="${this.escapeHtml(prefix)}-review-resource" class="form-textarea" rows="2">${this.escapeHtml(value||'')}</textarea></label></details>`;
};
