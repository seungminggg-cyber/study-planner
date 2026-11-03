// 누구에게 어떤 알림을 보낼지 정하는 계산 (Firebase와 상관없는 순수 함수 → tests/push.test.js 로 검사)
import { tasksOn, rateOf, daysBetween } from '../../src/lib/week.js';

export const PUSH_DEFAULTS = {
  on: false,
  start: true,
  late: true,
  timer: true,
  teacherLate: true,
  summary: true,
  summaryTime: '23:00',
};

// 한국 시간 기준 날짜·시각
export function kstNow(ms = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (t) => parts.find((p) => p.type === t).value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hhmm: `${get('hour')}:${get('minute')}`, ms };
}

export const toMin = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

// 새벽 2시~6시는 알림을 보내지 않음 (읽기 사용량 아끼기)
export function isQuietHour(now) {
  return now.hhmm >= '02:00' && now.hhmm < '06:00';
}

// 2일 넘은 '보낸 기록'은 지움
export function pruneSent(sent, today) {
  return Object.fromEntries(Object.entries(sent || {}).filter(([k]) => {
    const d = k.split(':')[1];
    return !(d && /^\d{4}-\d{2}-\d{2}$/.test(d)) || daysBetween(d, today) <= 2;
  }));
}

function shortNames(names, max = 6) {
  return names.length > max ? `${names.slice(0, max).join(', ')} 외 ${names.length - max}명` : names.join(', ');
}

/**
 * students: [{ uid, name, week (이번 주 문서 또는 null), push ({ tokens, sent, timerEndAt, timerStage, timerLabel } 또는 null) }]
 * teachers: [{ uid, push }]
 * 결과: messages [{ uid, tokens, title, body, tag }], sent: Map(uid → 새 sent 기록)
 */
export function planAlerts({ now, cfg, students, teachers }) {
  const messages = [];
  const sentOut = new Map();
  if (!cfg.on) return { messages, sent: sentOut };
  const nowMin = toMin(now.hhmm);

  const status = students.map((s) => {
    const day = s.week?.days?.[now.date] || {};
    const tasks = s.week ? tasksOn(s.week, now.date) : [];
    const planned = tasks.length > 0 && Boolean(day.target);
    const since = planned ? nowMin - toMin(day.target) : null;
    return { s, day, tasks, planned, since, notStarted: planned && !day.startedAt };
  });

  // ----- 학생 -----
  status.forEach(({ s, day, notStarted, since }) => {
    const tokens = s.push?.tokens || [];
    if (!tokens.length) return;
    const sent = pruneSent(s.push.sent, now.date);
    let changed = JSON.stringify(sent) !== JSON.stringify(s.push.sent || {});
    const send = (title, body, tag) => messages.push({ uid: s.uid, tokens, title, body, tag });

    if (notStarted && since >= 0) {
      if (cfg.late && since >= 30 && since < 120 && !sent[`late:${now.date}`]) {
        send('⏳ 아직 공부 시작 전이에요', `목표 시각(${day.target})에서 ${since}분 지났어요. 지금 [🚀 시작]을 누르고 선생님께 알려 주세요!`, 'late');
        sent[`late:${now.date}`] = now.ms;
        sent[`start:${now.date}`] = sent[`start:${now.date}`] || now.ms; // 늦게 확인됐으면 시작 알림은 건너뜀
        changed = true;
      } else if (cfg.start && since < 60 && !sent[`start:${now.date}`]) {
        send('⏰ 공부 시작할 시간이에요!', `오늘 목표 시작 ${day.target}. 첫 과제의 [🚀 시작]을 누르고 선생님께 알려 주세요.`, 'start');
        sent[`start:${now.date}`] = now.ms;
        changed = true;
      }
    }

    const end = Number(s.push.timerEndAt) || 0;
    if (cfg.timer && end && now.ms >= end && now.ms - end < 60 * 60000 && sent.timer !== end) {
      if (s.push.timerStage === 'output') send('🏁 인출 정리까지 끝!', '오늘 완료한 만큼 계획표에 체크해 주세요.', 'timer');
      else send('🎉 집중 시간 끝!', `${s.push.timerLabel ? `${s.push.timerLabel} · ` : ''}이제 책을 덮고 배운 내용을 백지에 정리해요.`, 'timer');
      sent.timer = end;
      changed = true;
    }
    if (changed) sentOut.set(s.uid, sent);
  });

  // ----- 선생님 -----
  const lateNow = status.filter((x) => x.notStarted && x.since >= 30 && x.since < 180);
  const plannedToday = status.filter((x) => x.planned);
  teachers.forEach((t) => {
    const tokens = t.push?.tokens || [];
    if (!tokens.length) return;
    const sent = pruneSent(t.push.sent, now.date);
    let changed = JSON.stringify(sent) !== JSON.stringify(t.push.sent || {});
    const key = `tlate:${now.date}`;
    const already = Array.isArray(sent[key]) ? sent[key] : [];
    const fresh = lateNow.filter((x) => !already.includes(x.s.uid));
    if (cfg.teacherLate && fresh.length) {
      messages.push({
        uid: t.uid,
        tokens,
        title: '⏰ 늦은 학생이 있어요',
        body: `${shortNames(fresh.map((x) => x.s.name))} 학생이 목표 시각보다 30분 넘게 시작하지 않았어요.`,
        tag: 'tlate',
      });
      sent[key] = [...already, ...fresh.map((x) => x.s.uid)];
      changed = true;
    }
    const sumKey = `sum:${now.date}`;
    const sumSince = nowMin - toMin(cfg.summaryTime);
    if (cfg.summary && sumSince >= 0 && sumSince < 120 && !sent[sumKey]) {
      if (plannedToday.length) {
        const started = plannedToday.filter((x) => x.day.startedAt);
        const notYet = plannedToday.filter((x) => !x.day.startedAt).map((x) => x.s.name);
        const rate = rateOf(plannedToday.flatMap((x) => x.tasks));
        messages.push({
          uid: t.uid,
          tokens,
          title: '📊 오늘 학습 요약',
          body: `시작 ${started.length}/${plannedToday.length}명 · 평균 달성률 ${rate ?? 0}%${notYet.length ? ` · 미시작: ${shortNames(notYet)}` : ''}`,
          tag: 'summary',
        });
      }
      sent[sumKey] = now.ms;
      changed = true;
    }
    if (changed) sentOut.set(t.uid, sent);
  });

  return { messages, sent: sentOut };
}
