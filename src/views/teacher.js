// 강사 화면: 현황판, 학생 관리(계획표 만들기·수정, 설정, 메모·리포트), 앱 설정
import { deleteDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import {
  S, refresh, savePref, approvedStudents, pendingStudents, settingsOf, subjects, guideSteps, teacherName, appTitle,
} from '../store.js';
import { html } from '../lib/html.js';
import { toast, debounceSave, flushSaves, clampNumber, copyText } from '../lib/util.js';
import {
  DEFAULT_SETTINGS, DEFAULT_PARENT_COMMENT, todayKey, nowHHMM, dayTitle, tasksOn, groupByPeriod, rateOf, weekRate,
  startedDays, plannedDays, focusTotal, isLate, weekDates, buildWeek, parseLegacyPlan, suggestNextStart,
  defaultWeekTitle, weekRangeText, dailyReport, parentReport, makeTaskId, isDateKey, daysBetween,
  normalizeProgress, weekContaining,
} from '../lib/week.js';
import {
  patchWeek, taskPatch, deleteTaskPatch, createWeek, deleteWeek, updateUser, saveNote, saveConfig, weekRef,
} from '../data.js';
import {
  progressBar, dayTabs, weekTable, openShare, rateText, subjectOptions, periodOptions,
} from './planner.js';

const selUser = () => S.t.users.find((u) => u.id === S.ui.sel);

// 강사가 보고 있는 날짜 (고른 날 → 오늘 → 그 주 첫날)
function editDate() {
  const week = S.t.week;
  if (!week) return '';
  const dates = weekDates(week.start || S.t.weekId);
  if (dates.includes(S.ui.tDate)) return S.ui.tDate;
  return dates.includes(todayKey()) ? todayKey() : dates[0];
}

function ago(ts) {
  if (!ts) return '기록 없음';
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export function teacherView() {
  if (!S.t.usersLoaded) return html`<div class="py-20 text-center text-sm text-slate-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i>불러오는 중...</div>`;
  if (S.ui.tab === 'settings') return settingsView();
  if (S.ui.tab === 'students') return S.ui.sel && selUser() ? studentPage(selUser()) : studentList();
  return dashboardView();
}

// ---------- 현황판 ----------
const ORDER = { late: 0, waiting: 1, started: 2, rest: 3, noweek: 4, loading: 5 };

function todayStatus(u) {
  const w = S.t.current[u.id];
  const today = todayKey();
  if (w === undefined) return { key: 'loading' };
  if (!w) return { key: 'noweek' };
  const tasks = tasksOn(w, today);
  const day = w.days?.[today] || {};
  const base = { w, tasks, day, rate: rateOf(tasks) };
  if (!tasks.length) return { ...base, key: day.startedAt ? 'started' : 'rest' };
  if (day.startedAt) return { ...base, key: 'started' };
  if (isLate(w, today, nowHHMM())) return { ...base, key: 'late' };
  return { ...base, key: 'waiting' };
}

function statusBadge(st) {
  switch (st.key) {
    case 'started': return html`<span class="chip bg-emerald-100 text-emerald-800">✅ ${st.day.startedAt} 시작</span>`;
    case 'late': return html`<span class="chip bg-rose-600 text-white">⏰ 늦음 (목표 ${st.day.target})</span>`;
    case 'waiting': return html`<span class="chip bg-slate-100 text-slate-600">⏳ ${st.day.target} 시작 예정</span>`;
    case 'rest': return html`<span class="chip bg-slate-100 text-slate-500">오늘 계획 없음</span>`;
    case 'noweek': return html`<span class="chip bg-amber-100 text-amber-800">이번 주 계획표 없음</span>`;
    default: return html`<span class="chip bg-slate-100 text-slate-400">불러오는 중</span>`;
  }
}

function dashboardView() {
  const today = todayKey();
  const rows = approvedStudents().map((u) => ({ u, st: todayStatus(u) }))
    .sort((a, b) => ORDER[a.st.key] - ORDER[b.st.key] || String(a.u.name).localeCompare(String(b.u.name), 'ko'));
  const count = (k) => rows.filter((r) => r.st.key === k).length;
  const pending = pendingStudents();

  return html`
    ${pending.length ? html`
      <button type="button" class="w-full text-left rounded-2xl bg-amber-50 border border-amber-300 p-4 flex items-center gap-3" data-action="t-tab" data-tab="students">
        <i class="fa-solid fa-user-clock text-amber-600 text-xl"></i>
        <span class="flex-1 text-sm font-bold text-amber-900">승인을 기다리는 학생이 ${pending.length}명 있어요.</span>
        <span class="btn btn-sm bg-amber-500 text-white">확인하기</span>
      </button>` : ''}

    <section class="card">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-xl font-black text-planner-dark">오늘 현황 · ${dayTitle(today)}</h2>
          <p class="text-sm text-slate-500 mt-1">학생이 체크하면 바로 바뀌어요. (현재 ${nowHHMM()})</p>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <span class="chip bg-emerald-100 text-emerald-800">시작 ${count('started')}명</span>
          <span class="chip bg-rose-100 text-rose-700">늦음 ${count('late')}명</span>
          <span class="chip bg-slate-100 text-slate-600">시작 전 ${count('waiting')}명</span>
          ${count('noweek') ? html`<span class="chip bg-amber-100 text-amber-800">계획표 없음 ${count('noweek')}명</span>` : ''}
        </div>
      </div>
    </section>

    ${rows.length ? html`
      <div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        ${rows.map(({ u, st }) => html`
          <button type="button" data-action="open-student" data-uid="${u.id}"
            class="text-left card !p-4 hover:border-planner-green transition space-y-3 ${st.key === 'late' ? '!border-rose-300 !bg-rose-50/50' : ''}">
            <div class="flex items-center justify-between gap-2">
              <span class="font-black text-lg text-slate-900 truncate">${u.name}</span>
              ${statusBadge(st)}
            </div>
            ${st.w ? html`
              <div class="space-y-1">
                <div class="flex justify-between text-xs font-bold text-slate-500">
                  <span>오늘 ${st.tasks.length}개 과제 · 집중 ${st.day.focus || 0}회</span>
                  <span class="text-planner-dark">${rateText(st.rate)}</span>
                </div>
                ${progressBar(st.rate, 'h-2')}
              </div>
              <div class="flex justify-between text-xs text-slate-500">
                <span>주간 달성 <b class="text-slate-700">${rateText(weekRate(st.w))}</b> · 시작 ${startedDays(st.w)}/${plannedDays(st.w)}일</span>
                <span>${ago(st.w.studentAt)}</span>
              </div>` : html`<p class="text-xs text-slate-500">${st.key === 'noweek' ? '눌러서 이번 주 계획표를 만들어 주세요.' : ''}</p>`}
          </button>`)}
      </div>` : html`<div class="empty">아직 승인된 학생이 없어요. 학생이 가입하면 [학생] 탭에서 승인해 주세요.<br />가입 주소: <b>${location.origin + location.pathname}</b></div>`}
  `;
}

// ---------- 학생 목록 ----------
function studentList() {
  const pending = pendingStudents();
  const approved = approvedStudents();
  const today = todayKey();
  return html`
    ${pending.length ? html`
      <section class="card space-y-3 !border-amber-300">
        <h2 class="card-title text-amber-900"><i class="fa-solid fa-user-clock"></i>승인 대기 (${pending.length})</h2>
        ${pending.map((u) => html`
          <div class="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3">
            <div class="flex-1 min-w-0">
              <p class="font-black">${u.name}</p>
              <p class="text-xs text-slate-500 truncate">${u.email || '이메일 없음'} · ${u.createdAt ? new Date(u.createdAt).toLocaleDateString('ko-KR') : ''} 가입</p>
            </div>
            <button type="button" class="btn btn-primary btn-sm" data-action="approve" data-uid="${u.id}"><i class="fa-solid fa-check"></i>승인</button>
            <button type="button" class="btn btn-danger btn-sm" data-action="reject" data-uid="${u.id}">거절</button>
          </div>`)}
      </section>` : ''}

    <section class="card space-y-3">
      <div class="flex items-center justify-between gap-2">
        <h2 class="card-title"><i class="fa-solid fa-users"></i>학생 (${approved.length})</h2>
        <button type="button" class="btn btn-secondary btn-sm" data-action="copy-join-link"><i class="fa-regular fa-copy"></i>가입 주소 복사</button>
      </div>
      ${approved.length ? html`
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          ${approved.map((u) => {
            const cur = weekContaining(u.weekIds || [], today);
            return html`
              <button type="button" class="text-left rounded-xl border border-planner-border/30 bg-white hover:border-planner-green p-3 flex items-center gap-3" data-action="open-student" data-uid="${u.id}">
                <span class="w-10 h-10 rounded-full bg-planner-light text-planner-dark font-black flex items-center justify-center shrink-0">${String(u.name || '?').slice(-2)}</span>
                <span class="flex-1 min-w-0">
                  <span class="block font-black truncate">${u.name}</span>
                  <span class="block text-xs ${cur ? 'text-slate-500' : 'text-amber-700 font-bold'}">${cur ? `이번 주 계획 있음 · 총 ${(u.weekIds || []).length}주` : '이번 주 계획표 없음'}</span>
                </span>
                <i class="fa-solid fa-chevron-right text-slate-300"></i>
              </button>`;
          })}
        </div>` : html`<div class="empty">학생이 가입하면 위에 '승인 대기'로 나타나요. [가입 주소 복사]로 학생에게 주소를 보내 주세요.</div>`}
    </section>`;
}

// ---------- 학생 한 명 ----------
function studentPage(u) {
  const sub = S.ui.sub;
  return html`
    <div class="flex flex-wrap items-center gap-2">
      <button type="button" class="btn btn-ghost btn-sm" data-action="close-student"><i class="fa-solid fa-arrow-left"></i>학생 목록</button>
      <h2 class="text-xl font-black text-planner-dark mr-auto">${u.name}</h2>
      <div class="seg w-full sm:w-auto">
        ${[['plan', '계획표', 'fa-calendar-week'], ['report', '메모·리포트', 'fa-file-lines'], ['settings', '학생 설정', 'fa-gear']].map(([id, label, icon]) => html`
          <button type="button" class="seg-btn ${sub === id ? 'active' : ''}" data-action="t-sub" data-sub="${id}"><i class="fa-solid ${icon}"></i>${label}</button>`)}
      </div>
    </div>
    ${sub === 'settings' ? studentSettings(u) : sub === 'report' ? reportPage(u) : planPage(u)}`;
}

function weekSelector(u, withCreate = true) {
  const ids = [...(u.weekIds || [])].sort().reverse();
  const today = todayKey();
  return html`
    <div class="flex flex-wrap items-center gap-2">
      ${ids.length ? html`
        <select class="input !w-auto font-bold" data-change="t-pick-week" aria-label="주 선택">
          ${ids.map((id) => html`<option value="${id}" ${id === S.t.weekId ? 'selected' : ''}>${weekRangeText(id)}${weekContaining([id], today) ? ' (이번 주)' : id > today ? ' (예정)' : ''}</option>`)}
        </select>` : ''}
      ${withCreate ? html`<button type="button" class="btn ${S.ui.creatingWeek ? 'btn-secondary' : 'btn-primary'} btn-sm" data-action="toggle-create-week">
        <i class="fa-solid ${S.ui.creatingWeek ? 'fa-xmark' : 'fa-plus'}"></i>${S.ui.creatingWeek ? '닫기' : '새 주 만들기'}
      </button>` : ''}
    </div>`;
}

function createWeekForm(u) {
  const ids = [...(u.weekIds || [])].sort();
  const start = S.ui.newStart || suggestNextStart(ids, todayKey());
  const prev = [...ids].reverse().find((id) => id < start);
  return html`
    <section class="card space-y-4 !border-planner-green">
      <h3 class="card-title"><i class="fa-solid fa-calendar-plus"></i>${u.name} 새 주 계획표 만들기</h3>
      <form class="space-y-3" data-submit="create-week">
        <div class="grid sm:grid-cols-2 gap-3">
          <div>
            <label class="label" for="nw-start">시작 날짜 (이 날부터 7일)</label>
            <input class="input" type="date" id="nw-start" name="start" value="${start}" data-change="nw-start" required />
          </div>
          <div>
            <label class="label" for="nw-title">제목</label>
            <input class="input" id="nw-title" name="title" maxlength="40" placeholder="${defaultWeekTitle(start)}" />
          </div>
        </div>
        ${prev ? html`
          <div class="rounded-xl bg-planner-bg border border-planner-border/30 p-3 space-y-2 text-sm">
            <p class="font-bold text-slate-700">지난 계획표(${weekRangeText(prev)})에서 가져오기</p>
            <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="copy" class="w-4 h-4 accent-green-700" checked />과제를 같은 요일에 그대로 복사 (진행 상황은 0%로)</label>
            <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="carry" class="w-4 h-4 accent-green-700" checked />다 못 끝낸 과제를 첫날에 [이월]로 추가 (복사도 하면 부분 완료만)</label>
            <p class="text-xs text-slate-500">주간 목표와 요일별 시작 시각도 이어받아요.</p>
            <input type="hidden" name="prev" value="${prev}" />
          </div>` : html`<p class="text-sm text-slate-500">빈 계획표로 시작해요. 만든 뒤 요일별로 과제를 넣어 주세요.</p>`}
        <button class="btn btn-primary w-full sm:w-auto" ${S.ui.busy ? 'disabled' : ''}><i class="fa-solid fa-check"></i>만들기</button>
      </form>

      <details class="rounded-xl border border-slate-200 bg-white p-3 text-sm">
        <summary class="cursor-pointer font-bold text-slate-600">예전 플래너(Netlify)에서 가져오기</summary>
        <form class="mt-3 space-y-2" data-submit="import-legacy">
          <p class="text-slate-600 leading-relaxed">예전 앱 코치 화면에서 <b>[🔗 현재 계획표·비밀번호가 담긴 전용 링크 복사]</b>를 누른 뒤, 복사된 주소를 아래에 붙여넣으세요. 날짜·과제·진행률·메모를 그대로 옮겨요. (예전 비밀번호는 가져오지 않아요)</p>
          <textarea class="input h-24 font-mono !text-xs" id="legacy-text" name="text" placeholder="https://....netlify.app/#plan=..."></textarea>
          <button class="btn btn-secondary btn-sm" ${S.ui.busy ? 'disabled' : ''}><i class="fa-solid fa-file-import"></i>가져오기</button>
        </form>
      </details>
    </section>`;
}

function planPage(u) {
  const ids = u.weekIds || [];
  const settings = settingsOf(u);
  const showCreate = S.ui.creatingWeek || !ids.length;
  const week = S.t.week;
  let body = '';
  if (!ids.length) body = '';
  else if (week === undefined) body = html`<div class="py-10 text-center text-sm text-slate-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i>불러오는 중...</div>`;
  else if (!week) body = html`<div class="empty">이 주 계획표를 찾을 수 없어요.</div>`;
  else body = weekEditor(u, week, settings);
  return html`
    ${weekSelector(u)}
    ${showCreate ? createWeekForm(u) : ''}
    ${body}`;
}

function weekEditor(u, week, settings) {
  const date = editDate();
  const day = week.days?.[date] || {};
  const tasks = tasksOn(week, date);
  const groups = groupByPeriod(tasks, settings.periods);
  const rate = weekRate(week);

  return html`
    <section class="card space-y-4">
      <div class="grid lg:grid-cols-2 gap-4">
        <div class="space-y-3">
          <div>
            <label class="label" for="wk-title">계획표 제목</label>
            <input class="input font-bold" id="wk-title" maxlength="40" value="${week.title || ''}" placeholder="${defaultWeekTitle(week.start)}" data-change="t-week-title" />
          </div>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="rounded-xl bg-planner-bg border border-planner-border/20 py-2"><p class="text-[11px] font-bold text-slate-500">주간 달성률</p><p class="font-black text-planner-dark">${rateText(rate)}</p></div>
            <div class="rounded-xl bg-planner-bg border border-planner-border/20 py-2"><p class="text-[11px] font-bold text-slate-500">시작 인증</p><p class="font-black text-planner-dark">${startedDays(week)}/${plannedDays(week)}일</p></div>
            <div class="rounded-xl bg-planner-bg border border-planner-border/20 py-2"><p class="text-[11px] font-bold text-slate-500">집중 완주</p><p class="font-black text-planner-dark">${focusTotal(week)}회</p></div>
          </div>
        </div>
        <div class="space-y-2">
          <p class="label !mb-0">🎯 주간 목표</p>
          ${(week.goals || []).map((g, i) => html`
            <div class="flex items-center gap-2">
              <span class="font-black text-planner-green">○</span>
              <input class="input input-sm flex-1" id="goal-${week.start}-${i}" maxlength="100" value="${g}" data-change="t-goal" data-i="${i}" />
              <button type="button" class="btn btn-danger btn-sm !px-2" data-action="t-goal-del" data-i="${i}" aria-label="목표 삭제"><i class="fa-solid fa-trash-can"></i></button>
            </div>`)}
          <form class="flex gap-2" data-submit="t-goal-add">
            <input class="input input-sm flex-1" id="goal-new" name="goal" maxlength="100" placeholder="새 주간 목표" />
            <button class="btn btn-secondary btn-sm"><i class="fa-solid fa-plus"></i>추가</button>
          </form>
        </div>
      </div>
    </section>

    ${dayTabs(week, date, 't-pick-day')}

    <section class="card space-y-4">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 class="text-lg font-black">${dayTitle(date)} 계획</h3>
          <p class="text-sm mt-1">
            ${day.startedAt ? html`<span class="font-bold text-planner-green">✅ ${day.startedAt} 시작 인증</span>
              <button type="button" class="ml-1 text-xs text-slate-400 underline" data-action="t-clear-start">기록 지우기</button>` : html`<span class="font-bold text-slate-500">아직 시작 기록 없음</span>`}
          </p>
        </div>
        <label class="flex items-center gap-2 text-sm font-bold text-planner-dark">⏰ 목표 시작
          <input type="time" class="input input-sm !w-auto" value="${day.target || settings.defaultTarget}" data-change="t-day-target" />
        </label>
      </div>

      ${groups.map((g) => html`
        <div class="space-y-2">
          <h4 class="font-black text-planner-dark text-sm">&lt;${g.period || '기타'}&gt;</h4>
          ${g.tasks.length ? g.tasks.map((t) => taskEditRow(t, settings)) : html`<p class="text-xs text-slate-400 pl-1">과제 없음</p>`}
        </div>`)}

      <form class="rounded-2xl border-2 border-dashed border-planner-border/40 p-3 space-y-2" data-submit="t-add-task">
        <p class="text-sm font-black text-planner-dark"><i class="fa-solid fa-plus"></i> ${dayTitle(date)}에 과제 추가</p>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select class="input input-sm" id="na-period" name="period">${periodOptions(settings.periods, S.ui.lastPeriod || settings.periods[0])}</select>
          <select class="input input-sm" id="na-subject" name="subject">${subjectOptions(S.ui.lastSubject || subjects()[0])}</select>
          <input class="input input-sm col-span-2" id="na-time" name="time" maxlength="30" placeholder="시간 예: 17:00~19:00" />
        </div>
        <div class="flex gap-2">
          <input class="input input-sm flex-1" id="na-title" name="title" maxlength="100" placeholder="과제 예: 개념의 신 19강 수강 + 정리" required />
          <button class="btn btn-primary btn-sm shrink-0">추가</button>
        </div>
      </form>

      ${day.memo ? html`
        <div class="rounded-xl bg-planner-light/50 border border-planner-border/30 p-3 text-sm">
          <p class="font-black text-planner-dark mb-1">🧠 학생 인출 메모</p>
          <p class="whitespace-pre-wrap text-slate-700">${day.memo}</p>
        </div>` : ''}

      <div class="flex flex-wrap gap-2 pt-1">
        <button type="button" class="btn btn-secondary btn-sm" data-action="t-daily-report"><i class="fa-solid fa-paper-plane"></i>이 날 마감 보고 보기</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="t-copy-day"><i class="fa-regular fa-copy"></i>이 날 과제를 다른 날에 복사</button>
      </div>
    </section>

    <details class="space-y-2" ${S.ui.tShowTable ? 'open' : ''}>
      <summary class="cursor-pointer font-bold text-planner-dark text-sm" data-action="t-toggle-table">주간 전체표 보기</summary>
      <div class="mt-2">${weekTable(week, settings.periods, 't-pick-day')}</div>
    </details>

    <div class="text-right">
      <button type="button" class="btn btn-danger btn-sm" data-action="t-delete-week"><i class="fa-solid fa-trash"></i>이 주 계획표 삭제</button>
    </div>`;
}

function taskEditRow(t, settings) {
  return html`
    <div class="rounded-2xl border p-3 space-y-2 ${t.status === 'done' ? 'border-emerald-300 bg-emerald-50/40' : t.status === 'partial' ? 'border-amber-300 bg-amber-50/30' : 'border-planner-border/30 bg-white'}">
      <div class="flex flex-wrap items-center gap-1.5">
        <select class="input input-sm !w-auto" data-change="t-task-field" data-id="${t.id}" data-field="period" aria-label="구분">${periodOptions(settings.periods, t.period)}</select>
        <input class="input input-sm !w-36" id="tt-${t.id}" value="${t.time || ''}" maxlength="30" placeholder="시간" data-change="t-task-field" data-id="${t.id}" data-field="time" aria-label="시간" />
        <select class="input input-sm !w-auto" data-change="t-task-field" data-id="${t.id}" data-field="subject" aria-label="과목">${subjectOptions(t.subject)}</select>
        <select class="input input-sm !w-auto" data-change="t-task-status" data-id="${t.id}" aria-label="진행 상황">
          <option value="todo" ${t.status === 'todo' ? 'selected' : ''}>진행 전</option>
          <option value="partial" ${t.status === 'partial' ? 'selected' : ''}>부분 완료 ${t.status === 'partial' ? `(${t.progress}%)` : ''}</option>
          <option value="done" ${t.status === 'done' ? 'selected' : ''}>완료</option>
        </select>
        ${t.by === 'student' ? html`<span class="chip bg-slate-100 text-slate-500">학생이 추가</span>` : ''}
        <button type="button" class="btn btn-danger btn-sm !px-2 ml-auto" data-action="t-task-del" data-id="${t.id}" aria-label="과제 삭제"><i class="fa-solid fa-trash-can"></i></button>
      </div>
      <input class="input input-sm font-bold" id="ttl-${t.id}" value="${t.title}" maxlength="100" data-change="t-task-field" data-id="${t.id}" data-field="title" aria-label="과제 내용" />
      ${t.note ? html`<p class="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">✏️ 학생 메모: ${t.note}</p>` : ''}
    </div>`;
}

// ---------- 메모·리포트 ----------
function reportPage(u) {
  const ids = [...(u.weekIds || [])].sort();
  const week = S.t.week;
  return html`
    <section class="card space-y-2">
      <div class="flex items-center justify-between gap-2">
        <h3 class="card-title"><i class="fa-solid fa-lock"></i>강사 전용 메모</h3>
        <span class="text-xs text-slate-400" id="note-status">${S.t.noteLoaded ? '자동 저장돼요 · 학생에게는 보이지 않아요' : '불러오는 중...'}</span>
      </div>
      <textarea class="input h-40 leading-relaxed" id="t-note-${u.id}" data-input="t-note" placeholder="상담 내용, 성향, 다음 주에 신경 쓸 점 등을 자유롭게 적어 두세요." ${S.t.noteLoaded ? '' : 'disabled'}>${S.t.note}</textarea>
    </section>

    <section class="card space-y-3">
      <h3 class="card-title"><i class="fa-solid fa-envelope-open-text"></i>학부모 주간 리포트</h3>
      ${ids.length && week ? html`
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="font-bold">대상 주:</span>
          ${weekSelector(u, false)}
        </div>
        <div>
          <label class="label" for="pr-comment">금주 지도 내용</label>
          <textarea class="input h-32 leading-relaxed" id="pr-comment">${S.ui.parentComment ?? DEFAULT_PARENT_COMMENT}</textarea>
        </div>
        <button type="button" class="btn btn-primary" data-action="t-parent-report"><i class="fa-solid fa-wand-magic-sparkles"></i>리포트 만들기</button>
      ` : html`<div class="empty">계획표가 있어야 리포트를 만들 수 있어요.</div>`}
    </section>`;
}

// ---------- 학생 설정 ----------
function studentSettings(u) {
  const s = settingsOf(u);
  return html`
    <section class="card space-y-4">
      <h3 class="card-title"><i class="fa-solid fa-sliders"></i>${u.name} 학생 설정</h3>
      <form class="space-y-3" data-submit="t-save-student">
        <div class="grid sm:grid-cols-2 gap-3">
          <div>
            <label class="label" for="ss-name">이름</label>
            <input class="input" id="ss-name" name="name" maxlength="20" value="${u.name}" required />
          </div>
          <div>
            <label class="label" for="ss-parent">리포트 받는 분 호칭</label>
            <input class="input" id="ss-parent" name="parentTitle" maxlength="20" value="${s.parentTitle}" placeholder="어머님" />
          </div>
          <div>
            <label class="label" for="ss-focus">집중 시간 (분)</label>
            <input class="input" type="number" id="ss-focus" name="focusMin" min="5" max="240" value="${s.focusMin}" />
          </div>
          <div>
            <label class="label" for="ss-output">인출 시간 (분, 0이면 없음)</label>
            <input class="input" type="number" id="ss-output" name="outputMin" min="0" max="120" value="${s.outputMin}" />
          </div>
          <div>
            <label class="label" for="ss-periods">하루 구분 (쉼표로 나눔)</label>
            <input class="input" id="ss-periods" name="periods" maxlength="60" value="${s.periods.join(', ')}" placeholder="학원전, 학원후" />
          </div>
          <div>
            <label class="label" for="ss-target">새 주 기본 시작 시각</label>
            <input class="input" type="time" id="ss-target" name="defaultTarget" value="${s.defaultTarget}" />
          </div>
        </div>
        <button class="btn btn-primary"><i class="fa-solid fa-floppy-disk"></i>저장</button>
      </form>
      <div class="border-t border-planner-border/20 pt-4 flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs text-slate-500">${u.email || ''} · ${u.provider === 'google' ? 'Google' : '이메일'} 가입</p>
        <button type="button" class="btn btn-danger btn-sm" data-action="t-unapprove"><i class="fa-solid fa-user-slash"></i>승인 취소 (앱 사용 중지)</button>
      </div>
    </section>`;
}

// ---------- 앱 설정 ----------
function settingsView() {
  const steps = S.ui.guideDraft || guideSteps();
  return html`
    <section class="card space-y-4">
      <h2 class="card-title"><i class="fa-solid fa-gear"></i>앱 설정</h2>
      <form class="space-y-4" data-submit="save-config" id="config-form">
        <div class="grid sm:grid-cols-2 gap-3">
          <div>
            <label class="label" for="cf-title">앱 이름</label>
            <input class="input" id="cf-title" name="appTitle" maxlength="30" value="${appTitle()}" />
          </div>
          <div>
            <label class="label" for="cf-teacher">선생님 이름 (카톡·리포트에 들어감)</label>
            <input class="input" id="cf-teacher" name="teacherName" maxlength="20" value="${teacherName()}" />
          </div>
        </div>
        <div>
          <label class="label" for="cf-subjects">과목 목록 (쉼표로 나눔 · 순서대로 색이 정해져요)</label>
          <input class="input" id="cf-subjects" name="subjects" maxlength="300" value="${subjects().join(', ')}" />
        </div>
        <div class="space-y-2">
          <p class="label !mb-0">학생 이용 안내 (처음 접속할 때 보여줘요)</p>
          ${steps.map((s, i) => html`
            <div class="rounded-xl border border-planner-border/30 bg-planner-bg p-2.5 space-y-1.5">
              <div class="flex gap-2">
                <input class="input input-sm font-bold flex-1" id="cf-g-title-${i}" name="gtitle" maxlength="80" value="${s.title}" />
                <button type="button" class="btn btn-danger btn-sm !px-2" data-action="guide-del" data-i="${i}" aria-label="단계 삭제"><i class="fa-solid fa-trash-can"></i></button>
              </div>
              <textarea class="input input-sm" id="cf-g-desc-${i}" name="gdesc" rows="2" maxlength="300">${s.desc}</textarea>
            </div>`)}
          <button type="button" class="btn btn-secondary btn-sm" data-action="guide-add"><i class="fa-solid fa-plus"></i>단계 추가</button>
        </div>
        <button class="btn btn-primary"><i class="fa-solid fa-floppy-disk"></i>설정 저장</button>
      </form>
    </section>

    <section class="card space-y-2 text-sm text-slate-600">
      <h3 class="card-title"><i class="fa-solid fa-circle-info"></i>학생 초대 방법</h3>
      <p>1. 학생에게 아래 주소를 보내 주세요. 학생이 Google 또는 이메일로 가입하면 [학생] 탭에 '승인 대기'로 나타나요.</p>
      <div class="flex gap-2">
        <code class="flex-1 truncate rounded-lg bg-white border border-slate-200 px-2 py-1.5 text-xs">${location.origin + location.pathname}</code>
        <button type="button" class="btn btn-secondary btn-sm" data-action="copy-join-link">복사</button>
      </div>
      <p>2. 승인한 뒤 [계획표]에서 이번 주 계획을 만들어 주면 학생 화면에 바로 보여요.</p>
    </section>`;
}

function readGuideDraft() {
  const form = document.getElementById('config-form');
  if (!form) return [...(S.ui.guideDraft || guideSteps())];
  const titles = [...form.querySelectorAll('[name="gtitle"]')].map((el) => el.value);
  const descs = [...form.querySelectorAll('[name="gdesc"]')].map((el) => el.value);
  return titles.map((title, i) => ({ title, desc: descs[i] || '' }));
}

// ---------- 동작 ----------
function editWeek(patch) {
  return patchWeek(S.ui.sel, S.t.weekId, patch);
}

function findEditTask(id) {
  return S.t.week?.tasks?.[id] ? { ...S.t.week.tasks[id], id } : null;
}

export const teacherActions = {
  't-tab': (el) => {
    flushSaves();
    S.ui.tab = el.dataset.tab;
    savePref('tTab', S.ui.tab);
    refresh();
    window.scrollTo({ top: 0 });
  },
  'open-student': (el) => {
    S.ui.sel = el.dataset.uid;
    S.ui.tab = 'students';
    S.ui.tWeekId = '';
    S.ui.tDate = '';
    S.ui.creatingWeek = false;
    S.ui.newStart = '';
    S.ui.parentComment = undefined;
    savePref('sel', S.ui.sel);
    savePref('tTab', 'students');
    refresh();
    window.scrollTo({ top: 0 });
  },
  'close-student': () => {
    flushSaves();
    S.ui.sel = '';
    savePref('sel', '');
    refresh();
  },
  't-sub': (el) => {
    flushSaves();
    S.ui.sub = el.dataset.sub;
    savePref('sub', S.ui.sub);
    refresh();
  },
  approve: async (el) => {
    const u = S.t.users.find((x) => x.id === el.dataset.uid);
    if (!u) return;
    await updateUser(u.id, {
      status: 'approved',
      weekIds: u.weekIds || [],
      ...Object.fromEntries(Object.entries(DEFAULT_SETTINGS).filter(([k]) => u[k] === undefined)),
    });
    toast(`${u.name} 학생을 승인했어요. 이제 계획표를 만들어 주세요.`);
  },
  reject: async (el) => {
    const u = S.t.users.find((x) => x.id === el.dataset.uid);
    if (!u || !confirm(`${u.name}님의 가입 신청을 거절할까요?`)) return;
    await deleteDoc(doc(db, 'users', u.id));
    toast('가입 신청을 거절했어요.');
  },
  't-unapprove': async () => {
    const u = selUser();
    if (!u || !confirm(`${u.name} 학생의 승인을 취소할까요? 계획표 기록은 남아 있고, 다시 승인하면 이어서 쓸 수 있어요.`)) return;
    await updateUser(u.id, { status: 'pending' });
    S.ui.sel = '';
    savePref('sel', '');
    toast('승인을 취소했어요.');
  },
  'copy-join-link': async () => {
    await copyText(location.origin + location.pathname);
    toast('가입 주소를 복사했어요. 학생에게 보내 주세요.');
  },
  't-pick-week': (el) => {
    flushSaves();
    S.ui.tWeekId = el.value;
    S.ui.tDate = '';
    refresh();
  },
  'toggle-create-week': () => {
    S.ui.creatingWeek = !S.ui.creatingWeek;
    S.ui.newStart = '';
    refresh();
  },
  'nw-start': (el) => {
    S.ui.newStart = el.value;
    refresh();
  },
  'create-week': async (form, e, data) => {
    const u = selUser();
    const start = String(data.get('start') || '');
    if (!isDateKey(start)) return toast('시작 날짜를 골라 주세요.', 'error');
    const ids = u.weekIds || [];
    if (ids.includes(start)) return toast('그 날짜로 시작하는 계획표가 이미 있어요.', 'error');
    const overlap = ids.find((id) => Math.abs(daysBetween(id, start)) < 7);
    if (overlap && !confirm(`${weekRangeText(overlap)} 계획표와 날짜가 겹쳐요. 그래도 만들까요?`)) return;
    let prev = null;
    const prevId = String(data.get('prev') || '');
    if (prevId && (data.get('copy') || data.get('carry'))) {
      const snap = await getDoc(weekRef(u.id, prevId));
      prev = snap.exists() ? { ...snap.data(), start: prevId } : null;
    }
    const week = buildWeek({
      start,
      title: String(data.get('title') || '').trim(),
      prev,
      copyTasks: Boolean(data.get('copy')),
      carryUnfinished: Boolean(data.get('carry')),
      defaultTarget: settingsOf(u).defaultTarget,
    });
    await createWeek(u.id, week);
    S.ui.tWeekId = start;
    S.ui.tDate = start;
    S.ui.creatingWeek = false;
    S.ui.newStart = '';
    refresh();
    toast(`${weekRangeText(start)} 계획표를 만들었어요.`);
  },
  'import-legacy': async (form, e, data) => {
    const u = selUser();
    let week;
    try {
      week = parseLegacyPlan(String(data.get('text') || ''), todayKey());
    } catch (err) {
      return toast(err.message, 'error');
    }
    if ((u.weekIds || []).includes(week.start) && !confirm(`${weekRangeText(week.start)} 계획표가 이미 있어요. 가져온 내용으로 바꿀까요?`)) return;
    await createWeek(u.id, week);
    form.reset();
    S.ui.tWeekId = week.start;
    S.ui.tDate = '';
    S.ui.creatingWeek = false;
    refresh();
    toast(`예전 플래너의 ${weekRangeText(week.start)} 계획을 가져왔어요. (과제 ${Object.keys(week.tasks).length}개)`);
  },
  't-delete-week': async () => {
    const u = selUser();
    if (!u || !S.t.weekId) return;
    if (!confirm(`${u.name} 학생의 ${weekRangeText(S.t.weekId)} 계획표를 삭제할까요? 학생의 체크 기록도 함께 지워져요.`)) return;
    await deleteWeek(u.id, S.t.weekId);
    S.ui.tWeekId = '';
    refresh();
    toast('계획표를 삭제했어요.');
  },
  't-week-title': (el) => editWeek({ title: el.value.trim() || defaultWeekTitle(S.t.weekId) }),
  't-goal': (el) => {
    const goals = [...(S.t.week?.goals || [])];
    const v = el.value.trim();
    if (!v) return;
    goals[Number(el.dataset.i)] = v;
    return editWeek({ goals });
  },
  't-goal-del': (el) => {
    const goals = [...(S.t.week?.goals || [])];
    goals.splice(Number(el.dataset.i), 1);
    return editWeek({ goals });
  },
  't-goal-add': async (form, e, data) => {
    const v = String(data.get('goal') || '').trim();
    if (!v) return;
    await editWeek({ goals: [...(S.t.week?.goals || []), v] });
    form.reset();
  },
  't-pick-day': (el) => {
    S.ui.tDate = el.dataset.date;
    refresh();
  },
  't-toggle-table': () => {
    S.ui.tShowTable = !S.ui.tShowTable;
    refresh();
  },
  't-day-target': (el) => editWeek({ [`days.${editDate()}.target`]: el.value || '17:00' }),
  't-clear-start': () => {
    if (!confirm('이 날의 시작 기록을 지울까요?')) return;
    return editWeek({ [`days.${editDate()}.startedAt`]: null });
  },
  't-add-task': async (form, e, data) => {
    const title = String(data.get('title') || '').trim();
    if (!title) return toast('과제 내용을 입력해 주세요.', 'error');
    S.ui.lastPeriod = String(data.get('period') || '');
    S.ui.lastSubject = String(data.get('subject') || '');
    const date = editDate();
    if (!date) return toast('날짜를 먼저 골라 주세요.', 'error');
    const id = makeTaskId();
    await editWeek({
      [`tasks.${id}`]: {
        date,
        period: S.ui.lastPeriod,
        time: String(data.get('time') || '').trim(),
        subject: S.ui.lastSubject,
        title,
        status: 'todo',
        progress: 0,
        note: '',
        order: Date.now(),
        by: 'teacher',
      },
    });
    form.querySelector('[name="title"]').value = '';
    form.querySelector('[name="time"]').value = '';
    form.querySelector('[name="title"]').focus();
  },
  't-task-field': (el) => {
    const field = el.dataset.field;
    const v = field === 'title' ? el.value.trim() : el.value;
    if (field === 'title' && !v) return toast('과제 내용은 비울 수 없어요.', 'error');
    return editWeek(taskPatch(el.dataset.id, { [field]: v }));
  },
  't-task-status': (el) => {
    const t = findEditTask(el.dataset.id);
    const status = el.value;
    const progress = normalizeProgress(status, t?.progress || 50);
    return editWeek(taskPatch(el.dataset.id, { status, progress }));
  },
  't-task-del': (el) => {
    const t = findEditTask(el.dataset.id);
    if (!t || !confirm(`'${t.title}' 과제를 삭제할까요?`)) return;
    return editWeek(deleteTaskPatch(t.id));
  },
  't-copy-day': async () => {
    const u = selUser();
    const week = S.t.week;
    const from = editDate();
    const tasks = tasksOn(week, from);
    if (!tasks.length) return toast('이 날에는 복사할 과제가 없어요.', 'error');
    const dates = weekDates(week.start).filter((d) => d !== from);
    const answer = prompt(`${dayTitle(from)} 과제 ${tasks.length}개를 어느 날에 복사할까요?\n${dates.map((d, i) => `${i + 1}. ${dayTitle(d)}`).join('\n')}\n번호를 입력하세요 (여러 날은 쉼표로: 2,3)`);
    if (!answer) return;
    const targets = answer.split(/[,\s]+/).map((n) => dates[Number(n) - 1]).filter(Boolean);
    if (!targets.length) return toast('번호를 다시 확인해 주세요.', 'error');
    const patch = {};
    let order = Date.now();
    targets.forEach((date) => tasks.forEach((t) => {
      order += 1;
      patch[`tasks.${makeTaskId()}`] = { date, period: t.period, time: t.time || '', subject: t.subject || '', title: t.title, status: 'todo', progress: 0, note: '', order, by: 'teacher' };
    }));
    await patchWeek(u.id, S.t.weekId, patch);
    toast(`${targets.map(dayTitle).join(', ')}에 복사했어요.`);
  },
  't-daily-report': () => {
    const u = selUser();
    const date = editDate();
    openShare(`📲 ${u.name} ${dayTitle(date)} 마감 보고`, dailyReport({ name: u.name, week: S.t.week, date, periods: settingsOf(u).periods }));
  },
  't-parent-report': () => {
    const u = selUser();
    const comment = document.getElementById('pr-comment')?.value.trim() || DEFAULT_PARENT_COMMENT;
    S.ui.parentComment = comment;
    openShare('👨‍👩‍👧 학부모 주간 리포트', parentReport({
      name: u.name, parentTitle: settingsOf(u).parentTitle, teacherName: teacherName(), week: { ...S.t.week, start: S.t.weekId }, comment,
    }), '내용을 확인하고 복사해서 보내 주세요.');
  },
  't-note': (el) => {
    const uid = S.ui.sel;
    const value = el.value;
    const status = document.getElementById('note-status');
    if (status) status.textContent = '저장 중...';
    debounceSave(`tnote:${uid}`, () => {
      saveNote(uid, value)
        .then(() => {
          const s = document.getElementById('note-status');
          if (s) s.textContent = `저장됨 (${nowHHMM()}) · 학생에게는 보이지 않아요`;
        })
        .catch(() => toast('메모를 저장하지 못했어요.', 'error'));
    }, 1000);
  },
  't-save-student': async (form, e, data) => {
    const u = selUser();
    const name = String(data.get('name') || '').trim();
    if (!name) return toast('이름을 입력해 주세요.', 'error');
    const periods = String(data.get('periods') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6);
    await updateUser(u.id, {
      name,
      parentTitle: String(data.get('parentTitle') || '').trim() || DEFAULT_SETTINGS.parentTitle,
      focusMin: clampNumber(data.get('focusMin'), 5, 240, DEFAULT_SETTINGS.focusMin),
      outputMin: clampNumber(data.get('outputMin'), 0, 120, DEFAULT_SETTINGS.outputMin),
      periods: periods.length ? periods : DEFAULT_SETTINGS.periods,
      defaultTarget: String(data.get('defaultTarget') || '') || DEFAULT_SETTINGS.defaultTarget,
    });
    toast('학생 설정을 저장했어요.');
  },
  'guide-add': () => {
    S.ui.guideDraft = [...readGuideDraft(), { title: '', desc: '' }];
    refresh();
  },
  'guide-del': (el) => {
    const steps = readGuideDraft();
    steps.splice(Number(el.dataset.i), 1);
    S.ui.guideDraft = steps;
    refresh();
  },
  'save-config': async (form, e, data) => {
    const list = String(data.get('subjects') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const guide = readGuideDraft().map((s) => ({ title: s.title.trim(), desc: s.desc.trim() })).filter((s) => s.title);
    await saveConfig({
      appTitle: String(data.get('appTitle') || '').trim() || '승민T 학습 플래너',
      teacherName: String(data.get('teacherName') || '').trim() || '승민T',
      subjects: [...new Set(list)].slice(0, 30),
      guide,
    });
    S.ui.guideDraft = null;
    toast('설정을 저장했어요.');
  },
};
