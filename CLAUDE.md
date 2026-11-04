# 승민T 학습 플래너 — 프로젝트 안내 (Claude용)

학원 강사(승민T)가 관리하는 학생들의 주간 학습 플래너 웹앱이다. 예전에 Gemini로 만든 한 학생(예원) 전용 단일 HTML 앱(Netlify + ntfy.sh 동기화)을 여러 학생용 Firebase 앱으로 다시 만들었다.
학생: 오늘 계획 체크, 100분 집중 + 20분 인출 타이머, 공부 시작 인증·카톡, 부분 완료·이월, 인출 메모, 마감 보고.
강사: 오늘 현황판, 학생 승인·설정, 주간 계획표 만들기·수정(복사·이월), 학생 화면 미리보기(보기 전용), 기록 그래프, 강사 전용 메모, 학부모 주간 리포트, 앱 설정, 폰 알림 설정.
학생: 하루 마무리(못 끝낸 과제 이월 + 못 한 이유), 기록(주간·월간 그래프), 🔔 폰 알림 켜기, 일정(시험 D-day·수행평가), 선생님 피드백 보기.
강사(2026-11 추가): 과제·하루 피드백, 강·Day 번호 자동 올리기, 과제 묶음, 다른 학생에게 복사, 다음 주 계획표 알림, 수강 종료(보관)·기록 완전 삭제.
공통: 개인정보 수집·이용 동의(가입 때·버전이 바뀌면 다시), 오프라인 저장.

## 사용자와 소통할 때
- 사용자는 비개발자인 강사다. **한국어로, 쉬운 말로**, 결과부터 짧게 설명한다.
- 화면 문구와 코드 주석도 한국어로 쓴다.
- 큰 변경 전에는 간단히 확인받고, 배포 후에는 무엇이 바뀌었는지 정리해 준다.
- 같은 강사의 다른 앱: `seungminggg-cyber/common-social-studies` (통합사회). 구조·부품(html.js, drafts, morphdom 렌더, install.js, sw.js)을 이 앱과 공유한다.

## 기술 구성
- Vite + 순수 JS(프레임워크 없음) + Tailwind CSS 3(`planner` 초록 색상). 아이콘 Font Awesome, 글꼴 Pretendard (npm 번들).
- Firebase 프로젝트 `seungmin-planner`: Authentication(Google, 이메일/비밀번호) + Firestore(서울) + Cloud Functions(알림). **Blaze 요금제**지만 무료 사용량 안에서 쓰는 것이 목표.
- 배포: GitHub Pages. `main`에 push하면 `.github/workflows/deploy.yml`이 테스트·빌드·배포. 보안 규칙·Functions는 `functions.yml`(규칙 테스트 통과 후 `--only functions,firestore:rules`). 주소 https://seungminggg-cyber.github.io/study-planner/ (vite `base` = `/study-planner/`)
- PWA: `public/manifest.webmanifest`, `public/sw.js`(network-first, push 수신·알림 표시·클릭 처리), `src/install.js`(설치 배너).
- 폰 알림: 기기 토큰은 FCM(`src/push.js`, 기본 VAPID 키) → `push/{uid}`. 프로젝트는 **Blaze 요금제**(2026-11부터, 알림 서버 때문).
  - 보내기: Cloud Functions `functions/index.js`의 `sendPush`(onSchedule 5분마다, asia-northeast3). 판단은 `scripts/push/plan.mjs`(순수 함수, tests/push.test.js), 읽기·보내기·기록은 `scripts/push/run.mjs`의 `runOnce`.
  - 배포: `.github/workflows/functions.yml`(관련 파일이 main에 올라가면 자동 + 수동 실행). `firebase.json` predeploy가 `functions/copy-shared.mjs`로 공용 파일을 `functions/shared/`에 복사(git 무시). 배포 계정은 Secret `FIREBASE_SERVICE_ACCOUNT`(편집자 + Cloud Run 관리자 역할), 워크플로에서는 `google-github-actions/auth`로 로그인.
  - 알림 종류: 시작·늦음·타이머(학생), 늦은 학생·하루 요약·다음 주 계획표 없음(선생님, 요약 시각), 피드백 도착(학생, 쓰고 2분 뒤), 시험·수행평가 D-3·D-1·당일(학생·선생님, 19:00~19:15에만 `events` 문서를 읽음).
