// 앱 전체 데이터와 Firebase 실시간 연결을 관리합니다.
// Firebase에서 데이터가 바뀌면 자동으로 화면을 다시 그립니다.
import { onAuthStateChanged } from 'firebase/auth';
import { doc, collection, onSnapshot, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import {
  DEFAULT_SETTINGS, DEFAULT_SUBJECTS, DEFAULT_GUIDE, todayKey, pickInitialWeek, weekContaining, weekDates,
} from './lib/week.js';

export function loadPref(key, fallback) {
  try {
    const v = localStorage.getItem('planner:' + key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function savePref(key, value) {
  try { localStorage.setItem('planner:' + key, JSON.stringify(value)); } catch { /* 저장 못 해도 괜찮음 */ }
}

export const S = {
  authReady: false,
  user: null,
  isTeacher: false,
  profile: undefined, // undefined = 불러오는 중, null = 가입 정보 없음
  role: '', // 'teacher' | 'student' | 'pending' | 'new'
  config: null,
  configLoaded: false,
  week: undefined, // 학생: 지금 보고 있는 주 (undefined = 불러오는 중, null = 없음)
  weekId: '',
  t: {
    users: [],
    usersLoaded: false,
    current: {}, // 현황판: 학생별 이번 주 계획 { uid: weekDoc | null }
    week: undefined, // 편집 중인 학생의 주
    weekId: '',
    note: '',
    noteLoaded: false,
    push: {}, // 설정 탭: uid → 알림 기기 정보
    pushStatus: null,
  },
  myPush: null,
  ui: {
    tab: '', // 강사: dash | students | settings
    sview: 'today', // 학생 화면 안쪽 탭: today | table | stats
    statsMode: 'week', // 기록: week | month
    statsMonth: '', // 기록에서 보는 달 'YYYY-MM'
    date: '', // 학생이 보고 있는 날짜
    weekId: '', // 학생이 직접 고른 주 (비어 있으면 이번 주)
    openTask: '',
    modal: null,
    loginMode: 'login',
    busy: false,
    // 강사
    sel: loadPref('sel', ''), // 선택한 학생 uid
    sub: loadPref('sub', 'plan'), // plan | settings | report
    tWeekId: '',
    tDate: '',
    tLayout: loadPref('tLayout', 'day'), // 계획표 편집: day(요일별) | week(7일 한 화면)
    creatingWeek: false,
  },
};

// ---------- 화면 다시 그리기 예약 ----------
let renderFn = () => {};
let scheduled = false;
export function onRender(fn) {
  renderFn = fn;
}
export function refresh() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    renderFn();
  }, 0);
}

// ---------- 실시간 연결 관리 ----------
const subs = new Map();

function listen(key, ref, onData) {
  stop(key);
  const unsub = onSnapshot(
    ref,
    (snap) => {
      onData(snap);
      refresh();
    },
    (err) => {
      console.warn(`[${key}]`, err.code || err.message);
      onData(null);
      refresh();
    },
  );
  subs.set(key, unsub);
}

function stop(key) {
  const unsub = subs.get(key);
  if (unsub) unsub();
  subs.delete(key);
}

function stopPrefix(prefix) {
  [...subs.keys()].filter((k) => k.startsWith(prefix)).forEach(stop);
}

const docData = (snap) => (snap && snap.exists() ? { id: snap.id, ...snap.data() } : null);

// 앱 이름·과목·안내 (로그인 전에도 필요)
listen('config', doc(db, 'config', 'app'), (snap) => {
  S.config = snap && snap.exists() ? snap.data() : null;
  S.configLoaded = true;
});

// ---------- 로그인 상태 ----------
onAuthStateChanged(auth, async (user) => {
  stopPrefix('p:');
  setRole('');
  S.user = user;
  S.isTeacher = false;
  S.profile = user ? undefined : null;
  S.authReady = true;
  refresh();
  if (!user) return;

  try {
    const adminDoc = await getDoc(doc(db, 'admins', user.uid));
    if (auth.currentUser?.uid !== user.uid) return; // 그사이 다른 계정으로 바뀐 경우
    S.isTeacher = adminDoc.exists();
  } catch {
    S.isTeacher = false;
  }

  listen('p:profile', doc(db, 'users', user.uid), (snap) => {
    S.profile = snap ? docData(snap) : null;
    updateRole();
  });
  if (S.isTeacher) updateRole();
});

function updateRole() {
  if (S.isTeacher) setRole('teacher');
  else if (S.profile === undefined) setRole('');
  else if (!S.profile) setRole('new');
  else setRole(S.profile.status === 'approved' ? 'student' : 'pending');
}

function setRole(next) {
  if (next === S.role) return;
  S.role = next;
  stopPrefix('r:');
  stopPrefix('d:');
  stopPrefix('e:');
  S.week = undefined;
  S.weekId = '';
  stopPrefix('s:');
  S.t = { users: [], usersLoaded: false, current: {}, week: undefined, weekId: '', note: '', noteLoaded: false, push: {}, pushStatus: null };
  S.ui.tab = next === 'teacher' ? loadPref('tTab', 'dash') : '';
  S.ui.sview = 'today';
  S.ui.date = '';
  S.ui.weekId = '';
  S.ui.modal = null;
  if (next === 'teacher') {
    listen('r:users', collection(db, 'users'), (snap) => {
      S.t.users = (snap ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : [])
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko'));
      S.t.usersLoaded = true;
    });
  }
  refresh();
}

// ---------- 화면을 그리기 전에 필요한 실시간 연결 확인 ----------
export function ensureWatches() {
  if (S.role === 'student') watchStudentWeek();
  if (S.role === 'teacher') {
    if (S.ui.tab === 'dash') watchDashboard();
    else stopPrefix('d:');
    if (S.ui.tab === 'students' && S.ui.sel) watchEditor();
    else {
      stopPrefix('e:');
      S.t.weekId = '';
    }
    // 설정 탭: 폰 알림을 켠 기기 수와 알림 서버 상태
    if (S.ui.tab === 'settings') {
      if (!subs.has('s:push')) {
        listen('s:push', collection(db, 'push'), (snap) => {
          S.t.push = snap ? Object.fromEntries(snap.docs.map((d) => [d.id, d.data()])) : {};
        });
        listen('s:pushStatus', doc(db, 'config', 'push_status'), (snap) => {
          S.t.pushStatus = snap && snap.exists() ? snap.data() : null;
        });
      }
    } else stopPrefix('s:');
  }
  // 학생: 내 알림 설정 (알림 팝업을 열었을 때만)
  if (S.role === 'student') {
    if (S.ui.modal?.type === 'pushSettings') {
      if (!subs.has('p:push')) {
        listen('p:push', doc(db, 'push', S.user.uid), (snap) => {
          S.myPush = snap && snap.exists() ? snap.data() : null;
        });
      }
    } else stop('p:push');
  }
}

function watchStudentWeek() {
  const ids = S.profile?.weekIds || [];
  const today = todayKey();
  const wanted = S.ui.weekId && ids.includes(S.ui.weekId) ? S.ui.weekId : pickInitialWeek(ids, today);
  if (wanted === S.weekId && (subs.has('r:week') || (!wanted && S.week === null))) return;
  S.weekId = wanted;
  S.ui.date = '';
  if (!wanted) {
    stop('r:week');
    S.week = null;
    return;
  }
  S.week = undefined;
  listen('r:week', doc(db, 'users', S.user.uid, 'weeks', wanted), (snap) => {
    S.week = snap ? docData(snap) : null;
  });
}

// 현황판: 승인된 학생마다 오늘이 든 주의 계획표를 실시간으로 봄
function watchDashboard() {
  const today = todayKey();
  const wanted = new Map();
  approvedStudents().forEach((u) => {
    const wid = weekContaining(u.weekIds || [], today);
    if (wid) wanted.set(`d:${u.id}:${wid}`, { uid: u.id, wid });
    else S.t.current[u.id] = null;
  });
  [...subs.keys()].filter((k) => k.startsWith('d:') && !wanted.has(k)).forEach(stop);
  wanted.forEach(({ uid, wid }, key) => {
    if (subs.has(key)) return;
    S.t.current[uid] = undefined;
    listen(key, doc(db, 'users', uid, 'weeks', wid), (snap) => {
      S.t.current[uid] = snap ? docData(snap) : null;
    });
  });
}

// 학생 관리: 고른 학생의 주간 계획표와 강사 메모
function watchEditor() {
  const u = S.t.users.find((x) => x.id === S.ui.sel);
  if (!u) return;
  const ids = u.weekIds || [];
  if (!S.ui.tWeekId || !ids.includes(S.ui.tWeekId)) S.ui.tWeekId = pickInitialWeek(ids, todayKey());
  const wid = S.ui.tWeekId;
  const key = `e:week:${u.id}:${wid}`;
  if (!subs.has(key)) {
    stopPrefix('e:week:');
    S.t.weekId = wid;
    S.t.week = wid ? undefined : null;
    if (wid) {
      listen(key, doc(db, 'users', u.id, 'weeks', wid), (snap) => {
        S.t.week = snap ? docData(snap) : null;
      });
    }
  }
  const noteKey = `e:note:${u.id}`;
  if (!subs.has(noteKey)) {
    stopPrefix('e:note:');
    S.t.note = '';
    S.t.noteLoaded = false;
    listen(noteKey, doc(db, 'notes', u.id), (snap) => {
      S.t.note = snap && snap.exists() ? snap.data().text || '' : '';
      S.t.noteLoaded = true;
    });
  }
}

// ---------- 자주 쓰는 계산 ----------
export function approvedStudents() {
  return S.t.users.filter((u) => u.status === 'approved');
}

export function pendingStudents() {
  return S.t.users.filter((u) => u.status === 'pending');
}

export function settingsOf(user) {
  const s = { ...DEFAULT_SETTINGS };
  if (!user) return s;
  if (Array.isArray(user.periods) && user.periods.length) s.periods = user.periods;
  if (Number(user.focusMin) > 0) s.focusMin = Number(user.focusMin);
  if (Number(user.outputMin) >= 0 && user.outputMin !== undefined && user.outputMin !== '') s.outputMin = Number(user.outputMin);
  if (user.defaultTarget) s.defaultTarget = user.defaultTarget;
  if (user.parentTitle) s.parentTitle = user.parentTitle;
  return s;
}

export function teacherName() {
  return S.config?.teacherName || '승민T';
}

export function appTitle() {
  return S.config?.appTitle || '승민T 학습 플래너';
}

export function subjects() {
  const list = S.config?.subjects;
  return Array.isArray(list) && list.length ? list : DEFAULT_SUBJECTS;
}

export function guideSteps() {
  const list = S.config?.guide;
  return Array.isArray(list) && list.length ? list : DEFAULT_GUIDE;
}

// 학생 화면에서 보고 있는 날짜 (주가 바뀌면 오늘 또는 그 주 첫날)
export function currentDate(week, selected) {
  if (!week) return '';
  const dates = weekDates(week.start);
  if (selected && dates.includes(selected)) return selected;
  const today = todayKey();
  return dates.includes(today) ? today : dates[0];
}
