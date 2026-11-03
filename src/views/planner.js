// 학생 화면과 강사 화면에서 함께 쓰는 플래너 조각들
import { S, subjects, guideSteps, refresh, savePref } from '../store.js';
import { html, raw } from '../lib/html.js';
import { shareOrCopy, copyText, toast, isMobile } from '../lib/util.js';
import {
  weekDates, dayInfo, dayRate, tasksOn, groupByPeriod, todayKey, taskList, cleanTime,
} from '../lib/week.js';

// 과목별 색 (설정의 과목 순서대로 색이 정해짐)
const SUBJECT_COLORS = [
  'bg-blue-50 text-blue-800 border-blue-200',
  'bg-rose-50 text-rose-800 border-rose-200',
  'bg-indigo-50 text-indigo-800 border-indigo-200',
  'bg-emerald-50 text-emerald-800 border-emerald-200',
  'bg-amber-50 text-amber-900 border-amber-200',
  'bg-purple-50 text-purple-800 border-purple-200',
  'bg-sky-50 text-sky-800 border-sky-200',
  'bg-teal-50 text-teal-800 border-teal-200',
  'bg-pink-50 text-pink-800 border-pink-200',
  'bg-lime-50 text-lime-800 border-lime-200',
  'bg-orange-50 text-orange-800 border-orange-200',
  'bg-cyan-50 text-cyan-800 border-cyan-200',
];

export function subjectChip(subject) {
  if (!subject) return '';
  const idx = subjects().indexOf(subject);
  const color = idx >= 0 ? SUBJECT_COLORS[idx % SUBJECT_COLORS.length] : 'bg-slate-50 text-slate-700 border-slate-200';
  return html`<span class="chip border ${color}">${subject}</span>`;
}

export function statusChip(t) {
  if (t.status === 'done') return html`<span class="chip bg-emerald-600 text-white">✅ 완료</span>`;
  if (t.status === 'partial') return html`<span class="chip bg-amber-500 text-white">🟡 ${t.progress}%</span>`;
  return html`<span class="chip bg-slate-100 text-slate-500">진행 전</span>`;
}

export function rateText(rate) {
  return rate === null ? '-' : `${rate}%`;
}

export function progressBar(rate, size = 'h-2.5') {
  return html`
    <div class="w-full ${size} rounded-full bg-planner-cream overflow-hidden border border-planner-border/20">
      <div class="h-full rounded-full ${rate === 100 ? 'bg-emerald-500' : 'bg-planner-green'} transition-all" style="width:${rate || 0}%"></div>
    </div>`;
}

export function subjectOptions(selected) {
  const list = subjects();
  const all = selected && !list.includes(selected) ? [...list, selected] : list;
  return all.map((s) => html`<option value="${s}" ${s === selected ? 'selected' : ''}>${s}</option>`);
}

export function periodOptions(periods, selected) {
  const all = selected && !periods.includes(selected) ? [...periods, selected] : periods;
  return all.map((p) => html`<option value="${p}" ${p === selected ? 'selected' : ''}>${p}</option>`);
}

// 요일 고르는 버튼 7개
export function dayTabs(week, selected, action) {
  const today = todayKey();
  return html`
    <div class="grid grid-cols-7 gap-1.5 sm:gap-2">
      ${weekDates(week.start).map((date) => {
        const info = dayInfo(date);
        const rate = dayRate(week, date);
        const on = date === selected;
        const started = Boolean(week.days?.[date]?.startedAt);
        const badge = rate === null ? 'bg-slate-100 text-slate-400' : rate === 100 ? 'bg-emerald-100 text-emerald-800' : rate > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500';
        return html`
          <button type="button" data-action="${action}" data-date="${date}"
            class="relative rounded-2xl border p-1.5 sm:p-2.5 text-left transition flex flex-col gap-1.5 ${on ? 'bg-planner-green text-white border-planner-dark shadow-md' : 'bg-planner-surface hover:bg-planner-light text-slate-800 border-planner-border/30'}">
            ${date === today ? html`<span class="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-1.5 text-[10px] font-black text-slate-900 leading-4">오늘</span>` : ''}
            <span class="flex items-baseline justify-between gap-1">
              <span class="text-xs sm:text-sm font-black">${info.ko}</span>
              <span class="text-[10px] sm:text-[11px] font-bold ${on ? 'text-white/80' : 'text-slate-400'}">${info.md}</span>
            </span>
            <span class="flex items-center justify-between gap-1">
              <span class="text-[10px] font-extrabold px-1 sm:px-1.5 py-0.5 rounded-md ${on ? 'bg-white/20 text-white' : badge}">${rate === null ? '-' : `${rate}%`}</span>
              ${started ? html`<i class="fa-solid fa-circle-check text-[11px] ${on ? 'text-amber-300' : 'text-planner-green'}" title="공부 시작 인증"></i>` : ''}
            </span>
          </button>`;
      })}
    </div>`;
}

