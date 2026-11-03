// 기록(그래프) 화면: 주간 추이, 월간 추이
// 차트는 라이브러리 없이 HTML로 그려요. 막대 하나 = 하루(또는 한 주·한 달)의 달성률.
// 지난 주 계획표는 이 화면을 열 때만 한 번 불러와서 무료 사용량을 아껴요.
import { getDoc } from 'firebase/firestore';
import { S, refresh } from '../store.js';
import { html } from '../lib/html.js';
import {
  todayKey, addDays, dayInfo, dayTitle, weekDates, weekRangeText, parseDateKey, dateKey,
  tasksOn, taskList, rateOf, daysBetween,
} from '../lib/week.js';
import { weekRef } from '../data.js';
import { rateText } from './planner.js';

// 차트 색: 지금 기간(강조)과 나머지. 밝은·어두운 화면 색은 tailwind.config.js 의 --chart-* (대비 검사 통과)
const ACCENT = 'var(--chart-accent)';
const BASE = 'var(--chart-base)';

// ---------- 지난 계획표 불러오기 (한 번 불러오면 기억) ----------
const cache = new Map();
const loading = new Set();

export function getWeek(c, weekId) {
  if (c.week && (c.week.start === weekId || c.weekId === weekId)) return { ...c.week, start: weekId };
  const key = `${c.uid}:${weekId}`;
  if (cache.has(key)) return cache.get(key);
  if (!loading.has(key)) {
    loading.add(key);
    getDoc(weekRef(c.uid, weekId))
      .then((snap) => cache.set(key, snap.exists() ? { ...snap.data(), start: weekId } : null))
      .catch(() => cache.set(key, null))
      .finally(() => {
        loading.delete(key);
        refresh();
      });
  }
  return undefined;
}

// 날짜 범위와 겹치는 주들을 모아서 날짜별 { tasks, day } 로 만듦
function collect(c, from, to) {
  const ids = (c.profile?.weekIds || []).filter((id) => id <= to && addDays(id, 6) >= from).sort();
  const byDate = {};
  let pending = 0;
  ids.forEach((id) => {
    const w = getWeek(c, id);
    if (w === undefined) {
      pending += 1;
      return;
    }
    if (!w) return;
    weekDates(id).forEach((date) => {
      if (date < from || date > to) return;
      byDate[date] = { tasks: tasksOn(w, date), day: w.days?.[date] || {} };
    });
  });
  return { byDate, pending, weekCount: ids.length };
}

function summarize(entries) {
  const all = entries.flatMap((e) => e.tasks);
  const planned = entries.filter((e) => e.tasks.length);
  const started = planned.filter((e) => e.day.startedAt);
  const onTime = started.filter((e) => !e.day.target || e.day.startedAt <= e.day.target);
  const focus = entries.reduce((s, e) => s + (Number(e.day.focus) || 0), 0);
  const carried = all.filter((t) => t.carriedTo).length;
  const reasons = {};
  entries.forEach((e) => String(e.day.reason || '').split(' · ').map((r) => r.trim()).filter(Boolean)
    .forEach((r) => { reasons[r] = (reasons[r] || 0) + 1; }));
  return {
    rate: rateOf(all),
    planned: planned.length,
    started: started.length,
    onTime: onTime.length,
    focus,
    carried,
    reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 6),
  };
}

// ---------- 화면 조각 ----------
function tile(label, value, sub = '') {
  return html`
    <div class="rounded-2xl bg-planner-surface border border-planner-border/25 p-3">
      <p class="text-xs font-bold text-slate-500">${label}</p>
      <p class="text-2xl font-black text-slate-900 mt-0.5">${value}</p>
      ${sub ? html`<p class="text-[11px] text-slate-500 mt-0.5">${sub}</p>` : ''}
    </div>`;
}

function startMark(day, hasTasks) {
  if (!hasTasks) return '';
  if (!day.startedAt) return '미시작';
  return !day.target || day.startedAt <= day.target ? '정시' : '늦게';
}

