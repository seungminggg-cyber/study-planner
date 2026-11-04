// 폰 알림: 누구에게 어떤 알림을 보낼지 검사 (npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planAlerts, kstNow, isQuietHour, pruneSent, PUSH_DEFAULTS } from '../scripts/push/plan.mjs';

const cfg = { ...PUSH_DEFAULTS, on: true };
const at = (hhmm) => ({ date: '2026-11-03', hhmm, ms: Date.parse(`2026-11-03T${hhmm}:00+09:00`) });

const week = (startedAt = null) => ({
  start: '2026-11-02',
  days: { '2026-11-03': { target: '17:30', startedAt, memo: '', focus: 0 } },
  tasks: {
    a: { date: '2026-11-03', period: '학원전', title: '숙제', status: 'done', progress: 100 },
    b: { date: '2026-11-03', period: '학원후', title: '인강', status: 'todo', progress: 0 },
  },
});
const student = (extra = {}) => ({ uid: 'stu1', name: '민지', week: week(), push: { tokens: ['tok1'], sent: {} }, ...extra });
const teacher = (sent = {}) => ({ uid: 'teach', push: { tokens: ['tokT'], sent } });

test('한국 시간 계산과 새벽 쉬는 시간', () => {
  const n = kstNow(Date.parse('2026-11-03T08:35:00Z'));
  assert.deepEqual([n.date, n.hhmm], ['2026-11-03', '17:35']);
  assert.equal(isQuietHour({ hhmm: '03:10' }), true);
  assert.equal(isQuietHour({ hhmm: '01:50' }), false);
  assert.equal(isQuietHour({ hhmm: '06:00' }), false);
});

test('선생님이 꺼 두면 아무것도 보내지 않음', () => {
  const r = planAlerts({ now: at('17:40'), cfg: { ...cfg, on: false }, students: [student()], teachers: [teacher()] });
  assert.equal(r.messages.length, 0);
});

test('목표 시각이 지나면 시작 알림 한 번만', () => {
  assert.equal(planAlerts({ now: at('17:20'), cfg, students: [student()], teachers: [] }).messages.length, 0);
  const r = planAlerts({ now: at('17:35'), cfg, students: [student()], teachers: [] });
  assert.equal(r.messages.length, 1);
  assert.equal(r.messages[0].tag, 'start');
  assert.match(r.messages[0].body, /17:30/);
  // 이미 보냈으면 다시 안 보냄
  const s2 = student({ push: { tokens: ['tok1'], sent: r.sent.get('stu1') } });
  assert.equal(planAlerts({ now: at('17:45'), cfg, students: [s2], teachers: [] }).messages.length, 0);
  // 시작했으면 안 보냄
  assert.equal(planAlerts({ now: at('17:35'), cfg, students: [student({ week: week('17:31') })], teachers: [] }).messages.length, 0);
  // 시작 알림을 꺼 두면 안 보냄
  assert.equal(planAlerts({ now: at('17:35'), cfg: { ...cfg, start: false }, students: [student()], teachers: [] }).messages.length, 0);
});

test('30분 넘게 시작 안 하면 한 번 더 (시작 알림과 겹치면 한 번만)', () => {
  const r = planAlerts({ now: at('18:05'), cfg, students: [student()], teachers: [] });
  assert.deepEqual(r.messages.map((m) => m.tag), ['late']);
  assert.ok(r.sent.get('stu1')['start:2026-11-03']);
  // 너무 오래 지났으면(2시간 이상) 학생 알림은 안 보냄
  assert.equal(planAlerts({ now: at('19:40'), cfg, students: [student()], teachers: [] }).messages.length, 0);
});

