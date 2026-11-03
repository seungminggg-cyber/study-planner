// 학생 화면: 오늘 계획 체크 + 타이머, 주간 전체표, 기록(그래프)
// 선생님이 [학생 화면 보기]를 누르면 같은 화면을 '보기 전용'으로 보여줘요.
import { writeBatch, deleteField } from 'firebase/firestore';
import { db } from '../firebase.js';
import { S, refresh, settingsOf, subjects, currentDate, savePref, loadPref } from '../store.js';
import { html } from '../lib/html.js';
import { toast, debounceSave, flushSaves } from '../lib/util.js';
import {
  weekDates, dayTitle, tasksOn, groupByPeriod, rateOf, weekRate, startedDays, plannedDays, focusTotal,
  todayKey, nowHHMM, isLate, startMessage, dailyReport, normalizeProgress, statusFromProgress, taskLabel,
  cleanTime, makeTaskId, addDays, weekRangeText, weekContaining, unfinishedTasks, carriedCopy, carryTarget,
  reasonText, pendingCloseDate, REASON_CHIPS,
} from '../lib/week.js';
import { patchWeek, taskPatch, deleteTaskPatch, weekRef } from '../data.js';
import {
  subjectChip, statusChip, progressBar, dayTabs, weekTable, goalsBox, openShare, rateText,
  subjectOptions, periodOptions,
} from './planner.js';
import { statsView } from './stats.js';
import { timer, remainingMs, formatMs, stageMs, startFor, toggle, reset, setStage, setAuto, setDurations } from '../timer.js';
import { unlockAudio, chime, alarmSound } from '../audio.js';
import { notify, notifyPermission, askNotifyPermission, canNotify } from '../notify.js';

// ---------- 지금 보고 있는 학생 (학생 본인 또는 선생님 미리보기) ----------
const isPreview = () => S.role === 'teacher';

export function ctx() {
  if (isPreview()) {
    const u = S.t.users.find((x) => x.id === S.ui.sel);
    return { uid: u?.id, profile: u, week: S.t.week, weekId: S.t.weekId, readOnly: true };
  }
  return { uid: S.user?.uid, profile: S.profile, week: S.week, weekId: S.weekId, readOnly: false };
}

function viewDate(c = ctx()) {
  return currentDate(c.week, isPreview() ? S.ui.tDate : S.ui.date);
}

function setViewDate(date) {
  if (isPreview()) S.ui.tDate = date;
  else S.ui.date = date;
}

// 미리보기에서는 아무것도 저장하지 않음
function blocked() {
  if (!ctx().readOnly) return false;
  toast('미리보기에서는 바꿀 수 없어요. [계획표] 탭에서 수정해 주세요.');
  return true;
}

const save = (patch) => {
  const c = ctx();
  return patchWeek(c.uid, c.weekId, patch, true);
};

function findTask(id) {
  const week = ctx().week;
  return week?.tasks?.[id] ? { ...week.tasks[id], id } : null;
}

// ---------- 화면 ----------
export function studentView() {
  const c = ctx();
  if (c.week === undefined) {
    return html`<div class="py-20 text-center text-sm text-slate-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i>계획표를 불러오는 중...</div>`;
  }
  if (!c.week) {
    return html`
      <div class="empty space-y-2 py-12">
        <div class="text-4xl">📒</div>
        <p class="font-bold text-slate-700">아직 이번 주 계획표가 없어요</p>
        <p>선생님이 계획표를 만들면 여기에 바로 나타나요.</p>
      </div>`;
  }
  const week = c.week;
  const date = viewDate(c);
  const settings = settingsOf(c.profile);
  if (!c.readOnly) setDurations(settings.focusMin, settings.outputMin);
  const view = S.ui.sview || 'today';

  return html`
    ${lateBanner(week)}
    ${pendingBanner(week)}
    ${weekHeader(c)}
    <div class="seg max-w-lg">
      <button type="button" class="seg-btn ${view === 'today' ? 'active' : ''}" data-action="student-tab" data-tab="today"><i class="fa-solid fa-list-check"></i>계획 체크</button>
      <button type="button" class="seg-btn ${view === 'table' ? 'active' : ''}" data-action="student-tab" data-tab="table"><i class="fa-solid fa-table-cells"></i>주간표</button>
      <button type="button" class="seg-btn ${view === 'stats' ? 'active' : ''}" data-action="student-tab" data-tab="stats"><i class="fa-solid fa-chart-column"></i>기록</button>
    </div>
    ${view === 'stats' ? statsView(c) : html`
      ${dayTabs(week, date, 'pick-day')}
      ${view === 'table' ? weekTable(week, settings.periods, 'table-pick') : dayView(c, date, settings)}`}
    ${c.readOnly ? '' : miniTimer()}
  `;
}

