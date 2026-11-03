// Firestore 보안 규칙 자동 테스트
// 실행: npx -y firebase-tools@13.29.1 emulators:exec --project demo-rules-test --only firestore "npm run test:rules"
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs,
} from 'firebase/firestore';

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => {
  await env.cleanup();
});

const week = {
  start: '2026-11-02',
  title: '11/2 ~ 11/8 학습 플래너',
  goals: ['목표'],
  days: { '2026-11-02': { target: '17:00', startedAt: null, memo: '', focus: 0 } },
  tasks: { t1: { date: '2026-11-02', period: '학원전', time: '17:00~19:00', subject: '수학', title: '숙제', status: 'todo', progress: 0, note: '', order: 1, by: 'teacher' } },
};

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins/teacher'), { name: '승민T' });
    await setDoc(doc(db, 'config/app'), { appTitle: '테스트' });
    await setDoc(doc(db, 'users/stuA'), { name: '김A', status: 'approved' });
    await setDoc(doc(db, 'users/stuB'), { name: '이B', status: 'approved' });
    await setDoc(doc(db, 'users/wait'), { name: '박대기', status: 'pending' });
    await setDoc(doc(db, 'users/stuA/weeks/2026-11-02'), week);
    await setDoc(doc(db, 'users/stuB/weeks/2026-11-02'), week);
    await setDoc(doc(db, 'users/wait/weeks/2026-11-02'), week);
    await setDoc(doc(db, 'notes/stuA'), { text: '강사 비공개 메모' });
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

test('로그인하지 않으면 학생 정보와 계획표를 볼 수 없다 (앱 설정만 가능)', async () => {
  await assertSucceeds(getDoc(doc(anon(), 'config/app')));
  await assertFails(getDoc(doc(anon(), 'users/stuA')));
  await assertFails(getDoc(doc(anon(), 'users/stuA/weeks/2026-11-02')));
});

test('학생은 자기 계획표만 볼 수 있다', async () => {
  await assertSucceeds(getDoc(doc(as('stuA'), 'users/stuA')));
  await assertSucceeds(getDoc(doc(as('stuA'), 'users/stuA/weeks/2026-11-02')));
  await assertFails(getDoc(doc(as('stuA'), 'users/stuB')));
  await assertFails(getDoc(doc(as('stuA'), 'users/stuB/weeks/2026-11-02')));
  await assertFails(getDocs(collection(as('stuA'), 'users')));
});

test('승인 대기 학생은 계획표를 볼 수 없다', async () => {
  await assertSucceeds(getDoc(doc(as('wait'), 'users/wait')));
  await assertFails(getDoc(doc(as('wait'), 'users/wait/weeks/2026-11-02')));
  await assertFails(updateDoc(doc(as('wait'), 'users/wait/weeks/2026-11-02'), { 'tasks.t1.status': 'done' }));
});

test('강사 메모는 학생이 볼 수 없다', async () => {
  await assertFails(getDoc(doc(as('stuA'), 'notes/stuA')));
  await assertSucceeds(getDoc(doc(as('teacher'), 'notes/stuA')));
  await assertSucceeds(setDoc(doc(as('teacher'), 'notes/stuB'), { text: '메모' }));
});

test('학생은 과제 진행 상황과 요일 기록을 바꿀 수 있다', async () => {
  const ref = doc(as('stuA'), 'users/stuA/weeks/2026-11-02');
  await assertSucceeds(updateDoc(ref, {
    'tasks.t1.status': 'partial',
    'tasks.t1.progress': 50,
    'tasks.t1.note': '절반',
    'days.2026-11-02.startedAt': '17:03',
    updatedAt: 1,
    studentAt: 1,
  }));
  // 학생이 직접 과제 추가
  await assertSucceeds(updateDoc(ref, {
    'tasks.s1': { date: '2026-11-02', period: '학원후', time: '', subject: '영어', title: '단어', status: 'todo', progress: 0, note: '', order: 2, by: 'student' },
  }));
});

