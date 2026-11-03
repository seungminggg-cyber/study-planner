// 입력 중인 글이 화면 새로고침(다른 기기의 데이터 변경 등) 때 지워지지 않도록 잠시 기억해 둡니다.
export const drafts = new Map();

export function clearDraft(form) {
  if (!form) return;
  [...form.elements].forEach((el) => {
    if (el.id) drafts.delete(el.id);
  });
}
