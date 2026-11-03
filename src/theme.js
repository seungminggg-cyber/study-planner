// 화면 밝기 모드: 자동(폰·컴퓨터 설정을 따름) → 밝게 → 어둡게 순서로 바뀜. 기기마다 따로 기억해요.
import { loadPref, savePref } from './store.js';

export const THEMES = {
  auto: { label: '자동', icon: 'fa-circle-half-stroke' },
  light: { label: '밝게', icon: 'fa-sun' },
  dark: { label: '어둡게', icon: 'fa-moon' },
};

const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function themeMode() {
  const t = loadPref('theme', 'auto');
  return THEMES[t] ? t : 'auto';
}

export function isDark() {
  const t = themeMode();
  return t === 'dark' || (t === 'auto' && Boolean(media?.matches));
}

export function applyTheme() {
  const dark = isDark();
  document.documentElement.classList.toggle('dark', dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#171f16' : '#3b6e22');
}

export function cycleTheme() {
  const order = ['auto', 'light', 'dark'];
  const next = order.at((order.indexOf(themeMode()) + 1) % order.length);
  savePref('theme', next);
  applyTheme();
  return next;
}

// '자동'일 때 폰 설정이 바뀌면 바로 따라감
media?.addEventListener?.('change', applyTheme);
