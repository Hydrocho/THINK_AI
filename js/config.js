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

  // Curricular Topics (1차시 ~ 5차시)
  PROJECT_TITLE: "유전자 조작 기술, 인간에게 축복일까? 재앙일까?",
  LESSONS: [
    {
      id: "lesson-1",
      number: 1,
      title: "1차시 · 부모에게 물려받는 유전 형질 생각하기",
      question: "사람에게 나타나는 다양한 특징 중 부모에게서 물려받는 것은 어떤 것이 있을까?",
      mode: "THINK_WORDCLOUD",
      description: "T: 유전 형질 혼자 생각하기 / H: 친구들과 작성 내용 비교 (워드 클라우드)"
    },
    {
      id: "lesson-2",
      number: 2,
      title: "2차시 · '우성'과 '열성' 대체 용어 제안",
      question: "‘우성’과 ‘열성’이 형질의 우수함과 열등함을 뜻하는 것으로 오해되지 않도록 새로운 이름을 붙인다면 무엇이라고 부르면 좋을까?",
      mode: "THINK_PEER_REVIEW",
      description: "T: 대체어 혼자 작성하기 / H: 친구들의 대체어 의견 비교하기"
    },
    {
      id: "lesson-3",
      number: 3,
      title: "3차시 · 유전적 다양성이 없는 자손 집단의 문제",
      question: "만약 부모가 한 가지 형질에 대해 모두 같은 유전 정보를 가진 생식세포만 만들어 모든 자손이 동일한 형질을 나타낸다고 가정해 보자. 다양하지 않은 자손 집단에는 어떤 문제가 생길 수 있을까?",
      mode: "THINK_PEER_REVIEW",
      description: "T: 나 혼자 생각하기 / H: 친구들과 토의 후 의견 비교"
    },
    {
      id: "lesson-4",
      number: 4,
      title: "4차시 · 사람 대상 임의 개입의 윤리적 문제와 과학 연구 원칙",
      question: "완두와 달리 사람을 대상으로 연구자가 원하는 형질을 선택하여 교배 실험을 할 수는 없다. 만약 과학의 발전을 이유로 연구자가 사람의 배우자 선택과 자녀 출산에 임의로 개입한다면 어떤 윤리적 문제가 발생할까? 과학 연구에서는 어떤 원칙을 지켜야 하는지 생각해 보자.",
      mode: "THINK_PEER_REVIEW",
      description: "T: 윤리적 문제와 연구 원칙 개인 작성 / H: 익명 비교 / I: Gemini 대화"
    },
    {
      id: "lesson-5",
      number: 5,
      title: "5차시 · 색각 다양한 사용자를 고려한 디자인 생각",
      question: "우리 주변에서 색깔만으로 정보를 구분하는 사례는 무엇인가? 색을 다르게 인식하는 사람은 어떤 상황에서 필요한 정보를 구분하기 어려울지 생각해 보자.",
      mode: "THINK_PEER_REVIEW",
      description: "T: 사례 및 문제 상황 생각 / H: 익명 의견 비교 / I: Gemini 대화"
    }
  ]
};