function weekHeader(c) {
  const week = c.week;
  const ids = [...(c.profile?.weekIds || [])].sort();
  const idx = ids.indexOf(week.start);
  const rate = weekRate(week);
  return html`
    <section class="card space-y-3">
      <div class="flex items-center justify-between gap-2">
        <button type="button" class="btn btn-ghost btn-sm !px-2" data-action="week-nav" data-to="${ids[idx - 1] || ''}" ${idx > 0 ? '' : 'disabled'} aria-label="지난주"><i class="fa-solid fa-chevron-left"></i></button>
        <div class="text-center min-w-0">
          <h2 class="font-black text-lg sm:text-xl text-planner-green truncate">${week.title || `${weekRangeText(week.start)} 학습 플래너`}</h2>
          ${week.start > todayKey() ? html`<p class="text-xs font-bold text-amber-700">다음 주 계획 미리보기</p>` : ''}
          ${week.start <= todayKey() && addDays(week.start, 6) < todayKey() ? html`<p class="text-xs font-bold text-slate-500">지난 계획표</p>` : ''}
        </div>
        <button type="button" class="btn btn-ghost btn-sm !px-2" data-action="week-nav" data-to="${ids[idx + 1] || ''}" ${idx >= 0 && idx < ids.length - 1 ? '' : 'disabled'} aria-label="다음 주"><i class="fa-solid fa-chevron-right"></i></button>
      </div>
      ${week.goals?.length ? html`
        <div class="rounded-2xl bg-planner-light/60 border border-planner-border/30 p-3.5">
          <p class="text-xs font-black text-planner-dark mb-2">🎯 이번 주 목표</p>
          ${goalsBox(week.goals)}
        </div>` : ''}
      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="rounded-xl bg-planner-bg border border-planner-border/20 py-2">
          <p class="text-[11px] font-bold text-slate-500">시작 인증</p>
          <p class="font-black text-planner-dark">${startedDays(week)} / ${plannedDays(week)}일</p>
        </div>
        <div class="rounded-xl bg-planner-bg border border-planner-border/20 py-2">
          <p class="text-[11px] font-bold text-slate-500">주간 달성률</p>
          <p class="font-black text-planner-dark">${rateText(rate)}</p>
        </div>
        <div class="rounded-xl bg-planner-bg border border-planner-border/20 py-2">
          <p class="text-[11px] font-bold text-slate-500">집중 완주</p>
          <p class="font-black text-planner-dark">${focusTotal(week)}회</p>
        </div>
      </div>
    </section>`;
}

function lateBanner(week) {
  const today = todayKey();
  if (!isLate(week, today, nowHHMM())) return '';
  const target = week.days[today].target;
  return html`
    <div class="rounded-2xl bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 text-white p-4 shadow-md flex flex-col sm:flex-row sm:items-center gap-3">
      <div class="flex items-center gap-3 flex-1">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 animate-bounce"><i class="fa-solid fa-bell text-lg"></i></span>
        <div>
          <p class="font-black">⏰ 약속한 공부 시작 시간(${target})이 지났어요!</p>
          <p class="text-sm text-white/90">오늘 첫 과제의 [🚀 시작]을 누르고 선생님께 알려 주세요.</p>
        </div>
      </div>
      <button type="button" class="btn bg-white text-rose-700 hover:bg-rose-50 shrink-0" data-action="start-first">🚀 지금 시작</button>
    </div>`;
}

// 지난 날 정리 안 한 과제가 있으면 알려줌
function pendingBanner(week) {
  const date = pendingCloseDate(week, todayKey());
  if (!date) return '';
  const n = unfinishedTasks(week, date).length;
  return html`
    <div class="rounded-2xl bg-amber-50 border-2 border-amber-300 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div class="flex items-center gap-3 flex-1">
        <span class="text-2xl">📦</span>
        <div>
          <p class="font-black text-amber-900">${dayTitle(date)}에 다 못 끝낸 과제가 ${n}개 있어요</p>
          <p class="text-sm text-amber-800">오늘 계획으로 넘기고, 못 한 이유를 간단히 적어 주세요.</p>
        </div>
      </div>
      <button type="button" class="btn btn-amber shrink-0" data-action="open-close-day" data-date="${date}">정리하기</button>
    </div>`;
}