test('타이머가 끝나면 알림 (같은 타이머는 한 번만)', () => {
  const end = at('20:00').ms;
  const s = student({ week: week('17:31'), push: { tokens: ['tok1'], sent: {}, timerEndAt: end, timerStage: 'focus', timerLabel: '[수학] 18강' } });
  assert.equal(planAlerts({ now: at('19:55'), cfg, students: [s], teachers: [] }).messages.length, 0);
  const r = planAlerts({ now: at('20:05'), cfg, students: [s], teachers: [] });
  assert.equal(r.messages[0].tag, 'timer');
  assert.match(r.messages[0].body, /\[수학\] 18강/);
  s.push.sent = r.sent.get('stu1');
  assert.equal(planAlerts({ now: at('20:15'), cfg, students: [s], teachers: [] }).messages.length, 0);
});

test('선생님: 30분 넘게 늦은 학생 알림 (같은 학생은 하루 한 번)', () => {
  const late = student();
  const ontime = student({ uid: 'stu2', name: '지훈', week: week('17:20'), push: null });
  const r = planAlerts({ now: at('18:05'), cfg, students: [late, ontime], teachers: [teacher()] });
  const tm = r.messages.find((m) => m.uid === 'teach');
  assert.equal(tm.tag, 'tlate');
  assert.match(tm.body, /민지 학생이/);
  assert.doesNotMatch(tm.body, /지훈/);
  const again = planAlerts({ now: at('18:15'), cfg, students: [late, ontime], teachers: [teacher(r.sent.get('teach'))] });
  assert.equal(again.messages.filter((m) => m.uid === 'teach').length, 0);
  // 선생님 알림을 꺼 두면 안 보냄
  assert.equal(planAlerts({ now: at('18:05'), cfg: { ...cfg, teacherLate: false }, students: [late], teachers: [teacher()] }).messages.filter((m) => m.uid === 'teach').length, 0);
});

test('선생님: 하루 요약', () => {
  const a = student({ push: null });
  const b = student({ uid: 'stu2', name: '지훈', week: week('17:20'), push: null });
  const r = planAlerts({ now: at('23:05'), cfg, students: [a, b], teachers: [teacher()] });
  const sum = r.messages.find((m) => m.tag === 'summary');
  assert.match(sum.body, /시작 1\/2명/);
  assert.match(sum.body, /미시작: 민지/);
  assert.equal(planAlerts({ now: at('22:50'), cfg, students: [a, b], teachers: [teacher()] }).messages.filter((m) => m.tag === 'summary').length, 0);
});

test('오래된 보낸 기록 정리', () => {
  const sent = { 'start:2026-10-28': 1, 'start:2026-11-02': 2, timer: 3 };
  assert.deepEqual(Object.keys(pruneSent(sent, '2026-11-03')).sort(), ['start:2026-11-02', 'timer']);
});

test('테스트 알림: 요청하면 다음 실행 때 한 번만 (학생·선생님 모두)', () => {
  const req = at('17:00').ms;
  const s = student({ week: week('17:01'), push: { tokens: ['tok1'], sent: {}, timerEndAt: req, timerStage: 'test' } });
  const t = { uid: 'teach', push: { tokens: ['tokT'], sent: {}, timerEndAt: req, timerStage: 'test' } };
  const r = planAlerts({ now: at('17:05'), cfg: { ...cfg, timer: false, summary: false }, students: [s], teachers: [t] });
  assert.deepEqual(r.messages.map((m) => `${m.uid}:${m.tag}`).sort(), ['stu1:test', 'teach:test']);
  s.push.sent = r.sent.get('stu1');
  t.push.sent = r.sent.get('teach');
  assert.equal(planAlerts({ now: at('17:15'), cfg, students: [s], teachers: [t] }).messages.filter((m) => m.tag === 'test').length, 0);
  // 테스트 요청은 '타이머 끝' 알림으로 보내지 않음
  assert.equal(r.messages.filter((m) => m.tag === 'timer').length, 0);
});

