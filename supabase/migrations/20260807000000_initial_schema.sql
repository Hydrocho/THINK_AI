-- ============================================================================
-- AI 학습 대화·익명 의견 교환·교사 평가 플랫폼 (THINK 모형) Initial Migration
-- Database Migration & RLS Security Policies
-- ============================================================================

-- 1. Profiles & Authorization Tables
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student', 'admin')),
  display_name TEXT,
  approval_status TEXT NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Classes Table
CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_code TEXT NOT NULL,
  grade_number INT NOT NULL,
  class_number INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_teacher_class_code UNIQUE (teacher_id, class_code)
);

-- 3. Student Accounts Table
CREATE TABLE IF NOT EXISTS public.student_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_number TEXT NOT NULL, -- e.g. '30208'
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_class_student_number UNIQUE (class_id, student_number)
);

-- 4. Activities Table
CREATE TABLE IF NOT EXISTS public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  core_question TEXT NOT NULL,
  ai_mode TEXT NOT NULL DEFAULT 'THOUGHT_PROVOKING' CHECK (ai_mode IN ('GENERAL', 'THOUGHT_PROVOKING')),
  ai_guidelines TEXT,
  max_questions INT NOT NULL DEFAULT 12 CHECK (max_questions BETWEEN 3 AND 30),
  retention_days INT NOT NULL DEFAULT 90,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Activity Classes Junction & Stage State Table
CREATE TABLE IF NOT EXISTS public.activity_stage_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  current_stage TEXT NOT NULL DEFAULT 'draft_initial' CHECK (current_stage IN (
    'draft_initial', 'ai_chat_open', 'claim_submission_open', 'peer_review_open', 'final_reflection_open', 'teacher_assessment_open', 'closed', 'trashed'
  )),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_activity_class UNIQUE (activity_id, class_id)
);

-- 6. Messages Table (Immutable Chat History)
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.student_accounts(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('student', 'gemini')),
  content TEXT NOT NULL,
  token_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Submissions Table (Initial & Final Reflection)
CREATE TABLE IF NOT EXISTS public.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.student_accounts(id) ON DELETE CASCADE,
  submission_type TEXT NOT NULL CHECK (submission_type IN ('initial_thought', 'claim_evidence', 'final_reflection')),
  content TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Peer Assignments & Reviews Table (Anonymous Peer Review)
CREATE TABLE IF NOT EXISTS public.peer_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  reviewer_student_id UUID NOT NULL REFERENCES public.student_accounts(id) ON DELETE CASCADE,
  author_student_id UUID NOT NULL REFERENCES public.student_accounts(id) ON DELETE CASCADE,
  display_order INT NOT NULL CHECK (display_order BETWEEN 1 AND 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_reviewer_order UNIQUE (activity_id, reviewer_student_id, display_order),
  CONSTRAINT no_self_review CHECK (reviewer_student_id <> author_student_id)
);

CREATE TABLE IF NOT EXISTS public.peer_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  reviewer_student_id UUID NOT NULL REFERENCES public.student_accounts(id) ON DELETE CASCADE,
  selected_assignment_id UUID REFERENCES public.peer_assignments(id) ON DELETE CASCADE,
  criteria_type TEXT NOT NULL CHECK (criteria_type IN ('validity', 'fairness', 'feasibility')),
  rationale TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. AI Evidence & Teacher Assessment Tables
CREATE TABLE IF NOT EXISTS public.ai_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.student_accounts(id) ON DELETE CASCADE,
  criterion_name TEXT NOT NULL,
  referenced_message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  excerpt_quote TEXT NOT NULL,
  ai_explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.teacher_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.student_accounts(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assessment_level TEXT NOT NULL CHECK (assessment_level IN ('BEGINNER', 'DEVELOPING', 'PROFICIENT', 'ADVANCED')),
  feedback_text TEXT,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_student_activity_assessment UNIQUE (activity_id, student_id)
);

-- Enable RLS on all public tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_stage_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_assessments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Profiles Policy: Allow authenticated users to read profiles
CREATE POLICY "Allow authenticated read profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Messages Policy: Students see only their own chat log. Teachers see their class students.
CREATE POLICY "Student read own messages" ON public.messages
  FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT id FROM public.student_accounts WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Teacher read class messages" ON public.messages
  FOR SELECT TO authenticated
  USING (
    activity_id IN (
      SELECT id FROM public.activities WHERE teacher_id = auth.uid()
    )
  );

-- Peer Review Policy: Students can only read allocated peer content without author details
CREATE POLICY "Student read assigned peer content" ON public.peer_assignments
  FOR SELECT TO authenticated
  USING (
    reviewer_student_id IN (
      SELECT id FROM public.student_accounts WHERE auth_user_id = auth.uid()
    )
  );

-- Activities Policy: Read system templates and teacher activities
CREATE POLICY "Read system and own activities" ON public.activities
  FOR SELECT TO authenticated, anon
  USING (teacher_id IS NULL OR teacher_id = auth.uid());

-- Seed Curriculum Activities (1차시 ~ 5차시)
INSERT INTO public.activities (id, teacher_id, title, core_question, ai_mode, max_questions)
VALUES 
  ('00000000-0000-0000-0000-000000000001', NULL, '1차시 · 부모에게 물려받는 유전 형질 생각하기', '사람에게 나타나는 다양한 특징 중 부모에게서 물려받는 것은 어떤 것이 있을까?', 'THOUGHT_PROVOKING', 12),
  ('00000000-0000-0000-0000-000000000002', NULL, '2차시 · 우성과 열성의 대체 용어 제안', '우성과 열성이 형질의 우수함과 열등함을 뜻하는 것으로 오해되지 않도록 새로운 이름을 붙인다면 무엇이라고 부르면 좋을까?', 'THOUGHT_PROVOKING', 12),
  ('00000000-0000-0000-0000-000000000003', NULL, '3차시 · 유전적 다양성 부족 자손 집단의 문제', '부모가 같은 유전 정보의 생식세포만 만들어 모든 자손이 동일한 형질을 나타낸다면 어떤 문제가 생길까?', 'THOUGHT_PROVOKING', 12),
  ('00000000-0000-0000-0000-000000000004', NULL, '4차시 · 사람 대상 임의 개입의 윤리적 문제와 과학 연구 원칙', '연구자가 사람의 배우자 선택과 자녀 출산에 임의 개입한다면 어떤 윤리적 문제가 발생할까?', 'THOUGHT_PROVOKING', 12),
  ('00000000-0000-0000-0000-000000000005', NULL, '5차시 · 색각 다양한 사용자를 고려한 디자인', '색깔만으로 정보를 구분하는 사례는 무엇이며, 색을 다르게 인식하는 사람은 어떤 불편을 겪을까?', 'THOUGHT_PROVOKING', 12)
ON CONFLICT DO NOTHING;

-- 10. Automatic Trigger for Google OAuth Signups to Create Pending Profile with Name and Email
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, display_name, email, approval_status)
  VALUES (
    NEW.id,
    'teacher',
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email,
    'pending'
  )
  ON CONFLICT (id) DO UPDATE 
  SET 
    display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
    email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Sync any auth.users missing from profiles
INSERT INTO public.profiles (id, role, display_name, email, approval_status)
SELECT 
  id, 
  'teacher', 
  COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email), 
  email, 
  'pending'
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;