function dayView(c, date, settings) {
  const week = c.week;
  const day = week.days?.[date] || {};
  const tasks = tasksOn(week, date);
  const rate = rateOf(tasks);
  const isToday = date === todayKey();
  const groups = groupByPeriod(tasks, settings.periods);

  return html`
    <div class="grid lg:grid-cols-12 gap-5 items-start">
      <div class="lg:col-span-8 space-y-4">
        <section class="card space-y-3">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 class="text-lg font-black text-slate-900">${dayTitle(date)} 계획표 ${isToday ? html`<span class="chip bg-amber-100 text-amber-800 align-middle">오늘</span>` : ''}</h3>
              <p class="text-sm mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span class="font-bold text-planner-dark">⏰ 목표 시작 ${day.target || '-'}</span>
                ${day.startedAt
                  ? html`<span class="font-extrabold text-planner-green">✅ ${day.startedAt} 시작 인증</span>`
                  : html`<span class="font-bold text-amber-700">⏳ 아직 시작 전</span>`}
                ${day.closedAt ? html`<span class="font-bold text-slate-500">🏁 ${day.closedAt} 마무리</span>` : ''}
              </p>
            </div>
            <div class="flex gap-2">
              <button type="button" class="btn btn-secondary btn-sm" data-action="open-add-task"><i class="fa-solid fa-plus"></i>과제 추가</button>
              <button type="button" class="btn btn-primary btn-sm" data-action="daily-report"><i class="fa-solid fa-flag-checkered"></i>마무리 + 보고</button>
            </div>
          </div>
          <div class="flex items-center gap-3">
            ${progressBar(rate)}
            <span class="text-sm font-black text-planner-dark shrink-0">${rateText(rate)}</span>
          </div>
          ${day.reason ? html`<p class="text-sm rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-amber-900"><b>📝 다 못 한 이유:</b> ${day.reason}</p>` : ''}
        </section>

        ${tasks.length ? groups.map((g) => html`
          <section class="space-y-2.5">
            <h4 class="font-black text-planner-dark flex items-center gap-2"><span class="w-1.5 h-5 rounded-full bg-planner-green"></span>&lt;${g.period || '기타'}&gt;</h4>
            ${g.tasks.length ? g.tasks.map((t) => taskCard(c, t)) : html`<div class="empty !p-4 !text-xs">등록된 과제가 없어요.</div>`}
          </section>`) : html`<div class="empty">이 날은 계획된 과제가 없어요. 필요하면 [과제 추가]로 직접 넣을 수 있어요.</div>`}
      </div>

      <div class="lg:col-span-4 space-y-4 lg:sticky lg:top-20">
        ${c.readOnly ? previewTimerCard(settings) : timerCard()}
        ${memoCard(c, date, day)}
      </div>
    </div>`;
}

function taskCard(c, t) {
  const open = S.ui.openTask === t.id;
  const isDone = t.status === 'done';
  const active = !c.readOnly && timer.taskId === t.id && timer.weekId === c.weekId;
  return html`
    <article class="rounded-2xl border-2 p-3.5 sm:p-4 shadow-sm transition ${isDone ? 'border-emerald-300 bg-emerald-50/40' : t.status === 'partial' ? 'border-amber-400 bg-amber-50/30' : 'border-planner-border/30 bg-planner-card'} ${active ? 'ring-2 ring-planner-green ring-offset-2 ring-offset-planner-bg' : ''}">
      <div class="flex flex-wrap items-center gap-1.5">
        ${t.time ? html`<span class="chip bg-planner-light text-planner-dark border border-planner-border/30">${cleanTime(t.time)}</span>` : ''}
        ${subjectChip(t.subject)}
        ${statusChip(t)}
        ${t.carriedTo ? html`<span class="chip bg-sky-100 text-sky-800">↪️ ${dayTitle(t.carriedTo)}로 이월</span>` : ''}
        ${t.by === 'student' ? html`<span class="chip bg-slate-100 text-slate-500">${t.from ? '이월됨' : '내가 추가'}</span>` : ''}
        ${active ? html`<span class="chip bg-planner-green text-white"><i class="fa-solid fa-stopwatch"></i>타이머 진행 중</span>` : ''}
      </div>
      <h5 class="mt-2 text-[15px] sm:text-base font-black leading-snug ${isDone ? 'line-through text-slate-400' : 'text-slate-900'}">${t.title}</h5>
      ${t.note && !open ? html`<p class="mt-2 text-sm font-semibold text-amber-900 bg-amber-100/70 border border-amber-300/70 rounded-xl px-3 py-2"><i class="fa-solid fa-pen-to-square mr-1 text-amber-700"></i>${t.note}</p>` : ''}

      <div class="mt-3 grid grid-cols-3 gap-2">
        ${isDone ? html`
          <button type="button" class="btn btn-secondary btn-sm col-span-3" data-action="task-undo" data-id="${t.id}"><i class="fa-solid fa-rotate-left"></i>완료 취소</button>
        ` : html`
          <button type="button" class="btn btn-primary btn-sm" data-action="task-start" data-id="${t.id}">🚀 시작</button>
          <button type="button" class="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700" data-action="task-done" data-id="${t.id}">✅ 완료</button>
          <button type="button" class="btn btn-sm ${open ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'}" data-action="task-open" data-id="${t.id}">🟡 부분 완료</button>
        `}
      </div>

      ${open ? html`
        <div class="mt-3 rounded-2xl bg-white border border-amber-300 p-3.5 space-y-3">
          <div>
            <div class="flex items-center justify-between">
              <label class="text-sm font-black text-slate-800" for="prog-${t.id}">어디까지 했나요?</label>
              <span class="text-lg font-black text-amber-600" id="prog-label-${t.id}">${t.status === 'todo' ? 0 : t.progress}%</span>
            </div>
            <input type="range" id="prog-${t.id}" class="w-full" min="0" max="100" step="5" value="${t.status === 'todo' ? 0 : t.progress}"
              data-input="progress-preview" data-change="progress-save" data-id="${t.id}" ${c.readOnly ? 'disabled' : ''} />
            <div class="grid grid-cols-4 gap-1.5 mt-1">
              ${[25, 50, 75, 90].map((p) => html`<button type="button" class="btn btn-sm btn-secondary !px-0" data-action="progress-quick" data-id="${t.id}" data-p="${p}">${p}%</button>`)}
            </div>
          </div>
          <div>
            <label class="text-sm font-black text-slate-800" for="note-${t.id}">✏️ 어디까지 했는지 메모</label>
            <textarea id="note-${t.id}" rows="2" class="input mt-1" maxlength="300" data-input="note-save" data-id="${t.id}" ${c.readOnly ? 'readonly' : ''}
              placeholder="예: 11강 수강 완료! 노트 정리는 절반까지, 나머지는 내일 마무리할게요.">${t.note || ''}</textarea>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex gap-1.5">
              ${t.carriedTo ? '' : html`<button type="button" class="btn btn-secondary btn-sm" data-action="carry-over" data-id="${t.id}"><i class="fa-solid fa-share"></i>남은 분량 넘기기</button>`}
              ${t.by === 'student' ? html`<button type="button" class="btn btn-danger btn-sm" data-action="task-delete" data-id="${t.id}"><i class="fa-solid fa-trash"></i>삭제</button>` : ''}
            </div>
            <button type="button" class="btn btn-primary btn-sm" data-action="task-open" data-id="${t.id}">닫기</button>
          </div>
        </div>` : ''}
    </article>`;
}