test('선생님 피드백: 쓰고 2분 지나면 한 번만', () => {
  const now = at('20:00');
  const w = week();
  w.tasks.b.fb = '인강 필기 꼼꼼히!';
  w.tasks.b.fbAt = now.ms - 60 * 1000; // 1분 전: 아직 쓰는 중일 수 있음
  let r = planAlerts({ now, cfg, students: [student({ week: w })], teachers: [] });
  assert.equal(r.messages.filter((m) => m.tag === 'feedback').length, 0);
  w.tasks.b.fbAt = now.ms - 3 * 60 * 1000;
  r = planAlerts({ now, cfg, students: [student({ week: w })], teachers: [] });
  const fb = r.messages.find((m) => m.tag === 'feedback');
  assert.ok(fb);
  assert.match(fb.body, /인강 필기 꼼꼼히/);
  // 보낸 기록이 있으면 다시 안 보냄
  const again = planAlerts({ now, cfg, students: [student({ week: w, push: { tokens: ['tok1'], sent: r.sent.get('stu1') } })], teachers: [] });
  assert.equal(again.messages.filter((m) => m.tag === 'feedback').length, 0);
  // 꺼 두면 안 보냄
  const off = planAlerts({ now, cfg: { ...cfg, feedback: false }, students: [student({ week: w })], teachers: [] });
  assert.equal(off.messages.filter((m) => m.tag === 'feedback').length, 0);
});

test('시험·수행평가 마감 알림: 학생과 선생님에게 하루 한 번', () => {
  const now = at('19:05');
  const events = { e1: { kind: 'perf', title: '화학 보고서', date: '2026-11-04' }, e2: { kind: 'exam', title: '기말고사', date: '2026-11-20' } };
  const r = planAlerts({ now, cfg, students: [student({ events })], teachers: [teacher()] });
  const mine = r.messages.find((m) => m.uid === 'stu1' && m.tag === 'deadline');
  assert.ok(mine);
  assert.match(mine.body, /D-1 수행평가 화학 보고서/);
  const t = r.messages.find((m) => m.uid === 'teach' && m.tag === 'deadline');
  assert.match(t.body, /민지 D-1 화학 보고서/);
  // 일정 문서를 안 읽은 시간에는 아무것도 안 함
  const r2 = planAlerts({ now: at('20:05'), cfg, students: [student()], teachers: [teacher()] });
  assert.equal(r2.messages.filter((m) => m.tag === 'deadline').length, 0);
  // 같은 날 두 번 안 보냄
  const r3 = planAlerts({ now, cfg, students: [student({ events, push: { tokens: ['tok1'], sent: r.sent.get('stu1') } })], teachers: [teacher(r.sent.get('teach'))] });
  assert.equal(r3.messages.filter((m) => m.tag === 'deadline').length, 0);
});

test('다음 주 계획표가 없는 학생을 선생님에게 (하루 요약 시각에)', () => {
  // 11/6(금): 11/2 주만 있으면 월요일이 빔
  const fri = { date: '2026-11-06', hhmm: '23:05', ms: Date.parse('2026-11-06T23:05:00+09:00') };
  const s1 = student({ weekIds: ['2026-11-02'], week: null });
  const s2 = { ...student({ uid: 'stu2', name: '서준', weekIds: ['2026-11-02', '2026-11-09'], week: null }) };
  const r = planAlerts({ now: fri, cfg, students: [s1, s2], teachers: [teacher()] });
  const nw = r.messages.find((m) => m.tag === 'nextweek');
  assert.ok(nw);
  assert.match(nw.body, /민지/);
  assert.doesNotMatch(nw.body, /서준/);
  const again = planAlerts({ now: fri, cfg, students: [s1, s2], teachers: [teacher(r.sent.get('teach'))] });
  assert.equal(again.messages.filter((m) => m.tag === 'nextweek').length, 0);
  // 수요일에는 안 보냄
  const wed = { date: '2026-11-04', hhmm: '23:05', ms: Date.parse('2026-11-04T23:05:00+09:00') };
  assert.equal(planAlerts({ now: wed, cfg, students: [s1], teachers: [teacher()] }).messages.filter((m) => m.tag === 'nextweek').length, 0);
});
