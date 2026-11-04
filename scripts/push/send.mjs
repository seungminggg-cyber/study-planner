// GitHub Actions 예비 알림 서버: Firebase(5분마다)가 멈췄을 때만 대신 알림을 보냄
//
// 필요한 것: GitHub에서 Google 로그인 (열쇠 파일 없이 google-github-actions/auth 로, 또는 예전 방식의 FIREBASE_SERVICE_ACCOUNT)
// 테스트: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 DRY_RUN=1 PUSH_NOW_MS=... node scripts/push/send.mjs
//   FORCE=1 이면 Firebase가 돌고 있어도 실행해요.
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { runOnce, firebaseIsRunning } from './run.mjs';

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
const adc = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const projectId = process.env.GCLOUD_PROJECT || 'seungmin-planner';

if (!serviceAccount && !adc && !emulator) {
  console.log('Google 로그인 정보가 없어서 알림을 보내지 않고 끝냅니다.');
  process.exit(0);
}

if (emulator) initializeApp({ projectId });
else if (adc) initializeApp({ credential: applicationDefault(), projectId });
else initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
const db = getFirestore();
const nowMs = process.env.PUSH_NOW_MS ? Number(process.env.PUSH_NOW_MS) : Date.now();

try {
  if (process.env.FORCE !== '1' && await firebaseIsRunning(db, nowMs)) {
    console.log('Firebase 알림 서버가 잘 돌고 있어서 GitHub 예비 서버는 쉬어요.');
  } else {
    await runOnce({ db, messaging: getMessaging(), nowMs, dry: process.env.DRY_RUN === '1', runner: 'github' });
  }
} catch (err) {
  console.error('알림 보내기 중 문제가 생겼어요:', err);
  process.exit(1);
}
