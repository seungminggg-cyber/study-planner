// 폰 홈 화면에 앱처럼 설치하기
// - 안드로이드(크롬, 삼성 인터넷)와 PC 크롬: [앱 설치] 버튼 한 번으로 설치
// - 아이폰(사파리): 자동 설치가 안 돼서 '공유 → 홈 화면에 추가' 방법을 안내
import { refresh, savePref } from './store.js';
import { html } from './lib/html.js';
import { isInAppBrowser, toast } from './lib/util.js';

const DISMISS_KEY = 'installDismissedAt';
const DISMISS_DAYS = 14;

const ua = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const isMobile = isIOS || /Android/i.test(ua);

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function dismissedRecently() {
  try {
    const at = Number(JSON.parse(localStorage.getItem('planner:' + DISMISS_KEY) || '0'));
    return Date.now() - at < DISMISS_DAYS * 86400000;
  } catch {
    return false;
  }
}

let deferredPrompt = null;
let installed = isStandalone();
let dismissed = dismissedRecently();

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // 브라우저 기본 안내 대신 우리 배너를 보여줌
  deferredPrompt = e;
  refresh();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  installed = true;
  toast('홈 화면에 설치됐어요!');
  refresh();
});

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => console.warn('서비스 워커 등록 실패', err));
  });
}

export function installBanner() {
  if (installed || dismissed || isInAppBrowser()) return '';

  let body;
  if (deferredPrompt) {
    body = html`
      <p class="flex-1 text-sm"><b>앱으로 설치</b>하면 홈 화면에서 바로 열 수 있어요.</p>
      <button type="button" class="btn btn-primary btn-sm shrink-0" data-action="install-app"><i class="fa-solid fa-download"></i>앱 설치</button>`;
  } else if (isIOS) {
    body = html`
      <p class="flex-1 text-sm leading-relaxed">
        <b>홈 화면에 추가</b>하면 앱처럼 쓸 수 있어요.<br />
        사파리 아래쪽 <i class="fa-solid fa-arrow-up-from-bracket text-planner-green mx-0.5"></i> 공유 버튼 → <b>'홈 화면에 추가'</b>
      </p>`;
  } else if (isMobile) {
    body = html`
      <p class="flex-1 text-sm leading-relaxed">
        <b>홈 화면에 추가</b>하면 앱처럼 쓸 수 있어요.<br />
        브라우저 메뉴 <i class="fa-solid fa-ellipsis-vertical text-planner-green mx-0.5"></i> → <b>'홈 화면에 추가'</b> 또는 <b>'앱 설치'</b>
      </p>`;
  } else {
    return '';
  }

  return html`
    <div class="flex items-center gap-3 rounded-2xl border border-planner-border/40 bg-planner-light p-3 pl-4 text-planner-dark">
      <img src="${import.meta.env.BASE_URL}icons/icon-192.png" alt="" class="w-10 h-10 rounded-xl shrink-0" />
      ${body}
      <button type="button" class="btn btn-ghost btn-sm !px-2 shrink-0" data-action="dismiss-install" aria-label="닫기"><i class="fa-solid fa-xmark"></i></button>
    </div>
  `;
}

export const installActions = {
  'install-app': async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    refresh();
  },
  'dismiss-install': () => {
    dismissed = true;
    savePref(DISMISS_KEY, Date.now());
    refresh();
  },
};
