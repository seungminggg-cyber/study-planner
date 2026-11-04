// 폰 알림 한 번 보내기 — Firebase Cloud Functions(5분마다)와 GitHub Actions(예비)가 함께 씀
//
// runOnce({ db, messaging, nowMs, dry, runner })
//   db: firebase-admin Firestore, messaging: firebase-admin Messaging
//   runner: 'firebase' | 'github' (선생님 설정 화면에 어디서 보냈는지 표시)
//   dry: true면 실제로 보내지는 않고 기록만 남김 (에뮬레이터 테스트용)
import { FieldValue } from 'firebase-admin/firestore';
import { weekContaining } from '../../src/lib/week.js';
import { PUSH_DEFAULTS, kstNow, isQuietHour, planAlerts } from './plan.mjs';

const DEAD_TOKEN = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument'];

// Firebase가 이 시간 안에 한 번이라도 돌았으면 GitHub 예비 실행은 쉬어요
export const BACKUP_AFTER_MS = 15 * 60 * 1000;

// GitHub 예비 실행: Firebase가 최근에 잘 돌고 있으면 true
export async function firebaseIsRunning(db, nowMs = Date.now()) {
  const snap = await db.doc('config/push_status').get();
  const s = snap.exists ? snap.data() : {};
  return s.runner === 'firebase' && nowMs - (s.lastRun || 0) < BACKUP_AFTER_MS;
}

export async function runOnce({ db, messaging, nowMs = Date.now(), dry = false, runner = 'github', log = console.log }) {
  const now = kstNow(nowMs);
  log(`한국 시간 ${now.date} ${now.hhmm}${dry ? ' (보내지 않고 확인만)' : ''}`);

  const writeStatus = (fields) => db.doc('config/push_status').set({ lastRun: now.ms, runner, ...fields }, { merge: true });

  try {
    if (isQuietHour(now)) {
      log('새벽 시간이라 쉬어요.');
      return { skipped: 'quiet' };
    }
    const cfgSnap = await db.doc('config/app').get();
    const cfg = { ...PUSH_DEFAULTS, ...(cfgSnap.exists ? cfgSnap.data().push || {} : {}) };
    if (!cfg.on) {
      log('선생님 설정에서 폰 알림이 꺼져 있어요.');
      await writeStatus({ lastSent: 0, note: 'off' });
      return { skipped: 'off' };
    }

    const pushSnap = await db.collection('push').get();
    const pushBy = new Map(pushSnap.docs.map((d) => [d.id, d.data()]));
    const devices = [...pushBy.values()].reduce((n, p) => n + (p.tokens?.length || 0), 0);
    if (!devices) {
      log('알림을 켠 기기가 없어요.');
      await writeStatus({ lastSent: 0, devices: 0, note: '' });
      return { skipped: 'no-devices' };
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
      log(`→ ${m.uid.slice(0, 6)}… [${m.tag}] ${m.title} / ${m.body}`);
      if (dry) continue;
      const res = await messaging.sendEachForMulticast({
        tokens: m.tokens,
        data: { title: m.title, body: m.body, tag: m.tag },
        webpush: { headers: { Urgency: 'high', TTL: '3600' } },
      });
      delivered += res.successCount;
      const dead = res.responses
        .map((r, i) => (!r.success && DEAD_TOKEN.includes(r.error?.code) ? m.tokens[i] : null))
        .filter(Boolean);
      res.responses.forEach((r) => { if (!r.success) log('  보내기 실패:', r.error?.code); });
      if (dead.length) {
        await db.doc(`push/${m.uid}`).update({ tokens: FieldValue.arrayRemove(...dead) });
        log(`  더 이상 쓰지 않는 기기 ${dead.length}개 정리`);
      }
    }

    // 보낸 기록 저장 (같은 알림을 두 번 보내지 않도록)
    await Promise.all([...sent.entries()].map(([uid, value]) => db.doc(`push/${uid}`).update({ sent: value })));
    await writeStatus({ lastSent: messages.length, delivered, devices, note: '' });
    log(`알림 ${messages.length}건 처리 (기기 ${devices}대)`);
    return { messages: messages.length, delivered, devices };
  } catch (err) {
    try { await writeStatus({ note: `오류: ${String(err.message || err).slice(0, 120)}` }); } catch { /* 상태 저장도 실패 */ }
    throw err;
  }
}
