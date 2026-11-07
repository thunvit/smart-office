/* SmartOffice — Nhận dạng người nói theo đặc trưng giọng (ADR-011).
 * Chạy hoàn toàn tại trình duyệt, không thư viện ngoài, không gửi âm thanh đi đâu:
 *  - đặc trưng MFCC (khung 25 ms, bước 10 ms, 26 bộ lọc mel, 20 hệ số, lifter 22) trên âm thanh 16 kHz;
 *  - chỉ lấy khung có tiếng nói (ngưỡng năng lượng tương đối);
 *  - "dấu giọng" = trung bình + độ lệch chuẩn của c1..c19 + độ lệch chuẩn của delta → 57 số. Máy chủ chỉ lưu dãy số này, không lưu âm thanh;
 *  - nhận dạng: khoảng cách tới dấu giọng của từng thành viên; độ tin cậy theo khoảng chênh với người gần thứ hai;
 *    mô hình trong phiên học thêm từ các đoạn thư ký đã xác nhận (không ghi lên máy chủ).
 * Giới hạn: đây là phương pháp thống kê đơn giản, độ chính xác phụ thuộc micro, phòng họp, số người; kết quả là GỢI Ý, thư ký xác nhận.
 * Tệp dùng được cả trong Node (kiểm thử) và trình duyệt (window.SO_VOICE). */