// 주간 전체 계획표 (예전 플래너 표 모양)
export function weekTable(week, periods, action) {
  const dates = weekDates(week.start);
  const groups = groupByPeriod(taskList(week), periods).map((g) => g.period);
  return html`
    <div class="overflow-x-auto rounded-2xl border-2 border-planner-border bg-planner-card shadow-sm">
      <table class="week-table w-full min-w-[920px] table-fixed border-collapse text-left">
        <thead>
          <tr class="bg-planner-green text-white">
            ${dates.map((date) => {
              const i = dayInfo(date);
              const rate = dayRate(week, date);
              return html`
                <th class="py-2 px-2 text-center cursor-pointer hover:bg-planner-deep" data-action="${action}" data-date="${date}">
                  <div class="text-sm font-black">${i.en}(${i.md})</div>
                  <div class="text-[11px] font-bold text-white/80">달성 ${rateText(rate)}</div>
                </th>`;
            })}
          </tr>
        </thead>
        <tbody>
          ${groups.map((period) => html`
            <tr>
              ${dates.map((date) => {
                const tasks = tasksOn(week, date).filter((t) => (t.period || '') === period);
                return html`
                  <td class="align-top p-2">
                    <div class="font-black text-xs text-slate-900 mb-1.5">&lt;${period || '기타'}&gt;</div>
                    <div class="space-y-1.5">
                      ${tasks.length ? tasks.map((t) => html`
                        <button type="button" data-action="${action}" data-date="${date}" data-task="${t.id}"
                          class="w-full text-left rounded-xl bg-planner-surface border border-planner-border/30 hover:border-planner-green p-1.5 space-y-1 shadow-sm">
                          <div class="flex items-center justify-between gap-1">
                            <span class="text-[10px] font-bold text-slate-500 truncate">${cleanTime(t.time)}</span>
                            ${t.status === 'done' ? html`<span class="text-[10px] font-black text-emerald-700">✅</span>` : t.status === 'partial' ? html`<span class="text-[10px] font-black text-amber-700">🟡${t.progress}%</span>` : ''}
                          </div>
                          <p class="text-[11px] font-extrabold leading-snug ${t.status === 'done' ? 'line-through text-slate-400' : 'text-slate-900'}">${t.title}</p>
                          ${t.note ? html`<p class="text-[10px] leading-tight text-amber-800 bg-amber-50 border border-amber-200 rounded px-1 py-0.5">✏️ ${t.note}</p>` : ''}
                        </button>`) : html`<p class="text-[11px] text-slate-300">-</p>`}
                    </div>
                  </td>`;
              })}
            </tr>`)}
        </tbody>
      </table>
    </div>
    <p class="text-xs text-slate-400 sm:hidden">표를 옆으로 밀어서 볼 수 있어요.</p>`;
}

export function goalsBox(goals) {
  if (!goals?.length) return '';
  return html`
    <ul class="space-y-1.5 text-sm font-bold text-slate-800">
      ${goals.map((g) => html`<li class="flex items-start gap-2"><span class="text-planner-green font-black">○</span><span>${g}</span></li>`)}
    </ul>`;
}

