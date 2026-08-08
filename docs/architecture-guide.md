# THINK 프로젝트 화면·스크립트 연결 지침서

## 1. 화면을 불러오는 순서

`index.html`은 공통 상단 바와 `#viewContainer`만 가진 시작 파일이다. `js/componentLoader.js`가 아래 HTML 조각을 비동기로 불러와 `#viewContainer`에 넣는다.

| 화면 파일 | 역할 |
| --- | --- |
| `views/authView.html` | 학생·교사 로그인 화면 |
| `views/studentLobbyView.html` | 학생 수업 선택 로비 |
| `views/studentThinkView.html` | 학생 THINK 학습 화면 |
| `views/teacherAdminView.html` | 교사용 수업·계정 관리 화면 |
| `views/modalsView.html` | 활동 생성, 학생 일괄 생성 모달 |

화면 HTML을 바꿨는데 브라우저에서 보이지 않으면, 먼저 해당 화면이 위 목록 중 어느 파일인지 확인한다. `componentLoader.js`는 캐시 없이 다시 불러오도록 설정되어 있다.

## 2. JavaScript 역할

| 파일 | 책임 | 연결 대상 |
| --- | --- | --- |
| `js/app.js` | 전체 화면 전환, 로그인 세션 복원, 전역 `App` 제공 | 모든 화면의 `onclick`, `onsubmit` |
| `js/componentLoader.js` | HTML 조각을 불러와 화면 구성 | `index.html`, `views/*.html` |
| `js/supabase-client.js` | Supabase Auth·DB·Edge Function 호출 | 모든 데이터 처리 모듈 |
| `js/modules/auth.js` | 학생/교사 로그인과 로그아웃 | `authView.html`, `App.handleStudentLogin` |
| `js/modules/studentManager.js` | 교사의 학생 조회, 일괄 생성, 비밀번호 초기화 | `teacherAdminView.html`, `modalsView.html` |
| `js/modules/masterAdmin.js` | 마스터 교사의 교사 승인·거절 | `teacherAdminView.html` |
| `js/modules/teacherAdmin.js` | 교사 대시보드 탭 및 수업 화면 | `teacherAdminView.html` |
| `js/modules/studentLobby.js` | 학생 수업 로비 | `studentLobbyView.html` |
| `js/modules/studentThink.js` | 학생 THINK 단계 화면 | `studentThinkView.html` |
| `js/modules/rosterParser.js` | 붙여넣은 학생 명단 해석 및 미리보기 | `studentManager.js` |
| `js/modules/passwordPolicy.js` | 새 비밀번호 규칙 검사 | 비밀번호 변경 화면 구현 시 사용 |

## 3. 학생 비밀번호 관련 현재 연결

```text
교사 화면의 '비밀번호 재설정' 버튼
  → StudentManagerModule.resetPassword(studentId, studentNumber)
  → 초기화 확인 창
  → SupabaseService.resetStudentPassword(studentId)
  → manage-student-accounts Edge Function (reset_password)
  → Supabase Auth 비밀번호 변경
```

현재 이 흐름은 기존 방식이다. 따라서 버튼을 누르면 교사가 새 비밀번호를 입력하는 창이 나타난다.

현재 비밀번호 초기화와 변경 흐름은 아래와 같다.

```text
교사 재설정 확인
  → 비밀번호를 000000으로 초기화
  → student_accounts.must_change_password = true

학생 로그인
  → 변경 필요 상태 확인
  → 전용 비밀번호 변경 화면
  → 변경 성공 시 must_change_password = false
  → 학생 로비 진입
```

## 4. 서버 측 파일

| 파일 | 역할 |
| --- | --- |
| `supabase/migrations/*.sql` | DB 테이블·권한(RLS) 구조 변경 |
| `supabase/functions/manage-student-accounts/index.ts` | 승인된 교사의 학생 계정 일괄 생성·초기화 |
| `supabase/functions/manage-teacher-requests/index.ts` | 마스터 교사의 교사 승인·거절 |
| `supabase/functions/change-student-password/index.ts` | 학생의 비밀번호 변경 필요 상태 조회 및 강제 비밀번호 변경 |

브라우저 JavaScript에는 Supabase 공개 키만 두고, `SUPABASE_SERVICE_ROLE_KEY`는 Edge Function에만 둔다.

## 5. 변경 작업 체크 순서

1. 화면 문구·입력칸 변경: `views/*.html`
2. 버튼 동작 변경: 연결된 `js/modules/*.js`
3. DB 데이터나 권한 변경: 새 `supabase/migrations/*.sql`
4. 관리자 권한 또는 Auth 변경: `supabase/functions/*/index.ts`
5. API 호출 변경: `js/supabase-client.js`
6. `tests/` 테스트 실행 후 브라우저에서 실제 흐름 확인

## 6. 자주 혼동되는 항목

- `favicon.ico 404`는 사이트 기능과 무관한 브라우저 아이콘 요청 오류다.
- 브라우저의 `127.0.0.1:5500`은 로컬 정적 서버 주소다. Supabase 데이터는 별도 클라우드 프로젝트에서 처리된다.
- HTML 파일만 수정해도 동작이 바뀌지는 않는다. 버튼이 호출하는 JavaScript 함수도 함께 확인해야 한다.
