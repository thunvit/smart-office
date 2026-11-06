/* SmartOffice — Bộ tính công thức cho trường dữ liệu tùy chỉnh (Base Wework bài 63000252575: "Công thức: hỗ trợ cộng trừ nhân chia
 * và các hàm tính Excel; nhập $ để hiển thị các biến").
 * Không dùng eval/new Function (ATTT): phân tích cú pháp đệ quy, chỉ chấp nhận số, biến $khoa, toán tử + - * / ^ ( ),
 * so sánh = <> < <= > >=, và các hàm SUM, AVERAGE (AVG), MIN, MAX, ROUND, ABS, IF, COUNT.
 * Dùng chung cho máy chủ (require) và trình duyệt (window.WorkFormula). */
(function (root) {
  'use strict';
  const FN = {
    SUM: a => a.reduce((s, x) => s + x, 0),
    AVERAGE: a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0),
    AVG: a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0),
    MIN: a => (a.length ? Math.min(...a) : 0),
    MAX: a => (a.length ? Math.max(...a) : 0),
    COUNT: a => a.length,
    ABS: a => Math.abs(a[0]),
    ROUND: a => { const n = Math.max(0, Math.min(10, Math.trunc(a[1] || 0))), f = Math.pow(10, n); return Math.round((a[0] + Number.EPSILON) * f) / f; },
    IF: a => (a[0] ? a[1] : (a.length > 2 ? a[2] : 0))
  };
  function tokenize(src) {
    const s = String(src || ''), out = []; let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) { let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; const v = Number(s.slice(i, j)); if (!isFinite(v)) throw new Error('Số không hợp lệ'); out.push({ t: 'num', v }); i = j; continue; }
      if (c === '$') { let j = i + 1; while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++; if (j === i + 1) throw new Error('Biến không hợp lệ'); out.push({ t: 'var', v: s.slice(i + 1, j) }); i = j; continue; }
      if (/[A-Za-z_]/.test(c)) { let j = i; while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++; const name = s.slice(i, j).toUpperCase(); if (!FN[name]) throw new Error('Hàm không hỗ trợ: ' + name); out.push({ t: 'fn', v: name }); i = j; continue; }
      const two = s.slice(i, i + 2);
      if (['<=', '>=', '<>'].includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue; }
      if ('+-*/^()<>=,;'.includes(c)) { out.push({ t: 'op', v: c === ';' ? ',' : c }); i++; continue; }
      throw new Error('Ký tự không hợp lệ: ' + c);
    }
    return out;
  }
  function parse(src) {
    const tk = tokenize(src); let p = 0;
    if (tk.length > 400) throw new Error('Công thức quá dài');
    const peek = () => tk[p], eat = v => { const x = tk[p]; if (!x || (v && x.v !== v)) throw new Error('Thiếu ' + (v || 'toán hạng')); p++; return x; };
    const cmp = () => { let l = add(); while (peek() && ['=', '<>', '<', '<=', '>', '>='].includes(peek().v)) { const o = eat().v, r = add(); l = { k: 'bin', o, l, r }; } return l; };
    const add = () => { let l = mul(); while (peek() && (peek().v === '+' || peek().v === '-')) { const o = eat().v, r = mul(); l = { k: 'bin', o, l, r }; } return l; };
    const mul = () => { let l = pow(); while (peek() && (peek().v === '*' || peek().v === '/')) { const o = eat().v, r = pow(); l = { k: 'bin', o, l, r }; } return l; };
    const pow = () => { let l = unary(); while (peek() && peek().v === '^') { eat(); l = { k: 'bin', o: '^', l, r: unary() }; } return l; }; // trái sang phải như Excel
    const unary = () => { if (peek() && (peek().v === '-' || peek().v === '+')) { const o = eat().v; const e = unary(); return o === '-' ? { k: 'neg', e } : e; } return prim(); };
    const prim = () => {
      const x = peek(); if (!x) throw new Error('Công thức chưa hoàn chỉnh');
      if (x.t === 'num') { p++; return { k: 'num', v: x.v }; }
      if (x.t === 'var') { p++; return { k: 'var', v: x.v }; }
      if (x.t === 'fn') { p++; eat('('); const args = []; if (peek() && peek().v !== ')') { args.push(cmp()); while (peek() && peek().v === ',') { eat(); args.push(cmp()); } } eat(')'); return { k: 'fn', v: x.v, args }; }
      if (x.v === '(') { p++; const e = cmp(); eat(')'); return e; }
      throw new Error('Không mong đợi: ' + x.v);
    };
    const ast = cmp(); if (p < tk.length) throw new Error('Thừa ký tự: ' + tk[p].v);
    return ast;
  }
  function evalAst(n, vars) {
    switch (n.k) {
      case 'num': return n.v;
      case 'var': { const v = Number(vars[n.v]); return isFinite(v) ? v : 0; }
      case 'neg': return -evalAst(n.e, vars);
      case 'fn': return FN[n.v](n.args.map(a => evalAst(a, vars)));
      case 'bin': {
        const a = evalAst(n.l, vars), b = evalAst(n.r, vars);
        switch (n.o) { case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return b === 0 ? NaN : a / b; case '^': return Math.pow(a, b);
          case '=': return a === b ? 1 : 0; case '<>': return a !== b ? 1 : 0; case '<': return a < b ? 1 : 0; case '<=': return a <= b ? 1 : 0; case '>': return a > b ? 1 : 0; case '>=': return a >= b ? 1 : 0; }
      }
    }
    return NaN;
  }
  const vars = src => { const out = new Set(); for (const t of tokenize(src)) if (t.t === 'var') out.add(t.v); return [...out]; };
  /* Trả về { ok, value } hoặc { ok:false, error } */
  function evaluate(src, values) {
    try { const v = evalAst(parse(src), values || {}); return isFinite(v) ? { ok: true, value: Math.round(v * 1e6) / 1e6 } : { ok: false, error: 'Kết quả không xác định (chia cho 0?)' }; }
    catch (e) { return { ok: false, error: e.message }; }
  }
  function check(src, allowed) {
    try { parse(src); const bad = vars(src).filter(v => !(allowed || []).includes(v)); return bad.length ? { ok: false, error: 'Biến không tồn tại: $' + bad.join(', $') } : { ok: true }; }
    catch (e) { return { ok: false, error: e.message }; }
  }
  const API = { evaluate, check, vars, FUNCTIONS: Object.keys(FN) };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.WorkFormula = API;
})(typeof window !== 'undefined' ? window : this);