function timerCard() {
  const focus = timer.focusMin;
  const output = timer.outputMin;
  const total = focus + output;
  const isFocus = timer.stage === 'focus';
  const ms = remainingMs();
  const elapsed = Math.max(0, stageMs() - ms);
  const pct = Math.min(100, Math.round(((isFocus ? 0 : focus * 60000) + elapsed) / (total * 60000) * 100));
  const perm = notifyPermission();
  return html`
    <section class="card space-y-3.5" id="timer-card">
      <div class="flex items-center justify-between gap-2">
        <h3 class="card-title"><i class="fa-solid fa-stopwatch"></i>공부 타이머</h3>
        <span class="chip ${isFocus ? 'bg-planner-green text-white' : 'bg-amber-500 text-white'}">${isFocus ? `1단계 · ${focus}분 집중` : `2단계 · ${output}분 인출`}</span>
      </div>
      <div class="rounded-xl bg-planner-light/60 border border-planner-border/20 px-3 py-2 text-sm font-bold text-planner-dark truncate">
        ${timer.taskLabel ? html`📌 ${timer.taskLabel}` : html`<span class="text-slate-500 font-semibold">과제의 [🚀 시작]을 누르면 여기서 시간이 흘러가요</span>`}
      </div>
      <div class="text-center">
        <p id="timer-display" class="font-mono font-black text-6xl tracking-tight ${isFocus ? 'text-planner-dark' : 'text-amber-600'}">${formatMs(ms)}</p>
        <p class="text-xs text-slate-500 mt-1">${isFocus ? '인강을 맹목적으로 듣지 말고 필기하며 집중!' : '책을 덮고 배운 내용을 백지에 정리해요!'}</p>
      </div>
      <div class="space-y-1">
        <div class="relative h-3 rounded-full bg-planner-cream overflow-hidden flex">
          <div class="h-full bg-planner-green/25" style="width:${(focus / total) * 100}%"></div>
          <div class="h-full bg-amber-400/30" style="width:${(output / total) * 100}%"></div>
          <div id="timer-bar" class="absolute inset-y-0 left-0 ${isFocus ? 'bg-planner-green' : 'bg-amber-500'} rounded-full" style="width:${pct}%"></div>
        </div>
        <div class="flex justify-between text-[11px] font-bold text-slate-500"><span>집중 ${focus}분</span><span>인출 ${output}분</span></div>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button type="button" class="btn ${timer.running ? 'btn-secondary' : 'btn-primary'}" data-action="timer-toggle">
          <i class="fa-solid ${timer.running ? 'fa-pause' : 'fa-play'}"></i>${timer.running ? '일시정지' : (ms < stageMs() ? '계속하기' : '시작')}
        </button>
        <button type="button" class="btn btn-secondary" data-action="timer-reset"><i class="fa-solid fa-rotate-left"></i>처음부터</button>
      </div>
      <div class="flex items-center justify-between gap-2 text-xs">
        <div class="flex gap-1">
          <button type="button" class="btn btn-sm ${isFocus ? 'bg-planner-light text-planner-dark border border-planner-green' : 'btn-ghost'}" data-action="timer-stage" data-stage="focus">집중으로</button>
          ${output > 0 ? html`<button type="button" class="btn btn-sm ${!isFocus ? 'bg-amber-50 text-amber-900 border border-amber-400' : 'btn-ghost'}" data-action="timer-stage" data-stage="output">인출로</button>` : ''}
        </div>
        <label class="flex items-center gap-1.5 font-bold text-slate-600 cursor-pointer">
          <input type="checkbox" class="w-4 h-4 accent-green-700" data-change="timer-auto" ${timer.auto ? 'checked' : ''} />인출 자동 시작
        </label>
      </div>
      ${canNotify() && perm === 'default' ? html`
        <button type="button" class="btn btn-sm btn-secondary w-full" data-action="ask-notify"><i class="fa-solid fa-bell"></i>타이머가 끝나면 알림 받기</button>` : ''}
    </section>`;
}

