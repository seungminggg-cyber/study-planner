// 주간 계산·보고 문구·예전 데이터 가져오기 검사 (npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, weekDates, mondayOf, weekContaining, pickInitialWeek, suggestNextStart, timeStartMinutes,
  tasksOn, groupByPeriod, rateOf, dayRate, weekRate, isLate, buildWeek, parseLegacyPlan, dailyReport,
  parentReport, startMessage, normalizeProgress, statusFromProgress, taskLabel, defaultWeekTitle,
} from '../src/lib/week.js';

const sampleWeek = () => ({
  start: '2026-11-02',
  title: '11/2 ~ 11/8 학습 플래너',
  goals: ['과제 밀리지 않기'],
  days: {
    '2026-11-02': { target: '17:00', startedAt: '17:02', memo: '수학 18강 공식 정리', focus: 1 },
    '2026-11-03': { target: '17:30', startedAt: null, memo: '', focus: 0 },
  },
  tasks: {
    a: { date: '2026-11-02', period: '학원전', time: '17:00~19:00', subject: '영어', title: '[영어] 학원 숙제', status: 'done', progress: 100, note: '', order: 1 },
    b: { date: '2026-11-02', period: '학원후', time: '23:30~1:30', subject: '화학', title: '22강 수강', status: 'partial', progress: 60, note: '절반 정리', order: 2 },
    c: { date: '2026-11-02', period: '학원후', time: '20:00~22:00', subject: '수학', title: '개념의 신 18강', status: 'todo', progress: 0, note: '', order: 3 },
    d: { date: '2026-11-03', period: '학원전', time: '17:30~18:30', subject: '수학', title: '숙제', status: 'todo', progress: 0, note: '', order: 4 },
    broken: { status: 'done' }, // 제목 없는 조각은 무시
  },
});

test('날짜 계산', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.deepEqual(weekDates('2026-11-02').slice(-1), ['2026-11-08']);
  assert.equal(mondayOf('2026-11-08'), '2026-11-02');
  assert.equal(mondayOf('2026-11-02'), '2026-11-02');
  assert.equal(defaultWeekTitle('2026-11-02'), '11/2 ~ 11/8 학습 플래너');
});

test('오늘이 든 주 찾기', () => {
  const ids = ['2026-10-23', '2026-11-02'];
  assert.equal(weekContaining(ids, '2026-11-03'), '2026-11-02');
  assert.equal(weekContaining(ids, '2026-10-29'), '2026-10-23');
  assert.equal(weekContaining(ids, '2026-10-31'), '');
  assert.equal(pickInitialWeek(ids, '2026-10-31'), '2026-11-02');
  assert.equal(pickInitialWeek(ids, '2026-12-25'), '2026-11-02');
  assert.equal(suggestNextStart(ids, '2026-11-03'), '2026-11-09');
  assert.equal(suggestNextStart([], '2026-11-03'), '2026-11-02');
});

test('새벽 시간은 밤 뒤로 정렬', () => {
  assert.ok(timeStartMinutes('23:30~1:30') < timeStartMinutes('0:30~2:00'));
  const order = tasksOn(sampleWeek(), '2026-11-02').map((t) => t.id);
  assert.deepEqual(order, ['a', 'c', 'b']);
});

test('달성률: 완료 100, 부분은 진행률, 과제 없으면 null', () => {
  const w = sampleWeek();
  assert.equal(dayRate(w, '2026-11-02'), Math.round((100 + 60 + 0) / 3));
  assert.equal(dayRate(w, '2026-11-05'), null);
  assert.equal(weekRate(w), Math.round((100 + 60 + 0 + 0) / 4));
  assert.equal(rateOf([]), null);
  assert.equal(normalizeProgress('partial', 0), 5);
  assert.equal(normalizeProgress('partial', 100), 95);
  assert.equal(statusFromProgress(100), 'done');
  assert.equal(statusFromProgress(0), 'todo');
});

test('구분별 묶기: 설정에 없는 구분도 보여줌', () => {
  const tasks = [{ period: '학원전' }, { period: '주말' }];
  const groups = groupByPeriod(tasks, ['학원전', '학원후']);
  assert.deepEqual(groups.map((g) => g.period), ['학원전', '학원후', '주말']);
});

test('늦음 판단', () => {
  const w = sampleWeek();
  assert.equal(isLate(w, '2026-11-03', '17:29'), false);
  assert.equal(isLate(w, '2026-11-03', '17:30'), true);
  assert.equal(isLate(w, '2026-11-02', '23:00'), false); // 이미 시작함
  assert.equal(isLate(w, '2026-11-05', '23:00'), false); // 과제 없음
});

test('과제 이름에 과목을 두 번 쓰지 않음', () => {
  assert.equal(taskLabel({ subject: '영어', title: '[영어] 숙제' }), '[영어] 숙제');
  assert.equal(taskLabel({ subject: '수학', title: '18강' }), '[수학] 18강');
});

