import './style.css';
import morphdom from 'morphdom';
import { S, onRender, refresh, ensureWatches, appTitle, teacherName, loadPref } from './store.js';
import { html } from './lib/html.js';
import { toast, flushSaves } from './lib/util.js';
import { drafts } from './lib/drafts.js';
import {
  loadingView, loginView, profileSetupView, pendingView, authActions, authErrorMessage,
} from './views/auth.js';
import { modalView, plannerActions } from './views/planner.js';
import { studentView, studentActions, studentModals, checkStudyAlarm } from './views/student.js';
import { teacherView, teacherActions } from './views/teacher.js';
import { installBanner, installActions, registerServiceWorker } from './install.js';
import { initTimer, timer, remainingMs, formatMs, stageMs } from './timer.js';
import { patchWeek, focusIncrementPatch } from './data.js';

const actions = {
  ...authActions, ...plannerActions, ...studentActions, ...teacherActions, ...installActions,
};

// ---------- 화면 구성 ----------
const TEACHER_TABS = [
  { id: 'dash', label: '현황판', icon: 'fa-gauge-high' },
  { id: 'students', label: '학생', icon: 'fa-users' },
  { id: 'settings', label: '설정', icon: 'fa-gear' },
];

function appShell(content) {
  const isTeacher = S.role === 'teacher';
  return html`
    <header class="sticky top-0 z-30 bg-planner-card/95 backdrop-blur border-b-2 border-planner-border/30 pt-[env(safe-area-inset-top)]">
      <div class="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-9 h-9 shrink-0 rounded-xl bg-planner-green text-white flex items-center justify-center shadow"><i class="fa-solid fa-calendar-check"></i></div>
          <div class="min-w-0">
            <h1 class="font-black text-base sm:text-lg text-planner-green truncate leading-tight">${appTitle()}</h1>
            <p class="text-xs font-bold text-slate-500 truncate">${isTeacher ? `${teacherName()} 관리 화면` : `${S.profile?.name || ''} 학생`}</p>
          </div>
        </div>
        ${isTeacher ? html`
          <nav class="hidden md:flex items-center gap-1">
            ${TEACHER_TABS.map((t) => html`
              <button type="button" class="btn btn-sm !text-sm ${S.ui.tab === t.id ? 'bg-planner-light text-planner-dark' : 'btn-ghost'}" data-action="t-tab" data-tab="${t.id}">
                <i class="fa-solid ${t.icon}"></i>${t.label}
              </button>`)}
          </nav>` : ''}
        <div class="flex items-center gap-1.5 shrink-0">
          ${!isTeacher ? html`<button type="button" class="btn btn-sm bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200" data-action="open-guide"><i class="fa-solid fa-circle-question"></i><span class="hidden sm:inline">이용 방법</span></button>` : ''}
          <button type="button" class="btn btn-ghost btn-sm" data-action="logout" title="로그아웃"><i class="fa-solid fa-arrow-right-from-bracket"></i><span class="hidden sm:inline">로그아웃</span></button>
        </div>
      </div>
    </header>

    <main class="max-w-6xl mx-auto px-4 py-5 sm:py-6 ${isTeacher ? 'pb-28 md:pb-10' : 'pb-28 lg:pb-10'} space-y-5">${installBanner()}${content}</main>

    ${isTeacher ? html`
      <nav class="md:hidden fixed bottom-0 inset-x-0 z-40 bg-planner-card/95 backdrop-blur border-t border-planner-border/30 pb-[env(safe-area-inset-bottom)]">
        <div class="grid grid-cols-3">
          ${TEACHER_TABS.map((t) => html`
            <button type="button" class="flex flex-col items-center gap-1 py-2.5 text-xs font-bold ${S.ui.tab === t.id ? 'text-planner-green' : 'text-slate-500'}" data-action="t-tab" data-tab="${t.id}">
              <i class="fa-solid ${t.icon} text-lg"></i>${t.label}
            </button>`)}
        </div>
      </nav>` : ''}
    ${modalView(studentModals)}
  `;
}

function view() {
  if (!S.authReady) return loadingView();
  if (!S.user) return loginView();
  if (!S.role) return loadingView();
  if (S.role === 'new') return profileSetupView();
  if (S.role === 'pending') return pendingView();
  return appShell(S.role === 'teacher' ? teacherView() : studentView());
}

// ---------- 화면 그리기 (바뀐 부분만 갱신) ----------
const root = document.getElementById('app');

