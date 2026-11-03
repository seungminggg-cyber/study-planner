// 지난 플래너 목록: 지금까지 만든 모든 주를 최근 것부터 달별로 보여주고, 누르면 그 주로 이동
// (학생 본인, 선생님 [학생] 화면 둘 다 씀. 달성률은 목록을 열 때 한 번씩만 불러옴)
import { S, refresh } from '../store.js';
import { html } from '../lib/html.js';
import { todayKey, weekRangeText, weekContaining, pickInitialWeek, taskList, rateOf, addDays } from '../lib/week.js';
import { ctx } from './student.js';
import { getWeek } from './stats.js';
import { rateText } from './planner.js';

const isTeacher = () => S.role === 'teacher';

function currentWeekId() {
  return isTeacher() ? S.t.weekId : S.weekId;
}

function weekBadge(id, today) {
  if (weekContaining([id], today)) return html`<span class="chip bg-amber-100 text-amber-800">이번 주</span>`;
  if (id > today) return html`<span class="chip bg-sky-100 text-sky-800">예정</span>`;
  return '';
}

export function archiveModal(m, frame) {
  const c = ctx();
  const ids = [...(c.profile?.weekIds || [])].sort().reverse();
  const today = todayKey();
  const months = [];
  ids.forEach((id) => {
    const key = id.slice(0, 7);
    let group = months.find((g) => g.key === key);
    if (!group) {
      group = { key, ids: [] };
      months.push(group);
    }
    group.ids.push(id);
  });
  return frame(`📚 ${isTeacher() ? `${c.profile?.name || ''} 학생의 ` : ''}지난 플래너`, html`
    ${ids.length ? html`
      <p class="text-sm text-slate-500">지금까지 만든 계획표 ${ids.length}개예요. 누르면 그 주 계획표로 이동해요.</p>
      <div class="space-y-4">
        ${months.map((g) => html`
          <section class="space-y-2">
            <h4 class="text-sm font-black text-planner-dark">${Number(g.key.slice(0, 4))}년 ${Number(g.key.slice(5, 7))}월</h4>
            ${g.ids.map((id) => {
              const w = getWeek(c, id);
              const rate = w ? rateOf(taskList(w)) : null;
              const on = id === currentWeekId();
              return html`
                <button type="button" data-action="archive-open" data-week="${id}"
                  class="w-full text-left rounded-2xl border p-3 flex items-center gap-3 transition ${on ? 'border-planner-green bg-planner-light' : 'border-planner-border/30 bg-planner-surface hover:border-planner-green'}">
                  <span class="flex-1 min-w-0">
                    <span class="flex items-center gap-1.5">
                      <span class="font-black text-slate-900">${weekRangeText(id)}</span>
                      ${weekBadge(id, today)}
                      ${on ? html`<span class="chip bg-planner-green text-white">보는 중</span>` : ''}
                    </span>
                    <span class="block text-xs text-slate-500 truncate mt-0.5">${w?.title || (w === undefined ? '불러오는 중...' : '')}</span>
                  </span>
                  <span class="text-right shrink-0">
                    <span class="block text-[11px] font-bold text-slate-500">달성률</span>
                    <span class="block font-black text-planner-dark">${w === undefined ? '…' : rateText(rate)}</span>
                  </span>
                  <i class="fa-solid fa-chevron-right text-slate-300"></i>
                </button>`;
            })}
          </section>`)}
      </div>` : html`<div class="empty">아직 만든 계획표가 없어요.</div>`}
  `);
}

export const archiveActions = {
  'open-archive': () => {
    S.ui.modal = { type: 'archive' };
    refresh();
  },
  'archive-open': (el) => {
    const id = el.dataset.week;
    if (isTeacher()) {
      S.ui.tWeekId = id;
      S.ui.tDate = '';
    } else {
      S.ui.weekId = id;
      S.ui.date = '';
    }
    S.ui.openTask = '';
    S.ui.modal = null;
    refresh();
    window.scrollTo({ top: 0 });
  },
  // 다른 주를 보다가 이번 주(없으면 가장 가까운 주)로 돌아가기
  'week-current': () => {
    if (isTeacher()) {
      const u = S.t.users.find((x) => x.id === S.ui.sel);
      S.ui.tWeekId = pickInitialWeek(u?.weekIds || [], todayKey());
      S.ui.tDate = '';
    } else {
      S.ui.weekId = '';
      S.ui.date = '';
    }
    refresh();
  },
};

// 지금 보고 있는 주가 이번 주가 아니면 true
export function viewingOtherWeek(weekIds, weekId) {
  const today = todayKey();
  const current = pickInitialWeek(weekIds || [], today);
  return Boolean(weekId && current && weekId !== current && !(weekId <= today && addDays(weekId, 6) >= today));
}