- 학생 기록 완전 삭제: callable `deleteStudent`(asia-northeast3, 호출자가 admins인지 확인 → users 재귀 삭제 + notes/push/events + Auth 계정). 앱은 `callFunction()`(firebase.js, firebase/functions를 쓸 때만 불러옴). 가입 거절도 이것을 씀.
- 백업·App Check: `scripts/cloud/setup.mjs`(`cloud-setup.yml`, 수동 실행·여러 번 안전). Firestore 백업 일정 매일 7일 + 매주 14주. reCAPTCHA Enterprise 키(github.io 도메인) → App Check 웹 앱 연결(토큰 1일). `enforce` 입력으로 Firestore 적용/해제.
  - 예비: GitHub Actions `push.yml`(cron 10분, 실제로는 수십 분)이 `scripts/push/send.mjs` 실행. `config/push_status.runner`가 `firebase`이고 15분 안에 돌았으면 쉼.
  - 새벽 2~6시(한국 시간)는 쉼. 실행할 때마다 `config/push_status`에 `lastRun`, `runner`, 결과를 남기고 선생님 [설정]에 보여 줌.

## 명령어
```bash
npm install
npm run build
npm test                      # tests/week.test.js + tests/push.test.js (계산·문구·이월·예전 데이터·알림 판단)
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 DRY_RUN=1 FORCE=1 PUSH_NOW_MS=<ms> node scripts/push/send.mjs   # 알림 서버를 에뮬레이터로 확인 (실제로 보내진 않고 기록만, scripts/push 에서 npm ci 먼저)
cd functions && npm ci && node copy-shared.mjs   # Cloud Function을 로컬에서 불러 보기 전에
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
- `src/views/archive.js` — 지난 플래너 목록 팝업(학생·강사 공용, `ctx()` 사용, 달성률은 stats.js `getWeek` 캐시로 한 번만 읽음), '이번 주로' 버튼.
- 강사 계획표 편집은 `S.ui.tLayout`(day | week, 기기에 기억). week = `weekGrid()` 7일 카드, 과제 추가 폼은 hidden `date` 칸을 보냄.
- 다크 모드: `tailwind.config.js`가 planner 색과 slate·amber 등 기본 색을 CSS 변수로 바꾸고 `html.dark`에서 어두운 값으로 뒤집는다. 화면 코드에는 `dark:`를 쓰지 않는다.
  - 흰 바탕은 `bg-white` 대신 `bg-planner-surface`, 버튼 눌림은 `hover:bg-planner-deep`(planner-dark는 어두운 화면에서 밝은 글자색이라 바탕으로 쓰지 않음).
  - 어두운 화면에서도 진해야 하는 것(팝업 배경 `bg-black/50`, 토스트·말풍선 `bg-[#1e293b]`)은 고정 색. 그래프 막대 색은 `--chart-accent`/`--chart-base`(밝은·어두운 화면 각각 대비 검사 통과).
  - 모드 저장·적용은 `src/theme.js`, 깜빡임 방지는 index.html 머리의 짧은 스크립트.
- `src/firebase.js` — Firestore는 `persistentLocalCache`(로그인 유지 기기만, 아니면 메모리). 로그아웃하면 `clearLocalDataAndReload()`로 기기 기록 삭제. 저장은 `data.js`의 `settle()`로 서버 확인을 2.5초까지만 기다림(오프라인이어도 화면이 멈추지 않게, 나중에 실패하면 토스트).
- 역할 `ended`(수강 종료): `users.status='ended'`, `endedAt`. 규칙상 계획표·일정 못 봄. 현황판·알림에서 빠짐. 동의 화면은 student/pending만(`needsConsent`, `CONSENT_VERSION`).
- `src/views/events.js` — 일정(`events/{uid}.items`), 학생 [일정] 탭·강사 [학생]→[일정]·오늘 화면 D-day 띠. `src/views/privacy.js` — 개인정보 안내·동의 화면.
- 피드백: `tasks.{id}.fb/fbAt`, `days.{날짜}.fb/fbAt`(강사가 씀). 학생이 본 시각은 기기 localStorage `fbSeen:{uid}`. 보고 있는 날은 바로 본 것으로 처리.
- 과제 묶음: `templates/{id}` {name, tasks[]}(강사만). 다른 학생 복사는 `freshTaskCopies`(진행·메모·피드백 빼고, 이월 과제 제외). 번호 올리기는 `numberToken`/`bumpTitle`/`seriesOffsets`(week.js).
- 동작 함수 안에서 날짜가 필요하면 화면 그릴 때 정한 값에 기대지 말고 `currentDate()` / `editDate()`로 그 순간 계산한다 (렌더 전에 저장되면 날짜가 비는 버그가 있었음).

## Firestore 데이터 구조
- `admins/{uid}` — 강사 계정 표시. 콘솔에서만 추가.
- `config/app` — `appTitle`, `teacherName`, `subjects`(과목 목록, 순서대로 색), `guide`(학생 이용 안내 단계).
- `users/{uid}` — `name`, `status: pending|approved`, `email`, `provider`, `weekIds`(강사가 만든 주 시작 날짜 목록), 학생별 설정 `periods`, `focusMin`, `outputMin`, `defaultTarget`, `parentTitle`.
- `users/{uid}/weeks/{시작날짜}` — `start`, `title`, `goals[]`, `days{날짜: {target, startedAt, memo, focus, reason, closedAt}}`, `tasks{id: {date, period, time, subject, title, status, progress, note, order, by, carriedTo?, from?, fromId?}}`, `updatedAt`, `studentAt`(학생 마지막 활동).
  - 이월: 원래 과제에 `carriedTo`(넘긴 날짜), 새 과제에 `from`/`fromId`. 넘길 날이 다음 주면 다음 주 문서에 씀(있을 때만). `buildWeek`는 `carriedTo` 있는 과제를 다시 이월하지 않음.
  - 학생은 `tasks`, `days`, `updatedAt`, `studentAt`만 수정 가능(규칙). 제목·목표·생성·삭제는 강사만.
- `notes/{uid}` — 강사 전용 메모. 학생은 읽을 수 없음.
- `push/{uid}` — `tokens[]`(기기 FCM 토큰, 최대 10), `timerEndAt`, `timerStage`, `timerLabel`, `sent`(서버가 쓰는 보낸 기록: `start:날짜`, `late:날짜`, `timer`, `fb`, `dl:날짜`, `nw:날짜` 등). 본인만 쓰기, 강사 읽기.
- `events/{uid}` — `items{id: {kind: exam|perf, title, date, subject, done, by, createdAt}}`. 승인된 본인·강사 읽기/쓰기(100개까지), 삭제는 강사.
- `templates/{id}` — 강사 과제 묶음. `users/{uid}`에 `consentAt`, `consentVer`(본인이 이 둘만 수정 가능), `endedAt`.
- `config/app.push` — `on`(전체), `start`, `late`, `timer`, `teacherLate`, `summary`, `summaryTime`, `feedback`, `deadline`, `nextWeek` (기본값은 `src/push.js`와 `scripts/push/plan.mjs` 두 곳에 같게). `config/push_status` — 서버 마지막 실행.
- 선생님 알림 대상은 `admins` 컬렉션으로 확인한다(push 문서의 값은 믿지 않음).
- 보안 규칙: `firestore.rules`. 바꾸면 `tests/rules.test.js`도 고친다. main에 올리면 `functions.yml`이 규칙 테스트 후 자동 게시(콘솔에 붙여넣을 필요 없음).

## 꼭 지켜야 할 점
- **무료 사용량**: 읽기 5만/일, 쓰기 2만/일. 학생 화면은 보고 있는 주 문서 1개만 실시간으로 본다. 현황판은 학생 수만큼 문서를 보므로 현황판 탭에 있을 때만 연결한다. 입력칸 저장은 `debounceSave`로 묶는다.
- 학생 이름·기록 같은 개인정보를 코드나 테스트에 넣지 않는다(공개 저장소).
- 작업 브랜치 `claude/planner-app`에 커밋·push한 뒤 `main`으로 fast-forward push해서 배포한다(강사 동의 하에).

- 화면 테스트 예시: scratchpad의 flow6.js처럼 `page.clock.setFixedTime`과 `timezoneId: 'Asia/Seoul'`로 날짜를 고정하고, firebase-admin(functions/node_modules)으로 데이터를 넣는다. 목표 시작 시각이 지나 있으면 시작 알림 팝업이 버튼을 가리니 주의.

## 다음 후보 기능
- 카톡 보내기 선택, 실제 공부 시간 집계, 학부모 열람 링크, 수강·결제일 관리, 기록 내보내기.
