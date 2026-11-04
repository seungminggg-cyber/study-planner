// 개인정보 수집·이용 안내와 동의
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { S, refresh, teacherName, appTitle, CONSENT_VERSION } from '../store.js';
import { html } from '../lib/html.js';
import { settle } from '../data.js';

// 안내 내용 (바꾸면 store.js 의 CONSENT_VERSION 날짜도 올려서 학생들에게 다시 동의를 받아요)
export function privacyItems() {
  const who = teacherName();
  return [
    ['모으는 정보', '이름, 로그인 이메일, 주간 계획·진행 기록·메모, 공부 시작 시각과 타이머 기록, 시험·수행평가 일정, 폰 알림을 켠 경우 기기의 알림 주소'],
    ['쓰는 곳', '학습 계획 관리와 피드백, 공부 알림, 학부모님께 드리는 학습 리포트'],
    ['보관 기간', `수강이 끝난 뒤 삭제를 요청하면 바로 지워요. 요청이 없으면 수강 종료 후 1년이 지나면 지워요.`],
    ['다른 곳에 주는지', '다른 사람이나 회사에 주지 않아요. (학습 리포트는 보호자님께만 드려요)'],
    ['저장 위치', 'Google Firebase 서버(주 저장 위치: 한국 서울)에 저장돼요. 로그인·알림과, 이상한 접근을 막는 reCAPTCHA도 Google이 처리해요.'],
    ['내 권리', `언제든 내 기록을 보거나 고치거나 지워 달라고 ${who}에게 요청할 수 있어요. 동의하지 않으면 앱을 쓸 수 없어요.`],
    ['만 14세 미만', '만 14세 미만 학생은 보호자(부모님)의 동의를 받은 뒤 가입해야 해요.'],
    ['책임자', `${who} (${appTitle()} 운영)`],
  ];
}

export function privacyList() {
  return html`
    <dl class="space-y-2 text-sm">
      ${privacyItems().map(([k, v]) => html`
        <div class="rounded-xl bg-planner-bg border border-planner-border/20 p-2.5">
          <dt class="font-black text-planner-dark text-xs">${k}</dt>
          <dd class="text-slate-700 leading-relaxed mt-0.5">${v}</dd>
        </div>`)}
    </dl>`;
}

// 가입 화면·동의 화면의 체크 두 개
export function consentChecks() {
  return html`
    <div class="space-y-2 rounded-xl border border-planner-border/30 bg-planner-surface p-3 text-sm">
      <label class="flex items-start gap-2 cursor-pointer">
        <input type="checkbox" name="agree" class="mt-0.5 w-4 h-4 accent-green-700 shrink-0" required />
        <span><b>[필수]</b> 개인정보 수집·이용에 동의해요. <button type="button" class="underline text-planner-green font-bold" data-action="open-privacy">내용 보기</button></span>
      </label>
      <label class="flex items-start gap-2 cursor-pointer">
        <input type="checkbox" name="age" class="mt-0.5 w-4 h-4 accent-green-700 shrink-0" required />
        <span><b>[필수]</b> 만 14세 이상이에요. (만 14세 미만이면 보호자의 동의를 받았어요)</span>
      </label>
    </div>`;
}

export function consentOk(data) {
  return Boolean(data.get('agree')) && Boolean(data.get('age'));
}

export function consentFields() {
  return { consentAt: Date.now(), consentVer: CONSENT_VERSION };
}

// 이미 가입한 학생: 안내가 새로 생기거나 바뀌었을 때 한 번 동의 받기
export function consentView(shell) {
  return shell(html`
    <div class="card space-y-4">
      <div>
        <h2 class="card-title">개인정보 안내를 확인해 주세요</h2>
        <p class="card-desc">${S.profile?.name || ''} 학생, 앱을 계속 쓰려면 아래 내용에 동의해 주세요.</p>
      </div>
      ${privacyList()}
      <form class="space-y-3" data-submit="give-consent">
        ${consentChecks()}
        <button class="btn btn-primary w-full py-3" ${S.ui.busy ? 'disabled' : ''}>동의하고 계속하기</button>
      </form>
      <p class="text-xs text-slate-500 text-center">동의하지 않으려면 ${teacherName()}에게 말씀해 주세요. · <button type="button" class="underline" data-action="logout">로그아웃</button></p>
    </div>`);
}

export function privacyModal(m, frame) {
  return frame('🔒 개인정보 수집·이용 안내', html`
    ${privacyList()}
    <button type="button" class="btn btn-primary w-full" data-action="close-modal">확인</button>
  `);
}

export const privacyActions = {
  'open-privacy': () => {
    S.ui.modal = { type: 'privacy' };
    refresh();
  },
  'give-consent': async (form, e, data) => {
    if (!consentOk(data)) return;
    S.ui.busy = true;
    refresh();
    try {
      await settle(updateDoc(doc(db, 'users', S.user.uid), consentFields()));
    } finally {
      S.ui.busy = false;
      refresh();
    }
  },
};