// 세로 막대 차트 (0~100%). value가 null이면 '계획 없음'(막대 없음)
// items: [{ label, sub, value, tip, accent, showLabel }]
function columnChart(items, { title, caption, height = 160 }) {
  const grid = [100, 50, 0];
  return html`
    <figure class="card space-y-3">
      <figcaption>
        <p class="font-black text-slate-900">${title}</p>
        ${caption ? html`<p class="text-xs text-slate-500 mt-0.5">${caption}</p>` : ''}
      </figcaption>
      <div class="flex gap-2">
        <div class="relative w-8 shrink-0 text-[10px] text-slate-400 font-bold" style="height:${height}px">
          ${grid.map((g) => html`<span class="absolute right-0 -translate-y-1/2" style="top:${(1 - g / 100) * height}px">${g}%</span>`)}
        </div>
        <div class="flex-1 min-w-0">
          <div class="relative" style="height:${height}px">
            ${grid.map((g) => html`<div class="absolute inset-x-0 h-px ${g === 0 ? 'bg-slate-300' : 'bg-planner-cream'}" style="top:${(1 - g / 100) * height}px"></div>`)}
            <div class="absolute inset-0 flex items-end gap-[2px]">
              ${items.map((it) => html`
                <div class="flex-1 h-full flex items-end justify-center outline-none rounded-md focus-visible:ring-2 focus-visible:ring-planner-green hover:bg-planner-light/60"
                  tabindex="0" data-tip="${it.tip}" aria-label="${it.tip}">
                  ${it.value === null ? '' : html`
                    <div class="w-full max-w-[24px] rounded-t-[4px] transition-[height]" style="height:${Math.max(it.value, 1.5) / 100 * height}px;background:${it.accent ? ACCENT : BASE}"></div>`}
                </div>`)}
            </div>
          </div>
          <div class="flex gap-[2px] mt-1.5">
            ${items.map((it) => html`
              <div class="flex-1 min-w-0 text-center leading-tight">
                <p class="text-[10px] sm:text-[11px] font-bold ${it.accent ? 'text-slate-900' : 'text-slate-500'} whitespace-nowrap">${it.showLabel === false ? '' : it.label}</p>
                ${it.sub !== undefined ? html`<p class="text-[10px] sm:text-[11px] font-black text-slate-700 whitespace-nowrap">${it.sub}</p>` : ''}
              </div>`)}
          </div>
        </div>
      </div>
    </figure>`;
}

// 기록이 2개 이상 쌓여야 '추이'가 의미 있어요. 그 전에는 안내만 보여줌
function trendOrNote(items, pending, chart, unit) {
  if (pending || items.filter((it) => it.value !== null).length >= 2) return chart;
  return html`
    <div class="card text-sm text-slate-500 flex items-center gap-2">
      <i class="fa-solid fa-chart-line text-planner-green"></i>
      ${unit} 이상 기록이 쌓이면 달성률이 어떻게 바뀌는지 그래프로 보여 드려요.
    </div>`;
}

function reasonsBox(reasons) {
  return html`
    <section class="card space-y-2">
      <p class="font-black text-slate-900">📝 다 못 한 이유</p>
      ${reasons.length ? html`
        <div class="flex flex-wrap gap-1.5">
          ${reasons.map(([r, n]) => html`<span class="chip bg-amber-50 text-amber-900 border border-amber-200 !text-sm !py-1">${r} <b class="ml-0.5">${n}회</b></span>`)}
        </div>` : html`<p class="text-sm text-slate-500">아직 적은 이유가 없어요.</p>`}
    </section>`;
}

function tableView(rows) {
  return html`
    <details class="card !p-3 text-sm">
      <summary class="cursor-pointer font-bold text-slate-600">표로 보기</summary>
      <div class="overflow-x-auto mt-2">
        <table class="w-full text-left">
          <thead><tr class="text-xs text-slate-500 border-b border-planner-cream">
            <th class="py-1.5 pr-2">날짜</th><th class="pr-2">달성률</th><th class="pr-2">과제</th><th class="pr-2">시작</th><th>못 한 이유</th>
          </tr></thead>
          <tbody>
            ${rows.map((r) => html`
              <tr class="border-b border-planner-cream/70 align-top">
                <td class="py-1.5 pr-2 whitespace-nowrap font-bold">${dayTitle(r.date)}</td>
                <td class="pr-2">${rateText(rateOf(r.tasks))}</td>
                <td class="pr-2">${r.tasks.length ? `${r.tasks.filter((t) => t.status === 'done').length}/${r.tasks.length}` : '-'}</td>
                <td class="pr-2 whitespace-nowrap">${r.day.startedAt ? `${r.day.startedAt} (${startMark(r.day, true)})` : (r.tasks.length ? '미시작' : '-')}</td>
                <td class="text-slate-600">${r.day.reason || ''}</td>
              </tr>`)}
          </tbody>
        </table>
      </div>
    </details>`;
}

