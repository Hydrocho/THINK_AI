/* ==========================================================================
   Supabase Configuration & App Environment Constants
   ========================================================================== */

window.APP_CONFIG = {
  // Public Supabase Configuration
  // Fill in your project URL and publishable anon key here
  SUPABASE_URL: "https://your-supabase-project-id.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",

  // Default Gemini API Limits per activity
  DEFAULT_QUESTION_LIMIT: 12,
  MIN_QUESTION_LIMIT: 3,
  MAX_QUESTION_LIMIT: 30,

  // 영화 아일랜드에서 출발하는 3차시 수업
  PROJECT_TITLE: "유전자 조작 기술 (친구 및 AI와 생각을 넓히고 나의 생각을 세우기)",
  LESSONS: [
  {
    "id": "lesson-1",
    "number": 1,
    "title": "1차시 · 진실을 알게 된 나라면?",
    "question": "영화 속 사람들은 ‘아일랜드’에 가는 것을 행운이라고 믿는다. 나만 그곳의 진실을 알게 되었는데, 가장 친한 친구가 당첨되어 기뻐하고 있다면 나는 어떻게 할까? 친구가 “너는 내가 당첨된 게 질투 나는 거지?”라며 믿지 않는다면, 그다음에는 어떻게 할까?",
    "mode": "THINK_PEER_REVIEW",
    "thinkStages": [
      "T",
      "H",
      "I",
      "N",
      "K"
    ],
    "aiResponseMode": "THOUGHT_PROVOKING",
    "aiQuestionLimit": 12
  },
  {
    "id": "lesson-2",
    "number": 2,
    "title": "2차시 · 내 가족을 살릴 수 있다면?",
    "question": "내 가족이 위독하다. 영화 속 회사는 복제인간에게서 장기를 받으면 살릴 수 있다고 말한다. 그런데 수술을 앞두고 그 복제인간이 나를 만나고 싶다고 한다. 나는 그 사람과 어떤 이야기를 나누게 될까? 만남 이후에도 내 선택은 같을까?",
    "mode": "THINK_PEER_REVIEW",
    "thinkStages": [
      "T",
      "H",
      "I",
      "N",
      "K"
    ],
    "aiResponseMode": "THOUGHT_PROVOKING",
    "aiQuestionLimit": 12
  },
  {
    "id": "lesson-3",
    "number": 3,
    "title": "3차시 · 내 유전자를 바꿀 수 있다면?",
    "question": "유전자를 바꿔 질병을 치료하거나 원하는 특징을 가질 수 있는 시대가 왔다고 가정해 보자. 친구가 말했다. “나는 바꿀 거야. 너는?” 나는 무엇을 바꾸고 무엇을 그대로 두고 싶을까? 이런 선택이 흔해진 학교에서 우리는 어떻게 살아가게 될까?",
    "mode": "THINK_PEER_REVIEW",
    "thinkStages": [
      "T",
      "H",
      "I",
      "N",
      "K"
    ],
    "aiResponseMode": "THOUGHT_PROVOKING",
    "aiQuestionLimit": 12
  }
]
};
