// 구글 로그인 (Google Identity Services 버튼)
//
// 예전 방식(signInWithPopup)은 로그인 중간에 firebaseapp.com 페이지를 거치는데,
// 아이폰 사파리는 다른 사이트의 저장공간을 막아서 "missing initial state" 오류가 나요.
// 그래서 구글 공식 로그인 버튼으로 구글 계정 정보를 직접 받아 Firebase에 로그인해요.
// (Google Cloud 콘솔의 OAuth 클라이언트에 https://seungminggg-cyber.github.io 가 '승인된 자바스크립트 원본'으로 있어야 함)
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from './firebase.js';

// Firebase가 만든 웹 클라이언트 ID (공개 값)
const CLIENT_ID = '828874203333-q759epl96ncuim94hhaaapmk30sb018p.apps.googleusercontent.com';

let loading = null;
let failed = false;

export function googleButtonFailed() {
  return failed;
}

function loadScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => (window.google?.accounts?.id ? resolve() : reject(new Error('gsi')));
      s.onerror = () => reject(new Error('gsi'));
      document.head.appendChild(s);
      setTimeout(() => reject(new Error('gsi-timeout')), 10000);
    });
  }
  return loading;
}

// 로그인 화면에 버튼 그리기 (el: 버튼이 들어갈 칸, onError: 실패 알림, onFail: 버튼을 못 그렸을 때)
export async function mountGoogleButton(el, { onError, onFail, onStart, onDone }) {
  if (!el || el.dataset.mounted) return;
  el.dataset.mounted = '1';
  try {
    await loadScript();
  } catch {
    failed = true;
    onFail?.();
    return;
  }
  window.google.accounts.id.initialize({
    client_id: CLIENT_ID,
    ux_mode: 'popup',
    auto_select: false,
    cancel_on_tap_outside: true,
    callback: async (res) => {
      onStart?.();
      try {
        await signInWithCredential(auth, GoogleAuthProvider.credential(res.credential));
      } catch (err) {
        onError?.(err);
      } finally {
        onDone?.();
      }
    },
  });
  const width = Math.max(220, Math.min(400, Math.round(el.getBoundingClientRect().width) || 320));
  window.google.accounts.id.renderButton(el, {
    type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', logo_alignment: 'center', locale: 'ko', width,
  });
}