// ---------- 주간 ----------
function weekMode(c) {
  const week = c.week;
  const dates = weekDates(week.start);
  const today = todayKey();
  const entries = dates.map((date) => ({ date, tasks: tasksOn(week, date), day: week.days?.[date] || {} }));
  const sum = summarize(entries);

  const dayItems = entries.map((e) => {
    const info = dayInfo(e.date);
    const rate = rateOf(e.tasks);
    const mark = startMark(e.day, e.tasks.length > 0);
    return {
      label: `${info.ko} ${info.md}`,
      sub: rate === null ? '-' : `${rate}%`,
      value: rate,
      accent: e.date === today,
      tip: `${dayTitle(e.date)} · ${rate === null ? '계획 없음' : `달성률 ${rate}%`}${mark ? ` · ${mark === '정시' ? '정시 시작' : mark === '늦게' ? `늦게 시작(${e.day.startedAt})` : '시작 안 함'}` : ''}`,
    };
  });

  // 최근 8주 추이 (지금 보는 주까지)
  const ids = [...(c.profile?.weekIds || [])].filter((id) => id <= week.start).sort().slice(-8);
  let pending = 0;
  const weekItems = ids.map((id) => {
    const w = getWeek(c, id);
    if (w === undefined) pending += 1;
    const rate = w ? rateOf(taskList(w)) : null;
    return {
      label: dayInfo(id).md,
      sub: rate === null ? '-' : `${rate}%`,
      value: rate,
      accent: id === week.start,
      tip: `${weekRangeText(id)} · ${rate === null ? (w === undefined ? '불러오는 중' : '계획 없음') : `주간 달성률 ${rate}%`}`,
    };
  });

  return html`
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
      ${tile('주간 달성률', rateText(sum.rate), weekRangeText(week.start))}
      ${tile('공부 시작 인증', `${sum.started}/${sum.planned}일`, `정시 시작 ${sum.onTime}일`)}
      ${tile('집중 완주', `${sum.focus}회`, '집중 타이머를 끝까지')}
      ${tile('다음 날로 이월', `${sum.carried}개`, '다 못 끝내 넘긴 과제')}
    </div>
    ${columnChart(dayItems, { title: '요일별 달성률', caption: '막대에 손가락을 대거나 마우스를 올리면 시작 시각도 보여요. 강조된 막대가 오늘이에요.' })}
    ${trendOrNote(weekItems, pending, columnChart(weekItems, { title: `최근 ${weekItems.length}주 달성률 추이`, caption: `주 시작 날짜 기준${pending ? ' · 불러오는 중...' : ''}. 강조된 막대가 지금 보는 주예요.`, height: 140 }), '2주')}
    ${reasonsBox(sum.reasons)}
    ${tableView(entries)}`;
}

// ---------- 월간 ----------
function monthKeyOf(date) {
  return date.slice(0, 7);
}

function monthRange(mk) {
  const [y, m] = mk.split('-').map(Number);
  return { from: dateKey(new Date(y, m - 1, 1)), to: dateKey(new Date(y, m, 0)) };
}

function shiftMonth(mk, n) {
  const [y, m] = mk.split('-').map(Number);
  return monthKeyOf(dateKey(new Date(y, m - 1 + n, 1)));
}

