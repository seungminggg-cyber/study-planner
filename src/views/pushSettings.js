// 폰 알림 설정 화면 (선생님 [설정] 탭 카드 + 학생 🔔 팝업)
import { S, refresh, approvedStudents } from '../store.js';
import { html } from '../lib/html.js';
import { toast } from '../lib/util.js';
import { saveConfig } from '../data.js';
import {
  pushConfig, checkSupport, needsInstallFirst, localToken, enablePush, disablePush, pushErrorMessage, requestTestPush,
} from '../push.js';
import { timer } from '../timer.js';

let supported = null;
checkSupport().then((ok) => {
  supported = ok;
  refresh();
});

function ago(ts) {
  if (!ts) return '';
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}시간 전` : `${Math.floor(h / 24)}일 전`;
}

function toggleRow(key, label, desc, cfg, disabled = false) {
  return html`
    <label class="flex items-start gap-3 rounded-xl border border-planner-border/25 bg-planner-surface p-3 cursor-pointer ${disabled ? 'opacity-50' : ''}">
      <input type="checkbox" class="mt-0.5 w-5 h-5 accent-green-700 shrink-0" data-change="push-toggle" data-key="${key}" ${cfg[key] ? 'checked' : ''} ${disabled ? 'disabled' : ''} />
      <span>
        <span class="block text-sm font-bold text-slate-900">${label}</span>
        <span class="block text-xs text-slate-500">${desc}</span>
      </span>
    </label>`;
}

// 이 기기에서 알림 켜기/끄기 버튼 (선생님·학생 공통)
function deviceBox(who) {
  const on = Boolean(localToken());
  if (supported === null) return html`<p class="text-sm text-slate-500"><i class="fa-solid fa-spinner fa-spin mr-1"></i>이 기기에서 알림을 받을 수 있는지 확인 중...</p>`;
  if (needsInstallFirst()) {
    return html`
      <div class="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 space-y-1">
        <p class="font-bold">아이폰은 먼저 홈 화면에 앱을 설치해야 알림을 받을 수 있어요.</p>
        <p>사파리 아래쪽 <i class="fa-solid fa-arrow-up-from-bracket"></i> 공유 → '홈 화면에 추가' → 홈 화면의 앱 아이콘으로 열고 여기서 다시 켜 주세요.</p>
      </div>`;
  }
  if (!supported) {
    return html`<p class="text-sm rounded-xl bg-slate-100 p-3 text-slate-600">이 브라우저에서는 알림을 받을 수 없어요. 안드로이드는 크롬, 컴퓨터는 크롬·엣지에서 열어 주세요.</p>`;
  }
  return html`
    <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border ${on ? 'border-emerald-300 bg-emerald-50' : 'border-planner-border/30 bg-planner-surface'} p-3">
      <p class="text-sm font-bold ${on ? 'text-emerald-800' : 'text-slate-700'}">
        ${on ? html`<i class="fa-solid fa-bell mr-1"></i>이 기기에서 알림을 받고 있어요` : html`<i class="fa-regular fa-bell-slash mr-1"></i>이 기기는 알림이 꺼져 있어요`}
      </p>
      ${on
        ? html`<span class="flex gap-1.5">
            <button type="button" class="btn btn-primary btn-sm" data-action="push-test"><i class="fa-solid fa-paper-plane"></i>테스트 알림 보내기</button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="push-disable">끄기</button>
          </span>`
        : html`<button type="button" class="btn btn-primary btn-sm" data-action="push-enable" ${S.ui.busy ? 'disabled' : ''}><i class="fa-solid fa-bell"></i>${who === 'teacher' ? '이 기기에서 선생님 알림 받기' : '이 폰에서 알림 켜기'}</button>`}
    </div>`;
}

function serverStatus() {
  const st = S.t.pushStatus;
  if (!st?.lastRun) {
    return html`<p class="text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2"><i class="fa-solid fa-triangle-exclamation mr-1"></i>알림 서버가 아직 한 번도 실행되지 않았어요. 서버 설정을 마쳐야 알림이 나가요.</p>`;
  }
  // Firebase는 5분마다, GitHub(예비)는 GitHub 사정에 따라 수십 분마다 돌아요
  const firebase = st.runner === 'firebase';
  const where = firebase ? 'Firebase · 5분마다' : 'GitHub 예비 서버 · 수십 분마다';
  const stale = Date.now() - st.lastRun > (firebase ? 20 : 70) * 60000;
  if (st.note && st.note.startsWith('오류')) {
    return html`<p class="text-xs rounded-lg bg-rose-50 border border-rose-200 text-rose-800 px-3 py-2"><i class="fa-solid fa-circle-exclamation mr-1"></i>알림 서버 ${ago(st.lastRun)} 실행 중 ${st.note}</p>`;
  }
  return html`
    <p class="text-xs rounded-lg px-3 py-2 ${stale ? 'bg-amber-50 border border-amber-200 text-amber-900' : 'bg-planner-light/60 text-planner-dark'}">
      <i class="fa-solid ${stale ? 'fa-triangle-exclamation' : 'fa-circle-check'} mr-1"></i>
      알림 서버 마지막 확인: ${ago(st.lastRun)} (${where})${stale ? ' — 새벽 2~6시는 쉬어요' : ''}
    </p>`;
}

// ---------- 선생님 [설정] 탭 카드 ----------
export function pushCard() {
  const cfg = pushConfig(S.config);
  const students = approvedStudents();
  const withDevice = students.filter((u) => (S.t.push?.[u.id]?.tokens || []).length);
  return html`
    <section class="card space-y-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 class="card-title"><i class="fa-solid fa-mobile-screen-button"></i>폰 알림 (앱이 꺼져 있어도)</h3>
          <p class="card-desc">5분마다 확인해서 보내요. 그래서 몇 분 늦게 도착할 수 있어요.</p>
        </div>
        <label class="flex items-center gap-2 cursor-pointer select-none">
          <span class="text-sm font-black ${cfg.on ? 'text-planner-green' : 'text-slate-500'}">${cfg.on ? '켜짐' : '꺼짐'}</span>
          <input type="checkbox" class="sr-only peer" data-change="push-toggle" data-key="on" ${cfg.on ? 'checked' : ''} aria-label="폰 알림 전체 켜기" />
          <span class="relative w-12 h-7 rounded-full bg-slate-300 peer-checked:bg-planner-green transition after:absolute after:top-1 after:left-1 after:w-5 after:h-5 after:rounded-full after:bg-planner-surface after:shadow after:transition peer-checked:after:translate-x-5"></span>
        </label>
      </div>

      ${serverStatus()}

      <div class="grid lg:grid-cols-2 gap-4">
        <div class="space-y-2">
          <p class="label !mb-0">학생에게 보내는 알림</p>
          ${toggleRow('start', '⏰ 공부 시작 시간 알림', '그 날 목표 시작 시각이 되었는데 아직 시작 전이면', cfg, !cfg.on)}
          ${toggleRow('late', '⏳ 30분 지나도 시작 안 하면 한 번 더', '목표 시각에서 30분이 지났는데 아직 시작 전이면', cfg, !cfg.on)}
          ${toggleRow('timer', '🎉 집중·인출 타이머 끝', '타이머를 켜 두고 앱을 닫았을 때도 끝나면 알려 줘요', cfg, !cfg.on)}
          ${toggleRow('feedback', '💬 선생님 피드백 도착', '과제나 하루에 피드백을 남기면 2~5분 뒤에 알려 줘요', cfg, !cfg.on)}
          ${toggleRow('deadline', '📅 시험·수행평가 D-3·D-1·당일', '저녁 7시에 다가오는 일정을 알려 줘요 (선생님에게도 모아서)', cfg, !cfg.on)}
          <p class="text-xs text-slate-500">학생 ${students.length}명 중 <b>${withDevice.length}명</b>이 폰 알림을 켰어요.${students.length > withDevice.length ? ' 학생 앱 위쪽 🔔 버튼에서 켤 수 있어요.' : ''}</p>
        </div>
        <div class="space-y-2">
          <p class="label !mb-0">선생님에게 보내는 알림</p>
          ${toggleRow('teacherLate', '⏰ 30분 넘게 늦은 학생', '학생 이름을 모아서 알려 줘요 (학생마다 하루 한 번)', cfg, !cfg.on)}
          ${toggleRow('summary', '📊 하루 요약', '시작한 학생 수, 미시작 학생, 평균 달성률', cfg, !cfg.on)}
          ${toggleRow('nextWeek', '📅 다음 주 계획표 없는 학생', '금·토·일처럼 3일 안에 계획표가 비는 학생을 하루 요약 시각에 알려 줘요', cfg, !cfg.on)}
          <label class="flex items-center justify-between gap-2 rounded-xl border border-planner-border/25 bg-planner-surface p-3 text-sm font-bold ${!cfg.on || !cfg.summary ? 'opacity-50' : ''}">
            하루 요약 받을 시각
            <input type="time" class="input input-sm !w-auto" value="${cfg.summaryTime}" data-change="push-summary-time" ${!cfg.on || !cfg.summary ? 'disabled' : ''} />
          </label>
          ${deviceBox('teacher')}
        </div>
      </div>
    </section>`;
}

// ---------- 학생 🔔 팝업 ----------
export function studentPushModal(m, frame) {
  const cfg = pushConfig(S.config);
  const items = [
    cfg.start && '⏰ 목표 시작 시각이 되면',
    cfg.late && '⏳ 30분이 지나도 시작 전이면 한 번 더',
    cfg.timer && '🎉 집중·인출 타이머가 끝나면',
    cfg.feedback && '💬 선생님 피드백이 오면',
    cfg.deadline && '📅 시험·수행평가 D-3·D-1·당일 저녁',
  ].filter(Boolean);
  return frame('🔔 폰 알림', html`
    ${cfg.on ? html`
      <p class="text-sm text-slate-700 leading-relaxed">앱을 닫아 두어도 아래 알림이 폰으로 와요. (몇 분 늦게 올 수 있어요)</p>
      <ul class="space-y-1 text-sm font-bold text-slate-800">${items.map((t) => html`<li>${t}</li>`)}</ul>
      ${deviceBox('student')}
      ${S.myPush?.tokens?.length > 1 ? html`<p class="text-xs text-slate-500">알림을 켠 내 기기: ${S.myPush.tokens.length}대</p>` : ''}
    ` : html`<p class="text-sm text-slate-600">선생님이 아직 폰 알림 기능을 켜지 않았어요. 앱이 열려 있을 때는 지금처럼 알림이 떠요.</p>`}
  `);
}

// ---------- 동작 ----------
async function turnOn() {
  S.ui.busy = true;
  refresh();
  try {
    await enablePush(S.user.uid);
    toast('🔔 이 기기에서 알림을 받을 수 있어요.');
  } catch (err) {
    console.warn(err);
    toast(pushErrorMessage(err), 'error');
  } finally {
    S.ui.busy = false;
    refresh();
  }
}

export const pushTeacherActions = {
  'push-toggle': async (el) => {
    const cfg = pushConfig(S.config);
    await saveConfig({ push: { ...cfg, [el.dataset.key]: el.checked } });
    if (el.dataset.key === 'on') toast(el.checked ? '폰 알림을 켰어요.' : '폰 알림을 껐어요. 이제 아무 알림도 나가지 않아요.');
  },
  'push-summary-time': async (el) => {
    if (!el.value) return;
    await saveConfig({ push: { ...pushConfig(S.config), summaryTime: el.value } });
    toast(`하루 요약을 ${el.value}에 보내 드릴게요.`);
  },
};

export const pushActions = {
  'push-enable': turnOn,
  'push-disable': async () => {
    await disablePush(S.user.uid);
    toast('이 기기 알림을 껐어요.');
    refresh();
  },
  'push-test': async () => {
    if (timer.running) return toast('타이머가 돌아가는 중에는 테스트를 할 수 없어요. 타이머를 멈춘 뒤 눌러 주세요.', 'error');
    if (!pushConfig(S.config).on) return toast('먼저 선생님 [설정]에서 폰 알림을 켜야 해요.', 'error');
    await requestTestPush(S.user.uid);
    toast('📨 테스트 알림을 요청했어요. 보통 5분 안에 이 기기로 "알림 테스트 성공!"이 와요. 앱은 닫아도 돼요.');
  },
  'open-push-settings': () => {
    S.ui.modal = { type: 'pushSettings' };
    refresh();
  },
};
