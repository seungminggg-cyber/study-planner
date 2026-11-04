// 시험 D-day · 수행평가 일정 (학생 [일정] 탭, 선생님 [학생] → [일정] 탭, 오늘 화면 위쪽 D-day 띠)
// 데이터: events/{uid}.items = { id: { kind, title, date, subject, done, by, createdAt } }
import { doc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../firebase.js';
import { S, refresh } from '../store.js';
import { html } from '../lib/html.js';
import { toast } from '../lib/util.js';
import { settle } from '../data.js';
import {
  EVENT_KINDS, eventList, ddayStrip, ddayText, dayTitle, todayKey, isDateKey, makeTaskId, daysBetween,
} from '../lib/week.js';
import { subjectChip, subjectOptions } from './planner.js';

const isTeacher = () => S.role === 'teacher';

// 지금 보고 있는 학생의 일정
export function currentEvents() {
  return isTeacher() ? S.t.events : S.events;
}

function targetUid() {
  return isTeacher() ? S.ui.sel : S.user?.uid;
}

function ddayChipClass(e, today) {
  const n = daysBetween(today, e.date);
  if (n <= 1) return 'bg-rose-600 text-white';
  if (n <= 7) return 'bg-amber-500 text-white';
  return 'bg-planner-green text-white';
}

// 오늘 화면 위쪽 D-day 띠
export function ddayStripView(items, openAction = 'student-tab') {
  const today = todayKey();
  const list = ddayStrip(items, today);
  if (!list.length) return '';
  return html`
    <button type="button" data-action="${openAction}" data-tab="events" data-sub="events"
      class="w-full text-left rounded-2xl border border-planner-border/30 bg-planner-card px-3.5 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 hover:border-planner-green">
      <span class="text-xs font-black text-planner-dark"><i class="fa-solid fa-calendar-days mr-1"></i>다가오는 일정</span>
      ${list.map((e) => html`
        <span class="flex items-center gap-1.5 text-sm font-bold text-slate-800 min-w-0">
          <span class="chip ${ddayChipClass(e, today)}">${ddayText(e.date, today)}</span>
          <span class="truncate">${e.kind === 'exam' ? '📝' : '📎'} ${e.title}</span>
        </span>`)}
    </button>`;
}

function eventRow(e, today, canEdit) {
  const past = e.date < today;
  const mine = isTeacher() || e.by === 'student';
  return html`
    <div class="flex flex-wrap items-center gap-2 rounded-xl border p-2.5 ${e.done ? 'border-emerald-200 bg-emerald-50/40' : past ? 'border-slate-200 bg-slate-50' : 'border-planner-border/30 bg-planner-surface'}">
      <span class="chip ${e.done ? 'bg-emerald-100 text-emerald-800' : past ? 'bg-slate-200 text-slate-600' : ddayChipClass(e, today)}">${e.done ? '완료' : ddayText(e.date, today)}</span>
      <span class="chip ${e.kind === 'exam' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-900'}">${EVENT_KINDS[e.kind] || '일정'}</span>
      ${subjectChip(e.subject)}
      <span class="flex-1 min-w-[8rem]">
        <span class="block text-sm font-black ${e.done ? 'line-through text-slate-400' : 'text-slate-900'}">${e.title}</span>
        <span class="block text-xs text-slate-500">${dayTitle(e.date)}${e.by === 'teacher' && !isTeacher() ? ' · 선생님이 등록' : ''}${e.by === 'student' && isTeacher() ? ' · 학생이 등록' : ''}</span>
      </span>
      ${canEdit ? html`
        ${e.kind !== 'exam' ? html`<button type="button" class="btn btn-sm ${e.done ? 'btn-secondary' : 'bg-emerald-600 text-white hover:bg-emerald-700'}" data-action="ev-done" data-id="${e.id}" data-done="${e.done ? '' : '1'}">${e.done ? '완료 취소' : '✅ 끝냄'}</button>` : ''}
        ${mine ? html`<button type="button" class="btn btn-danger btn-sm !px-2" data-action="ev-del" data-id="${e.id}" aria-label="일정 삭제"><i class="fa-solid fa-trash-can"></i></button>` : ''}` : ''}
    </div>`;
}

// 일정 목록 + 추가 (canEdit: 학생 본인이나 선생님)
export function eventsPanel(items, canEdit) {
  if (items === undefined) return html`<div class="py-10 text-center text-sm text-slate-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i>불러오는 중...</div>`;
  const today = todayKey();
  const list = eventList(items);
  const upcoming = list.filter((e) => e.date >= today && !e.done);
  const done = list.filter((e) => e.date < today || e.done).reverse();
  return html`
    ${canEdit ? html`
      <section class="card space-y-3">
        <h3 class="card-title"><i class="fa-solid fa-calendar-plus"></i>일정 추가</h3>
        <form class="space-y-2" data-submit="ev-add">
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <select class="input input-sm" id="ev-kind" name="kind" aria-label="종류">
              <option value="perf">수행평가</option>
              <option value="exam">시험</option>
            </select>
            <select class="input input-sm" id="ev-subject" name="subject" aria-label="과목"><option value="">과목 없음</option>${subjectOptions('')}</select>
            <input class="input input-sm col-span-2" type="date" id="ev-date" name="date" min="${today}" required aria-label="날짜" />
          </div>
          <div class="flex gap-2">
            <input class="input input-sm flex-1" id="ev-title" name="title" maxlength="60" placeholder="예: 화학 탐구 보고서 제출 / 2학기 기말고사" required />
            <button class="btn btn-primary btn-sm shrink-0"><i class="fa-solid fa-plus"></i>추가</button>
          </div>
        </form>
        <p class="text-xs text-slate-500">${isTeacher() ? '학생 화면 위쪽에 D-day로 보이고, 폰 알림을 켠 학생에게는 D-3·D-1·당일 저녁 7시에 알림이 가요.' : '수행평가·시험 날짜를 넣으면 위쪽에 D-day로 보이고, 폰 알림을 켜면 D-3·D-1·당일 저녁에 알려 줘요.'}</p>
      </section>` : ''}

    <section class="card space-y-2.5">
      <h3 class="card-title"><i class="fa-solid fa-calendar-days"></i>다가오는 일정 (${upcoming.length})</h3>
      ${upcoming.length ? upcoming.map((e) => eventRow(e, today, canEdit)) : html`<div class="empty !p-5">아직 다가오는 일정이 없어요.</div>`}
    </section>

    ${done.length ? html`
      <details class="card space-y-2.5">
        <summary class="cursor-pointer font-bold text-slate-600 text-sm">지난·끝낸 일정 (${done.length})</summary>
        <div class="space-y-2 mt-2">${done.map((e) => eventRow(e, today, canEdit))}</div>
      </details>` : ''}`;
}

function save(ref, promise) {
  return settle(promise).then(() => refresh());
}

export const eventActions = {
  'ev-add': async (form, e, data) => {
    const uid = targetUid();
    if (!uid) return;
    const title = String(data.get('title') || '').trim();
    const date = String(data.get('date') || '');
    if (!title) return toast('일정 이름을 입력해 주세요.', 'error');
    if (!isDateKey(date)) return toast('날짜를 골라 주세요.', 'error');
    const kind = data.get('kind') === 'exam' ? 'exam' : 'perf';
    const id = makeTaskId();
    const ref = doc(db, 'events', uid);
    await save(ref, setDoc(ref, {
      items: { [id]: { kind, title, date, subject: String(data.get('subject') || ''), done: false, by: isTeacher() ? 'teacher' : 'student', createdAt: Date.now() } },
      updatedAt: Date.now(),
    }, { merge: true }));
    form.querySelector('[name="title"]').value = '';
    toast(`📅 ${EVENT_KINDS[kind]} 일정을 넣었어요. (${ddayText(date, todayKey())})`);
  },
  'ev-done': async (el) => {
    const uid = targetUid();
    const ref = doc(db, 'events', uid);
    await save(ref, updateDoc(ref, { [`items.${el.dataset.id}.done`]: Boolean(el.dataset.done), updatedAt: Date.now() }));
  },
  'ev-del': async (el) => {
    const uid = targetUid();
    const item = currentEvents()?.[el.dataset.id];
    if (!item || !confirm(`'${item.title}' 일정을 지울까요?`)) return;
    const ref = doc(db, 'events', uid);
    await save(ref, updateDoc(ref, { [`items.${el.dataset.id}`]: deleteField(), updatedAt: Date.now() }));
  },
};
