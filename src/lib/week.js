// 주간 플래너 계산 도우미 (Firebase와 상관없는 순수 계산만 모아 둠 → tests/week.test.js 로 검사)
//
// 한 주 계획 문서(users/{uid}/weeks/{시작날짜}) 모양:
// {
//   start: '2026-11-02',            // 문서 ID와 같음. 이 날부터 7일
//   title: '11/2 ~ 11/8 학습 플래너',
//   goals: ['주간 목표', ...],
//   days:  { '2026-11-02': { target: '17:00', startedAt: '17:02' | null, memo: '', focus: 0 }, ... },
//   tasks: { 과제ID: { date, period, time, subject, title, status, progress, note, order, by } },
//   createdAt, updatedAt, studentAt
// }
// 과제를 목록(배열)이 아니라 ID별로 저장해서, 선생님과 학생이 동시에 고쳐도 서로 덮어쓰지 않아요.

export const DEFAULT_SETTINGS = {
  periods: ['학원전', '학원후'],
  focusMin: 100,
  outputMin: 20,
  defaultTarget: '17:00',
  parentTitle: '어머님',
};

export const DEFAULT_SUBJECTS = ['국어', '문학', '수학', '영어', '생명', '화학', '물리', '지구', '현사윤', '사회', '일본어', '수행평가', '기타'];

export const DEFAULT_GUIDE = [
  {
    title: '1️⃣ 공부 시작: [🚀 시작] 누르고 선생님께 알리기',
    desc: '오늘 할 과제의 [🚀 시작]을 누르면 집중 타이머가 켜지고, 선생님께 보낼 시작 카톡이 준비돼요. 시작 시각은 선생님 화면에도 바로 보여요.',
  },
  {
    title: '2️⃣ 100분 집중 + 20분 인출',
    desc: '인강을 맹목적으로 듣지 말고 필기하며 집중한 뒤, 책을 덮고 배운 내용을 백지에 정리해요. 정리한 핵심은 [인출 메모]에 적어 주세요.',
  },
  {
    title: '3️⃣ 다 못 끝냈다면: [🟡 부분 완료]',
    desc: '끝낸 만큼 진행률을 고르고 어디까지 했는지 솔직하게 적어 주세요. 남은 분량은 [내일로 넘기기]로 옮길 수 있어요.',
  },
  {
    title: '4️⃣ 공부를 마쳤다면: [🏁 마무리 + 보고]',
    desc: '다 못 끝낸 과제는 다음 날로 넘기고, 못 한 이유를 간단히 적어요. 그다음 만들어진 카톡 문구를 선생님께 보내면 끝!',
  },
  {
    title: '5️⃣ 🔔 알림과 📊 기록',
    desc: '위쪽 🔔 버튼에서 폰 알림을 켜면 앱을 닫아도 시작 시간·타이머 알림이 와요. [기록] 탭에서는 이번 주·이번 달 그래프를 볼 수 있어요.',
  },
];

// ---------- 날짜 ----------
export const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
export const DAY_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayKey() {
  return dateKey(new Date());
}

export function parseDateKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function isDateKey(key) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(key)) && dateKey(parseDateKey(key)) === key;
}

export function addDays(key, n) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

export function daysBetween(a, b) {
  return Math.round((parseDateKey(b) - parseDateKey(a)) / 86400000);
}

