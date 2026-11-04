import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import {
  initializeFirestore, connectFirestoreEmulator, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
  terminate, clearIndexedDbPersistence, waitForPendingWrites,
} from 'firebase/firestore';

// Firebase 콘솔 > 프로젝트 설정 > 내 앱 에서 받은 값입니다.
// 이 값은 원래 웹페이지에 공개되는 값이라 저장소에 있어도 괜찮습니다.
// 데이터 보호는 firestore.rules(보안 규칙)가 담당합니다.
const firebaseConfig = {
  apiKey: 'AIzaSyDsJbfTsFK-08BqZWqrEA5zk9WQapQizmc',
  authDomain: 'seungmin-planner.firebaseapp.com',
  projectId: 'seungmin-planner',
  storageBucket: 'seungmin-planner.firebasestorage.app',
  messagingSenderId: '828874203333',
  appId: '1:828874203333:web:b7c343f9e4502ed620d0ac',
};

export const useEmulator = import.meta.env.VITE_USE_EMULATOR === '1';

export const app = initializeApp(firebaseConfig);

// App Check: 우리 앱(github.io 주소)에서 온 요청인지 Google reCAPTCHA로 확인해요.
// (키는 GitHub Actions 'Cloud setup'이 만든 공개 키. 테스트용 에뮬레이터·내 컴퓨터에서는 쓰지 않음)
const APP_CHECK_SITE_KEY = '6Le2jg8uAAAAAEBH-vf3FUGCFToThau3cVIptQG4';
if (!useEmulator && location.hostname.endsWith('github.io')) {
  try {
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
  } catch (err) {
    console.warn('App Check를 켜지 못했어요', err);
  }
}

export const auth = getAuth(app);

// 오프라인 저장: 인터넷이 끊겨도 체크한 내용을 이 기기에 저장해 두었다가 연결되면 자동으로 올려요.
// '로그인 상태 유지'를 끈 기기(학원·학교 공용 컴퓨터)에서는 기기에 남기지 않아요.
function keepLogin() {
  try { return localStorage.getItem('planner:keepLogin') !== 'false'; } catch { return false; }
}

function makeDb() {
  if (keepLogin()) {
    try {
      return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
    } catch (err) {
      console.warn('오프라인 저장을 켜지 못했어요', err);
    }
  }
  return initializeFirestore(app, { localCache: memoryLocalCache() });
}

export const db = makeDb();

// 개발용: npm run dev:emu 로 실행하면 실제 데이터 대신 내 컴퓨터의 테스트용 Firebase에 연결
if (useEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

// 아직 서버에 올라가지 않은 기록이 있는지 (최대 ms 동안 기다려 봄)
export async function pendingWritesDone(ms = 3000) {
  return Promise.race([
    waitForPendingWrites(db).then(() => true, () => true),
    new Promise((resolve) => setTimeout(() => resolve(false), ms)),
  ]);
}

// 로그아웃할 때: 이 기기에 저장해 둔 기록을 지우고 새로 시작 (공용 기기에서 다음 사람이 못 보게)
export async function clearLocalDataAndReload() {
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch (err) {
    console.warn('기기에 저장된 기록을 지우지 못했어요', err);
  }
  location.reload();
}

// 선생님 전용 서버 기능(학생 기록 완전 삭제)은 쓸 때만 불러와요
export async function callFunction(name, data) {
  const { getFunctions, httpsCallable, connectFunctionsEmulator } = await import('firebase/functions');
  const fns = getFunctions(app, 'asia-northeast3');
  if (useEmulator && !fns.emulatorOrigin) connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  const res = await httpsCallable(fns, name)(data);
  return res.data;
}
