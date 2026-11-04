// 주간 계산·보고 문구·예전 데이터 가져오기 검사 (npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, weekDates, mondayOf, weekContaining, pickInitialWeek, suggestNextStart, timeStartMinutes,
  tasksOn, groupByPeriod, rateOf, dayRate, weekRate, isLate, buildWeek, parseLegacyPlan, dailyReport,
  parentReport, startMessage, normalizeProgress, statusFromProgress, taskLabel, defaultWeekTitle,
  unfinishedTasks, carriedCopy, carryTarget, reasonText, pendingCloseDate,
  missingSoon, numberToken, bumpTitle, seriesOffsets, freshTaskCopies, feedbackList, unseenFeedbackDates,
  ddayText, eventList, upcomingEvents, ddayStrip, deadlineAlerts,
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

test('다 못 끝낸 과제 이월과 못 한 이유', () => {
  const w = sampleWeek();
  assert.deepEqual(unfinishedTasks(w, '2026-11-02').map((t) => t.id), ['c', 'b']);
  const copy = carriedCopy({ ...w.tasks.b, id: 'b' });
  assert.equal(copy.title, '[이월] 22강 수강');
  assert.match(copy.note, /11\/2 60% 진행 · 절반 정리/);
  assert.equal(copy.status, 'todo');
  assert.equal(carriedCopy({ ...copy, title: '[이월] 22강 수강', status: 'todo', date: '2026-11-03' }).title, '[이월] 22강 수강');
  assert.equal(carryTarget('2026-11-03', '2026-11-03'), '2026-11-04');
  assert.equal(carryTarget('2026-11-02', '2026-11-03'), '2026-11-03');
  assert.equal(reasonText(['시간 부족', '컨디션'], ' 수행평가 준비 '), '시간 부족 · 컨디션 · 수행평가 준비');
  assert.equal(reasonText([], ''), '');
  // 어제 정리 안 한 미완료가 있으면 그 날짜
  assert.equal(pendingCloseDate(w, '2026-11-03'), '2026-11-02');
  // 이월했거나 마감했으면 없음
  w.tasks.b.carriedTo = '2026-11-03';
  w.tasks.c.carriedTo = '2026-11-03';
  assert.equal(unfinishedTasks(w, '2026-11-02').length, 0);
  assert.equal(pendingCloseDate(w, '2026-11-03'), '');
  // 마감 보고에 이월 표시와 이유
  w.days['2026-11-02'].reason = '시간 부족';
  const daily = dailyReport({ name: '민지', week: w, date: '2026-11-02', periods: ['학원전', '학원후'] });
  assert.match(daily, /↪️ 11\/3\(화\)로 이월/);
  assert.match(daily, /다 못 한 이유\]\n시간 부족/);
  const parent = parentReport({ name: '민지', parentTitle: '어머님', teacherName: '승민T', week: w, comment: '' });
  assert.match(parent, /못 한 이유: 시간 부족/);
  // 새 주 만들 때 이미 넘긴 과제는 다시 이월하지 않음
  const next = buildWeek({ start: '2026-11-09', prev: w, carryUnfinished: true });
  assert.equal(Object.values(next.tasks).length, 1); // d만
});

test('다음 주 계획표가 곧 비는지', () => {
  // 11/2(월)~11/8(일) 계획만 있음
  assert.equal(missingSoon(['2026-11-02'], '2026-11-04'), ''); // 수: 목~토 있음
  assert.equal(missingSoon(['2026-11-02'], '2026-11-06'), '2026-11-09'); // 금: 월요일이 빔
  assert.equal(missingSoon(['2026-11-02', '2026-11-09'], '2026-11-06'), '');
  assert.equal(missingSoon([], '2026-11-06'), '2026-11-07');
});

test('강·Day 번호 올리기', () => {
  assert.equal(bumpTitle('영단어 Day 12', 7), '영단어 Day 19');
  assert.equal(bumpTitle('개념의 신 19강 수강 + 정리', 1), '개념의 신 20강 수강 + 정리');
  assert.equal(bumpTitle('19~20강', 2), '21~22강');
  assert.equal(bumpTitle('수학 3회 모의고사', 1), '수학 4회 모의고사');
  assert.equal(bumpTitle('Unit 4 단어', 1), 'Unit 5 단어');
  assert.equal(bumpTitle('쎈 p.30~35', 3), '쎈 p.30~35'); // 쪽수는 그대로
  assert.equal(bumpTitle('오답노트', 3), '오답노트');
  assert.equal(numberToken('오답노트'), null);
  const tasks = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ id: `d${i}`, subject: '영어', title: `영단어 Day ${12 + i}` }));
  tasks.push({ id: 'k', subject: '수학', title: '개념 3강' }, { id: 'c', subject: '영어', title: '[이월] 영단어 Day 11' });
  const off = seriesOffsets(tasks);
  assert.equal(off.get('d0'), 7);
  assert.equal(off.get('k'), 1);
  assert.equal(off.has('c'), false); // 이월 과제는 번호 계산에서 빼요
});

