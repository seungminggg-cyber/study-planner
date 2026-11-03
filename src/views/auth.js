// 로그인, 회원가입, 가입 정보 입력, 승인 대기 화면
import {
  GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendPasswordResetEmail, signOut,
  setPersistence, browserLocalPersistence, browserSessionPersistence,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import { S, refresh, appTitle, teacherName, loadPref, savePref } from '../store.js';
import { html } from '../lib/html.js';
import { toast, copyText, isKakaoInApp, isInAppBrowser } from '../lib/util.js';

// 로그인 상태 유지: 켜면 앱을 닫았다 열어도 로그인돼 있고, 끄면 브라우저를 닫을 때 로그아웃돼요.
// (구글 로그인 창이 차단되지 않도록 로그인 버튼을 누르기 전에 미리 적용해 둡니다)
const loginPrefs = {
  keep: loadPref('keepLogin', true),
  saveEmail: loadPref('saveEmail', true),
};

function applyPersistence() {
  setPersistence(auth, loginPrefs.keep ? browserLocalPersistence : browserSessionPersistence).catch(() => {});
}
applyPersistence();

function savedEmail() {
  return loginPrefs.saveEmail ? loadPref('savedEmail', '') : '';
}

function rememberEmail(email) {
  savePref('savedEmail', loginPrefs.saveEmail ? email : '');
}

function shell(content) {
  return html`
    <div class="min-h-screen flex items-center justify-center px-4 py-10">
      <div class="w-full max-w-sm space-y-6">
        <div class="text-center space-y-2">
          <div class="mx-auto w-14 h-14 rounded-2xl bg-planner-green text-white flex items-center justify-center text-2xl shadow-md">
            <i class="fa-solid fa-calendar-check"></i>
          </div>
          <h1 class="text-2xl font-black tracking-tight text-planner-dark">${appTitle()}</h1>
          <p class="text-sm text-slate-500">${S.config?.appSubtitle || '100분 집중 + 20분 인출 주간 학습 플래너'}</p>
        </div>
        ${content}
      </div>
    </div>
  `;
}

function inAppNotice() {
  if (!isInAppBrowser()) return '';
  const url = location.href;
  return html`
    <div class="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900 space-y-2">
      <p class="font-semibold"><i class="fa-solid fa-triangle-exclamation mr-1"></i>앱 안의 브라우저에서는 Google 로그인이 막혀 있어요</p>
      <p>크롬이나 사파리 같은 기본 브라우저에서 열어주세요.</p>
      ${isKakaoInApp()
        ? html`<a class="btn btn-sm bg-amber-400 text-slate-900 hover:bg-amber-300" href="kakaotalk://web/openExternal?url=${encodeURIComponent(url)}">기본 브라우저로 열기</a>`
        : html`<button type="button" class="btn btn-sm bg-amber-400 text-slate-900 hover:bg-amber-300" data-action="copy-url">주소 복사하기</button>`}
    </div>
  `;
}

export function loadingView() {
  return html`
    <div class="min-h-screen flex items-center justify-center text-sm text-slate-500">
      <i class="fa-solid fa-spinner fa-spin mr-2"></i>불러오는 중...
    </div>
  `;
}

export function loginView() {
  const signup = S.ui.loginMode === 'signup';
  return shell(html`
    ${inAppNotice()}
    <div class="card space-y-5">
      <button type="button" class="btn btn-secondary w-full py-3" data-action="google-login" ${S.ui.busy ? 'disabled' : ''}>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        Google로 계속하기
      </button>

      <div class="flex items-center gap-3 text-xs text-slate-400">
        <span class="h-px flex-1 bg-slate-200"></span>또는 이메일로<span class="h-px flex-1 bg-slate-200"></span>
      </div>

      <div class="seg">
        <button type="button" class="seg-btn ${!signup ? 'active' : ''}" data-action="login-mode" data-mode="login">로그인</button>
        <button type="button" class="seg-btn ${signup ? 'active' : ''}" data-action="login-mode" data-mode="signup">회원가입</button>
      </div>

      <form class="space-y-3" data-submit="${signup ? 'email-signup' : 'email-login'}" novalidate>
        <div>
          <label class="label" for="login-email">이메일</label>
          <input class="input" id="login-email" name="email" type="email" autocomplete="email" placeholder="example@naver.com" value="${savedEmail()}" required />
        </div>
        <div>
          <label class="label" for="login-pw">비밀번호</label>
          <input class="input" id="login-pw" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" placeholder="${signup ? '8자 이상, 영문과 숫자 포함' : ''}" required />
        </div>
        ${signup ? html`
          <div>
            <label class="label" for="login-pw2">비밀번호 확인</label>
            <input class="input" id="login-pw2" name="password2" type="password" autocomplete="new-password" required />
          </div>
          <p class="text-xs text-slate-500">비밀번호를 잊어버리면 이 이메일로 재설정 링크를 받을 수 있어요. 자주 쓰는 이메일로 가입하세요.</p>
        ` : ''}
        <div class="flex items-center justify-between gap-2 text-sm text-slate-600">
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" class="w-4 h-4 accent-green-700" data-change="pref-keep" ${loginPrefs.keep ? 'checked' : ''} />로그인 상태 유지
          </label>
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" class="w-4 h-4 accent-green-700" data-change="pref-save-email" ${loginPrefs.saveEmail ? 'checked' : ''} />이메일 저장
          </label>
        </div>
        <button class="btn btn-primary w-full py-3" ${S.ui.busy ? 'disabled' : ''}>${signup ? '가입하기' : '로그인'}</button>
        <p class="text-xs text-slate-400 text-center">학교·학원 공용 컴퓨터에서는 '로그인 상태 유지'를 꺼주세요.</p>
      </form>

      ${!signup ? html`<button type="button" class="block mx-auto text-sm text-slate-500 hover:text-planner-green" data-action="reset-password">비밀번호를 잊으셨나요?</button>` : ''}
    </div>
  `);
}

export function profileSetupView() {
  return shell(html`
    <div class="card space-y-5">
      <div>
        <h2 class="card-title">처음 오셨네요! 반가워요</h2>
        <p class="card-desc">이름을 알려주시면 ${teacherName()}이 확인 후 승인해 드려요.</p>
      </div>
      <form class="space-y-3" data-submit="create-profile">
        <div>
          <label class="label" for="pf-name">이름</label>
          <input class="input" id="pf-name" name="name" maxlength="20" placeholder="실명을 입력하세요" required />
        </div>
        <button class="btn btn-primary w-full py-3" ${S.ui.busy ? 'disabled' : ''}>가입 신청하기</button>
      </form>
      <p class="text-xs text-slate-400 text-center">${S.user?.email || ''} 계정으로 로그인됨 · <button type="button" class="underline hover:text-slate-600" data-action="logout">로그아웃</button></p>
    </div>

    <details class="text-sm text-slate-500 rounded-xl border border-slate-200 bg-planner-surface p-4">
      <summary class="cursor-pointer font-medium text-slate-600">강사(관리자) 계정으로 쓰시려면</summary>
      <div class="mt-3 space-y-2 leading-relaxed">
        <p>Firebase 콘솔 → Firestore → <b>admins</b> 컬렉션에 아래 ID로 문서를 만든 뒤 새로고침하세요.</p>
        <div class="flex items-center gap-2">
          <code class="flex-1 truncate rounded-lg bg-slate-100 px-2 py-1.5 text-xs">${S.user?.uid || ''}</code>
          <button type="button" class="btn btn-secondary btn-sm" data-action="copy-uid">복사</button>
        </div>
      </div>
    </details>
  `);
}

export function pendingView() {
  return shell(html`
    <div class="card space-y-4 text-center">
      <div class="mx-auto w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xl">
        <i class="fa-solid fa-hourglass-half"></i>
      </div>
      <div>
        <h2 class="text-lg font-bold">승인을 기다리고 있어요</h2>
        <p class="text-sm text-slate-500 mt-1">${teacherName()}이 승인하면 바로 이용할 수 있어요.<br />이 화면은 승인되면 자동으로 바뀌어요.</p>
      </div>
      <div class="rounded-xl bg-slate-50 p-3 text-sm">
        <span class="font-semibold">${S.profile?.name}</span>
      </div>
      <button type="button" class="btn btn-ghost w-full" data-action="logout">로그아웃</button>
    </div>
  `);
}

// ---------- 동작 ----------
const AUTH_ERRORS = {
  'auth/invalid-credential': '이메일 또는 비밀번호가 맞지 않아요.',
  'auth/wrong-password': '이메일 또는 비밀번호가 맞지 않아요.',
  'auth/user-not-found': '가입되지 않은 이메일이에요.',
  'auth/invalid-email': '이메일 형식이 올바르지 않아요.',
  'auth/email-already-in-use': '이미 가입된 이메일이에요. 로그인해 주세요.',
  'auth/weak-password': '비밀번호가 너무 쉬워요.',
  'auth/too-many-requests': '시도가 너무 많아요. 잠시 후 다시 해주세요.',
  'auth/network-request-failed': '인터넷 연결을 확인해 주세요.',
  'auth/popup-blocked': '팝업이 차단됐어요. 팝업을 허용하고 다시 눌러주세요.',
  'auth/unauthorized-domain': '이 주소는 아직 로그인이 허용되지 않았어요. 강사님께 알려주세요.',
  'auth/operation-not-allowed': '이 로그인 방식이 아직 켜져 있지 않아요. 강사님께 알려주세요.',
};

export function authErrorMessage(err) {
  return AUTH_ERRORS[err?.code] || '';
}

async function withBusy(fn) {
  S.ui.busy = true;
  refresh();
  try {
    await fn();
  } finally {
    S.ui.busy = false;
    refresh();
  }
}

function validPassword(pw) {
  return pw.length >= 8 && /[a-zA-Z]/.test(pw) && /\d/.test(pw);
}

export const authActions = {
  'login-mode': (el) => {
    S.ui.loginMode = el.dataset.mode;
    refresh();
  },
  'google-login': () => withBusy(async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
      throw err;
    }
  }),
  'email-login': (form, e, data) => withBusy(async () => {
    const email = String(data.get('email')).trim();
    const pw = String(data.get('password'));
    if (!email || !pw) return toast('이메일과 비밀번호를 입력해 주세요.', 'error');
    await signInWithEmailAndPassword(auth, email, pw);
    rememberEmail(email);
  }),
  'email-signup': (form, e, data) => withBusy(async () => {
    const email = String(data.get('email')).trim();
    const pw = String(data.get('password'));
    if (!email) return toast('이메일을 입력해 주세요.', 'error');
    if (!validPassword(pw)) return toast('비밀번호는 8자 이상, 영문과 숫자를 섞어주세요.', 'error');
    if (pw !== String(data.get('password2'))) return toast('비밀번호 확인이 일치하지 않아요.', 'error');
    await createUserWithEmailAndPassword(auth, email, pw);
    rememberEmail(email);
    S.ui.loginMode = 'login';
  }),
  'pref-keep': (el) => {
    loginPrefs.keep = el.checked;
    savePref('keepLogin', el.checked);
    applyPersistence();
  },
  'pref-save-email': (el) => {
    loginPrefs.saveEmail = el.checked;
    savePref('saveEmail', el.checked);
    if (!el.checked) savePref('savedEmail', '');
    refresh();
  },
  'reset-password': async () => {
    const email = document.getElementById('login-email')?.value.trim();
    if (!email) return toast('위 칸에 이메일을 먼저 입력해 주세요.', 'error');
    await sendPasswordResetEmail(auth, email);
    toast('비밀번호 재설정 메일을 보냈어요. 메일함(스팸함 포함)을 확인해 주세요.');
  },
  'create-profile': (form, e, data) => withBusy(async () => {
    const name = String(data.get('name')).trim();
    if (!name) return toast('이름을 입력해 주세요.', 'error');
    const user = auth.currentUser;
    await setDoc(doc(db, 'users', user.uid), {
      name,
      status: 'pending',
      provider: user.providerData[0]?.providerId === 'google.com' ? 'google' : 'password',
      email: user.email || '',
      createdAt: Date.now(),
    });
  }),
  logout: async () => {
    S.ui.loginMode = 'login'; // 다시 들어올 때는 로그인 화면부터
    await signOut(auth);
  },
  'copy-uid': async () => {
    await copyText(S.user?.uid || '');
    toast('ID를 복사했어요.');
  },
  'copy-url': async () => {
    await copyText(location.href);
    toast('주소를 복사했어요. 기본 브라우저에 붙여넣어 주세요.');
  },
};