// 선생님 미리보기: 타이머는 학생 폰에서만 돌아가서 모양만 보여줌
function previewTimerCard(settings) {
  return html`
    <section class="card space-y-3 opacity-90">
      <div class="flex items-center justify-between gap-2">
        <h3 class="card-title"><i class="fa-solid fa-stopwatch"></i>공부 타이머</h3>
        <span class="chip bg-planner-green text-white">${settings.focusMin}분 집중 + ${settings.outputMin}분 인출</span>
      </div>
      <p class="text-center font-mono font-black text-5xl text-planner-dark">${formatMs(settings.focusMin * 60000)}</p>
      <p class="text-xs text-center text-slate-500">타이머는 학생 폰에서 돌아가요. 집중을 끝까지 마치면 '집중 완주' 횟수가 올라가요.</p>
    </section>`;
}

// 폰에서 타이머 카드가 화면 밖에 있을 때 아래쪽에 작게 보여주는 타이머
function miniTimer() {
  if (!timer.running) return '';
  return html`
    <button type="button" data-action="scroll-timer"
      class="lg:hidden fixed z-30 right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] rounded-full shadow-lg px-4 py-2.5 font-mono font-black text-white flex items-center gap-2 ${timer.stage === 'focus' ? 'bg-planner-green' : 'bg-amber-500'}">
      <i class="fa-solid fa-stopwatch"></i><span id="mini-timer">${formatMs(remainingMs())}</span>
    </button>`;
}

function memoCard(c, date, day) {
  return html`
    <section class="card space-y-2.5">
      <h3 class="card-title"><i class="fa-solid fa-brain"></i>인출 메모</h3>
      <p class="text-xs text-slate-500">인출 시간에 정리한 핵심 내용을 적어요. 마감 보고에 함께 들어가요.</p>
      <textarea id="memo-${date}" rows="5" maxlength="2000" class="input leading-relaxed" data-input="memo-save" data-date="${date}" ${c.readOnly ? 'readonly' : ''}
        placeholder="예: [수학 18강] 근의 공식 유도 과정을 백지에 다시 써 봄. 판별식 부분이 헷갈림.">${day.memo || ''}</textarea>
    </section>`;
}

// ---------- 팝업 (과제 추가, 시작 알림, 하루 마무리) ----------
export const studentModals = {
  addTask: (m, frame) => {
    const c = ctx();
    const settings = settingsOf(c.profile);
    return frame(`${dayTitle(viewDate(c))}에 과제 추가`, html`
      <form class="space-y-3" data-submit="student-add-task">
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="label" for="sa-period">구분</label>
            <select class="input" id="sa-period" name="period">${periodOptions(settings.periods, settings.periods[settings.periods.length - 1])}</select>
          </div>
          <div>
            <label class="label" for="sa-subject">과목</label>
            <select class="input" id="sa-subject" name="subject">${subjectOptions(subjects()[0])}</select>
          </div>
        </div>
        <div>
          <label class="label" for="sa-time">시간 (선택)</label>
          <input class="input" id="sa-time" name="time" maxlength="30" placeholder="예: 21:00~23:00" />
        </div>
        <div>
          <label class="label" for="sa-title">할 일</label>
          <input class="input" id="sa-title" name="title" maxlength="100" placeholder="예: 영단어 Day 12 암기" required />
        </div>
        <button class="btn btn-primary w-full">추가하기</button>
      </form>
    `);
  },
  alarm: (m, frame) => frame('⏰ 약속한 공부 시작 시간이에요!', html`
    <p class="text-sm text-slate-700 leading-relaxed">오늘 목표 시작 시각 <b>${m.target}</b>이 지났어요.<br />첫 과제를 시작하고 선생님께 알려 주세요!</p>
    <div class="grid gap-2">
      <button type="button" class="btn btn-primary py-3" data-action="start-first">🚀 지금 시작하기</button>
      <div class="grid grid-cols-2 gap-2">
        <button type="button" class="btn btn-secondary" data-action="snooze" data-min="10">10분 뒤 다시 알림</button>
        <button type="button" class="btn btn-ghost" data-action="close-modal">닫기</button>
      </div>
    </div>
  `),
  closeDay: (m, frame) => {
    const c = ctx();
    const week = c.week;
    if (!week) return '';
    const tasks = unfinishedTasks(week, m.date);
    const target = carryTarget(m.date, todayKey());
    const targetWeek = weekContaining(c.profile?.weekIds || [], target);
    const day = week.days?.[m.date] || {};
    return frame(`🏁 ${dayTitle(m.date)} 마무리하기`, html`
      <form class="space-y-4" data-submit="close-day">
        <div class="space-y-2">
          <p class="text-sm font-black text-slate-800">다 못 끝낸 과제가 ${tasks.length}개 있어요</p>
          ${tasks.map((t) => html`
            <label class="flex items-start gap-2.5 rounded-xl border border-planner-border/30 bg-white p-2.5 cursor-pointer">
              <input type="checkbox" class="mt-0.5 w-5 h-5 accent-green-700 shrink-0" data-change="cd-carry" data-id="${t.id}" ${targetWeek && !m.skip.includes(t.id) ? 'checked' : ''} ${targetWeek ? '' : 'disabled'} />
              <span class="min-w-0">
                <span class="block text-sm font-bold text-slate-900">${t.title}</span>
                <span class="block text-xs text-slate-500">${t.status === 'partial' ? `${t.progress}%까지 함 · 남은 분량을 넘겨요` : '시작하지 못함'}</span>
              </span>
            </label>`)}
          <p class="text-xs ${targetWeek ? 'text-planner-dark font-bold' : 'text-amber-800'}">
            ${targetWeek ? `체크한 과제는 ${dayTitle(target)} 계획표에 [이월]로 들어가요.` : '다음 주 계획표가 아직 없어서 지금은 넘길 수 없어요. 선생님이 다음 주를 만들 때 이월돼요.'}
          </p>
        </div>
        <div class="space-y-2">
          <p class="label !mb-0">📝 다 못 한 이유 <span class="font-normal text-slate-500">(골라도 되고 적어도 돼요)</span></p>
          <div class="flex flex-wrap gap-1.5">
            ${REASON_CHIPS.map((ch) => html`
              <button type="button" data-action="cd-chip" data-chip="${ch}"
                class="rounded-full border px-3 py-1.5 text-sm font-bold transition ${m.chips.includes(ch) ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-600 border-slate-300 hover:border-amber-400'}">${ch}</button>`)}
          </div>
          <textarea class="input" id="cd-reason" name="reason" rows="2" maxlength="200" placeholder="예: 수행평가 PPT 만드느라 화학 인강을 못 들었어요."></textarea>
          ${day.reason ? html`<p class="text-xs text-slate-500">지난번에 적은 이유: ${day.reason}</p>` : ''}
        </div>
        <button class="btn btn-primary w-full py-3"><i class="fa-solid fa-flag-checkered"></i>${targetWeek ? '넘기고 마무리' : '마무리'}${m.report ? ' + 마감 보고' : ''}</button>
      </form>
    `);
  },
};

