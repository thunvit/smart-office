/* SmartOffice — Đọc/ghi tệp Excel (.xlsx) ngay trên trình duyệt, không dùng thư viện ngoài (CLAUDE.md mục 3.2).
 * - Đọc: giải nén ZIP bằng DecompressionStream('deflate-raw'), phân tích sharedStrings.xml, styles.xml (định dạng ngày) và các sheet bằng DOMParser.
 * - Ghi: tạo ZIP không nén (phương thức store) kèm CRC32; một kiểu chữ đậm cho dòng tiêu đề; độ rộng cột.
 * Phạm vi đủ cho mẫu nhập/xuất của phân hệ Công việc – Dự án (Base Wework bài 63000252615, 63000252614, 63000277994...). */
(function () {
  'use strict';
  const td = new TextDecoder(), te = new TextEncoder();
  /* ---------- ZIP ---------- */
  async function unzip(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf), files = {};
    let eocd = -1; for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Tệp không phải định dạng .xlsx (ZIP).');
    const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Tệp .xlsx bị hỏng.');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = td.decode(u8.subarray(p + 46, p + 46 + nlen));
      const lnlen = dv.getUint16(off + 26, true), lxlen = dv.getUint16(off + 28, true), start = off + 30 + lnlen + lxlen;
      files[name] = { method, data: u8.subarray(start, start + csize) };
      p += 46 + nlen + xlen + clen;
    }
    const read = async name => {
      const f = files[name]; if (!f) return null;
      if (f.method === 0) return td.decode(f.data);
      if (f.method !== 8) throw new Error('Kiểu nén không hỗ trợ.');
      if (typeof DecompressionStream === 'undefined') throw new Error('Trình duyệt chưa hỗ trợ đọc .xlsx. Vui lòng dùng Chrome, Edge, Firefox hoặc Safari bản mới.');
      const s = new Blob([f.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return td.decode(await new Response(s).arrayBuffer());
    };
    return { names: Object.keys(files), read };
  }
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(entries) { // entries: [{ name, text }]
    const parts = [], central = []; let off = 0;
    for (const e of entries) {
      const name = te.encode(e.name), data = te.encode(e.text), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name); off += 30 + name.length + data.length;
    }
    const csize = central.reduce((s, x) => s + x.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  /* ---------- Đọc .xlsx ---------- */
  const colIdx = ref => { const m = /^([A-Z]+)/.exec(ref); let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const excelDate = v => { const d = new Date(Math.round((v - 25569) * 864e5)); return d.toISOString().slice(0, 10).split('-').reverse().join('/') + (v % 1 ? ' ' + d.toISOString().slice(11, 16) : ''); };
  async function read(file) {
    const z = await unzip(await file.arrayBuffer()), P = new DOMParser();
    const xml = async n => { const t = await z.read(n); return t ? P.parseFromString(t, 'application/xml') : null; };
    const ss = []; const sx = await xml('xl/sharedStrings.xml');
    if (sx) for (const si of sx.getElementsByTagName('si')) ss.push(Array.from(si.getElementsByTagName('t')).map(t => t.textContent).join(''));
    /* Kiểu ngày: numFmtId 14–22, 45–47 hoặc định dạng tùy chỉnh có d/m/y */
    const dateStyles = new Set(); const st = await xml('xl/styles.xml');
    if (st) { const custom = {}; for (const nf of st.getElementsByTagName('numFmt')) custom[nf.getAttribute('numFmtId')] = nf.getAttribute('formatCode') || '';
      const xfs = st.getElementsByTagName('cellXfs')[0]; if (xfs) Array.from(xfs.getElementsByTagName('xf')).forEach((xf, i) => { const id = +xf.getAttribute('numFmtId'); if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || /[dmy]/i.test((custom[id] || '').replace(/\[[^\]]*\]|"[^"]*"/g, ''))) dateStyles.add(i); }); }
    const wb = await xml('xl/workbook.xml'), rels = await xml('xl/_rels/workbook.xml.rels'), relMap = {};
    if (rels) for (const r of rels.getElementsByTagName('Relationship')) relMap[r.getAttribute('Id')] = r.getAttribute('Target');
    const sheets = [];
    for (const s of wb.getElementsByTagName('sheet')) {
      const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let target = relMap[rid] || ''; target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
      const doc = await xml(target); if (!doc) continue;
      const rows = [];
      for (const row of doc.getElementsByTagName('row')) {
        const ri = (+row.getAttribute('r') || rows.length + 1) - 1, arr = [];
        for (const c of row.getElementsByTagName('c')) {
          const t = c.getAttribute('t'), vEl = c.getElementsByTagName('v')[0], s2 = +c.getAttribute('s');
          let v = vEl ? vEl.textContent : '';
          if (t === 's') v = ss[+v] ?? ''; else if (t === 'inlineStr') v = Array.from(c.getElementsByTagName('t')).map(x => x.textContent).join(''); else if (t === 'b') v = v === '1' ? 'TRUE' : 'FALSE';
          else if (v !== '' && dateStyles.has(s2) && isFinite(+v)) v = excelDate(+v);
          arr[colIdx(c.getAttribute('r') || 'A1')] = String(v);
        }
        rows[ri] = Array.from(arr, x => x ?? '');
      }
      sheets.push({ name: s.getAttribute('name'), rows: Array.from(rows, r => r || []) });
    }
    return sheets;
  }
  /* ---------- Ghi .xlsx ---------- */
  const xe = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const colName = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  /* sheets: [{ name, rows: [[...]], widths?: [số ký tự], header?: true (dòng 1 in đậm), boldRows?: Set(chỉ số dòng), fill?: { 'r,c': 'mã màu' } }] */
  function write(sheets) {
    const fills = []; for (const s of sheets) for (const v of Object.values(s.fill || {})) if (!fills.includes(v)) fills.push(v);
    const sheetXml = s => {
      const rows = s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
        if (v === null || v === undefined || v === '') { const f = (s.fill || {})[ri + ',' + ci]; return f ? `<c r="${colName(ci)}${ri + 1}" s="${2 + fills.indexOf(f)}"/>` : ''; }
        const ref = colName(ci) + (ri + 1), bold = (s.header && ri === 0) || (s.boldRows && s.boldRows.has(ri)), f = (s.fill || {})[ri + ',' + ci];
        const st = f ? ` s="${2 + fills.indexOf(f)}"` : bold ? ' s="1"' : '';
        return typeof v === 'number' && isFinite(v) ? `<c r="${ref}"${st}><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${xe(v)}</t></is></c>`;
      }).join('')}</row>`).join('');
      const cols = s.widths ? `<cols>${s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${s.header ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : ''}${cols}<sheetData>${rows}</sheetData></worksheet>`;
    };
    const safe = n => String(n || 'Sheet').replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31);
    const entries = [
      { name: '[Content_Types].xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
      { name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xe(safe(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="${2 + fills.length}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fills.map(c => `<fill><patternFill patternType="solid"><fgColor rgb="FF${c.replace('#', '').toUpperCase()}"/></patternFill></fill>`).join('')}</fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="${2 + fills.length}"><xf/><xf fontId="1" applyFont="1"/>${fills.map((c, i) => `<xf fillId="${2 + i}" applyFill="1"/>`).join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
      ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(s) }))
    ];
    return zip(entries);
  }
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  window.XLSX_LITE = { read, write, download, unzip, crc32 };
})();
