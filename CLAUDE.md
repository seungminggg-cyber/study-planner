# 승민T 학습 플래너 — 프로젝트 안내 (Claude용)

학원 강사(승민T)가 관리하는 학생들의 주간 학습 플래너 웹앱이다. 예전에 Gemini로 만든 한 학생(예원) 전용 단일 HTML 앱(Netlify + ntfy.sh 동기화)을 여러 학생용 Firebase 앱으로 다시 만들었다.
학생: 오늘 계획 체크, 100분 집중 + 20분 인출 타이머, 공부 시작 인증·카톡, 부분 완료·이월, 인출 메모, 마감 보고.
강사: 오늘 현황판, 학생 승인·설정, 주간 계획표 만들기·수정(복사·이월), 학생 화면 미리보기(보기 전용), 기록 그래프, 강사 전용 메모, 학부모 주간 리포트, 앱 설정, 폰 알림 설정.
학생: 하루 마무리(못 끝낸 과제 이월 + 못 한 이유), 기록(주간·월간 그래프), 🔔 폰 알림 켜기.

## 사용자와 소통할 때
- 사용자는 비개발자인 강사다. **한국어로, 쉬운 말로**, 결과부터 짧게 설명한다.
- 화면 문구와 코드 주석도 한국어로 쓴다.
- 큰 변경 전에는 간단히 확인받고, 배포 후에는 무엇이 바뀌었는지 정리해 준다.
- 같은 강사의 다른 앱: `seungminggg-cyber/common-social-studies` (통합사회). 구조·부품(html.js, drafts, morphdom 렌더, install.js, sw.js)을 이 앱과 공유한다.

## 기술 구성
- Vite + 순수 JS(프레임워크 없음) + Tailwind CSS 3(`planner` 초록 색상). 아이콘 Font Awesome, 글꼴 Pretendard (npm 번들).
- Firebase 프로젝트 `seungmin-planner`: Authentication(Google, 이메일/비밀번호) + Firestore(서울). **무료(Spark) 요금제**.
- 배포: GitHub Pages. `main`에 push하면 `.github/workflows/deploy.yml`이 테스트·빌드·배포. 주소 https://seungminggg-cyber.github.io/study-planner/ (vite `base` = `/study-planner/`)
- PWA: `public/manifest.webmanifest`, `public/sw.js`(network-first, push 수신·알림 표시·클릭 처리), `src/install.js`(설치 배너).
- 폰 알림(무료 방식): 기기 토큰은 FCM(`src/push.js`, 기본 VAPID 키) → `push/{uid}`. 보내기는 Cloud Functions(유료) 대신 GitHub Actions `push.yml`이 10분마다 `scripts/push/send.mjs`(firebase-admin, 저장소 Secret `FIREBASE_SERVICE_ACCOUNT`)를 실행. 누구에게 무엇을 보낼지는 `scripts/push/plan.mjs`(순수 함수, tests/push.test.js). 새벽 2~6시(한국 시간)는 쉼. 서버는 실행할 때마다 `config/push_status`에 마지막 실행 시각을 남김.

## 명령어
```bash
npm install
npm run build
npm test                      # tests/week.test.js + tests/push.test.js (계산·문구·이월·예전 데이터·알림 판단)
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 DRY_RUN=1 PUSH_NOW_MS=<ms> node scripts/push/send.mjs   # 알림 서버를 에뮬레이터로 확인만 (scripts/push 에서 npm ci 먼저)
npm run dev:emu               # 에뮬레이터에 연결해서 실행 (VITE_USE_EMULATOR=1)
npx -y firebase-tools@13.29.1 emulators:exec --project demo-rules-test --only firestore "npm run test:rules"   # 보안 규칙 테스트
```
- 화면 테스트: `npx -y firebase-tools@13.29.1 emulators:start --project seungmin-planner --only auth,firestore` + `npm run dev:emu`를 켜고 Playwright로 강사·학생 흐름을 돌린다.
  - 강사 계정은 Auth 에뮬레이터 REST(`accounts:signUp`)로 만들고 `admins/{uid}` 문서를 `Authorization: Bearer owner`로 넣는다.
- 이 클라우드 환경에서는 github.io, apis.google.com 등이 막혀 있어 배포된 사이트를 직접 열어 볼 수 없다.

## 코드 구조
- `src/main.js` — 화면 그리기(morphdom으로 바뀐 부분만 갱신), 이벤트 위임, 타이머 연결, 30초마다 시작 알림 확인.
  - 클릭 `data-action`, 폼 제출 `data-submit`, 변경 `data-change`, 입력 `data-input`. view 파일이 `xxxActions`를 내보내고 main에서 합친다.
  - 포커스된 입력칸(끌고 있는 슬라이더 포함)은 다시 그리지 않는다. 폼 안 입력값은 `lib/drafts.js`에 임시 저장.
