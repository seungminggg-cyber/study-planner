// Firebase에 저장하는 동작 모음
// 과제 하나, 요일 하나 단위로 필요한 칸만 저장해서 선생님과 학생이 동시에 고쳐도 서로 지워지지 않아요.
import {
  doc, updateDoc, setDoc, writeBatch, arrayUnion, arrayRemove, deleteField, increment,
} from 'firebase/firestore';
import { db } from './firebase.js';
import { toast } from './lib/util.js';

// 인터넷이 느리거나 끊겨도 화면이 멈추지 않게: 서버 확인은 2.5초까지만 기다려요.
// 그 뒤에는 이 기기에 저장된 채로 두었다가 연결되면 자동으로 올라가요. (나중에 실패하면 알려 줌)
export function settle(promise, ms = 2500) {
  let late = false;
  const wait = new Promise((resolve) => setTimeout(() => { late = true; resolve(); }, ms));
  promise.catch((err) => {
    if (!late) return; // 기다리는 동안 실패하면 부른 쪽에서 알려 줌
    console.warn(err);
    toast(err?.code === 'permission-denied' ? '저장 권한이 없어요. 다시 로그인해 주세요.' : '저장하지 못한 내용이 있어요. 새로고침해 주세요.', 'error');
  });
  return Promise.race([promise, wait]);
}

export const weekRef = (uid, weekId) => doc(db, 'users', uid, 'weeks', weekId);

// asStudent: 학생이 고친 경우 '마지막 활동 시각'도 함께 기록 (선생님 현황판에 보임)
export function patchWeek(uid, weekId, patch, asStudent = false) {
  const now = Date.now();
  return settle(updateDoc(weekRef(uid, weekId), { ...patch, updatedAt: now, ...(asStudent ? { studentAt: now } : {}) }));
}

export function taskPatch(id, fields) {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [`tasks.${id}.${k}`, v]));
}

export function deleteTaskPatch(id) {
  return { [`tasks.${id}`]: deleteField() };
}

export function focusIncrementPatch(date) {
  return { [`days.${date}.focus`]: increment(1) };
}

export async function createWeek(uid, week) {
  const batch = writeBatch(db);
  batch.set(weekRef(uid, week.start), week);
  batch.update(doc(db, 'users', uid), { weekIds: arrayUnion(week.start) });
  await settle(batch.commit());
}

export async function deleteWeek(uid, weekId) {
  const batch = writeBatch(db);
  batch.delete(weekRef(uid, weekId));
  batch.update(doc(db, 'users', uid), { weekIds: arrayRemove(weekId) });
  await settle(batch.commit());
}

export function updateUser(uid, fields) {
  return settle(updateDoc(doc(db, 'users', uid), fields));
}

export function saveNote(uid, text) {
  return settle(setDoc(doc(db, 'notes', uid), { text, updatedAt: Date.now() }));
}

export function saveConfig(fields) {
  return settle(setDoc(doc(db, 'config', 'app'), { ...fields, updatedAt: Date.now() }, { merge: true }));
}
