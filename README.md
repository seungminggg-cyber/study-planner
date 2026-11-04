# 승민T 학습 플래너

학생별 주간 계획표, 100분 집중 + 20분 인출 타이머, 공부 시작 인증, 카톡 보고, 강사 현황판을 한곳에 모은 웹앱입니다.

- 화면: HTML + Tailwind CSS (Vite로 빌드)
- 로그인·데이터: Firebase (Authentication + Firestore + 알림용 Cloud Functions), Blaze 요금제 (무료 사용량 안에서 사용)
- 배포: GitHub Pages (main 브랜치에 올리면 자동 배포)
- 주소: https://seungminggg-cyber.github.io/study-planner/

## 처음 한 번만 하는 설정

1. **보안 규칙**: `firestore.rules`는 main에 올리면 GitHub Actions(`functions.yml`)가 테스트한 뒤 자동으로 게시해요. (처음 한 번은 Firebase 콘솔 → Firestore → 규칙 탭에 붙여넣기)
2. **GitHub Pages 켜기**: 저장소 Settings → Pages → Source를 **GitHub Actions**로 선택
3. **로그인 허용 주소 추가**: Firebase 콘솔 → Authentication → 설정 → 승인된 도메인 → `seungminggg-cyber.github.io` 추가
4. **강사(관리자) 계정 등록**
   1. 배포된 앱에서 강사님 Google 계정으로 로그인 → "강사(관리자) 계정으로 쓰시려면"을 펼쳐 ID 복사
   2. Firebase 콘솔 → Firestore → 데이터 → 컬렉션 시작 → 컬렉션 ID `admins`, 문서 ID에 복사한 ID 붙여넣기, 필드 `name` (string) = `승민T` → 저장
   3. 앱 새로고침 → 강사 화면이 열려요

## 폰 알림 설정 (앱이 꺼져 있어도 오는 알림)

Firebase Cloud Functions(`functions/index.js`)가 **5분마다** 보낼 알림이 있으면 보내요. (Blaze 요금제, 학생 수가 적으면 거의 0원)
Firebase가 15분 넘게 멈추면 GitHub(`scripts/push/send.mjs`)가 예비로 대신 보내요. (수십 분마다라 늦을 수 있어요)