// ---------- 팝업 ----------
export function openShare(title, text, hint = '') {
  S.ui.modal = { type: 'share', title, text, hint };
  refresh();
}

function modalFrame(title, body, closeAction = 'close-modal') {
  return html`
    <div class="modal-back" data-action="${closeAction}" data-self="1">
      <div class="modal-box" role="dialog" aria-modal="true">
        <div class="flex items-start justify-between gap-3">
          <h3 class="text-lg font-black text-planner-dark">${title}</h3>
          <button type="button" class="btn btn-ghost btn-sm !px-2" data-action="${closeAction}" aria-label="닫기"><i class="fa-solid fa-xmark text-base"></i></button>
        </div>
        ${body}
      </div>
    </div>`;
}

function shareModal(m) {
  return modalFrame(m.title, html`
    ${m.hint ? html`<p class="text-sm text-slate-600">${m.hint}</p>` : ''}
    <textarea id="share-text" class="input h-56 font-mono !text-[13px] leading-relaxed" readonly>${m.text}</textarea>
    <div class="grid ${isMobile && navigator.share ? 'grid-cols-2' : 'grid-cols-1'} gap-2">
      ${isMobile && navigator.share ? html`<button type="button" class="btn bg-[#FEE500] text-[#191919] hover:brightness-95" data-action="share-send"><i class="fa-solid fa-comment"></i>카톡으로 보내기</button>` : ''}
      <button type="button" class="btn btn-primary" data-action="share-copy"><i class="fa-regular fa-copy"></i>복사하기</button>
    </div>
    <p class="text-xs text-slate-400">${isMobile ? '[카톡으로 보내기]를 누르고 카카오톡 → 선생님을 고르면 돼요.' : '복사한 뒤 카카오톡 대화창에 붙여넣어 주세요.'}</p>
  `);
}

function guideModal() {
  return modalFrame('📖 플래너 이용 방법', html`
    <div class="space-y-2.5">
      ${guideSteps().map((s) => html`
        <div class="rounded-2xl border border-planner-border/30 bg-planner-bg p-3.5 space-y-1">
          <p class="font-black text-sm text-planner-dark">${s.title}</p>
          <p class="text-sm text-slate-700 leading-relaxed">${s.desc}</p>
        </div>`)}
    </div>
    <button type="button" class="btn btn-primary w-full" data-action="close-guide">확인했어요</button>
  `, 'close-guide');
}

export function modalView(extra = {}) {
  const m = S.ui.modal;
  if (!m) return '';
  if (m.type === 'share') return shareModal(m);
  if (m.type === 'guide') return guideModal();
  const fn = extra[m.type];
  return fn ? fn(m, modalFrame) : '';
}

export const plannerActions = {
  'close-modal': (el, e) => {
    if (el.dataset.self && e.target !== el) return; // 팝업 안쪽을 누른 건 무시
    S.ui.modal = null;
    refresh();
  },
  'close-guide': (el, e) => {
    if (el.dataset.self && e.target !== el) return;
    savePref('guideSeen', true);
    S.ui.modal = null;
    refresh();
    // 안내를 닫자마자 시작 시간 알림이 필요한지 확인
    window.dispatchEvent(new Event('planner:check-alarm'));
  },
  'open-guide': () => {
    S.ui.modal = { type: 'guide' };
    refresh();
  },
  'share-send': async () => {
    const result = await shareOrCopy(S.ui.modal?.text || '');
    if (result === 'copied') toast('복사했어요. 카카오톡에 붙여넣어 주세요.');
    if (result === 'failed') toast('복사하지 못했어요. 글자를 길게 눌러 직접 복사해 주세요.', 'error');
  },
  'share-copy': async () => {
    const ok = await copyText(S.ui.modal?.text || '');
    if (ok) toast('📋 복사했어요! 카카오톡에 붙여넣어 주세요.');
    else {
      document.getElementById('share-text')?.select();
      toast('복사하지 못했어요. 선택된 글자를 직접 복사해 주세요.', 'error');
    }
  },
};

export { raw };
