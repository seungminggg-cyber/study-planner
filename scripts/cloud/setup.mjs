// Google Cloud 설정을 한 번에 맞추는 스크립트 (GitHub Actions의 'Cloud setup'에서 실행, 여러 번 실행해도 안전)
//  1) Firestore 자동 백업: 매일(7일 보관) + 매주 일요일(14주 보관)
//  2) App Check: reCAPTCHA Enterprise 키를 만들고 웹 앱에 연결 (우리 앱에서 온 요청인지 확인)
//  3) ENFORCE=firestore 이면 Firestore에 App Check를 '적용'(우리 앱이 아닌 요청 차단), ENFORCE=off 면 해제
// 필요한 것: GOOGLE_APPLICATION_CREDENTIALS (google-github-actions/auth가 만들어 줌)
import { GoogleAuth } from 'google-auth-library';

const PROJECT = 'seungmin-planner';
const PROJECT_NUMBER = '828874203333';
const WEB_APP_ID = '1:828874203333:web:b7c343f9e4502ed620d0ac';
const DOMAINS = ['seungminggg-cyber.github.io'];
const KEY_NAME = 'study-planner-appcheck';

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
const client = await auth.getClient();

async function api(method, url, body) {
  const res = await client.request({ method, url, data: body, validateStatus: () => true });
  if (res.status >= 400) {
    const msg = res.data?.error?.message || JSON.stringify(res.data);
    throw Object.assign(new Error(`${method} ${url.split('?')[0]} → ${res.status} ${msg}`), { status: res.status });
  }
  return res.data;
}

async function waitOp(op, base) {
  let cur = op;
  for (let i = 0; i < 30 && cur && cur.name && !cur.done; i += 1) {
    await new Promise((r) => setTimeout(r, 3000));
    cur = await api('GET', `${base}/${cur.name}`);
  }
  return cur;
}

async function enableApi(service) {
  const op = await api('POST', `https://serviceusage.googleapis.com/v1/projects/${PROJECT}/services/${service}:enable`, {});
  await waitOp(op, 'https://serviceusage.googleapis.com/v1');
  console.log(`✔ ${service} 사용 중`);
}

// ---------- 1) 백업 ----------
async function backups() {
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/backupSchedules`;
  const list = (await api('GET', base)).backupSchedules || [];
  const has = (kind) => list.some((s) => (kind === 'daily' ? s.dailyRecurrence : s.weeklyRecurrence));
  if (!has('daily')) {
    await api('POST', base, { retention: `${7 * 86400}s`, dailyRecurrence: {} });
    console.log('✔ 매일 백업을 만들었어요 (7일 보관)');
  } else console.log('✔ 매일 백업 이미 있음');
  if (!has('weekly')) {
    await api('POST', base, { retention: `${98 * 86400}s`, weeklyRecurrence: { day: 'SUNDAY' } });
    console.log('✔ 매주 일요일 백업을 만들었어요 (14주 보관)');
  } else console.log('✔ 매주 백업 이미 있음');
  const backupsNow = await api('GET', `https://firestore.googleapis.com/v1/projects/${PROJECT}/locations/-/backups`);
  console.log(`  지금 남아 있는 백업: ${(backupsNow.backups || []).length}개`);
}

// ---------- 2) App Check ----------
async function appCheck() {
  await enableApi('recaptchaenterprise.googleapis.com');
  await enableApi('firebaseappcheck.googleapis.com');
  const keysUrl = `https://recaptchaenterprise.googleapis.com/v1/projects/${PROJECT}/keys`;
  const keys = (await api('GET', keysUrl)).keys || [];
  let key = keys.find((k) => k.displayName === KEY_NAME);
  if (!key) {
    key = await api('POST', keysUrl, { displayName: KEY_NAME, webSettings: { allowedDomains: DOMAINS, integrationType: 'SCORE' } });
    console.log('✔ reCAPTCHA 키를 만들었어요');
  }
  const siteKey = key.name.split('/').pop();
  const cfgUrl = `https://firebaseappcheck.googleapis.com/v1/projects/${PROJECT_NUMBER}/apps/${WEB_APP_ID}/recaptchaEnterpriseConfig`;
  await api('PATCH', `${cfgUrl}?updateMask=siteKey,tokenTtl`, { siteKey, tokenTtl: `${24 * 3600}s` });
  console.log(`✔ App Check에 웹 앱 연결 (토큰 유효 1일)`);
  console.log(`SITE_KEY=${siteKey}`);

  const svcBase = `https://firebaseappcheck.googleapis.com/v1/projects/${PROJECT_NUMBER}/services`;
  const enforce = process.env.ENFORCE || '';
  if (enforce === 'firestore' || enforce === 'off') {
    const mode = enforce === 'off' ? 'UNENFORCED' : 'ENFORCED';
    await api('PATCH', `${svcBase}/firestore.googleapis.com?updateMask=enforcementMode`, { enforcementMode: mode });
    console.log(`✔ Firestore App Check: ${mode === 'ENFORCED' ? '적용(우리 앱이 아닌 요청 차단)' : '해제'}`);
  }
  const svcs = (await api('GET', svcBase)).services || [];
  svcs.forEach((s) => console.log(`  ${s.name.split('/').pop()}: ${s.enforcementMode || 'OFF'}`));
}

let failed = false;
for (const [label, fn] of [['백업', backups], ['App Check', appCheck]]) {
  try {
    console.log(`\n== ${label}`);
    await fn();
  } catch (err) {
    failed = true;
    console.error(`✘ ${label}: ${err.message}`);
  }
}
process.exit(failed ? 1 : 0);
