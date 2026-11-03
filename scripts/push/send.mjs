// GitHub Actions에서 10분마다 실행: 보낼 폰 알림이 있으면 Firebase Cloud Messaging으로 보냄
//
// 필요한 것: GitHub 저장소 Secrets 에 FIREBASE_SERVICE_ACCOUNT (Firebase 서비스 계정 키 JSON 전체)
// 테스트: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 DRY_RUN=1 PUSH_NOW_MS=... node scripts/push/send.mjs
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { weekContaining } from '../../src/lib/week.js';
import { PUSH_DEFAULTS, kstNow, isQuietHour, planAlerts } from './plan.mjs';

const DRY = process.env.DRY_RUN === '1';
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
const emulator = process.env.FIRESTORE_EMULATOR_HOST;

if (!serviceAccount && !emulator) {
  console.log('FIREBASE_SERVICE_ACCOUNT 가 아직 설정되지 않아서 알림을 보내지 않고 끝냅니다.');
  process.exit(0);
}

initializeApp(serviceAccount
  ? { credential: cert(JSON.parse(serviceAccount)) }
  : { projectId: process.env.GCLOUD_PROJECT || 'seungmin-planner' });
const db = getFirestore();

const now = kstNow(process.env.PUSH_NOW_MS ? Number(process.env.PUSH_NOW_MS) : Date.now());
console.log(`한국 시간 ${now.date} ${now.hhmm}${DRY ? ' (보내지 않고 확인만)' : ''}`);

async function writeStatus(fields) {
  await db.doc('config/push_status').set({ lastRun: now.ms, ...fields }, { merge: true });
}

async function main() {
  if (isQuietHour(now)) {
    console.log('새벽 시간이라 쉬어요.');
    return;
  }
  const cfgSnap = await db.doc('config/app').get();
  const cfg = { ...PUSH_DEFAULTS, ...(cfgSnap.exists ? cfgSnap.data().push || {} : {}) };
  if (!cfg.on) {
    console.log('선생님 설정에서 폰 알림이 꺼져 있어요.');
    await writeStatus({ lastSent: 0, note: 'off' });
    return;
  }

  const pushSnap = await db.collection('push').get();
  const pushBy = new Map(pushSnap.docs.map((d) => [d.id, d.data()]));
  const devices = [...pushBy.values()].reduce((n, p) => n + (p.tokens?.length || 0), 0);
  if (!devices) {
    console.log('알림을 켠 기기가 없어요.');
    await writeStatus({ lastSent: 0, devices: 0, note: '' });
    return;
  }

  // 선생님은 admins 목록으로 확인 (push 문서에 스스로 적은 값은 믿지 않음)
  const adminsSnap = await db.collection('admins').get();
  const teacherIds = new Set(adminsSnap.docs.map((d) => d.id));
  const teachers = [...teacherIds].map((uid) => ({ uid, push: pushBy.get(uid) || null }));
  const teacherWants = teachers.some((t) => t.push?.tokens?.length) && (cfg.teacherLate || cfg.summary);

  const usersSnap = await db.collection('users').where('status', '==', 'approved').get();
  const students = usersSnap.docs.map((d) => ({ uid: d.id, name: d.data().name || '', weekIds: d.data().weekIds || [], push: pushBy.get(d.id) || null }));

  // 이번 주 계획표는 필요한 학생 것만 읽음
  const need = students.filter((s) => teacherWants || (s.push?.tokens?.length && (cfg.start || cfg.late)));
  const refs = [];
  need.forEach((s) => {
    s.weekId = weekContaining(s.weekIds, now.date);
    if (s.weekId) refs.push(db.doc(`users/${s.uid}/weeks/${s.weekId}`));
  });
  const weekSnaps = refs.length ? await db.getAll(...refs) : [];
  const weekBy = new Map(weekSnaps.filter((w) => w.exists).map((w) => [w.ref.parent.parent.id, { ...w.data(), start: w.id }]));
  students.forEach((s) => { s.week = weekBy.get(s.uid) || null; });

  const { messages, sent } = planAlerts({ now, cfg, students, teachers });

  let delivered = 0;
  for (const m of messages) {
    console.log(`→ ${m.uid.slice(0, 6)}… [${m.tag}] ${m.title} / ${m.body}`);
    if (DRY) continue;
    const res = await getMessaging().sendEachForMulticast({
      tokens: m.tokens,
      data: { title: m.title, body: m.body, tag: m.tag },
      webpush: { headers: { Urgency: 'high', TTL: '3600' } },
    });
    delivered += res.successCount;
    const dead = res.responses
      .map((r, i) => (!r.success && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument'].includes(r.error?.code) ? m.tokens[i] : null))
      .filter(Boolean);
    res.responses.forEach((r) => { if (!r.success) console.log('  보내기 실패:', r.error?.code); });
    if (dead.length) {
      await db.doc(`push/${m.uid}`).update({ tokens: FieldValue.arrayRemove(...dead) });
      console.log(`  더 이상 쓰지 않는 기기 ${dead.length}개 정리`);
    }
  }

  // 보낸 기록 저장 (같은 알림을 두 번 보내지 않도록)
  await Promise.all([...sent.entries()].map(([uid, value]) => db.doc(`push/${uid}`).update({ sent: value })));
  await writeStatus({ lastSent: messages.length, delivered, devices, note: '' });
  console.log(`알림 ${messages.length}건 처리 (기기 ${devices}대)`);
}

main().catch(async (err) => {
  console.error('알림 보내기 중 문제가 생겼어요:', err);
  try { await writeStatus({ note: `오류: ${String(err.message || err).slice(0, 120)}` }); } catch { /* 상태 저장도 실패 */ }
  process.exit(1);
});