- `src/lib/html.js` — `html` 태그 템플릿이 값을 **자동 이스케이프**(XSS 방지). 검증된 HTML만 `raw()`.
- `src/lib/week.js` — Firebase와 무관한 순수 계산: 날짜, 정렬(새벽 시간은 밤 뒤로), 달성률, 늦음 판단, 카톡·리포트 문구, `buildWeek`(복사·이월), `parseLegacyPlan`(예전 앱 `#plan=` 링크 가져오기). **로직을 바꾸면 tests/week.test.js도 고친다.**
- `src/store.js` — 전역 상태 `S`, 실시간 리스너(키 접두사: `r:` 역할별, `d:` 현황판, `e:` 강사 편집), 역할 판별, `settingsOf(user)`.
- `src/data.js` — 저장 함수. 과제·요일은 필드 경로(`tasks.{id}.status`, `days.{날짜}.memo`)로 부분 저장해서 동시 수정 충돌을 피한다.
- `src/views/student.js`, `src/views/teacher.js`, `src/views/planner.js`(공통 조각·공유/안내 팝업), `src/views/auth.js`.
- `src/timer.js` — 끝나는 시각 기준 2단계 타이머(localStorage 저장). 집중 완주 시 `days.{날짜}.focus` +1. 알림을 켠 학생이면 `push/{uid}.timerEndAt`도 갱신(main.js).
- `src/views/student.js` — `ctx()`가 '지금 보는 학생'을 돌려줌: 학생 본인 또는 강사 미리보기(`readOnly`, 선택한 학생·`S.t.week`). 쓰기 동작은 `blocked()`로 막는다. 안쪽 탭은 `S.ui.sview`(today|table|stats).
- `src/views/stats.js` — 주간·월간 그래프(HTML 막대, 라이브러리 없음). 지난 주 문서는 기록 탭을 열 때만 `getDoc`으로 한 번 읽고 메모리에 기억.
- 팝업 배경(`data-self`)은 배경을 직접 눌렀을 때만 닫힌다(main.js 클릭 처리). 팝업 안 폼 제출이 막혔던 버그가 있었음.
- 동작 함수 안에서 날짜가 필요하면 화면 그릴 때 정한 값에 기대지 말고 `currentDate()` / `editDate()`로 그 순간 계산한다 (렌더 전에 저장되면 날짜가 비는 버그가 있었음).

## Firestore 데이터 구조
- `admins/{uid}` — 강사 계정 표시. 콘솔에서만 추가.
- `config/app` — `appTitle`, `teacherName`, `subjects`(과목 목록, 순서대로 색), `guide`(학생 이용 안내 단계).
- `users/{uid}` — `name`, `status: pending|approved`, `email`, `provider`, `weekIds`(강사가 만든 주 시작 날짜 목록), 학생별 설정 `periods`, `focusMin`, `outputMin`, `defaultTarget`, `parentTitle`.
- `users/{uid}/weeks/{시작날짜}` — `start`, `title`, `goals[]`, `days{날짜: {target, startedAt, memo, focus, reason, closedAt}}`, `tasks{id: {date, period, time, subject, title, status, progress, note, order, by, carriedTo?, from?, fromId?}}`, `updatedAt`, `studentAt`(학생 마지막 활동).
  - 이월: 원래 과제에 `carriedTo`(넘긴 날짜), 새 과제에 `from`/`fromId`. 넘길 날이 다음 주면 다음 주 문서에 씀(있을 때만). `buildWeek`는 `carriedTo` 있는 과제를 다시 이월하지 않음.
  - 학생은 `tasks`, `days`, `updatedAt`, `studentAt`만 수정 가능(규칙). 제목·목표·생성·삭제는 강사만.
- `notes/{uid}` — 강사 전용 메모. 학생은 읽을 수 없음.
- `push/{uid}` — `tokens[]`(기기 FCM 토큰, 최대 10), `timerEndAt`, `timerStage`, `timerLabel`, `sent`(서버가 쓰는 보낸 기록). 본인만 쓰기, 강사 읽기.
- `config/app.push` — `on`(전체), `start`, `late`, `timer`, `teacherLate`, `summary`, `summaryTime`. `config/push_status` — 서버 마지막 실행.
- 선생님 알림 대상은 `admins` 컬렉션으로 확인한다(push 문서의 값은 믿지 않음).
- 보안 규칙: `firestore.rules`. 바꾸면 `tests/rules.test.js`도 고치고, 강사에게 Firebase 콘솔 규칙 탭에 붙여넣어 달라고 안내해야 한다(자동 배포되지 않음).

## 꼭 지켜야 할 점
- **무료 사용량**: 읽기 5만/일, 쓰기 2만/일. 학생 화면은 보고 있는 주 문서 1개만 실시간으로 본다. 현황판은 학생 수만큼 문서를 보므로 현황판 탭에 있을 때만 연결한다. 입력칸 저장은 `debounceSave`로 묶는다.
- 학생 이름·기록 같은 개인정보를 코드나 테스트에 넣지 않는다(공개 저장소).
- 작업 브랜치 `claude/planner-app`에 커밋·push한 뒤 `main`으로 fast-forward push해서 배포한다(강사 동의 하에).

## 다음 후보 기능
- 과제 순서 바꾸기, 다른 학생 계획표 복사(템플릿), 선생님 칭찬·피드백 댓글, 연속 시작 스트릭, 시험 D-day, 학부모 열람 링크.
