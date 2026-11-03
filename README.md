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

## 사용 흐름

- **학생**: 가입(Google 또는 이메일) → 이름 입력 → 강사 승인 → 오늘 계획 체크, [🚀 시작]으로 타이머 + 시작 카톡, [🟡 부분 완료], [마감 보고]
- **강사**: [현황판]에서 오늘 누가 시작했는지·늦었는지 확인 → [학생]에서 주간 계획표 만들기·수정, 강사 전용 메모, 학부모 리포트 → [설정]에서 앱 이름·과목·이용 안내 수정
- **새 주**: [학생] → 학생 선택 → [새 주 만들기]. 지난주 과제 복사, 덜 끝낸 과제 이월을 고를 수 있어요.
- **예전 플래너(Netlify)에서 옮기기**: 예전 앱 코치 화면의 [🔗 계획표 링크 복사] 주소를 [새 주 만들기] 아래 '예전 플래너에서 가져오기'에 붙여넣기

## 개발용 명령어

```bash
npm install
npm run dev          # 실제 Firebase에 연결해서 실행
npm run dev:emu      # 테스트용 Firebase(에뮬레이터)에 연결해서 실행
npm run build        # 배포용 파일 만들기
npm test             # 계산·보고 문구·예전 데이터 가져오기 검사
npx -y firebase-tools@13.29.1 emulators:exec --project demo-rules-test --only firestore "npm run test:rules"   # 보안 규칙 테스트
```

## 폴더 구조

- `firestore.rules` — 누가 어떤 데이터를 보고 쓸 수 있는지 정하는 보안 규칙
- `src/lib/week.js` — 날짜, 달성률, 카톡 문구, 새 주 만들기, 예전 데이터 가져오기 (순수 계산)
- `src/views/student.js` — 학생 화면 (오늘 계획, 타이머, 주간표)
- `src/views/teacher.js` — 강사 화면 (현황판, 학생 관리, 설정)
- `src/store.js` — Firebase 실시간 데이터 연결
- `src/timer.js` — 끝나는 시각 기준 공부 타이머 (화면이 꺼져도 정확)