test('카톡 문구', () => {
  const w = sampleWeek();
  const msg = startMessage({ date: '2026-11-02', task: w.tasks.c, startedAt: '20:01', focusMin: 100, outputMin: 20 });
  assert.match(msg, /11\/2\(월\) 20:00~22:00 \[수학\] 개념의 신 18강/);
  const daily = dailyReport({ name: '민지', week: w, date: '2026-11-02', periods: ['학원전', '학원후'] });
  assert.match(daily, /민지 11\/2\(월\) 학습 마감 보고/);
  assert.match(daily, /공부 시작 시각: 17:02/);
  assert.match(daily, /🟡 \[부분 60%\]/);
  assert.match(daily, /절반 정리/);
  const parent = parentReport({ name: '민지', parentTitle: '어머님', teacherName: '승민T', week: w, comment: '' });
  assert.match(parent, /금주\(11\/2 ~ 11\/8\) 민지 학생/);
  assert.match(parent, /계획한 2일 중 1일/);
  assert.match(parent, /11\/5\(목\): 계획 없음/);
});

test('새 주 만들기: 복사와 이월', () => {
  const prev = sampleWeek();
  const next = buildWeek({ start: '2026-11-09', prev, copyTasks: true, carryUnfinished: true });
  assert.equal(next.title, '11/9 ~ 11/15 학습 플래너');
  assert.deepEqual(next.goals, ['과제 밀리지 않기']);
  assert.equal(next.days['2026-11-10'].target, '17:30'); // 같은 요일 시작 시각 유지
  assert.equal(next.days['2026-11-12'].target, '17:00'); // 없으면 기본값
  const tasks = Object.values(next.tasks);
  assert.equal(tasks.filter((t) => t.title.startsWith('[이월]')).length, 1); // 복사도 하므로 부분 완료만 이월
  assert.ok(tasks.every((t) => t.status === 'todo' && t.progress === 0));
  const carried = tasks.find((t) => t.title === '[이월] 22강 수강');
  assert.equal(carried.date, '2026-11-09');
  assert.match(carried.note, /지난주 60% 진행/);
  const copied = tasks.filter((t) => !t.title.startsWith('[이월]'));
  assert.equal(copied.length, 4);
  assert.ok(copied.some((t) => t.date === '2026-11-10' && t.title === '숙제'));
  // 복사 없이 이월만 하면 끝내지 못한 과제 전부(부분 1 + 진행 전 2)를 첫날로
  const carryOnly = Object.values(buildWeek({ start: '2026-11-09', prev, carryUnfinished: true }).tasks);
  assert.equal(carryOnly.length, 3);
  assert.ok(carryOnly.every((t) => t.date === '2026-11-09' && t.title.startsWith('[이월]')));
});

function legacyLink(obj) {
  const b64 = Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
  return `https://example.netlify.app/#plan=${b64}`;
}

test('예전 플래너 링크 가져오기', () => {
  const old = {
    plannerTitle: '11/2 ~ 11/8 학습 플래너',
    weeklyGoals: ['카톡 꼭 보내기'],
    coachPinCode: '0000',
    scheduleData: [
      { dayKey: 'mon', dateLabel: '11/2', targetStartTime: '17:00', startedAt: '17:05', isStarted: true, keywordMemo: '메모', tasks: [
        { id: 'm1', period: '학원전', timeRange: '[17:00~19:00]', subject: '영어', title: '[영어] 숙제', status: 'partial', progress: 70, actualNote: '70%까지' },
      ] },
      { dayKey: 'sun', dateLabel: '11/8', targetStartTime: '14:00', startedAt: null, isStarted: false, keywordMemo: '', tasks: [
        { id: 's1', period: '학원후', timeRange: '[21:00~23:00]', subject: '생명', title: '[생명] 기출', status: 'todo', progress: 0, actualNote: '' },
      ] },
    ],
  };
  const week = parseLegacyPlan(legacyLink(old), '2026-11-03');
  assert.equal(week.start, '2026-11-02');
  assert.equal(week.title, '11/2 ~ 11/8 학습 플래너');
  assert.deepEqual(week.goals, ['카톡 꼭 보내기']);
  assert.equal(week.days['2026-11-02'].startedAt, '17:05');
  assert.equal(week.days['2026-11-08'].target, '14:00');
  const tasks = Object.values(week.tasks);
  assert.equal(tasks.length, 2);
  const t = tasks.find((x) => x.subject === '영어');
  assert.equal(t.time, '17:00~19:00');
  assert.equal(t.progress, 70);
  assert.equal(t.note, '70%까지');
  assert.ok(!JSON.stringify(week).includes('0000')); // 예전 비밀번호는 가져오지 않음
  // 연말에 1월 날짜가 섞여도 가까운 해로 맞춤
  const y = parseLegacyPlan(legacyLink({ scheduleData: [{ dateLabel: '12/30', tasks: [] }, { dateLabel: '1/2', tasks: [] }] }), '2026-12-29');
  assert.equal(y.start, '2026-12-30');
  assert.ok(y.days['2027-01-02']);
  assert.throws(() => parseLegacyPlan('아무 글자', '2026-11-03'), /읽지 못했어요/);
});
