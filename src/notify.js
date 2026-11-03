// 폰·컴퓨터 알림 (앱이 열려 있을 때). 아이폰은 홈 화면에 설치한 경우에만 알림이 와요.
import { toast } from './lib/util.js';

export function canNotify() {
  return typeof Notification !== 'undefined';
}

export function notifyPermission() {
  return canNotify() ? Notification.permission : 'unsupported';
}

export async function askNotifyPermission() {
  if (!canNotify()) {
    toast('이 브라우저는 알림을 지원하지 않아요. 아이폰은 홈 화면에 앱을 설치하면 쓸 수 있어요.', 'error');
    return false;
  }
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    toast('알림을 켰어요. 타이머가 끝나면 알려 드릴게요.');
    return true;
  }
  toast('알림이 꺼져 있어요. 브라우저 설정에서 이 사이트의 알림을 허용해 주세요.', 'error');
  return false;
}

export async function notify(title, body) {
  if (notifyPermission() !== 'granted') return;
  const options = { body, icon: `${import.meta.env.BASE_URL}icons/icon-192.png`, tag: 'planner', renotify: true };
  try {
    // 안드로이드 크롬은 서비스 워커를 통해서만 알림을 띄울 수 있음
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
    new Notification(title, options); // eslint-disable-line no-new
  } catch (err) {
    console.warn('알림 실패', err);
  }
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* 진동 없음 */ }
}