function isField(el) {
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

function render() {
  ensureWatches();
  const markup = `<div id="app">${view()}</div>`;
  morphdom(root, markup, {
    onBeforeElUpdated(fromEl, toEl) {
      if (fromEl.isEqualNode(toEl)) return false;
      if (isField(fromEl)) {
        // 지금 입력 중인 칸은 건드리지 않음 (끌고 있는 진행률 슬라이더 포함)
        if (fromEl === document.activeElement) return false;
        // 아직 저장 안 한 입력 내용은 유지
        if (fromEl.id && drafts.has(fromEl.id)) {
          const v = drafts.get(fromEl.id);
          if (toEl.tagName === 'SELECT') {
            [...toEl.options].forEach((o) => o.toggleAttribute('selected', o.value === v));
          } else {
            toEl.value = v;
          }
        }
      }
      return true;
    },
  });
  // 학생 처음 접속 시 이용 방법 안내
  if (S.role === 'student' && S.week && !S.ui.modal && !loadPref('guideSeen', false) && !guideShown) {
    guideShown = true;
    S.ui.modal = { type: 'guide' };
    refresh();
  }
}
let guideShown = false;

onRender(render);

// ---------- 이벤트 연결 ----------
function errorMessage(err) {
  const authMsg = authErrorMessage(err);
  if (authMsg) return authMsg;
  if (err?.code === 'permission-denied') return '권한이 없어요. 다시 로그인하거나 선생님께 문의해 주세요.';
  if (err?.code === 'unavailable') return '인터넷 연결을 확인해 주세요.';
  if (err?.code === 'not-found') return '계획표를 찾을 수 없어요. 새로고침해 주세요.';
  return '문제가 생겼어요. 잠시 후 다시 시도해 주세요.';
}

async function run(name, ...args) {
  const fn = actions[name];
  if (!fn) return;
  try {
    await fn(...args);
  } catch (err) {
    console.error(name, err);
    toast(errorMessage(err), 'error');
  }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  if (el.tagName !== 'A') e.preventDefault();
  run(el.dataset.action, el, e);
});

document.addEventListener('submit', (e) => {
  const form = e.target;
  if (!form.dataset.submit) return;
  e.preventDefault();
  const data = new FormData(form);
  run(form.dataset.submit, form, e, data).then(() => {
    // 저장 후 비워진 칸은 임시 기억에서도 지움
    [...form.elements].forEach((el) => {
      if (!el.id) return;
      if (el.value === '') drafts.delete(el.id);
      else if (drafts.has(el.id)) drafts.set(el.id, el.value);
    });
  });
});

document.addEventListener('reset', (e) => {
  [...e.target.elements].forEach((el) => el.id && drafts.delete(el.id));
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.form && el.id && isField(el)) drafts.set(el.id, el.value);
  if (el.dataset?.input) run(el.dataset.input, el, e);
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.form && el.id && isField(el)) drafts.set(el.id, el.value);
  if (el.dataset?.change) run(el.dataset.change, el, e);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.ui.modal) {
    S.ui.modal = null;
    refresh();
  }
});

// 화면을 닫거나 다른 앱으로 갈 때 쓰던 메모를 바로 저장
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSaves();
  else refresh();
});
window.addEventListener('pagehide', flushSaves);

// ---------- 공부 타이머 ----------
let lastSig = '';
initTimer({
  focusDone: (info) => {
    toast(`🎉 ${info.focusMin}분 집중 완료!${timer.auto && timer.outputMin ? ` 이어서 ${timer.outputMin}분 인출 정리를 해요.` : ''}`);
    // 집중 완주 횟수를 그 날 기록에 더함 (선생님 현황판에 보임)
    if (S.role === 'student' && info.uid === S.user?.uid && info.weekId && info.date) {
      patchWeek(info.uid, info.weekId, focusIncrementPatch(info.date), true).catch((err) => console.warn(err));
    }
  },
  outputDone: () => toast('🎉 공부 루틴 완주! 완료한 범위를 체크해 주세요.'),
  update: (evt) => {
    const ms = remainingMs();
    const text = formatMs(ms);
    const display = document.getElementById('timer-display');
    if (display) display.textContent = text;
    const mini = document.getElementById('mini-timer');
    if (mini) mini.textContent = text;
    const bar = document.getElementById('timer-bar');
    if (bar) {
      const total = (timer.focusMin + timer.outputMin) * 60000;
      const done = (timer.stage === 'focus' ? 0 : timer.focusMin * 60000) + Math.max(0, stageMs() - ms);
      bar.style.width = `${Math.min(100, (done / total) * 100)}%`;
    }
    document.title = timer.running ? `${text} · ${timer.stage === 'focus' ? '집중' : '인출'}` : appTitle();
    const sig = `${timer.stage}|${timer.running}|${timer.taskId}`;
    if (sig !== lastSig || evt) {
      lastSig = sig;
      refresh();
    }
  },
});

// 30초마다: 시계·늦음 표시 갱신, 시작 시간 알림 확인, 자정 넘어가면 오늘 날짜 바꾸기
setInterval(() => {
  checkStudyAlarm();
  refresh();
}, 30 * 1000);
setTimeout(checkStudyAlarm, 3000);
window.addEventListener('planner:check-alarm', () => setTimeout(checkStudyAlarm, 300));

registerServiceWorker();

refresh();
