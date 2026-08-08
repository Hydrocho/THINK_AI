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
      }
      return { success: true, data };
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
      if (error) throw error;
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
    getStudentPasswordChangeStatus: async function () { return this.invokeAccountFunction("change-student-password", { action: "status" }); },
    changeStudentPassword: async function (password) { return this.invokeAccountFunction("change-student-password", { password }); },
    listProjects: async function () { return this.invokeAccountFunction("manage-class-projects", { action: "list_projects" }); },
    createProject: async function (payload) { return this.invokeAccountFunction("manage-class-projects", { action: "create_project", ...payload }); },
    publishProject: async function (projectId) { return this.invokeAccountFunction("manage-class-projects", { action: "publish", projectId }); },
    attachProjectToClass: async function (classId, versionId, title) { return this.invokeAccountFunction("manage-class-projects", { action: "attach", classId, versionId, title }); },
    openClassLesson: async function (classProjectId, lessonPlanId) { return this.invokeAccountFunction("manage-class-projects", { action: "open_lesson", classProjectId, lessonPlanId }); },

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
