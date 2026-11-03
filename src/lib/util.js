// 알림창, 복사·공유 등 여러 화면에서 함께 쓰는 기능

let toastTimer = null;
export function toast(message, type = 'ok') {
  const box = document.getElementById('toast');
  if (!box) return;
  box.textContent = message;
  box.dataset.type = type;
  box.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.add('hidden'), type === 'error' ? 4500 : 2800);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
export const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
export const isMobile = isIOS || /Android/i.test(ua);

// 폰에서는 공유창(카톡 선택)을 바로 열고, 컴퓨터에서는 복사합니다.
// 반환값: 'shared' | 'copied' | 'cancelled' | 'failed'
export async function shareOrCopy(text) {
  if (isMobile && navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}

export function isKakaoInApp() {
  return /KAKAOTALK/i.test(ua);
}

export function isInAppBrowser() {
  return /KAKAOTALK|Instagram|FBAN|FBAV|NAVER\(inapp|Line\/|everytimeApp|DaumApps/i.test(ua);
}

export function newId(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function clampNumber(v, min, max, fallback = min) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// 같은 칸에 계속 입력할 때 마지막 입력 후 잠시 기다렸다가 한 번만 저장
const debounceTimers = new Map();
export function debounce(key, fn, ms = 700) {
  clearTimeout(debounceTimers.get(key));
  debounceTimers.set(key, setTimeout(() => {
    debounceTimers.delete(key);
    fn();
  }, ms));
}

// 아직 저장 대기 중인 입력이 있으면 바로 저장 (화면을 닫거나 다른 날로 이동할 때)
const pendingFlush = new Map();
export function debounceSave(key, fn, ms = 800) {
  pendingFlush.set(key, fn);
  debounce(key, () => {
    pendingFlush.delete(key);
    fn();
  }, ms);
}
export function flushSaves() {
  pendingFlush.forEach((fn, key) => {
    clearTimeout(debounceTimers.get(key));
    debounceTimers.delete(key);
    fn();
  });
  pendingFlush.clear();
}