function monthMode(c) {
  const mk = S.ui.statsMonth || monthKeyOf(c.week?.start && c.week.start > todayKey() ? c.week.start : todayKey());
  const { from, to } = monthRange(mk);
  const today = todayKey();
  const { byDate, pending } = collect(c, from, to);
  const dates = Array.from({ length: daysBetween(from, to) + 1 }, (_, i) => addDays(from, i));
  const entries = dates.map((date) => ({ date, tasks: byDate[date]?.tasks || [], day: byDate[date]?.day || {} }));
  const sum = summarize(entries);
  const [y, m] = mk.split('-').map(Number);

  const dayItems = entries.map((e) => {
    const d = parseDateKey(e.date).getDate();
    const rate = rateOf(e.tasks);
    const mark = startMark(e.day, e.tasks.length > 0);
    return {
      label: String(d),
      showLabel: d === 1 || d % 5 === 0,
      value: rate,
      accent: e.date === today,
      tip: `${dayTitle(e.date)} · ${rate === null ? '계획 없음' : `달성률 ${rate}%`}${mark ? ` · ${mark === '정시' ? '정시 시작' : mark === '늦게' ? '늦게 시작' : '시작 안 함'}` : ''}`,
    };
  });

  // 최근 6개월 월별 달성률
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(mk, i - 5));
  let pendingMonths = 0;
  const monthItems = months.map((k) => {
    const r = monthRange(k);
    const got = collect(c, r.from, r.to);
    pendingMonths += got.pending;
    const tasks = Object.values(got.byDate).flatMap((e) => e.tasks);
    const rate = rateOf(tasks);
    const mo = Number(k.split('-')[1]);
    return {
      label: `${mo}월`,
      sub: rate === null ? '-' : `${rate}%`,
      value: rate,
      accent: k === mk,
      tip: `${k.replace('-', '년 ')}월 · ${rate === null ? (got.pending ? '불러오는 중' : '계획 없음') : `달성률 ${rate}%`}`,
    };
  });

  return html`
    <div class="flex items-center justify-between gap-2">
      <button type="button" class="btn btn-ghost btn-sm" data-action="stats-month" data-to="${shiftMonth(mk, -1)}"><i class="fa-solid fa-chevron-left"></i>이전 달</button>
      <p class="font-black text-lg text-planner-dark">${y}년 ${m}월</p>
      <button type="button" class="btn btn-ghost btn-sm" data-action="stats-month" data-to="${shiftMonth(mk, 1)}" ${mk >= monthKeyOf(today) ? 'disabled' : ''}>다음 달<i class="fa-solid fa-chevron-right"></i></button>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 ${pending ? 'opacity-60' : ''}">
      ${tile('월간 달성률', rateText(sum.rate), `계획한 날 ${sum.planned}일`)}
      ${tile('공부 시작 인증', `${sum.started}/${sum.planned}일`, `정시 시작 ${sum.onTime}일`)}
      ${tile('집중 완주', `${sum.focus}회`, '집중 타이머를 끝까지')}
      ${tile('다음 날로 이월', `${sum.carried}개`, '다 못 끝내 넘긴 과제')}
    </div>
    <div class="${pending ? 'opacity-60' : ''}">
      ${columnChart(dayItems, { title: `${m}월 일별 달성률`, caption: `${pending ? '불러오는 중... · ' : ''}막대가 없는 날은 계획이 없던 날이에요. 강조된 막대가 오늘이에요.` })}
    </div>
    ${trendOrNote(monthItems, pendingMonths, columnChart(monthItems, { title: '최근 6개월 달성률 추이', caption: `${pendingMonths ? '불러오는 중... · ' : ''}한 달 동안의 모든 과제 기준. 강조된 막대가 지금 보는 달이에요.`, height: 140 }), '2개월')}
    ${reasonsBox(sum.reasons)}
    ${tableView(entries.filter((e) => e.tasks.length || e.day.startedAt))}`;
}

export function statsView(c) {
  if (!c.week) return html`<div class="empty">계획표가 있어야 기록을 볼 수 있어요.</div>`;
  const mode = S.ui.statsMode || 'week';
  return html`
    <div class="space-y-4">
      <div class="seg max-w-xs">
        <button type="button" class="seg-btn ${mode === 'week' ? 'active' : ''}" data-action="stats-mode" data-mode="week">주간</button>
        <button type="button" class="seg-btn ${mode === 'month' ? 'active' : ''}" data-action="stats-mode" data-mode="month">월간</button>
        <button type="button" class="btn btn-ghost btn-sm !px-2" data-action="stats-reload" title="새로 불러오기" aria-label="새로 불러오기"><i class="fa-solid fa-rotate"></i></button>
      </div>
      ${mode === 'month' ? monthMode(c) : weekMode(c)}
    </div>`;
}

export const statsActions = {
  'stats-mode': (el) => {
    S.ui.statsMode = el.dataset.mode;
    refresh();
  },
  'stats-month': (el) => {
    S.ui.statsMonth = el.dataset.to;
    refresh();
  },
  'stats-reload': () => {
    cache.clear();
    refresh();
  },
};

// ---------- 막대 위 말풍선 (마우스·터치·키보드) ----------
let tipEl = null;
function showTip(target) {
  const text = target?.dataset?.tip;
  if (!text) return;
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'fixed z-[80] pointer-events-none rounded-lg bg-[#1e293b] text-white text-xs font-bold px-2.5 py-1.5 shadow-lg max-w-[80vw]';
    document.body.appendChild(tipEl);
  }
  tipEl.textContent = text;
  tipEl.style.display = 'block';
  const r = target.getBoundingClientRect();
  const w = tipEl.offsetWidth;
  const left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
  tipEl.style.left = `${left}px`;
  tipEl.style.top = `${Math.max(8, r.top - tipEl.offsetHeight - 6)}px`;
}
function hideTip() {
  if (tipEl) tipEl.style.display = 'none';
}
if (typeof document !== 'undefined') {
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (t) showTip(t);
  });
  document.addEventListener('pointerout', (e) => {
    if (e.target.closest?.('[data-tip]')) hideTip();
  });
  document.addEventListener('focusin', (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (t) showTip(t);
  });
  document.addEventListener('focusout', hideTip);
  window.addEventListener('scroll', hideTip, { passive: true });
}
