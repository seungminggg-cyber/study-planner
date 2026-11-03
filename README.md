# 승민T 학습 플래너

학생별 주간 계획표, 100분 집중 + 20분 인출 타이머, 공부 시작 인증, 카톡 보고, 강사 현황판을 한곳에 모은 웹앱입니다.

- 화면: HTML + Tailwind CSS (Vite로 빌드)
- 로그인·데이터: Firebase (Authentication + Firestore), 무료(Spark) 요금제
- 배포: GitHub Pages (main 브랜치에 올리면 자동 배포)
- 주소: https://seungminggg-cyber.github.io/study-planner/

## 처음 한 번만 하는 설정

1. **보안 규칙 붙여넣기**: Firebase 콘솔 → Firestore → 규칙 탭 → `firestore.rules` 내용 전체를 붙여넣고 [게시]
2. **GitHub Pages 켜기**: 저장소 Settings → Pages → Source를 **GitHub Actions**로 선택
3. **로그인 허용 주소 추가**: Firebase 콘솔 → Authentication → 설정 → 승인된 도메인 → `seungminggg-cyber.github.io` 추가
4. **강사(관리자) 계정 등록**
   1. 배포된 앱에서 강사님 Google 계정으로 로그인 → "강사(관리자) 계정으로 쓰시려면"을 펼쳐 ID 복사
   2. Firebase 콘솔 → Firestore → 데이터 → 컬렉션 시작 → 컬렉션 ID `admins`, 문서 ID에 복사한 ID 붙여넣기, 필드 `name` (string) = `승민T` → 저장
   3. 앱 새로고침 → 강사 화면이 열려요

## 폰 알림 설정 (앱이 꺼져 있어도 오는 알림)

GitHub가 10분마다 `scripts/push/send.mjs`를 실행해서 보낼 알림이 있으면 보내요. (무료 방식이라 몇 분 늦게 올 수 있어요)

1. Firebase 콘솔 → ⚙️ 프로젝트 설정 → **서비스 계정** → **새 비공개 키 생성** → JSON 파일이 내려받아져요
2. GitHub 저장소 → Settings → Secrets and variables → **Actions** → **New repository secret**
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Secret: 내려받은 JSON 파일을 메모장으로 열어 **전체 내용**을 붙여넣기 → Add secret
3. 내려받은 JSON 파일은 지우기 (Firebase 전체 열쇠라서 다른 곳에 두면 안 돼요)
4. GitHub 저장소 → **Actions** → **Send phone notifications** → **Run workflow**로 한 번 실행
5. 앱 [설정] → 폰 알림 **켜기**, **이 기기에서 선생님 알림 받기** → '알림 서버 마지막 확인: 방금 전'이 보이면 성공
6. 학생은 앱 위쪽 🔔 버튼 → **이 폰에서 알림 켜기** (아이폰은 먼저 홈 화면에 추가해야 해요)

- 저장소에 60일 동안 아무 변화가 없으면 GitHub가 10분마다 실행을 멈춰요. 그때는 Actions 탭에서 다시 켜 주세요.
- 새벽 2시~6시는 알림을 보내지 않아요.

## 사용 흐름

- **학생**: 가입(Google 또는 이메일) → 이름 입력 → 강사 승인 → 오늘 계획 체크, [🚀 시작]으로 타이머 + 시작 카톡, [🟡 부분 완료], [마감 보고]
- **강사**: [현황판]에서 오늘 누가 시작했는지·늦었는지 확인 → [학생]에서 주간 계획표 만들기·수정, 강사 전용 메모, 학부모 리포트 → [설정]에서 앱 이름·과목·이용 안내 수정
- **새 주**: [학생] → 학생 선택 → [새 주 만들기]. 지난주 과제 복사, 덜 끝낸 과제 이월을 고를 수 있어요.
- **하루 마무리**: 학생이 [마무리 + 보고]를 누르면 다 못 끝낸 과제를 다음 날로 넘기고 못 한 이유를 적어요. 지난 날 정리를 안 했으면 다음 날 위쪽에 알려 줘요.
- **기록**: 학생 화면 [기록] 탭과 강사 [학생] → [기록] 탭에서 주간·월간 달성률 그래프를 봐요.
- **학생 화면 보기**: 강사 [학생] → [학생 화면] 탭에서 학생이 보는 화면을 그대로(보기 전용) 볼 수 있어요.
- **예전 플래너(Netlify)에서 옮기기**: 예전 앱 코치 화면의 [🔗 계획표 링크 복사] 주소를 [새 주 만들기] 아래 '예전 플래너에서 가져오기'에 붙여넣기

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
- `scripts/push/` — 10분마다 알림을 보내는 서버 스크립트 (`.github/workflows/push.yml`)
