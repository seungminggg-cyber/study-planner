// 누구에게 어떤 알림을 보낼지 정하는 계산 (Firebase와 상관없는 순수 함수 → tests/push.test.js 로 검사)
import {
  tasksOn, rateOf, daysBetween, missingSoon, feedbackList, deadlineAlerts, ddayText, dayTitle, EVENT_KINDS,
} from '../../src/lib/week.js';

export const PUSH_DEFAULTS = {
  on: false,
  start: true,
  late: true,
  timer: true,
  teacherLate: true,
  summary: true,
  summaryTime: '23:00',
  feedback: true, // 학생: 선생님 피드백이 새로 오면
  deadline: true, // 학생·선생님: 시험·수행평가 D-3, D-1, 당일 (저녁 7시)
  nextWeek: true, // 선생님: 다음 주 계획표가 없는 학생 (금·토·일, 하루 요약 시각)
};

// 시험·수행평가 마감 알림은 하루 한 번 저녁 7시쯤 (이때만 일정 문서를 읽어서 사용량을 아낌)
export function isDeadlineWindow(now) {
  return now.hhmm >= '19:00' && now.hhmm < '19:15';
}

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

// [테스트 알림 보내기]: 앱이 timerStage 'test' 와 요청 시각을 남기면 다음 실행 때 한 번 보냄
// (보안 규칙을 바꾸지 않으려고 타이머 칸을 함께 씀)
function isTestRequest(push, now, sent) {
  const end = Number(push?.timerEndAt) || 0;
  return push?.timerStage === 'test' && end && now.ms >= end && now.ms - end < 60 * 60000 && sent.timer !== end ? end : 0;
}
const TEST_TITLE = '✅ 알림 테스트 성공!';
const TEST_BODY = '이 기기로 폰 알림이 잘 와요. 이제 앱을 닫아 두어도 알림을 받을 수 있어요.';

function shortNames(names, max = 6) {
  return names.length > max ? `${names.slice(0, max).join(', ')} 외 ${names.length - max}명` : names.join(', ');
}

/**
 * students: [{ uid, name, weekIds, week (이번 주 문서 또는 null), events (일정 items, 마감 알림 시간에만), push ({ tokens, sent, timerEndAt, timerStage, timerLabel } 또는 null) }]
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

    const test = isTestRequest(s.push, now, sent);
    const end = Number(s.push.timerEndAt) || 0;
    if (test) {
      send(TEST_TITLE, TEST_BODY, 'test');
      sent.timer = test;
      changed = true;
    } else if (cfg.timer && s.push.timerStage !== 'test' && end && now.ms >= end && now.ms - end < 60 * 60000 && sent.timer !== end) {
      if (s.push.timerStage === 'output') send('🏁 인출 정리까지 끝!', '오늘 완료한 만큼 계획표에 체크해 주세요.', 'timer');
      else send('🎉 집중 시간 끝!', `${s.push.timerLabel ? `${s.push.timerLabel} · ` : ''}이제 책을 덮고 배운 내용을 백지에 정리해요.`, 'timer');
      sent.timer = end;
      changed = true;
    }
    // 선생님 피드백: 쓰고 2분 지난 뒤(쓰는 중에 보내지 않게), 12시간 안의 것만
    const fb = cfg.feedback && s.week ? feedbackList(s.week)[0] : null;
    if (fb && fb.at > (Number(sent.fb) || 0)) {
      const age = now.ms - fb.at;
      if (age >= 2 * 60000) {
        if (age < 12 * 3600000) {
          send('💬 선생님 피드백이 도착했어요', `${dayTitle(fb.date)}${fb.task ? ` · ${fb.task.title}` : ''}: ${fb.text}`.slice(0, 120), 'feedback');
        }
        sent.fb = fb.at;
        changed = true;
      }
    }

    // 시험·수행평가 마감
    if (cfg.deadline && s.events && !sent[`dl:${now.date}`]) {
      const list = deadlineAlerts(s.events, now.date);
      if (list.length) {
        send('📅 다가오는 일정', list.map((e) => `${ddayText(e.date, now.date)} ${EVENT_KINDS[e.kind] || ''} ${e.title}`.replace(/\s+/g, ' ')).join(' · ').slice(0, 150), 'deadline');
        sent[`dl:${now.date}`] = now.ms;
        changed = true;
      }
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
    const test = isTestRequest(t.push, now, sent);
    if (test) {
      messages.push({ uid: t.uid, tokens, title: TEST_TITLE, body: TEST_BODY, tag: 'test' });
      sent.timer = test;
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
    // 다음 주 계획표가 없는 학생 (금·토·일처럼 3일 안에 빈 날이 생길 때, 하루 요약 시각에)
    const nwKey = `nw:${now.date}`;
    if (cfg.nextWeek && sumSince >= 0 && sumSince < 120 && !sent[nwKey]) {
      const missing = students.filter((s) => s.weekIds?.length && missingSoon(s.weekIds, now.date));
      if (missing.length) {
        messages.push({
          uid: t.uid,
          tokens,
          title: '📅 다음 주 계획표를 만들어 주세요',
          body: `${shortNames(missing.map((s) => s.name))} 학생의 다음 주 계획표가 아직 없어요.`,
          tag: 'nextweek',
        });
      }
      sent[nwKey] = now.ms;
      changed = true;
    }
    // 학생들의 시험·수행평가 마감 모음
    const dlKey = `dl:${now.date}`;
    if (cfg.deadline && !sent[dlKey] && students.some((s) => s.events)) {
      const items = students.flatMap((s) => deadlineAlerts(s.events, now.date).map((e) => `${s.name} ${ddayText(e.date, now.date)} ${e.title}`));
      if (items.length) {
        messages.push({ uid: t.uid, tokens, title: '📅 학생 일정 (D-3·D-1·당일)', body: items.join(' · ').slice(0, 180), tag: 'deadline' });
      }
      sent[dlKey] = now.ms;
      changed = true;
    }
    if (changed) sentOut.set(t.uid, sent);
  });

  return { messages, sent: sentOut };
}
