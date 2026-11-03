// Firebase에 저장하는 동작 모음
// 과제 하나, 요일 하나 단위로 필요한 칸만 저장해서 선생님과 학생이 동시에 고쳐도 서로 지워지지 않아요.
import {
  doc, updateDoc, setDoc, writeBatch, arrayUnion, arrayRemove, deleteField, increment,
} from 'firebase/firestore';
import { db } from './firebase.js';

export const weekRef = (uid, weekId) => doc(db, 'users', uid, 'weeks', weekId);

// asStudent: 학생이 고친 경우 '마지막 활동 시각'도 함께 기록 (선생님 현황판에 보임)
export function patchWeek(uid, weekId, patch, asStudent = false) {
  const now = Date.now();
  return updateDoc(weekRef(uid, weekId), { ...patch, updatedAt: now, ...(asStudent ? { studentAt: now } : {}) });
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
  await batch.commit();
}

export async function deleteWeek(uid, weekId) {
  const batch = writeBatch(db);
  batch.delete(weekRef(uid, weekId));
  batch.update(doc(db, 'users', uid), { weekIds: arrayRemove(weekId) });
  await batch.commit();
}

export function updateUser(uid, fields) {
  return updateDoc(doc(db, 'users', uid), fields);
}

export function saveNote(uid, text) {
  return setDoc(doc(db, 'notes', uid), { text, updatedAt: Date.now() });
}

export function saveConfig(fields) {
  return setDoc(doc(db, 'config', 'app'), { ...fields, updatedAt: Date.now() }, { merge: true });
}