1. Firebase 콘솔 → ⚙️ 프로젝트 설정 → **서비스 계정** → **새 비공개 키 생성** → JSON 파일이 내려받아져요
2. GitHub 저장소 → Settings → Secrets and variables → **Actions** → **New repository secret**
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Secret: 내려받은 JSON 파일을 메모장으로 열어 **전체 내용**을 붙여넣기 → Add secret
3. 내려받은 JSON 파일은 지우기 (Firebase 전체 열쇠라서 다른 곳에 두면 안 돼요)
4. Firebase 콘솔 → **Blaze 요금제로 업그레이드** (예산 알림 설정 권장)
5. [Google Cloud IAM](https://console.cloud.google.com/iam-admin/iam?project=seungmin-planner) → `firebase-adminsdk-…` 계정에 **편집자**, **Cloud Run 관리자** 역할 추가
6. GitHub 저장소 → **Actions** → **Deploy Firebase functions** → **Run workflow** (알림 코드가 바뀌면 자동으로 다시 배포돼요)
7. 앱 [설정] → 폰 알림 **켜기**, **이 기기에서 선생님 알림 받기** → '알림 서버 마지막 확인: 방금 전 (Firebase · 5분마다)'가 보이면 성공
8. 학생은 앱 위쪽 🔔 버튼 → **이 폰에서 알림 켜기** (아이폰은 먼저 홈 화면에 추가해야 해요)

- 새벽 2시~6시는 알림을 보내지 않아요.
- 예비 서버는 저장소에 60일 동안 아무 변화가 없으면 GitHub가 멈춰요. 그때는 Actions 탭에서 다시 켜 주세요.

## 사용 흐름

- **학생**: 가입(Google 또는 이메일) → 이름 입력 → 강사 승인 → 오늘 계획 체크, [🚀 시작]으로 타이머 + 시작 카톡, [🟡 부분 완료], [마감 보고]
- **강사**: [현황판]에서 오늘 누가 시작했는지·늦었는지 확인 → [학생]에서 주간 계획표 만들기·수정, 강사 전용 메모, 학부모 리포트 → [설정]에서 앱 이름·과목·이용 안내 수정
- **새 주**: [학생] → 학생 선택 → [새 주 만들기]. 지난주 과제 복사, 덜 끝낸 과제 이월을 고를 수 있어요.
- **하루 마무리**: 학생이 [마무리 + 보고]를 누르면 다 못 끝낸 과제를 다음 날로 넘기고 못 한 이유를 적어요. 지난 날 정리를 안 했으면 다음 날 위쪽에 알려 줘요.
- **기록**: 학생 화면 [기록] 탭과 강사 [학생] → [기록] 탭에서 주간·월간 달성률 그래프를 봐요.
- **학생 화면 보기**: 강사 [학생] → [학생 화면] 탭에서 학생이 보는 화면을 그대로(보기 전용) 볼 수 있어요.
- **7일 한 화면 편집**: 강사 [학생] → [계획표]에서 [7일 한 화면에]를 누르면 월~일 계획을 한 화면에서 고치고 과제를 넣을 수 있어요.
- **지난 플래너**: 학생 화면 계획표 제목 아래, 강사 [계획표] 주 선택 옆의 [지난 플래너] 버튼으로 지난 주 계획표를 골라 봐요.
- **화면 모드**: 위쪽 해/달 버튼으로 자동(폰 설정을 따름) → 밝게 → 어둡게를 바꿔요. 기기마다 따로 기억해요.
- **예전 플래너(Netlify)에서 옮기기**: 예전 앱 코치 화면의 [🔗 계획표 링크 복사] 주소를 [새 주 만들기] 아래 '예전 플래너에서 가져오기'에 붙여넣기
- **개인정보 동의**: 가입할 때(그리고 이미 가입한 학생은 다음 로그인 때 한 번) 수집·이용 안내에 동의해야 써요. 안내를 바꾸면 `src/store.js`의 `CONSENT_VERSION`을 올려 다시 동의를 받아요.
- **수강 종료·기록 삭제**: [학생] → 학생 → [설정]에서 [수강 종료](기록 보관, 다시 시작 가능) 또는 [기록 모두 삭제](계획표·일정·메모·로그인 계정까지, 이름을 입력해야 지워짐). 종료 후 1년이 지난 학생은 목록에 삭제 권장 표시.
- **피드백**: 강사 [계획표]에서 과제마다 💬 피드백, 하루마다 💬 한마디 → 학생 화면에 말풍선과 '새 피드백' 표시, 폰 알림.
- **계획표 빨리 만들기**: [새 주 만들기]에서 강·Day 번호 자동 올리기(Day 12~18 → 19~25), [과제 묶음]으로 자주 쓰는 과제를 여러 날에 한 번에, [이 주 과제를 다른 학생에게 복사], [이 날 과제를 다른 날에 복사]할 때 번호 하루씩 올리기.
- **일정(D-day)**: 학생 [일정] 탭·강사 [학생] → [일정]에서 시험·수행평가를 넣으면 학생 화면 위쪽에 D-day, D-3·D-1·당일 저녁 7시 폰 알림.
- **다음 주 계획표 알림**: 3일 안에 계획표가 비는 학생이 있으면 현황판 위쪽에 알려 주고, 하루 요약 시각에 폰 알림.
- **오프라인**: 인터넷이 끊겨도 체크한 내용은 기기에 저장했다가 연결되면 올라가요. 로그아웃하면 기기에 남긴 기록을 지워요. ('로그인 상태 유지'를 끄면 기기에 남기지 않음)

## 데이터 지키기

- **자동 백업**: Actions → **Cloud setup** → Run workflow 로 Firestore 백업 일정을 만들어요. 매일(7일 보관) + 매주 일요일(14주 보관). 되돌릴 일이 생기면 Claude에게 "백업에서 복구해 줘"라고 요청하세요.
- **App Check**: 같은 Cloud setup이 reCAPTCHA 키를 만들고 앱에 연결해요. 하루쯤 지켜본 뒤 `enforce` 칸에 `firestore`를 넣고 실행하면 우리 앱이 아닌 곳에서 오는 요청을 막아요. (`off`로 해제)

## 개발용 명령어

```bash
npm install
npm run dev          # 실제 Firebase에 연결해서 실행
npm run dev:emu      # 테스트용 Firebase(에뮬레이터)에 연결해서 실행
npm run build        # 배포용 파일 만들기
npm test             # 계산·보고 문구·예전 데이터 가져오기·폰 알림 판단 검사
npx -y firebase-tools@13.29.1 emulators:exec --project demo-rules-test --only firestore "npm run test:rules"   # 보안 규칙 테스트
```

## 폴더 구조

- `firestore.rules` — 누가 어떤 데이터를 보고 쓸 수 있는지 정하는 보안 규칙
- `src/lib/week.js` — 날짜, 달성률, 카톡 문구, 새 주 만들기, 예전 데이터 가져오기 (순수 계산)
- `src/views/student.js` — 학생 화면 (오늘 계획, 타이머, 주간표)
- `src/views/teacher.js` — 강사 화면 (현황판, 학생 관리, 설정)
- `src/store.js` — Firebase 실시간 데이터 연결
- `src/timer.js` — 끝나는 시각 기준 공부 타이머 (화면이 꺼져도 정확)
- `src/views/stats.js` — 주간·월간 그래프
- `src/push.js`, `src/views/pushSettings.js`, `public/sw.js` — 폰 알림 켜기·끄기와 알림 띄우기
- `functions/` — Firebase Cloud Functions: 5분마다 알림 보내기(`sendPush`), 학생 기록 완전 삭제(`deleteStudent`). `.github/workflows/functions.yml`이 보안 규칙과 함께 배포
- `src/views/events.js` — 시험·수행평가 일정, `src/views/privacy.js` — 개인정보 안내·동의
- `scripts/cloud/setup.mjs` — 백업·App Check 설정 (`.github/workflows/cloud-setup.yml`)
- `scripts/push/` — 알림 판단(`plan.mjs`)·보내기(`run.mjs`) 공용 코드, GitHub 예비 서버(`send.mjs`, `.github/workflows/push.yml`)
