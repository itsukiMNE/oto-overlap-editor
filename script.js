(() => {
  const fileInput = document.getElementById('fileInput');
  const fileStatus = document.getElementById('fileStatus');
  const previewBtn = document.getElementById('previewBtn');
  const copyBtn = document.getElementById('copyBtn');
  const copyMojibakeBtn = document.getElementById('copyMojibakeBtn');
  const resultBox = document.getElementById('resultBox');
  const resultText = document.getElementById('resultText');
  const previewStatus = document.getElementById('previewStatus');
  const previewContainer = document.getElementById('previewContainer');

  let originalText = '';
  let originalBytes = null;
  let modifiedBytes = null;
  let originalEncoding = 'utf-8';
  let parsedLines = [];
  let modifiedText = '';
  let sourceFileName = 'oto.ini';

  const KTP_PREFIXES = [
    'か','き','く','け','こ','きゃ','きゅ','きょ','きぇ',
    'た','ち','つ','て','と','ちゃ','ちゅ','ちょ','ちぇ',
    'つぁ','つぃ','つぇ','つぉ','てぃ','とぅ','てゅ',
    'ぱ','ぴ','ぷ','ぺ','ぽ','ぴゃ','ぴゅ','ぴょ','ぴぇ'
  ];

  const WY_PREFIXES = [
    'や','ゆ','よ','いぇ',
    'わ','うぃ','うぇ','うぉ'
  ];

  const VOWEL_N = ['あ','い','う','え','お','を','ん'];

  function decodeFile(buffer) {
    const bytes = new Uint8Array(buffer);

    // UTF-8 BOM
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      originalEncoding = 'utf-8';
      return new TextDecoder('utf-8').decode(bytes);
    }

    // Try UTF-8 first. If replacement characters appear, fallback to Shift_JIS.
    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (!utf8.includes('\uFFFD')) {
      originalEncoding = 'utf-8';
      return utf8;
    }

    try {
      originalEncoding = 'shift_jis';
      return new TextDecoder('shift_jis').decode(bytes);
    } catch (e) {
      originalEncoding = 'utf-8';
      return utf8;
    }
  }

  function getAliasAndSound(line) {
    const eq = line.indexOf('=');
    if (eq < 0) return null;

    const left = line.slice(0, eq);
    const right = line.slice(eq + 1);
    const parts = right.split(',');
    if (parts.length < 6) return null;

    const alias = parts[0].trim();
    const wavBase = left.replace(/\\/g, '/').split('/').pop().replace(/\.wav$/i, '').trim();

    // Alias is preferred; if empty, use wav filename as fallback.
    const target = alias || wavBase;
    return { target, alias, wavBase, parts, left };
  }

  function stripPitchSuffix(target) {
    // v0.10: Ignore a trailing pitch label when classifying the alias.
    // Examples: かC4 -> か, きゃ_D#4 -> きゃ, a R C4 -> a R.
    return target.trim().replace(/[\s_-]*[A-G](?:#|b)?-?\d+$/i, '').trim();
  }

  function normalizeTarget(target) {
    // Remove a trailing pitch label first, then common VCV/CVVC framing.
    let t = stripPitchSuffix(target);
    t = t.replace(/^[-_\s]+/, '');
    t = t.replace(/^[aiueonAIUEON]\s+/u, '');
    return t;
  }

  function startsWithAny(text, list) {
    return list.some(item => text.startsWith(item));
  }

  function classify(target) {
    const raw = stripPitchSuffix(target);

    // v0.07: Any "- X" alias is always treated as Other, regardless of X.
    if (/^-\s+\S/u.test(raw)) return 'other';

    // v0.11: Aliases in the form "a / i / u / e / o / n + kana" are always Other.
    // Examples: a あ, i い, n ん -> Preutterance / 3.
    if (/^[aiueon]\s+[ぁ-ゖァ-ヺ]/iu.test(raw)) return 'other';

    // v0.12: If "E" is followed by kana in an ending-style alias, treat it as Other.
    // Examples: a Eん, i Eあ, - Eう -> Preutterance / 3.
    if (/^(?:-|[aiueon])\s+E[ぁ-ゖァ-ヺ]/iu.test(raw)) return 'other';

    // v0.08: Ending aliases such as "a R", "i R吸", "u Rh", "a E", and "a -" use the ending rule.
    if (/^[aiueon]\s+(?:[RE]|-)/iu.test(raw)) return 'ending';

    const t = normalizeTarget(target);

    // v0.03: Any target beginning with ん is treated as ん,
    // even when letters or other suffix markers follow it (e.g. んm, んN).
    if (t.startsWith('ん')) return 'vowel_n';

    // v0.11: Vowels / を may carry a numeric suffix and are still treated as vowels.
    // Examples: あ2, い03, を1.
    if (VOWEL_N.filter(v => v !== 'ん').some(v => t === v || new RegExp('^' + v + '\\d+$').test(t))) {
      return 'vowel_n';
    }

    if (startsWithAny(t, KTP_PREFIXES)) return 'ktp';
    if (startsWithAny(t, WY_PREFIXES)) return 'wy';

    return 'other';
  }

  function calculateOverlap(preutterance, target) {
    if (!Number.isFinite(preutterance)) return null;

    const category = classify(target);
    if (category === 'ktp') return -5;
    if (category === 'wy' || category === 'ending') return preutterance / 2 - 1;
    if (category === 'vowel_n') return preutterance * 2;
    return preutterance / 3;
  }

  function formatNumber(value) {
    if (!Number.isFinite(value)) return '';
    const rounded = Math.round((value + Number.EPSILON) * 10) / 10;
    return rounded.toFixed(1);
  }

  function categoryLabel(category) {
    if (category === 'ktp') return 'K/T/P';
    if (category === 'wy') return 'W/Y';
    if (category === 'vowel_n') return '母音/を/ん';
    if (category === 'ending') return '语尾';
    return '其他';
  }

  function splitByteLines(bytes) {
    const lines = [];
    let start = 0;
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0x0A) {
        let contentEnd = i;
        let ending = new Uint8Array([0x0A]);
        if (i > start && bytes[i - 1] === 0x0D) {
          contentEnd = i - 1;
          ending = new Uint8Array([0x0D, 0x0A]);
        }
        lines.push({ content: bytes.slice(start, contentEnd), ending });
        start = i + 1;
      }
    }
    if (start <= bytes.length) {
      lines.push({ content: bytes.slice(start), ending: new Uint8Array(0) });
    }
    return lines;
  }

  function concatBytes(chunks) {
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }

  function replaceOverlapInByteLine(lineBytes, newOverlap) {
    let eq = -1;
    for (let i = 0; i < lineBytes.length; i++) {
      if (lineBytes[i] === 0x3D) { // =
        eq = i;
        break;
      }
    }
    if (eq < 0) return lineBytes;

    let commaCount = 0;
    let fieldStart = -1;
    for (let i = eq + 1; i < lineBytes.length; i++) {
      if (lineBytes[i] === 0x2C) { // ,
        commaCount++;
        if (commaCount === 5) {
          fieldStart = i + 1;
          break;
        }
      }
    }
    if (fieldStart < 0) return lineBytes;

    let valueStart = fieldStart;
    while (valueStart < lineBytes.length && (lineBytes[valueStart] === 0x20 || lineBytes[valueStart] === 0x09)) valueStart++;
    let valueEnd = lineBytes.length;
    while (valueEnd > valueStart && (lineBytes[valueEnd - 1] === 0x20 || lineBytes[valueEnd - 1] === 0x09)) valueEnd--;

    const replacement = new TextEncoder().encode(newOverlap); // ASCII only
    return concatBytes([
      lineBytes.slice(0, valueStart),
      replacement,
      lineBytes.slice(valueEnd)
    ]);
  }

  function decodeModifiedBytes(bytes) {
    if (!bytes) return '';
    return new TextDecoder(originalEncoding === 'shift_jis' ? 'shift_jis' : 'utf-8').decode(bytes);
  }

  function bytesToChineseAnsiMojibake(bytes) {
    if (!bytes) return '';
    // The underlying bytes are kept in their original CP932/Shift_JIS form.
    // Decoding those same bytes as GBK reproduces the text shown by a Chinese ANSI environment.
    return new TextDecoder('gbk').decode(bytes);
  }

  function parseText(text) {
    const newline = text.includes('\r\n') ? '\r\n' : '\n';
    return {
      newline,
      lines: text.split(/\r?\n/)
    };
  }

  function buildPreview() {
    if (!originalText || !originalBytes) return;

    const { lines } = parseText(originalText);
    const byteLines = splitByteLines(originalBytes);
    const rows = [];
    const outByteChunks = [];
    let changed = 0;
    let skipped = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const byteLine = byteLines[i] || { content: new Uint8Array(0), ending: new Uint8Array(0) };
      const data = getAliasAndSound(line);

      if (!data) {
        outByteChunks.push(byteLine.content, byteLine.ending);
        continue;
      }

      const { target, alias, parts } = data;
      const pre = parseFloat(parts[4]);
      const oldOverlap = parts[5];
      const newOverlap = calculateOverlap(pre, target);

      if (!Number.isFinite(pre) || newOverlap === null) {
        outByteChunks.push(byteLine.content, byteLine.ending);
        skipped++;
        continue;
      }

      const category = classify(target);
      const newText = formatNumber(newOverlap);
      const newByteLine = replaceOverlapInByteLine(byteLine.content, newText);
      outByteChunks.push(newByteLine, byteLine.ending);

      rows.push({
        alias: alias || '(空)',
        target,
        pre: formatNumber(pre),
        category: categoryLabel(category),
        oldOverlap,
        newOverlap: newText
      });
      changed++;
    }

    modifiedBytes = concatBytes(outByteChunks);
    modifiedText = decodeModifiedBytes(modifiedBytes);
    parsedLines = rows;
    resultText.value = modifiedText;
    resultBox.style.display = 'block';

    if (!rows.length) {
      previewContainer.innerHTML = '';
      previewStatus.innerHTML = '<span class="error">没有找到可处理的 oto.ini 行</span>';
      copyBtn.disabled = true;
      copyMojibakeBtn.disabled = true;
      return;
    }

    previewStatus.textContent = `可处理 ${changed} 行${skipped ? `，跳过 ${skipped} 行` : ''}`;
    copyBtn.disabled = false;
    copyMojibakeBtn.disabled = originalEncoding !== 'shift_jis';

    const html = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Alias</th>
              <th>识别对象</th>
              <th>Preutterance</th>
              <th>分类</th>
              <th>原 Overlap</th>
              <th>新 Overlap</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${escapeHtml(r.alias)}</td>
                <td>${escapeHtml(r.target)}</td>
                <td>${escapeHtml(r.pre)}</td>
                <td><span class="tag">${escapeHtml(r.category)}</span></td>
                <td>${escapeHtml(r.oldOverlap)}</td>
                <td><strong>${escapeHtml(r.newOverlap)}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;

    previewContainer.innerHTML = html;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    sourceFileName = file.name || 'oto.ini';
    try {
      const buffer = await file.arrayBuffer();
      originalBytes = new Uint8Array(buffer);
      originalText = decodeFile(buffer);
      modifiedText = '';
      previewContainer.innerHTML = '';
      resultBox.style.display = 'none';
      resultText.value = '';
      modifiedBytes = null;
      copyBtn.disabled = true;
      copyMojibakeBtn.disabled = true;
      previewBtn.disabled = false;
      const encodingLabel = originalEncoding === 'shift_jis' ? '日文 ANSI（CP932 / Shift_JIS）' : 'UTF-8';
      fileStatus.textContent = `${sourceFileName} · 已读取 · 读取编码：${encodingLabel}`;
      previewStatus.textContent = '点击“生成预览”查看修改结果';
    } catch (e) {
      fileStatus.innerHTML = '<span class="error">读取文件失败</span>';
      previewBtn.disabled = true;
      copyBtn.disabled = true;
      copyMojibakeBtn.disabled = true;
    }
  });

  previewBtn.addEventListener('click', buildPreview);


  copyBtn.addEventListener('click', async () => {
    if (!modifiedText) return;
    try {
      await navigator.clipboard.writeText(modifiedText);
      const oldText = copyBtn.textContent;
      copyBtn.textContent = '已复制';
      setTimeout(() => { copyBtn.textContent = oldText; }, 1200);
    } catch (e) {
      resultText.focus();
      resultText.select();
      document.execCommand('copy');
    }
  });

  copyMojibakeBtn.addEventListener('click', async () => {
    if (!modifiedBytes || originalEncoding !== 'shift_jis') return;
    try {
      const mojibakeText = bytesToChineseAnsiMojibake(modifiedBytes);
      await navigator.clipboard.writeText(mojibakeText);
      const oldText = copyMojibakeBtn.textContent;
      copyMojibakeBtn.textContent = '已复制乱码文本';
      setTimeout(() => { copyMojibakeBtn.textContent = oldText; }, 1200);
    } catch (e) {
      alert('当前浏览器不支持 GBK 转码，请使用最新版 Chrome 或 Edge。');
    }
  });

})();
