// 2단계 공부 타이머 (집중 → 인출)
// '끝나는 시각'을 기억하는 방식이라, 폰 화면을 끄거나 다른 앱에 다녀와도 시간이 정확하고
// 새로고침해도 이어집니다.
import { chime } from './audio.js';
import { notify } from './notify.js';

const KEY = 'planner:timer';

export const timer = {
  stage: 'focus', // 'focus' | 'output'
  running: false,
  endAt: 0,
  remaining: 100 * 60 * 1000,
  focusMin: 100,
  outputMin: 20,
  auto: true, // 집중이 끝나면 인출 타이머 자동 시작
  // 어떤 과제를 하는 중인지 (집중 완료 횟수를 그 날에 기록하려고 함께 저장)
  uid: '',
  weekId: '',
  date: '',
  taskId: '',
  taskLabel: '',
};

try {
  Object.assign(timer, JSON.parse(localStorage.getItem(KEY) || '{}'));
} catch { /* 저장된 값이 없으면 기본값 */ }

let handlers = { focusDone: () => {}, outputDone: () => {}, update: () => {} };
let ticker = null;

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(timer)); } catch { /* 무시 */ }
}

export function initTimer(h) {
  handlers = { ...handlers, ...h };
  if (timer.running) startTicker();
}

export function stageMs(stage = timer.stage) {
  return (stage === 'focus' ? timer.focusMin : timer.outputMin) * 60 * 1000;
}

export function remainingMs() {
  return timer.running ? Math.max(0, timer.endAt - Date.now()) : timer.remaining;
}

export function formatMs(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function startTicker() {
  clearInterval(ticker);
  ticker = setInterval(tick, 500);
  tick();
}

function tick() {
  if (!timer.running) return;
  if (Date.now() >= timer.endAt) {
    finishStage();
    return;
  }
  handlers.update();
}

function finishStage() {
  const finished = { ...timer };
  clearInterval(ticker);
  timer.running = false;
  chime();
  if (finished.stage === 'focus') {
    handlers.focusDone(finished);
    if (timer.outputMin > 0) {
      timer.stage = 'output';
      timer.remaining = stageMs('output');
      if (timer.auto) {
        timer.endAt = Date.now() + timer.remaining;
        timer.running = true;
        startTicker();
      }
      notify(`${timer.focusMin}분 집중 완료! 🎉`, timer.auto ? `이어서 ${timer.outputMin}분 인출 정리를 시작해요. 책을 덮고 백지에 정리해 보세요.` : `${timer.outputMin}분 인출 정리를 시작해 보세요.`);
    } else {
      resetState();
      notify('집중 완료! 🎉', '완료한 만큼 계획표에 체크해 주세요.');
    }
  } else {
    handlers.outputDone(finished);
    resetState();
    notify('공부 루틴 완주! 🎉', '완료한 범위를 계획표에 체크해 주세요.');
  }
  save();
  handlers.update('stage');
}

function resetState() {
  timer.stage = 'focus';
  timer.running = false;
  timer.remaining = stageMs('focus');
}

export function setDurations(focusMin, outputMin) {
  if (timer.focusMin === focusMin && timer.outputMin === outputMin) return;
  timer.focusMin = focusMin;
  timer.outputMin = outputMin;
  if (!timer.running) timer.remaining = stageMs();
  save();
}

// 과제를 골라 처음부터 시작
export function startFor(info) {
  Object.assign(timer, info);
  timer.stage = 'focus';
  timer.remaining = stageMs('focus');
  timer.endAt = Date.now() + timer.remaining;
  timer.running = true;
  save();
  startTicker();
  handlers.update('stage');
}

export function toggle() {
  if (timer.running) {
    timer.remaining = remainingMs();
    timer.running = false;
    clearInterval(ticker);
  } else {
    timer.endAt = Date.now() + timer.remaining;
    timer.running = true;
    startTicker();
  }
  save();
  handlers.update('stage');
}

export function reset() {
  clearInterval(ticker);
  resetState();
  save();
  handlers.update('stage');
}

export function setStage(stage) {
  clearInterval(ticker);
  timer.running = false;
  timer.stage = stage;
  timer.remaining = stageMs(stage);
  save();
  handlers.update('stage');
}

export function setAuto(on) {
  timer.auto = on;
  save();
}

export function setTask(info) {
  Object.assign(timer, info);
  save();
}