export function weekDates(start) {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function dayInfo(key) {
  const d = parseDateKey(key);
  return {
    md: `${d.getMonth() + 1}/${d.getDate()}`,
    ko: DAY_KO[d.getDay()],
    en: DAY_EN[d.getDay()],
    weekday: d.getDay(),
  };
}

export function dayTitle(key) {
  const i = dayInfo(key);
  return `${i.md}(${i.ko})`;
}

export function weekRangeText(start) {
  return `${dayInfo(start).md} ~ ${dayInfo(addDays(start, 6)).md}`;
}

export function defaultWeekTitle(start) {
  return `${weekRangeText(start)} 학습 플래너`;
}

// 그 날이 속한 주의 월요일
export function mondayOf(key) {
  const wd = parseDateKey(key).getDay();
  return addDays(key, wd === 0 ? -6 : 1 - wd);
}

// 오늘이 들어 있는 주 찾기 (여러 개면 가장 최근에 시작한 주)
export function weekContaining(weekIds, key) {
  const ids = [...(weekIds || [])].filter((id) => id <= key && daysBetween(id, key) < 7).sort();
  return ids.length ? ids[ids.length - 1] : '';
}

// 학생이 처음 볼 주: 오늘이 든 주 → 없으면 가장 가까운 다음 주 → 없으면 가장 최근 주
export function pickInitialWeek(weekIds, key) {
  const ids = [...(weekIds || [])].sort();
  if (!ids.length) return '';
  const current = weekContaining(ids, key);
  if (current) return current;
  const next = ids.find((id) => id > key);
  return next || ids[ids.length - 1];
}

// 새 주를 만들 때 추천할 시작 날짜: 마지막 주 바로 다음 날, 없으면 이번 주 월요일
export function suggestNextStart(weekIds, key) {
  const ids = [...(weekIds || [])].sort();
  if (!ids.length) return mondayOf(key);
  const after = addDays(ids[ids.length - 1], 7);
  return after < mondayOf(key) ? mondayOf(key) : after;
}

export function nowHHMM(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---------- 과제 ----------
// '23:30~1:30' 같은 시간 글자에서 시작 시각(분)을 뽑아 정렬에 씀. 새벽(0~4시)은 밤 뒤로 보냄
export function timeStartMinutes(time) {
  const m = String(time || '').match(/(\d{1,2})\s*[:시]\s*(\d{2})?/);
  if (!m) return 9999;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  if (h < 5) h += 24;
  return h * 60 + min;
}

export function cleanTime(time) {
  return String(time || '').replace(/[\[\]]/g, '').trim();
}

export function normalizeProgress(status, progress) {
  if (status === 'done') return 100;
  if (status === 'todo') return 0;
  const p = Math.round(Number(progress) || 0);
  return Math.min(95, Math.max(5, p));
}

export function statusFromProgress(p) {
  const n = Number(p) || 0;
  if (n >= 100) return 'done';
  if (n <= 0) return 'todo';
  return 'partial';
}

export function taskList(week) {
  return Object.entries(week?.tasks || {})
    .filter(([, t]) => t && typeof t.title === 'string' && t.title && t.date)
    .map(([id, t]) => ({ ...t, id }));
}

export function sortTasks(tasks) {
  return [...tasks].sort((a, b) => timeStartMinutes(a.time) - timeStartMinutes(b.time) || (a.order || 0) - (b.order || 0));
}

export function tasksOn(week, date) {
  return sortTasks(taskList(week).filter((t) => t.date === date));
}

// 학원전 / 학원후 같은 구분별로 묶기. 설정에 없는 구분이 과제에 있으면 뒤에 붙임
export function groupByPeriod(tasks, periods) {
  const names = [...(periods?.length ? periods : DEFAULT_SETTINGS.periods)];
  tasks.forEach((t) => {
    const p = t.period || '';
    if (!names.includes(p)) names.push(p);
  });
  return names
    .map((period) => ({ period, tasks: tasks.filter((t) => (t.period || '') === period) }))
    .filter((g, i) => i < (periods?.length || 2) || g.tasks.length > 0);
}

export function taskScore(t) {
  if (t.status === 'done') return 100;
  if (t.status === 'partial') return Math.min(100, Math.max(0, Number(t.progress) || 0));
  return 0;
}

// 과제가 없으면 null (화면에는 '-' 로 표시)
export function rateOf(tasks) {
  if (!tasks.length) return null;
  return Math.round(tasks.reduce((sum, t) => sum + taskScore(t), 0) / tasks.length);
}

export function dayRate(week, date) {
  return rateOf(tasksOn(week, date));
}

export function weekRate(week) {
  return rateOf(taskList(week));
}

export function startedDays(week) {
  return Object.values(week?.days || {}).filter((d) => d?.startedAt).length;
}

export function plannedDays(week) {
  const dates = new Set(taskList(week).map((t) => t.date));
  return dates.size;
}

export function focusTotal(week) {
  return Object.values(week?.days || {}).reduce((sum, d) => sum + (Number(d?.focus) || 0), 0);
}

// 오늘 목표 시작 시각이 지났는데 아직 시작 안 했는지
export function isLate(week, date, hhmm) {
  const day = week?.days?.[date];
  if (!day || day.startedAt || !day.target) return false;
  if (!tasksOn(week, date).length) return false;
  return hhmm >= day.target;
}

// 제목이 이미 [과목]으로 시작하면 과목을 두 번 쓰지 않음
export function taskLabel(t) {
  const title = String(t.title || '');
  if (!t.subject || title.startsWith(`[${t.subject}]`)) return title;
  return `[${t.subject}] ${title}`;
}

// ---------- 다 못 끝낸 과제 이월 + 못 한 이유 ----------
export const REASON_CHIPS = ['수행평가·학교 숙제', '학교 일정', '컨디션', '시간 부족', '계획이 많았어요', '집중이 안 됐어요'];

// 그 날 다 못 끝냈고 아직 다른 날로 넘기지 않은 과제
export function unfinishedTasks(week, date) {
  return tasksOn(week, date).filter((t) => t.status !== 'done' && !t.carriedTo);
}

// 남은 분량을 다른 날로 옮길 새 과제 (원래 과제는 carriedTo로 표시)
export function carriedCopy(t, order = Date.now()) {
  const done = t.status === 'partial' ? t.progress : 0;
  return {
    date: '',
    period: t.period || '',
    time: t.time || '',
    subject: t.subject || '',
    title: t.title.startsWith('[이월') ? t.title : `[이월] ${t.title}`,
    status: 'todo',
    progress: 0,
    note: done ? `${dayInfo(t.date).md} ${done}% 진행${t.note ? ` · ${t.note}` : ''}` : '',
    order,
    by: 'student',
    from: t.date,
  };
}

// 마감할 때 넘길 날짜: 오늘(또는 미래) 계획이면 다음 날, 지난 날이면 오늘로
export function carryTarget(date, today) {
  return date < today ? today : addDays(date, 1);
}

export function reasonText(chips, text) {
  return [...(chips || []), String(text || '').trim()].filter(Boolean).join(' · ').slice(0, 300);
}

// 오늘보다 앞선 날 중에 정리 안 한(마감 안 한) 미완료 과제가 남은 가장 최근 날
export function pendingCloseDate(week, today) {
  const dates = weekDates(week.start).filter((d) => d < today).reverse();
  return dates.find((d) => unfinishedTasks(week, d).length && !week.days?.[d]?.closedAt) || '';
}

// ---------- 카톡 문구 ----------
export function startMessage({ date, task, startedAt, focusMin, outputMin }) {
  const what = task ? `${task.time ? `${cleanTime(task.time)} ` : ''}${taskLabel(task)}` : '오늘 계획';
  return `선생님! ${dayTitle(date)} ${what} 지금 공부 시작합니다! (시작 ${startedAt} · ${focusMin}분 집중 + ${outputMin}분 인출)`;
}

function statusIcon(t) {
  if (t.status === 'done') return '✅ [완료]';
  if (t.status === 'partial') return `🟡 [부분 ${t.progress}%]`;
  return '⬜ [미완료]';
}

export function dailyReport({ name, week, date, periods }) {
  const day = week?.days?.[date] || {};
  const tasks = tasksOn(week, date);
  const rate = rateOf(tasks);
  const lines = groupByPeriod(tasks, periods)
    .flatMap((g) => g.tasks.map((t) => {
      let line = `${statusIcon(t)} <${t.period}> ${t.time ? `${cleanTime(t.time)} ` : ''}${taskLabel(t)}`;
      if (t.note) line += `\n   ↳ ✏️ ${t.note}`;
      if (t.carriedTo) line += `\n   ↳ ↪️ ${dayTitle(t.carriedTo)}로 이월`;
      return line;
    }))
    .join('\n\n');

  return [
    `[📒 ${name} ${dayTitle(date)} 학습 마감 보고]`,
    `• 공부 시작 시각: ${day.startedAt || '미기록'}`,
    `• 오늘 계획 달성률: ${rate === null ? '-' : `${rate}%`} (부분 완료 포함)`,
    ...(day.focus ? [`• 집중 타이머 완주: ${day.focus}회`] : []),
    '',
    '📋 [오늘의 진행 내역]',
    lines || '(오늘 계획 없음)',
    '',
    ...(day.reason ? ['📝 [다 못 한 이유]', day.reason, ''] : []),
    '🧠 [인출 메모]',
    day.memo || '(작성한 메모 없음)',
    '',
    '선생님! 오늘 완료한 부분까지 계획표 체크해서 보내드립니다!',
  ].join('\n');
}

export const DEFAULT_PARENT_COMMENT = '학원 전·후 시간을 나누어 학원 숙제를 밀리지 않도록 하고, 인강은 맹목적으로 듣지 않고 100분 집중 수강 후 20분 인출 정리를 하도록 지도하고 있습니다.\n분량을 100% 끝내지 못한 날에도 포기하지 않고 완료한 부분까지 계획표를 수정하며 꾸준히 진도를 이어가고 있습니다.';

export function parentReport({ name, parentTitle, teacherName, week, comment }) {
  const dates = weekDates(week.start);
  const rate = weekRate(week);
  const dayLines = dates.map((date) => {
    const tasks = tasksOn(week, date);
    if (!tasks.length) return `• ${dayTitle(date)}: 계획 없음`;
    const done = tasks.filter((t) => t.status === 'done').length;
    const partial = tasks.filter((t) => t.status === 'partial').length;
    const reason = week.days?.[date]?.reason;
    return `• ${dayTitle(date)}: 달성률 ${rateOf(tasks)}% (완료 ${done}건 / 부분 ${partial}건)${reason ? `\n   ↳ 못 한 이유: ${reason}` : ''}`;
  });
  const focus = focusTotal(week);
  return [
    `${parentTitle || '어머님'}, 안녕하십니까. ${teacherName}입니다.`,
    `금주(${weekRangeText(week.start)}) ${name} 학생의 주간 학습 진행 상황과 과제 달성 리포트를 공유해 드립니다.`,
    '',
    '📊 [주간 학습 요약]',
    `• 주간 과제 소화율: ${rate === null ? '-' : `${rate}%`} (부분 완료 반영)`,
    `• 공부 시작 인증: 계획한 ${plannedDays(week)}일 중 ${startedDays(week)}일`,
    ...(focus ? [`• 집중 타이머 완주: ${focus}회`] : []),
    '',
    '🗓️ [요일별 진행 현황]',
    ...dayLines,
    '',
    '💡 [금주 지도 내용]',
    comment || DEFAULT_PARENT_COMMENT,
    '',
    '관련하여 궁금하신 점 있으시면 언제든 연락 부탁드립니다. 감사합니다.',
  ].join('\n');
}

// ---------- 새 주 만들기 ----------
let idCounter = 0;
export function makeTaskId() {
  idCounter += 1;
  return 't' + Date.now().toString(36) + idCounter.toString(36) + Math.random().toString(36).slice(2, 6);
}

function emptyDay(target) {
  return { target, startedAt: null, memo: '', focus: 0 };
}

// prev: 지난주 문서 (없어도 됨)
// copyTasks: 지난주 과제를 같은 요일에 그대로 복사 / carryUnfinished: 덜 끝낸 과제를 새 주 첫날로 이월
// (복사도 함께 하면 부분 완료 과제만 이월해서 같은 과제가 두 번 생기지 않게 함)
export function buildWeek({ start, title, prev, copyTasks = false, carryUnfinished = false, defaultTarget = '17:00', now = Date.now() }) {
  const dates = weekDates(start);
  const prevDates = prev ? weekDates(prev.start) : [];
  const days = {};
  dates.forEach((date, i) => {
    // 같은 요일의 목표 시작 시각을 이어받음
    const wd = dayInfo(date).weekday;
    const sameDay = prevDates.find((d) => dayInfo(d).weekday === wd);
    const target = (sameDay && prev?.days?.[sameDay]?.target) || defaultTarget;
    days[date] = emptyDay(target);
    if (i === 0) days[date].target = days[date].target || defaultTarget;
  });

  const tasks = {};
  let order = 0;
  const add = (t) => {
    order += 1;
    tasks[makeTaskId()] = { ...t, status: 'todo', progress: 0, note: t.note || '', order, by: 'teacher' };
  };

  if (prev) {
    const prevTasks = sortTasks(taskList(prev));
    if (carryUnfinished) {
      // 과제를 그대로 복사할 때는 '진행 전' 과제가 이미 복사되므로 부분 완료만 이월 (중복 방지)
      prevTasks.filter((t) => !t.carriedTo && (t.status === 'partial' || (t.status === 'todo' && !copyTasks))).forEach((t) => {
        add({
          date: start,
          period: t.period,
          time: t.time || '',
          subject: t.subject || '',
          title: t.title.startsWith('[이월]') ? t.title : `[이월] ${t.title}`,
          note: t.status === 'partial' ? `지난주 ${t.progress}% 진행${t.note ? ` · ${t.note}` : ''}` : '',
        });
      });
    }
    if (copyTasks) {
      prevTasks.forEach((t) => {
        const offset = prevDates.indexOf(t.date);
        if (offset < 0) return;
        add({ date: dates[offset], period: t.period, time: t.time || '', subject: t.subject || '', title: t.title.replace(/^\[이월\]\s*/, '') });
      });
    }
  }

  return {
    start,
    title: title || defaultWeekTitle(start),
    goals: [...(prev?.goals || [])],
    days,
    tasks,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------- 예전 플래너(Netlify) 데이터 가져오기 ----------
// 예전 앱 코치 화면의 [🔗 계획표 링크 복사]로 받은 주소(…#plan=…)를 붙여넣으면 한 주 계획으로 바꿔 줍니다.
function decodeBase64Utf8(b64) {
  const bin = atob(b64.replace(/\s+/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function guessDate(label, today) {
  const m = String(label || '').match(/(\d{1,2})\s*[\/.월-]\s*(\d{1,2})/);
  if (!m) return '';
  const month = Number(m[1]);
  const day = Number(m[2]);
  const ty = parseDateKey(today).getFullYear();
  let best = '';
  [ty - 1, ty, ty + 1].forEach((y) => {
    const key = dateKey(new Date(y, month - 1, day));
    if (!best || Math.abs(daysBetween(today, key)) < Math.abs(daysBetween(today, best))) best = key;
  });
  return best;
}

export function parseLegacyPlan(input, today = todayKey()) {
  const text = String(input || '').trim();
  if (!text) throw new Error('붙여넣은 내용이 비어 있어요.');
  let obj;
  try {
    if (text.startsWith('{')) {
      obj = JSON.parse(text);
    } else {
      const encoded = text.includes('#plan=') ? text.split('#plan=')[1] : text;
      obj = JSON.parse(decodeBase64Utf8(decodeURIComponent(encoded)));
    }
  } catch {
    throw new Error('예전 플래너 링크를 읽지 못했어요. 링크 전체를 그대로 붙여넣어 주세요.');
  }
  const schedule = Array.isArray(obj?.scheduleData) ? obj.scheduleData : [];
  if (!schedule.length) throw new Error('링크 안에 주간 계획이 없어요.');

  const dated = schedule.map((d) => ({ d, date: guessDate(d.dateLabel, today) })).filter((x) => x.date);
  if (!dated.length) throw new Error('날짜(예: 11/2)를 찾지 못했어요.');
  const sorted = dated.map((x) => x.date).sort();
  const start = sorted[0];
  if (daysBetween(start, sorted[sorted.length - 1]) > 6) throw new Error('날짜가 7일 범위를 넘어요. 예전 앱에서 날짜를 확인해 주세요.');

  const week = buildWeek({ start, title: obj.plannerTitle || '' });
  week.goals = (obj.weeklyGoals || []).map((g) => String(g)).filter(Boolean);
  let order = 0;
  dated.forEach(({ d, date }) => {
    week.days[date] = {
      target: d.targetStartTime || '17:00',
      startedAt: d.isStarted && d.startedAt ? String(d.startedAt) : null,
      memo: String(d.keywordMemo || ''),
      focus: 0,
    };
    (d.tasks || []).forEach((t) => {
      if (!t?.title) return;
      order += 1;
      const status = ['done', 'partial', 'todo'].includes(t.status) ? t.status : 'todo';
      week.tasks[makeTaskId()] = {
        date,
        period: String(t.period || DEFAULT_SETTINGS.periods[1]),
        time: cleanTime(t.timeRange),
        subject: String(t.subject || ''),
        title: String(t.title),
        status,
        progress: normalizeProgress(status, t.progress),
        note: String(t.actualNote || ''),
        order,
        by: 'teacher',
      };
    });
  });
  return week;
}
