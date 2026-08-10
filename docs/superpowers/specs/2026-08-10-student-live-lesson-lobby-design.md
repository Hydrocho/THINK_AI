# 학생 실시간 수업 로비 설계

## 목표

학생은 로그인 후 자신의 학급에서 교사가 현재 열어 둔 차시 하나에만 입장한다. PIN 입력과 레거시 활동 목록을 제거하고, 현재 수업과 개인 학습 기록을 명확히 분리한다.

## 범위

- 학생 로비, 학생 수업 진입, 학생용 수업 조회 API, THINK 화면의 차시 바인딩을 수정한다.
- 학급당 열린 차시는 하나로 제한한다.
- 교사가 설정한 차시별 THINK 단계 접근 권한을 학생 화면에 그대로 적용한다.
- 학생의 초안·제출 기록은 별도 목록으로 표시한다.

## 범위 밖

- PIN 발급·검증·관리 기능은 제공하지 않는다.
- 여러 차시를 동시에 여는 기능은 제공하지 않는다.
- 교사 수업 운영 화면의 정보 구조를 전면 개편하지 않는다. 다만 실제 열린 세션 상태를 정확히 읽도록 보완한다.

## 화면 구조

### 학생 로비

1. 환영 헤더 아래에 `현재 열린 수업` 카드 하나를 둔다.
2. 열린 세션이 있으면 프로젝트명, 차시명, 핵심 질문, 열려 있는 THINK 단계 요약, `수업 입장` 버튼을 표시한다.
3. 열린 세션이 없으면 같은 위치에 `현재 열린 수업이 없습니다. 선생님이 수업을 열면 자동으로 표시됩니다.` 안내를 표시한다.
4. PIN 입력 카드를 제거한다.
5. `나의 활동 및 생각 기록`에는 현재 세션이 아닌 개인 초안·제출 기록을 차시 단위로 표시한다. 기록이 없으면 빈 상태를 표시한다.

### 학생 THINK 화면

- 선택된 실시간 차시의 프로젝트명·차시명·핵심 질문·활성 THINK 단계를 표시한다.
- `hidden` 단계는 잠금 안내만 표시한다.
- `read_only` 단계는 저장과 입력을 막고 읽기 전용 안내를 표시한다.
- `writable` 단계만 작성·저장·제출할 수 있다.
- 수업 화면의 차시 선택 드롭다운과 하드코딩된 예시 차시는 제거한다. 학생은 로비의 현재 열린 수업으로만 진입한다.

## 서버 데이터 계약

`get-student-lessons` Edge Function은 인증된 학생의 이메일에서 학년·반을 계산한다. 이후 해당 학급의 현재 열린 세션을 조회하고, 그 세션의 차시와 다음 데이터를 반환한다.

```ts
type StudentLiveLessonResponse = {
  liveLesson: null | {
    classId: string;
    sessionId: string;
    projectId: string;
    projectTitle: string;
    lesson: {
      id: string;
      number: number;
      title: string;
      coreQuestion: string;
      thinkStages: Array<'T' | 'H' | 'I' | 'N' | 'K'>;
      aiQuestionLimit: number;
      aiResponseMode: 'THOUGHT_PROVOKING' | 'GENERAL';
      thinkStageAccess: Record<string, 'hidden' | 'read_only' | 'writable'>;
    };
  };
  history: Array<{
    lessonPlanId: string;
    projectTitle: string;
    lessonTitle: string;
    status: 'draft' | 'submitted';
    updatedAt: string;
  }>;
};
```

- `liveLesson`은 `class_sessions.status = 'open'`인 세션에서만 생성한다.
- 여러 open 세션이 데이터에 존재할 경우 가장 최근 `opened_at`을 우선 반환하되, 서버의 수업 열기 로직은 같은 학급에서 기존 open 세션을 먼저 닫아 하나만 유지해야 한다.
- 단계 권한은 `class_lesson_stage_access`를 우선하고, 행이 없으면 `hidden`으로 처리한다.
- 학생 응답·기록 조회는 학생 본인 데이터만 포함한다.

## 클라이언트 경계

- `SupabaseService.fetchStudentLiveLesson()`은 위 응답만 반환한다.
- `StudentLobbyModule.renderLobby(state)`는 로비의 로딩·오류·빈 상태와 liveLesson/history 렌더링만 담당한다.
- `StudentLobbyModule.enterLiveLesson(state, lesson)`은 선택한 liveLesson을 `state.activeLessonPlans`에 설정하고 THINK 화면으로 전환한다.
- `App.selectLesson()`과 `StudentThinkModule.renderStep()`은 동일한 활성 차시 객체를 사용한다.
- 학생 로비에서는 `fetchActivities()`를 호출하지 않는다.

## 오류 처리

- API 오류 시 로비에 재시도 가능한 오류 메시지를 보이고 수업 진입 버튼을 표시하지 않는다.
- `liveLesson`이 없을 때 수업 화면으로 전환하지 않는다.
- 로비가 다시 열릴 때마다 서버에서 현재 세션을 다시 조회한다.

## 검증 기준

1. PIN 관련 입력·버튼·클라이언트 진입 함수가 학생 로비에 남아 있지 않다.
2. 열린 수업이 없으면 학생은 수업 화면에 들어갈 수 없다.
3. 열린 수업이 하나 있으면 해당 차시 정보와 입장 버튼이 표시된다.
4. 열린 수업이 교체되면 새 차시만 표시되고 입장 시 새 차시가 렌더링된다.
5. `hidden`, `read_only`, `writable` 단계가 각각 잠금·읽기 전용·작성 가능으로 동작한다.
6. 학생 로비가 레거시 `activities`를 읽지 않는다.
7. DOM ID가 로비·THINK 뷰·스크립트 간에 일치한다.