test('학생은 제목·주간 목표를 바꾸거나 계획표를 지울 수 없다', async () => {
  const ref = doc(as('stuA'), 'users/stuA/weeks/2026-11-02');
  await assertFails(updateDoc(ref, { title: '바꿈' }));
  await assertFails(updateDoc(ref, { goals: [] }));
  await assertFails(deleteDoc(ref));
  await assertFails(setDoc(doc(as('stuA'), 'users/stuA/weeks/2026-11-09'), week));
  // 다른 학생 계획표 수정 불가
  await assertFails(updateDoc(doc(as('stuA'), 'users/stuB/weeks/2026-11-02'), { 'tasks.t1.status': 'done' }));
  // 한 주(7일)를 벗어난 날짜 기록 불가
  const days = {};
  ['02', '03', '04', '05', '06', '07', '08', '09'].forEach((d) => { days[`2026-11-${d}`] = { target: '17:00' }; });
  await assertFails(updateDoc(ref, { days }));
});

test('학생은 승인 상태와 설정을 바꿀 수 없다', async () => {
  await assertFails(updateDoc(doc(as('stuA'), 'users/stuA'), { status: 'approved', focusMin: 10 }));
  await assertFails(updateDoc(doc(as('wait'), 'users/wait'), { status: 'approved' }));
});

test('새 학생은 승인 대기로만 가입할 수 있다', async () => {
  const base = { name: '최신입', provider: 'google', email: 'a@b.c', createdAt: 1 };
  await assertFails(setDoc(doc(as('newbie'), 'users/newbie'), { ...base, status: 'approved' }));
  await assertFails(setDoc(doc(as('newbie'), 'users/other'), { ...base, status: 'pending' }));
  await assertFails(setDoc(doc(as('newbie'), 'users/newbie'), { ...base, status: 'pending', focusMin: 1 }));
  await assertSucceeds(setDoc(doc(as('newbie'), 'users/newbie'), { ...base, status: 'pending' }));
});

test('강사는 모든 학생을 관리할 수 있다', async () => {
  const t = as('teacher');
  await assertSucceeds(getDocs(collection(t, 'users')));
  await assertSucceeds(updateDoc(doc(t, 'users/wait'), { status: 'approved' }));
  await assertSucceeds(setDoc(doc(t, 'users/stuA/weeks/2026-11-09'), week));
  await assertSucceeds(updateDoc(doc(t, 'users/stuA/weeks/2026-11-02'), { title: '새 제목', goals: ['a'] }));
  await assertSucceeds(deleteDoc(doc(t, 'users/stuB/weeks/2026-11-02')));
  await assertSucceeds(setDoc(doc(t, 'config/app'), { appTitle: '바꿈' }));
  await assertFails(setDoc(doc(as('stuA'), 'config/app'), { appTitle: '해킹' }));
});

test('관리자 목록은 앱에서 만들 수 없다', async () => {
  await assertFails(setDoc(doc(as('stuA'), 'admins/stuA'), { name: '나' }));
  await assertFails(setDoc(doc(as('teacher'), 'admins/stuA'), { name: '나' }));
  await assertSucceeds(getDoc(doc(as('teacher'), 'admins/teacher')));
  await assertFails(getDoc(doc(as('stuA'), 'admins/teacher')));
});

test('폰 알림 주소는 본인 것만 저장하고, 강사는 볼 수 있다', async () => {
  await assertSucceeds(setDoc(doc(as('stuA'), 'push/stuA'), { tokens: ['t1'], updatedAt: 1 }));
  await assertSucceeds(updateDoc(doc(as('stuA'), 'push/stuA'), { timerEndAt: 123, timerStage: 'focus', timerLabel: '수학', updatedAt: 2 }));
  await assertFails(setDoc(doc(as('stuA'), 'push/stuB'), { tokens: ['t2'] }));
  await assertFails(getDoc(doc(as('stuB'), 'push/stuA')));
  await assertSucceeds(getDoc(doc(as('teacher'), 'push/stuA')));
  await assertSucceeds(getDocs(collection(as('teacher'), 'push')));
  await assertFails(getDocs(collection(as('stuA'), 'push')));
  // 정해진 칸 말고 다른 값은 못 넣음, 주소는 10개까지
  await assertFails(setDoc(doc(as('stuA'), 'push/stuA'), { role: 'teacher' }, { merge: true }));
  await assertFails(setDoc(doc(as('stuA'), 'push/stuA'), { tokens: Array.from({ length: 11 }, (_, i) => `t${i}`) }, { merge: true }));
  await assertFails(setDoc(doc(anon(), 'push/stuA'), { tokens: ['x'] }));
});
