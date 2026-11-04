// Firebase Cloud Functions — 5분마다 폰 알림 보내기 (Blaze 요금제 필요)
//
// 알림 판단·보내기 코드는 GitHub 예비 서버와 같은 scripts/push/run.mjs 를 써요.
// 배포할 때 copy-shared.mjs 가 그 파일들을 functions/shared/ 로 복사해요. (firebase.json predeploy)
// 배포: GitHub 저장소 → Actions → Deploy Firebase functions (main에 관련 파일이 바뀌면 자동)
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { runOnce } from './shared/scripts/push/run.mjs';

initializeApp();

export const sendPush = onSchedule({
  schedule: 'every 5 minutes',
  timeZone: 'Asia/Seoul',
  region: 'asia-northeast3', // 서울 (Firestore와 같은 곳)
  memory: '256MiB',
  timeoutSeconds: 120,
  maxInstances: 1,
  retryCount: 0, // 실패해도 5분 뒤에 다시 돌기 때문에 재시도하지 않음
}, async () => {
  await runOnce({ db: getFirestore(), messaging: getMessaging(), runner: 'firebase' });
});
