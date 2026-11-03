// 화면에 글자를 넣을 때 자동으로 특수문자를 안전하게 바꿔주는 도우미.
// 학생이 제보함 등에 <script> 같은 코드를 써도 그냥 글자로만 보이게 합니다.

class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"'`]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '`': '&#96;',
  }[c]));
}

// 이미 안전하다고 확인된 HTML 조각을 그대로 넣을 때만 사용
export function raw(value) {
  return new SafeHtml(String(value ?? ''));
}

function toHtml(value) {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(toHtml).join('');
  if (value === false || value === null || value === undefined) return '';
  return esc(value);
}

// 사용법: html`<p>${userText}</p>` → userText 는 자동으로 안전하게 처리됨
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => {
    out += toHtml(v) + strings[i + 1];
  });
  return new SafeHtml(out);
}

// [키워드] 표기를 강조 표시로 바꿔줌 (먼저 안전하게 처리한 뒤 변환)
export function highlightBrackets(text, className) {
  return raw(esc(text).replace(/\[([^\]]+)\]/g, (_, word) => `<mark class="${className}">${word}</mark>`));
}