(function (root) {
'use strict';
const VERSION = 'mfcc-v1', RATE = 16000, FRAME = 400, HOP = 160, NFFT = 512, NMEL = 26, NCEP = 20, LIFTER = 22;
const K = NCEP - 1, DIMS = 3 * K, MIN_VOICED = 60; // tối thiểu ~0,6 giây có tiếng nói

/* ---------- Bảng tính sẵn ---------- */
const HAMMING = new Float32Array(FRAME); for (let i = 0; i < FRAME; i++) HAMMING[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (FRAME - 1));
const mel = f => 2595 * Math.log10(1 + f / 700), imel = m => 700 * (Math.pow(10, m / 2595) - 1);
const NB = NFFT / 2 + 1, FB = [];
(function () {
  const lo = mel(100), hi = mel(7600), pts = []; for (let i = 0; i < NMEL + 2; i++) pts.push(Math.floor((NFFT + 1) * imel(lo + (hi - lo) * i / (NMEL + 1)) / RATE));
  for (let m = 1; m <= NMEL; m++) {
    const w = new Float32Array(NB), a = pts[m - 1], b = pts[m], c = pts[m + 1];
    for (let k = a; k < b; k++) w[k] = (k - a) / Math.max(1, b - a);
    for (let k = b; k < c; k++) w[k] = (c - k) / Math.max(1, c - b);
    FB.push(w);
  }
})();
const DCT = []; for (let n = 0; n < NCEP; n++) { const r = new Float32Array(NMEL); for (let m = 0; m < NMEL; m++) r[m] = Math.cos(Math.PI * n * (m + 0.5) / NMEL) * Math.sqrt(2 / NMEL); DCT.push(r); }
const LIFT = new Float32Array(NCEP); for (let n = 0; n < NCEP; n++) LIFT[n] = 1 + (LIFTER / 2) * Math.sin(Math.PI * n / LIFTER);
const BITREV = new Uint16Array(NFFT); for (let i = 0, j = 0; i < NFFT; i++) { BITREV[i] = j; let b = NFFT >> 1; while (j & b) { j ^= b; b >>= 1; } j |= b; }
const COS = new Float32Array(NFFT / 2), SIN = new Float32Array(NFFT / 2); for (let i = 0; i < NFFT / 2; i++) { COS[i] = Math.cos(2 * Math.PI * i / NFFT); SIN[i] = -Math.sin(2 * Math.PI * i / NFFT); }

function fftPower(frame, out) {
  const re = new Float32Array(NFFT), im = new Float32Array(NFFT);
  for (let i = 0; i < NFFT; i++) re[BITREV[i]] = i < frame.length ? frame[i] : 0;
  for (let size = 2; size <= NFFT; size <<= 1) {
    const half = size >> 1, step = NFFT / size;
    for (let s = 0; s < NFFT; s += size) for (let j = 0; j < half; j++) {
      const k = j * step, a = s + j, b = a + half, tr = re[b] * COS[k] - im[b] * SIN[k], ti = re[b] * SIN[k] + im[b] * COS[k];
      re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
    }
  }
  for (let k = 0; k < NB; k++) out[k] = (re[k] * re[k] + im[k] * im[k]) / NFFT;
}

/** Đặc trưng từng khung: { ceps: Float32Array[] (NCEP hệ số), energy: Float32Array (log năng lượng) } */
function features(pcm) {
  const n = pcm.length < FRAME ? 0 : 1 + Math.floor((pcm.length - FRAME) / HOP);
  const ceps = [], energy = new Float32Array(n), frame = new Float32Array(FRAME), pw = new Float32Array(NB), lm = new Float32Array(NMEL);
  for (let f = 0; f < n; f++) {
    const o = f * HOP; let e = 0;
    for (let i = 0; i < FRAME; i++) { const x = pcm[o + i] - 0.97 * (o + i > 0 ? pcm[o + i - 1] : 0); frame[i] = x * HAMMING[i]; e += x * x; }
    energy[f] = Math.log(e + 1e-10);
    fftPower(frame, pw);
    for (let m = 0; m < NMEL; m++) { let s = 0; const w = FB[m]; for (let k = 0; k < NB; k++) if (w[k]) s += w[k] * pw[k]; lm[m] = Math.log(s + 1e-10); }
    const c = new Float32Array(NCEP); for (let k = 0; k < NCEP; k++) { let s = 0; const d = DCT[k]; for (let m = 0; m < NMEL; m++) s += d[m] * lm[m]; c[k] = s * LIFT[k]; }
    ceps.push(c);
  }
  return { ceps, energy };
}

/** Chọn khung có tiếng nói: cao hơn nền nhiễu ≥ 12 dB và không thấp hơn khung to nhất quá 45 dB */
function voicedIdx(energy) {
  if (!energy.length) return [];
  const s = Array.from(energy).sort((a, b) => a - b), floor = s[Math.floor(s.length * 0.1)], top = s[s.length - 1];
  const thr = Math.max(floor + Math.log(Math.pow(10, 1.2)), top - Math.log(Math.pow(10, 4.5)), Math.log(1e-6 * FRAME));
  const out = []; for (let i = 0; i < energy.length; i++) if (energy[i] > thr) out.push(i);
  return out;
}

/** Dấu giọng của một đoạn âm thanh 16 kHz (Float32Array, −1…1). Trả null khi quá ít tiếng nói. */
function embed(pcm) {
  const { ceps, energy } = features(pcm), idx = voicedIdx(energy);
  if (idx.length < MIN_VOICED) return null;
  const v = new Array(DIMS).fill(0), sq = new Array(K).fill(0), dsum = new Array(K).fill(0), dsq = new Array(K).fill(0); let nd = 0;
  for (const i of idx) for (let k = 0; k < K; k++) { const x = ceps[i][k + 1]; v[k] += x; sq[k] += x * x; }
  for (const i of idx) if (i > 0 && i < ceps.length - 1) { nd++; for (let k = 0; k < K; k++) { const d = (ceps[i + 1][k + 1] - ceps[i - 1][k + 1]) / 2; dsum[k] += d; dsq[k] += d * d; } }
  const n = idx.length;
  for (let k = 0; k < K; k++) {
    const m = v[k] / n; v[k] = m;
    v[K + k] = Math.sqrt(Math.max(0, sq[k] / n - m * m));
    const dm = nd ? dsum[k] / nd : 0; v[2 * K + k] = nd ? 0.5 * Math.sqrt(Math.max(0, dsq[k] / nd - dm * dm)) : 0; // delta: trọng số 0,5
  }
  return v.map(x => Math.round(x * 1e4) / 1e4);
}

const valid = v => Array.isArray(v) && v.length === DIMS && v.every(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 1e4);
const dist = (a, b) => { let s = 0; for (let i = 0; i < DIMS; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s / DIMS); };
const avg = (a, na, b, nb) => a.map((x, i) => (x * na + b[i] * nb) / (na + nb));

/** Gộp nhiều dấu giọng (ví dụ các đoạn do nhà cung cấp gắn cùng nhãn người nói) */
function mean(list) { const ok = list.filter(valid); if (!ok.length) return null; return ok.reduce((a, v, i) => i ? avg(a, i, v, 1) : v.slice(), null); }

/** Mô hình người nói trong một cuộc họp.
 * refs: [{ key, vec, n }] — key là mã thành viên; vec là dấu giọng đã đăng ký (n: trọng số).
 * classify(emb) → { key|null, d, margin, sure }; learn(key, emb): học thêm khi thư ký xác nhận người nói (chỉ trong phiên). */
function Model(refs) {
  const C = new Map(); const intra = [];
  for (const r of refs || []) if (r && r.key != null && valid(r.vec)) C.set(String(r.key), { vec: r.vec.slice(), n: Math.min(20, r.n || 5) });
  const median = () => { const s = intra.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  return {
    has: key => C.has(String(key)),
    keys: () => [...C.keys()],
    size: () => C.size,
    set(key, vec, n = 5) { if (valid(vec)) C.set(String(key), { vec: vec.slice(), n }); },
    classify(emb) {
      if (!valid(emb) || !C.size) return { key: null, d: null, margin: 0, sure: false };
      const r = [...C.entries()].map(([k, c]) => ({ k, d: dist(emb, c.vec) })).sort((a, b) => a.d - b.d);
      const d1 = r[0].d, d2 = r[1] ? r[1].d : null, margin = d2 ? (d2 - d1) / d2 : 1;
      /* Từ chối khi xa hơn hẳn mức thường gặp của các đoạn đã xác nhận (tự hiệu chỉnh theo phòng họp, micro) */
      if (intra.length >= 3 && d1 > 2.2 * median()) return { key: null, d: d1, margin, sure: false };
      return { key: r[0].k, d: d1, margin, sure: margin >= 0.12 };
    },
    learn(key, emb) {
      if (key == null || !valid(emb)) return;
      const k = String(key), c = C.get(k);
      if (!c) { C.set(k, { vec: emb.slice(), n: 1 }); return; }
      intra.push(dist(emb, c.vec)); if (intra.length > 200) intra.shift();
      c.vec = avg(c.vec, c.n, emb, 1); c.n = Math.min(20, c.n + 1);
    }
  };
}

/** Hạ tần số lấy mẫu về 16 kHz (lấy trung bình từng cụm mẫu – đủ cho tiếng nói) */
function to16k(chunks, inRate) {
  const len = chunks.reduce((n, c) => n + c.length, 0), all = new Float32Array(len); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
  if (inRate === RATE) return all;
  const ratio = inRate / RATE, n = Math.floor(len / ratio), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = Math.floor(i * ratio), b = Math.max(a + 1, Math.floor((i + 1) * ratio)); let s = 0; for (let j = a; j < b && j < len; j++) s += all[j]; out[i] = s / (b - a); }
  return out;
}

const API = { VERSION, RATE, DIMS, features, embed, valid, dist, mean, Model, to16k };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.SO_VOICE = API;
})(typeof window !== 'undefined' ? window : this);
