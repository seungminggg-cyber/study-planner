// 앱이 꺼져 있어도 오는 폰 알림 (Firebase Cloud Messaging)
//
// 동작 방식
// 1) 학생·선생님이 [이 기기에서 알림 켜기]를 누르면, 이 기기의 알림 주소(토큰)를 push/{uid} 에 저장해요.
// 2) Firebase Cloud Functions(functions/index.js)가 5분마다 실행돼서, 보낼 알림이 있으면 그 주소로 보내요.
//    (Firebase가 멈추면 GitHub의 scripts/push/send.mjs 가 예비로 대신 보내요)
//    (시작 시간 알림, 30분 지나도 미시작, 타이머 종료, 선생님에게 늦은 학생·하루 요약)
// 3) 폰에 도착한 알림은 public/sw.js 가 화면에 띄워요.
import { getMessaging, getToken, deleteToken, isSupported } from 'firebase/messaging';
import { doc, setDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { app, db } from './firebase.js';
import { loadPref, savePref } from './store.js';
import { isIOS } from './lib/util.js';

export const PUSH_DEFAULTS = {
  on: false, // 선생님이 설정에서 켜야 동작
  start: true, // 목표 시작 시각 알림 (학생)
  late: true, // 30분 지나도 시작 안 하면 한 번 더 (학생)
  timer: true, // 집중·인출 타이머 끝 (학생)
  teacherLate: true, // 30분 넘게 늦은 학생 알림 (선생님)
  summary: true, // 하루 요약 (선생님)
  summaryTime: '23:00',
  feedback: true, // 선생님 피드백 도착 (학생)
  deadline: true, // 시험·수행평가 D-3·D-1·당일 (학생·선생님)
  nextWeek: true, // 다음 주 계획표 없는 학생 (선생님)
};
// (서버 쪽 기본값은 scripts/push/plan.mjs 의 PUSH_DEFAULTS — 둘을 같게 맞춰 두세요)

export function pushConfig(config) {
  return { ...PUSH_DEFAULTS, ...(config?.push || {}) };
}

const isEmulator = import.meta.env.VITE_USE_EMULATOR === '1';
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

let supported = null;
export async function checkSupport() {
  if (supported !== null) return supported;
  if (isEmulator) {
    supported = 'Notification' in window;
    return supported;
  }
  try {
    supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && await isSupported();
  } catch {
    supported = false;
  }
  return supported;
}

// 아이폰은 홈 화면에 설치한 앱에서만 알림을 받을 수 있어요
export function needsInstallFirst() {
  return isIOS && !isStandalone();
}

export function localToken() {
  return loadPref('pushToken', '');
}

async function swRegistration() {
  const url = `${import.meta.env.BASE_URL}sw.js`;
  const reg = (await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)) || (await navigator.serviceWorker.register(url));
  await navigator.serviceWorker.ready;
  return reg;
}

// 버튼을 눌렀을 때 호출 (알림 허용 창은 버튼을 누를 때만 띄울 수 있음)
export async function enablePush(uid) {
  if (!(await checkSupport())) throw Object.assign(new Error('unsupported'), { code: 'push/unsupported' });
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw Object.assign(new Error('denied'), { code: 'push/denied' });
  let token;
  if (isEmulator) {
    token = `emu-${uid}-${Math.random().toString(36).slice(2, 8)}`; // 테스트용 가짜 주소
  } else {
    const reg = await swRegistration();
    token = await getToken(getMessaging(app), { serviceWorkerRegistration: reg });
  }
  if (!token) throw Object.assign(new Error('no-token'), { code: 'push/no-token' });
  await setDoc(doc(db, 'push', uid), { tokens: arrayUnion(token), updatedAt: Date.now() }, { merge: true });
  savePref('pushToken', token);
  return token;
}

export async function disablePush(uid) {
  const token = localToken();
  if (token) {
    await updateDoc(doc(db, 'push', uid), { tokens: arrayRemove(token), updatedAt: Date.now() }).catch(() => {});
    if (!isEmulator) {
      try { await deleteToken(getMessaging(app)); } catch { /* 이미 지워짐 */ }
    }
  }
  savePref('pushToken', '');
}

// 타이머가 돌아가는 동안 끝나는 시각을 저장해 두면, 앱이 꺼져 있어도 끝날 때 알림을 보내 줘요
let lastTimerSig = '';
export function syncTimer(uid, timer) {
  if (!uid || !localToken()) return;
  const endAt = timer.running ? timer.endAt : null;
  const sig = `${endAt}|${timer.stage}`;
  if (sig === lastTimerSig) return;
  lastTimerSig = sig;
  setDoc(doc(db, 'push', uid), {
    timerEndAt: endAt,
    timerStage: timer.stage,
    timerLabel: String(timer.taskLabel || '').slice(0, 80),
    updatedAt: Date.now(),
  }, { merge: true }).catch((err) => console.warn('타이머 알림 저장 실패', err));
}

// 테스트 알림 요청: 다음 서버 실행(보통 5분 안)에 이 사람의 기기로 테스트 알림이 가요
export async function requestTestPush(uid) {
  await setDoc(doc(db, 'push', uid), { timerEndAt: Date.now(), timerStage: 'test', timerLabel: '', updatedAt: Date.now() }, { merge: true });
  lastTimerSig = '';
}

export function pushErrorMessage(err) {
  switch (err?.code) {
    case 'push/unsupported': return '이 브라우저에서는 알림을 받을 수 없어요. 크롬(안드로이드)이나 홈 화면에 설치한 앱(아이폰)에서 켜 주세요.';
    case 'push/denied': return '알림이 차단돼 있어요. 브라우저(또는 폰) 설정에서 이 사이트의 알림을 허용한 뒤 다시 눌러 주세요.';
    default: return '알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요.';
  }
}