test('새 주 만들기: 번호 자동 올리기, 학생이 이월한 과제는 복사 안 함', () => {
  const prev = {
    start: '2026-11-02',
    days: {},
    tasks: {
      a: { date: '2026-11-02', period: '학원후', subject: '영어', title: '영단어 Day 12', status: 'done', progress: 100 },
      b: { date: '2026-11-03', period: '학원후', subject: '영어', title: '영단어 Day 13', status: 'done', progress: 100 },
      c: { date: '2026-11-04', period: '학원후', subject: '수학', title: '오답 정리', status: 'todo', progress: 0 },
      d: { date: '2026-11-05', period: '학원후', subject: '영어', title: '[이월] 영단어 Day 13', status: 'todo', progress: 0, by: 'student', from: '2026-11-03' },
    },
  };
  const w = buildWeek({ start: '2026-11-09', prev, copyTasks: true, bumpNumbers: true });
  const titles = Object.values(w.tasks).map((t) => `${t.date} ${t.title}`).sort();
  assert.deepEqual(titles, ['2026-11-09 영단어 Day 14', '2026-11-10 영단어 Day 15', '2026-11-11 오답 정리']);
  assert.equal(w.bumped, 2);
  const plain = buildWeek({ start: '2026-11-09', prev, copyTasks: true });
  assert.equal(plain.bumped, undefined);
  assert.ok(Object.values(plain.tasks).some((t) => t.title === '영단어 Day 12'));
});

test('다른 학생에게 복사할 과제: 기록은 빼고 새로', () => {
  const week = {
    tasks: {
      a: { date: '2026-11-02', period: '학원후', subject: '영어', title: '단어', status: 'done', progress: 100, note: '다 함', fb: '좋아', fbAt: 5, by: 'teacher' },
      b: { date: '2026-11-03', period: '학원후', subject: '영어', title: '[이월] 단어', status: 'todo', progress: 0, by: 'student', from: '2026-11-02' },
    },
  };
  const out = Object.values(freshTaskCopies(week, 100));
  assert.equal(out.length, 1);
  assert.equal(out[0].status, 'todo');
  assert.equal(out[0].note, '');
  assert.equal(out[0].fb, undefined);
  assert.equal(out[0].by, 'teacher');
});

test('선생님 피드백: 최신순, 안 본 날짜', () => {
  const week = {
    days: { '2026-11-02': { fb: '잘했어', fbAt: 300 }, '2026-11-03': { fb: '', fbAt: 0 } },
    tasks: {
      a: { date: '2026-11-03', title: '단어', fb: '스펠링 주의', fbAt: 500 },
      b: { date: '2026-11-03', title: '수학', fb: '', fbAt: 0 },
    },
  };
  const list = feedbackList(week);
  assert.deepEqual(list.map((f) => f.text), ['스펠링 주의', '잘했어']);
  assert.equal(list[0].task.title, '단어');
  assert.deepEqual(unseenFeedbackDates(week, {}), ['2026-11-02', '2026-11-03']);
  assert.deepEqual(unseenFeedbackDates(week, { '2026-11-02': 300 }), ['2026-11-03']);
  assert.deepEqual(unseenFeedbackDates(week, { '2026-11-02': 300, '2026-11-03': 500 }), []);
});

test('시험 D-day·수행평가', () => {
  const today = '2026-11-04';
  assert.equal(ddayText('2026-11-10', today), 'D-6');
  assert.equal(ddayText(today, today), 'D-DAY');
  assert.equal(ddayText('2026-11-01', today), 'D+3');
  const items = {
    x: { kind: 'exam', title: '기말고사', date: '2026-12-08' },
    y: { kind: 'perf', title: '화학 보고서', date: '2026-11-05', done: false },
    z: { kind: 'perf', title: '국어 발표', date: '2026-11-07', done: true },
    w: { kind: 'perf', title: '영어 에세이', date: '2026-11-25' },
    old: { kind: 'perf', title: '지난 것', date: '2026-10-30' },
    bad: { kind: 'perf', title: '', date: '2026-11-06' },
  };
  assert.deepEqual(eventList(items).map((e) => e.id), ['old', 'y', 'z', 'w', 'x']);
  assert.deepEqual(upcomingEvents(items, today).map((e) => e.id), ['y', 'w', 'x']);
  // 띠: 가장 가까운 시험 + 2주 안 수행평가 (끝낸 것 제외)
  assert.deepEqual(ddayStrip(items, today).map((e) => e.id), ['x', 'y']);
  // 마감 알림: D-3, D-1, 당일만
  assert.deepEqual(deadlineAlerts(items, today).map((e) => e.id), ['y']);
  assert.deepEqual(deadlineAlerts(items, '2026-11-22').map((e) => e.id), ['w']);
});