// ---------- 시작 시간 알림 (앱이 열려 있을 때) ----------
let snoozeUntil = 0;
export function checkStudyAlarm() {
  if (S.role !== 'student' || !S.week || S.ui.modal) return;
  const today = todayKey();
  if (!isLate(S.week, today, nowHHMM())) return;
  const target = S.week.days[today].target;
  const key = `alarm:${S.weekId}:${today}:${target}`;
  if (loadPref(key, false) || Date.now() < snoozeUntil) return;
  savePref(key, true);
  S.ui.modal = { type: 'alarm', target };
  alarmSound();
  notify('⏰ 약속한 공부 시작 시간이에요!', '첫 과제를 시작하고 선생님께 알려 주세요.');
  refresh();
}

// ---------- 동작 ----------
function startedPatch() {
  // 시작 인증은 '오늘'에만 남김 (지난 날 과제를 오늘 하더라도 오늘 시작으로 기록)
  const week = ctx().week;
  const today = todayKey();
  if (!weekDates(week.start).includes(today)) return {};
  if (week.days?.[today]?.startedAt) return {};
  return { [`days.${today}.startedAt`]: nowHHMM() };
}

function setProgress(id, p) {
  const status = statusFromProgress(p);
  const progress = normalizeProgress(status, p);
  const patch = { ...taskPatch(id, { status, progress }) };
  if (status !== 'todo') Object.assign(patch, startedPatch());
  return save(patch);
}

// 과제들을 다른 날로 넘기기 (다음 주 계획표가 있으면 그쪽으로). 마무리 정보도 함께 저장
async function carryTasks(tasks, target, dayPatch = {}) {
  const c = ctx();
  const targetWeek = weekContaining(c.profile?.weekIds || [], target);
  if (tasks.length && !targetWeek) throw Object.assign(new Error('no-week'), { code: 'no-week' });
  const here = { ...dayPatch };
  const there = {};
  let order = Date.now();
  tasks.forEach((t) => {
    order += 1;
    const id = makeTaskId();
    const copy = { ...carriedCopy(t, order), date: target, fromId: t.id };
    if (targetWeek === c.weekId) here[`tasks.${id}`] = copy;
    else there[`tasks.${id}`] = copy;
    here[`tasks.${t.id}.carriedTo`] = target;
  });
  const now = Date.now();
  const batch = writeBatch(db);
  batch.update(weekRef(c.uid, c.weekId), { ...here, updatedAt: now, studentAt: now });
  if (Object.keys(there).length) batch.update(weekRef(c.uid, targetWeek), { ...there, updatedAt: now, studentAt: now });
  await batch.commit();
}

async function startTask(id) {
  const c = ctx();
  const t = findTask(id);
  if (!t) return;
  unlockAudio();
  if (timer.running && timer.taskId !== id && !confirm('진행 중인 타이머가 있어요. 이 과제로 바꿔서 처음부터 시작할까요?')) return;
  const today = todayKey();
  const countDate = weekDates(c.week.start).includes(today) ? today : t.date;
  const settings = settingsOf(c.profile);
  setDurations(settings.focusMin, settings.outputMin);
  if (!(timer.running && timer.taskId === id)) {
    startFor({ uid: c.uid, weekId: c.weekId, date: countDate, taskId: id, taskLabel: `${t.time ? `${cleanTime(t.time)} ` : ''}${taskLabel(t)}` });
  }
  const startedAt = c.week.days?.[today]?.startedAt || nowHHMM();
  const patch = startedPatch();
  if (Object.keys(patch).length) save(patch).catch((err) => toast(err.code === 'permission-denied' ? '저장 권한이 없어요.' : '저장하지 못했어요. 인터넷을 확인해 주세요.', 'error'));
  openShare('🚀 선생님께 시작 알리기', startMessage({ date: today, task: t, startedAt, focusMin: settings.focusMin, outputMin: settings.outputMin }),
    '타이머가 켜졌어요! 아래 문구를 선생님께 보내 주세요.');
}

