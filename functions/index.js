// Firebase Cloud Functions — 5분마다 폰 알림 보내기 (Blaze 요금제 필요)
//
// 알림 판단·보내기 코드는 GitHub 예비 서버와 같은 scripts/push/run.mjs 를 써요.
// 배포할 때 copy-shared.mjs 가 그 파일들을 functions/shared/ 로 복사해요. (firebase.json predeploy)
// 배포: GitHub 저장소 → Actions → Deploy Firebase functions (main에 관련 파일이 바뀌면 자동)
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
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

// 학생 기록 완전 삭제 (선생님만): 계획표·일정·메모·알림 기기·로그인 계정까지 모두 지워요.
// 개인정보 삭제 요청이나 가입 거절 때 써요. 되돌릴 수 없어요.
export const deleteStudent = onCall({
  region: 'asia-northeast3',
  memory: '256MiB',
  timeoutSeconds: 60,
  maxInstances: 2,
}, async (req) => {
  const caller = req.auth?.uid;
  if (!caller) throw new HttpsError('unauthenticated', '로그인이 필요해요.');
  const db = getFirestore();
  if (!(await db.doc(`admins/${caller}`).get()).exists) throw new HttpsError('permission-denied', '선생님만 지울 수 있어요.');
  const uid = String(req.data?.uid || '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid) || uid === caller) throw new HttpsError('invalid-argument', '지울 학생을 다시 확인해 주세요.');
  if ((await db.doc(`admins/${uid}`).get()).exists) throw new HttpsError('permission-denied', '선생님 계정은 지울 수 없어요.');

  await db.recursiveDelete(db.doc(`users/${uid}`)); // 학생 정보 + 모든 주간 계획표
  await Promise.all(['notes', 'push', 'events'].map((c) => db.doc(`${c}/${uid}`).delete()));
  let account = true;
  try {
    await getAuth().deleteUser(uid);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    account = false;
  }
  console.log(`학생 기록 삭제 완료 (${uid.slice(0, 6)}…, 로그인 계정 ${account ? '삭제' : '없음'})`);
  return { ok: true, account };
});
