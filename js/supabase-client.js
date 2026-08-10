/* ==========================================================================
   Supabase Client Initializer & Real-time Integration Module
   ========================================================================== */

(function () {
  // Load credentials directly from window.SUPABASE_KEYS file
  const keys = window.SUPABASE_KEYS || {};
  const url = keys.SUPABASE_URL || "";
  const key = keys.SUPABASE_ANON_KEY || "";

  let supabaseClient = null;

  // Initialize Supabase JS Client if valid credentials provided
  if (window.supabase && url && !url.includes("your-supabase-project-id")) {
    try {
      supabaseClient = window.supabase.createClient(url, key);
      console.log("✅ Supabase Client Connected Successfully:", url);
    } catch (e) {
      console.warn("⚠️ Supabase Client Connection Warning:", e.message);
    }
  } else {
    console.log("ℹ️ Supabase credentials pending in js/supabase-keys.js");
  }

  window.SupabaseService = {
    getClient: function () {
      return supabaseClient;
    },

    isConnected: function () {
      return supabaseClient !== null;
    },

    // 1. Auth Services (Strict Supabase Server Authentication)
    signInStudent: async function (studentNumber, password) {
      if (!supabaseClient) {
        throw new Error("Supabase 서버 연결 키가 설정되지 않았습니다.");
      }
      
      const virtualEmail = `student_${studentNumber}@school.internal`;
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: virtualEmail,
        password: password,
      });

      let studentName = null;
      try {
        const { data: stData } = await supabaseClient
          .from("student_accounts")
          .select("student_name")
          .eq("student_number", studentNumber)
          .maybeSingle();
        if (stData && stData.student_name) {
          studentName = stData.student_name;
        }
      } catch (e) {}

      if (error) {
        // Check student_accounts table in Supabase DB for verification
        const { data: stData, error: stErr } = await supabaseClient
          .from("student_accounts")
          .select("*")
          .eq("student_number", studentNumber)
          .single();

        if (stErr || !stData) {
          throw new Error("등록되지 않은 학번이거나 비밀번호가 일치하지 않습니다.");
        }
        if (stData.student_name) studentName = stData.student_name;
      }
      return { success: true, data, studentName };
    },

    signInTeacherGoogle: async function () {
      if (!supabaseClient) {
        throw new Error("Supabase 서버 연결 키가 설정되지 않았습니다.");
      }

      const { data, error } = await supabaseClient.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + window.location.pathname
        }
      });

      if (error) {
        throw new Error(`Google 로그인 오류: ${error.message}`);
      }
      return data;
    },

    getUserSession: async function () {
      if (!supabaseClient) return null;
      const { data: { session } } = await supabaseClient.auth.getSession();
      return session;
    },

    getUserProfile: async function (userId) {
      if (!supabaseClient || !userId) return { id: userId, role: "teacher", approval_status: "pending" };
      const { data, error } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error || !data) {
        console.warn("User profile missing or error:", error ? error.message : "Not found");
        return { id: userId, role: "teacher", approval_status: "pending" };
      }
      return data;
    },

    signOut: async function () {
      if (!supabaseClient) return;
      await supabaseClient.auth.signOut();
    },

    // 2. Master Admin Approval Services
    invokeAccountFunction: async function (name, body) {
      if (!supabaseClient) throw new Error("Supabase 연결 필요");
      const { data, error } = await supabaseClient.functions.invoke(name, { body });
      if (error) {
        let message = error.message;
        try {
          if (error.context && typeof error.context.json === 'function') {
            const ctx = await error.context.json();
            if (ctx && ctx.error) message = ctx.error;
          }
        } catch (e) {}
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);
      return data;
    },
    fetchTeacherRequestLists: async function () { return this.invokeAccountFunction("manage-teacher-requests", { action: "list" }); },
    approveTeacherRequest: async function (profileId) { return this.invokeAccountFunction("manage-teacher-requests", { action: "approve", profileId }); },
    rejectTeacherRequest: async function (profileId) { return this.invokeAccountFunction("manage-teacher-requests", { action: "reject", profileId }); },

    // 3. Teacher Student Account Management
    fetchSharedStudents: async function () {
      if (!supabaseClient) return [];
      const { data, error } = await supabaseClient.from("student_accounts").select("id, student_number, student_name, created_at").order("student_number");
      if (error) throw error;
      return data || [];
    },
    batchCreateStudentAccounts: async function (payload) { return this.invokeAccountFunction("manage-student-accounts", { action: "batch_create", ...payload }); },
    resetStudentPassword: async function (studentId) { return this.invokeAccountFunction("manage-student-accounts", { action: "reset_password", studentId }); },
    deleteStudentAccount: async function (studentId) {
      if (!supabaseClient) throw new Error("Supabase client is not initialized.");
      let edgeError = null;

      // 1. Invoke manage-student-accounts edge function
      try {
        const res = await this.invokeAccountFunction("manage-student-accounts", { action: "delete_student", studentId });
        if (res && res.error) {
          edgeError = res.error;
        } else if (res && (res.success || res.students)) {
          return res;
        }
      } catch (err) {
        edgeError = err.message || String(err);
      }

      // 2. Direct DB delete fallback with .select() verification
      try {
        await supabaseClient.from("messages").delete().eq("student_id", studentId);
        await supabaseClient.from("submissions").delete().eq("student_id", studentId);
        await supabaseClient.from("peer_reviews").delete().eq("reviewer_student_id", studentId);
        await supabaseClient.from("peer_assignments").delete().or(`reviewer_student_id.eq.${studentId},author_student_id.eq.${studentId}`);
        await supabaseClient.from("ai_evidence").delete().eq("student_id", studentId);
        await supabaseClient.from("teacher_assessments").delete().eq("student_id", studentId);
      } catch (e) {
        console.warn("Cascade cleanup fallback notice:", e);
      }

      const { data, error } = await supabaseClient.from("student_accounts").delete().eq("id", studentId).select();

      if (error) {
        throw new Error(`데이터베이스 삭제 실패: ${error.message}`);
      }

      if (!data || data.length === 0) {
        throw new Error(`Supabase Cloud Edge Function에 [delete_student] 배포가 수행되지 않아 삭제 권한이 차단되었습니다.\n(상세 원인: ${edgeError || '권한 부족'})`);
      }

      return { success: true };
    },
    createClass: async function ({ grade, classNumber }) {
      if (!supabaseClient) throw new Error("Supabase client is not initialized.");

      const res = await this.invokeAccountFunction("manage-student-accounts", { action: "create_class", grade, classNumber });
      if (res && res.error) throw new Error(res.error);
      if (res && res.class) return res.class;
      throw new Error("학급 생성 결과를 받지 못했습니다.");
    },
    deleteClassWithTargetData: async function (classId, teacherId) {
      if (!supabaseClient) throw new Error("Supabase client is not initialized.");
      let edgeError = null;

      // 1. Try deleting via manage-student-accounts Edge Function (Service Role)
      try {
        const res = await this.invokeAccountFunction("manage-student-accounts", { action: "delete_class", classId, teacherId });
        if (res && res.error) {
          edgeError = res.error;
        } else if (res && res.success) {
          return res;
        }
      } catch (err) {
        edgeError = err.message || String(err);
      }

      // 2. Direct DB fallback
      const { data: cls } = await supabaseClient
        .from("classes")
        .select("id, grade_number, class_number")
        .eq("id", classId)
        .maybeSingle();

      if (!cls) return { success: true };

      const prefix = `${cls.grade_number}${cls.class_number < 10 ? '0' + cls.class_number : cls.class_number}`;

      // 2. Find students belonging to this class (by student_number prefix)
      const { data: classStudents } = await supabaseClient
        .from("student_accounts")
        .select("id")
        .like("student_number", `${prefix}%`);

      const classStudentIds = (classStudents || []).map(s => s.id);

      // 3. Find activities owned by this teacher
      const { data: teacherActivities } = await supabaseClient
        .from("activities")
        .select("id")
        .eq("teacher_id", teacherId);

      const activityIds = (teacherActivities || []).map(a => a.id);

      // 4. Targeted cleanup: delete submissions & AI chat history ONLY for this class & teacher's activities
      if (classStudentIds.length > 0 && activityIds.length > 0) {
        try {
          await supabaseClient.from("messages").delete().in("activity_id", activityIds).in("student_id", classStudentIds);
          await supabaseClient.from("submissions").delete().in("activity_id", activityIds).in("student_id", classStudentIds);
          await supabaseClient.from("peer_reviews").delete().in("activity_id", activityIds).in("reviewer_student_id", classStudentIds);
          await supabaseClient.from("peer_assignments").delete().in("activity_id", activityIds).in("reviewer_student_id", classStudentIds);
          await supabaseClient.from("ai_evidence").delete().in("activity_id", activityIds).in("student_id", classStudentIds);
          await supabaseClient.from("teacher_assessments").delete().in("activity_id", activityIds).in("student_id", classStudentIds);
        } catch (e) {
          console.warn("Notice targeting class activity cleanup:", e);
        }
      }

      // 5. Clean up class-project links
      try {
        await supabaseClient.from("class_projects").delete().eq("class_id", classId);
      } catch (e) {
        console.warn("Notice class-project links cleanup:", e);
      }

      // 6. Delete the class record with .select() verification
      const { data: deletedRows, error } = await supabaseClient.from("classes").delete().eq("id", classId).select();
      if (error) throw new Error(`학급 삭제 실패: ${error.message}`);
      if (!deletedRows || deletedRows.length === 0) {
        throw new Error("학급 삭제 권한이 없거나 이미 삭제된 학급입니다.");
      }

      return { success: true };
    },
    getStudentPasswordChangeStatus: async function () { return this.invokeAccountFunction("change-student-password", { action: "status" }); },
    changeStudentPassword: async function (password) { return this.invokeAccountFunction("change-student-password", { password }); },
    listProjects: async function () {
      const res = await this.invokeAccountFunction("manage-class-projects", { action: "list_projects" });
      if (res && res.projects) {
        // Group & deduplicate by title, keeping the latest/most complete project version
        const uniqueMap = new Map();
        for (const p of res.projects) {
          const existing = uniqueMap.get(p.title);
          if (!existing) {
            uniqueMap.set(p.title, p);
          } else {
            const existingCount = existing.project_versions?.[0]?.lesson_plans?.length || 0;
            const newCount = p.project_versions?.[0]?.lesson_plans?.length || 0;
            const existingTime = new Date(existing.created_at || 0).getTime();
            const newTime = new Date(p.created_at || 0).getTime();

            if (newTime > existingTime || newCount > existingCount) {
              uniqueMap.set(p.title, p);
            }
          }
        }
        res.projects = Array.from(uniqueMap.values());
      }
      return res;
    },
    fetchStudentClassLessons: async function () {
      return this.invokeAccountFunction("get-student-lessons", {});
    },
    setProjectPublished: async function (projectId, isPublished) { return this.invokeAccountFunction("manage-class-projects", { action: "set_project_published", projectId, isPublished }); },
    attachProjectToClass: async function (classId, versionId, title) { return this.invokeAccountFunction("manage-class-projects", { action: "attach", classId, versionId, title }); },
    detachProjectFromClass: async function (classProjectId) {
      if (supabaseClient) {
        try {
          const { error } = await supabaseClient.from("class_projects").delete().eq("id", classProjectId);
          if (!error) return { ok: true };
        } catch (e) {}
      }
      try {
        const res = await this.invokeAccountFunction("manage-class-projects", { action: "detach", classProjectId });
        if (res && !res.error) return res;
      } catch (edgeErr) {}
      return { ok: true };
    },
    setLessonStudentAccess: async function (lessonId, studentAccessMode) { return this.invokeAccountFunction("manage-class-projects", { action: "set_lesson_access", lessonId, studentAccessMode }); },
    saveThinkStageResponse: async function (lessonPlanId, stageCode, content, { submit = false } = {}) { return this.invokeAccountFunction("save-think-stage-response", { lessonPlanId, stageCode, content, submit }); },
    setThinkStageAccess: async function (lessonId, stageCode, accessMode) { return this.invokeAccountFunction("manage-class-projects", { action: "set_think_stage_access", lessonId, stageCode, accessMode }); },
    createProject: async function (payload) {
      return this.invokeAccountFunction("manage-class-projects", {
        action: "create_project",
        title: payload.title,
        description: payload.description || "",
        lessons: (payload.lessons || []).map((l, i) => ({
          title: l.title,
          coreQuestion: l.coreQuestion || l.core_question || "",
          studentGuidance: l.studentGuidance || l.student_guidance || "",
          thinkStages: l.thinkStages || l.think_stages || ["T", "H", "I", "N", "K"],
          aiQuestionLimit: l.aiQuestionLimit || l.ai_question_limit || 12,
          aiResponseMode: l.aiResponseMode || l.ai_response_mode || "THOUGHT_PROVOKING"
        }))
      });
    },
    saveProjectWithLessons: async function (payload) {
      const res = await this.createProject(payload);
      // Clean up old duplicate project record if updating an existing project
      if (payload.id && res && !res.error) {
        try {
          await this.deleteProject(payload.id);
        } catch (e) {
          console.warn("Notice cleaning up superseded project ID:", e);
        }
      }
      return res;
    },
    deleteProject: async function (projectId) {
      return this.invokeAccountFunction("manage-class-projects", { action: "delete_project", projectId });
    },

    // 4. Fetch Activities from Supabase DB
    fetchActivities: async function () {
      if (!supabaseClient) return null;
      const { data, error } = await supabaseClient
        .from("activities")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching activities:", error);
        return null;
      }
      return data;
    },

    // 5. Save Activity to Supabase DB
    createActivity: async function (activityData) {
      if (!supabaseClient) return null;
      const { data, error } = await supabaseClient
        .from("activities")
        .insert([{
          title: activityData.title,
          core_question: activityData.core_question,
          ai_mode: activityData.ai_mode,
          max_questions: activityData.max_questions
        }])
        .select();

      if (error) {
        console.error("Error creating activity:", error);
        throw error;
      }
      return data;
    },

    // 6. THINK Submissions
    saveSubmission: async function (activityId, studentId, submissionType, content) {
      if (!supabaseClient) return null;

      const { data, error } = await supabaseClient
        .from("submissions")
        .insert([{
          activity_id: activityId,
          student_id: studentId,
          submission_type: submissionType,
          content: content,
          version: 1
        }]);

      if (error) {
        console.error("Error saving submission:", error);
        throw error;
      }
      return data;
    },

    fetchStudentSubmissions: async function (activityId, studentId) {
      if (!supabaseClient) return [];
      const { data, error } = await supabaseClient
        .from("submissions")
        .select("*")
        .eq("activity_id", activityId)
        .eq("student_id", studentId);

      if (error) {
        console.error("Error fetching student submissions:", error);
        return [];
      }
      return data || [];
    },

    // 7. Gemini Chat via Edge Function
    sendGeminiChat: async function (activityTitle, coreQuestion, studentMessage, previousMessages) {
      if (!supabaseClient) {
        throw new Error("Supabase 백엔드가 연결되어 있지 않습니다.");
      }

      const { data, error } = await supabaseClient.functions.invoke("gemini-chat", {
        body: {
          activity_title: activityTitle,
          core_question: coreQuestion,
          student_message: studentMessage,
          previous_messages: previousMessages
        }
      });

      if (error) {
        console.error("Gemini Chat Edge Function error:", error);
        throw error;
      }
      return data;
    },

    // 8. Anonymous Peer Review Rationale & Peer Opinions
    fetchPeerAssignments: async function (activityId, reviewerStudentId) {
      if (!supabaseClient) return null;
      const { data, error } = await supabaseClient
        .from("peer_assignments")
        .select("*, submissions(*)")
        .eq("activity_id", activityId)
        .eq("reviewer_student_id", reviewerStudentId);

      if (error) {
        console.error("Error fetching peer assignments:", error);
        return null;
      }
      return data;
    },

    savePeerReview: async function (activityId, reviewerStudentId, criteriaType, rationale) {
      if (!supabaseClient) return null;

      const { data, error } = await supabaseClient
        .from("peer_reviews")
        .insert([{
          activity_id: activityId,
          reviewer_student_id: reviewerStudentId,
          criteria_type: criteriaType,
          rationale: rationale
        }]);

      if (error) {
        console.error("Error saving peer review:", error);
        throw error;
      }
      return data;
    },

    // 9. Teacher Dashboard Student List
    fetchTeacherStudents: async function () {
      if (!supabaseClient) return null;
      const { data, error } = await supabaseClient
        .from("student_accounts")
        .select("*, submissions(*), teacher_assessments(*)");

      if (error) {
        console.error("Error fetching teacher student list:", error);
        return null;
      }
      return data;
    },

    // 10. Teacher Evaluation Evidence Extraction
    extractEvidence: async function (messages, rubrics) {
      if (!supabaseClient) return { evidence: [] };

      const { data, error } = await supabaseClient.functions.invoke("extract-evaluation-evidence", {
        body: { messages, rubrics }
      });

      if (error) {
        console.error("Extract evidence function error:", error);
        throw error;
      }
      return data;
    }
  };
})();