function openReport(date) {
  const c = ctx();
  const settings = settingsOf(c.profile);
  openShare('📲 오늘 공부 마감 보고', dailyReport({ name: c.profile?.name || '', week: c.week, date, periods: settings.periods }),
    '오늘 완료한 부분까지 정리된 보고서예요. 선생님께 보내 주세요!');
}

export const studentActions = {
  'pick-day': (el) => {
    flushSaves();
    setViewDate(el.dataset.date);
    S.ui.openTask = '';
    refresh();
  },
  'table-pick': (el) => {
    setViewDate(el.dataset.date);
    S.ui.openTask = el.dataset.task || '';
    S.ui.sview = 'today';
    refresh();
    if (el.dataset.task) setTimeout(() => document.getElementById(`prog-${el.dataset.task}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
  },
  'student-tab': (el) => {
    S.ui.sview = el.dataset.tab;
    refresh();
  },
  'week-nav': (el) => {
    if (!el.dataset.to) return;
    flushSaves();
    if (isPreview()) {
      S.ui.tWeekId = el.dataset.to;
      S.ui.tDate = '';
    } else {
      S.ui.weekId = el.dataset.to;
    }
    S.ui.openTask = '';
    refresh();
  },
  'task-start': (el) => {
    if (blocked()) return;
    return startTask(el.dataset.id);
  },
  'start-first': () => {
    S.ui.modal = null;
    if (blocked()) return refresh();
    const today = todayKey();
    S.ui.date = today;
    S.ui.sview = 'today';
    const first = tasksOn(ctx().week, today).find((t) => t.status !== 'done');
    if (first) return startTask(first.id);
    refresh();
  },
  'task-done': async (el) => {
    if (blocked()) return;
    unlockAudio();
    chime();
    S.ui.openTask = '';
    refresh();
    await setProgress(el.dataset.id, 100);
    toast('✅ 완료! 잘했어요.');
  },
  'task-undo': (el) => {
    if (blocked()) return;
    return setProgress(el.dataset.id, 0);
  },
  'task-open': (el) => {
    const id = el.dataset.id;
    flushSaves();
    S.ui.openTask = S.ui.openTask === id ? '' : id;
    const t = findTask(id);
    refresh();
    // 처음 부분 완료를 누르면 50%로 표시해 둠
    if (!ctx().readOnly && S.ui.openTask && t && t.status === 'todo') setProgress(id, 50);
  },
  'progress-preview': (el) => {
    const label = document.getElementById(`prog-label-${el.dataset.id}`);
    if (label) label.textContent = `${el.value}%`;
  },
  'progress-save': (el) => {
    if (blocked()) return;
    return setProgress(el.dataset.id, Number(el.value));
  },
  'progress-quick': (el) => {
    if (blocked()) return;
    return setProgress(el.dataset.id, Number(el.dataset.p));
  },
  'note-save': (el) => {
    if (ctx().readOnly) return;
    const id = el.dataset.id;
    const { uid, weekId } = ctx();
    const value = el.value;
    debounceSave(`note:${id}`, () => {
      const t = ctx().week?.tasks?.[id];
      const patch = taskPatch(id, { note: value });
      // 메모를 쓰기 시작했는데 아직 진행 전이면 부분 완료로 표시
      if (t && t.status === 'todo' && value.trim()) Object.assign(patch, taskPatch(id, { status: 'partial', progress: 50 }));
      patchWeek(uid, weekId, patch, true).catch(() => toast('메모를 저장하지 못했어요.', 'error'));
    });
  },
  'memo-save': (el) => {
    if (ctx().readOnly) return;
    const date = el.dataset.date;
    const { uid, weekId } = ctx();
    const value = el.value;
    debounceSave(`memo:${date}`, () => {
      patchWeek(uid, weekId, { [`days.${date}.memo`]: value }, true).catch(() => toast('메모를 저장하지 못했어요.', 'error'));
    });
  },
  'carry-over': async (el) => {
    if (blocked()) return;
    const t = findTask(el.dataset.id);
    if (!t || t.carriedTo) return;
    const target = carryTarget(t.date, todayKey());
    try {
      await carryTasks([t], target);
    } catch (err) {
      if (err.code === 'no-week') return toast('다음 주 계획표가 아직 없어요. 선생님이 다음 주를 만들 때 이월돼요.', 'error');
      throw err;
    }
    S.ui.openTask = '';
    refresh();
    const remain = 100 - (t.status === 'partial' ? t.progress : 0);
    toast(`↪️ 남은 분량(${remain}%)을 ${dayTitle(target)} 계획표에 넣었어요.`);
  },
  'task-delete': async (el) => {
    if (blocked()) return;
    const t = findTask(el.dataset.id);
    if (!t || t.by !== 'student') return;
    if (!confirm(`'${t.title}' 과제를 지울까요?`)) return;
    S.ui.openTask = '';
    refresh();
    const patch = deleteTaskPatch(t.id);
    // 이월해 온 과제를 지우면 원래 과제의 '이월됨' 표시도 없앰 (같은 주에 있을 때)
    if (t.fromId && ctx().week?.tasks?.[t.fromId]) patch[`tasks.${t.fromId}.carriedTo`] = deleteField();
    await save(patch);
    toast('과제를 지웠어요.');
  },
  'open-add-task': () => {
    if (blocked()) return;
    S.ui.modal = { type: 'addTask' };
    refresh();
  },
  'student-add-task': async (form, e, data) => {
    if (blocked()) return;
    const title = String(data.get('title') || '').trim();
    if (!title) return toast('할 일을 입력해 주세요.', 'error');
    const date = viewDate();
    if (!date) return toast('날짜를 먼저 골라 주세요.', 'error');
    const id = makeTaskId();
    await save({
      [`tasks.${id}`]: {
        date,
        period: String(data.get('period') || ''),
        time: String(data.get('time') || '').trim(),
        subject: String(data.get('subject') || ''),
        title,
        status: 'todo',
        progress: 0,
        note: '',
        order: Date.now(),
        by: 'student',
      },
    });
    form.reset();
    S.ui.modal = null;
    refresh();
    toast('과제를 추가했어요.');
  },
  // 마무리 + 보고: 다 못 끝낸 과제가 있으면 먼저 이월·이유를 받음
  'daily-report': async () => {
    flushSaves();
    const c = ctx();
    const date = viewDate(c);
    if (c.readOnly) return openReport(date);
    if (unfinishedTasks(c.week, date).length) {
      S.ui.modal = { type: 'closeDay', date, chips: [], skip: [], report: true };
      return refresh();
    }
    if (!c.week.days?.[date]?.closedAt) save({ [`days.${date}.closedAt`]: nowHHMM() }).catch(() => {});
    openReport(date);
  },
  'open-close-day': (el) => {
    if (blocked()) return;
    S.ui.modal = { type: 'closeDay', date: el.dataset.date, chips: [], skip: [], report: false };
    refresh();
  },
  'cd-chip': (el) => {
    const m = S.ui.modal;
    if (!m) return;
    const ch = el.dataset.chip;
    m.chips = m.chips.includes(ch) ? m.chips.filter((x) => x !== ch) : [...m.chips, ch];
    refresh();
  },
  'cd-carry': (el) => {
    const m = S.ui.modal;
    if (!m) return;
    const id = el.dataset.id;
    m.skip = el.checked ? m.skip.filter((x) => x !== id) : [...m.skip, id];
  },
  'close-day': async (form, e, data) => {
    if (blocked()) return;
    const m = S.ui.modal;
    const c = ctx();
    if (!m || !c.week) return;
    const reason = reasonText(m.chips, data.get('reason'));
    const unfinished = unfinishedTasks(c.week, m.date);
    if (unfinished.length && !reason) return toast('다 못 한 이유를 골라 주거나 간단히 적어 주세요.', 'error');
    const target = carryTarget(m.date, todayKey());
    const canCarry = Boolean(weekContaining(c.profile?.weekIds || [], target));
    const toCarry = canCarry ? unfinished.filter((t) => !m.skip.includes(t.id)) : [];
    await carryTasks(toCarry, target, {
      [`days.${m.date}.reason`]: reason,
      [`days.${m.date}.closedAt`]: nowHHMM(),
    });
    const date = m.date;
    const withReport = m.report;
    form.reset();
    S.ui.modal = null;
    refresh();
    if (toCarry.length) toast(`↪️ ${toCarry.length}개 과제를 ${dayTitle(target)} 계획표로 넘겼어요.`);
    else toast('🏁 마무리했어요. 수고했어요!');
    if (withReport) setTimeout(() => openReport(date), 50);
  },
  'timer-toggle': () => {
    if (blocked()) return;
    unlockAudio();
    toggle();
  },
  'timer-reset': () => {
    if (blocked()) return;
    if (timer.running && !confirm('타이머를 처음부터 다시 시작할까요?')) return;
    reset();
  },
  'timer-stage': (el) => {
    if (blocked()) return;
    setStage(el.dataset.stage);
  },
  'timer-auto': (el) => setAuto(el.checked),
  'ask-notify': async () => {
    await askNotifyPermission();
    refresh();
  },
  'scroll-timer': () => {
    S.ui.sview = 'today';
    refresh();
    setTimeout(() => document.getElementById('timer-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  },
  snooze: (el) => {
    const min = Number(el.dataset.min) || 10;
    snoozeUntil = Date.now() + min * 60000;
    const today = todayKey();
    const target = S.week?.days?.[today]?.target;
    savePref(`alarm:${S.weekId}:${today}:${target}`, false);
    S.ui.modal = null;
    toast(`⏳ ${min}분 뒤에 다시 알려 드릴게요.`);
    refresh();
  },
};
