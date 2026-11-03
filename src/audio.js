// 알림음: 음원 파일 없이 브라우저에서 소리를 직접 만들어 재생합니다.
let ctx = null;

// 사용자가 버튼을 누를 때 한 번 불러 두면, 나중에 타이머가 끝날 때 소리가 날 수 있어요.
export function unlockAudio() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch { /* 지원 안 하는 브라우저 */ }
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  return ctx;
}

function tones(freqs, gap, length, volume, type = 'sine') {
  const c = unlockAudio();
  if (!c) return;
  freqs.forEach((f, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    const t = c.currentTime + i * gap;
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    o.connect(g);
    g.connect(c.destination);
    o.start(t);
    o.stop(t + length + 0.05);
  });
}

// 타이머가 끝났을 때, 과제를 완료했을 때
export function chime() {
  tones([880, 1320], 0.25, 0.6, 0.3);
}

// 공부 시작 시간 알림
export function alarmSound() {
  tones([523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5], 0.16, 0.4, 0.25, 'triangle');
}
