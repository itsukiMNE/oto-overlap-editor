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
  const generateBxBtn = document.getElementById('generateBxBtn');
  const copyBxBtn = document.getElementById('copyBxBtn');
  const copyBxMojibakeBtn = document.getElementById('copyBxMojibakeBtn');
  const bxStatus = document.getElementById('bxStatus');
  const bxPreviewContainer = document.getElementById('bxPreviewContainer');
  const bxResultBox = document.getElementById('bxResultBox');
  const bxResultText = document.getElementById('bxResultText');

  let originalText = '';
  let originalBytes = null;
  let modifiedBytes = null;
  let originalEncoding = 'utf-8';
  let parsedLines = [];
  let modifiedText = '';
  let sourceFileName = 'oto.ini';
  let bxModifiedText = '';
  let bxModifiedBytes = null;

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

    // v0.15: あ / い / う / え / お / を / ん share one suffix rule.
    // If one of these kana is the base alias, trailing numbers, letters, or non-kana
    // markers do not change the classification (e.g. あ2, を1, んm, んN).
    // Kana combinations such as うぃ are not matched here and continue to the normal rules.
    if (/^[あいうえおをん](?:$|[^ぁ-ゖァ-ヺ].*)/u.test(t)) return 'vowel_n';

    if (startsWithAny(t, KTP_PREFIXES)) return 'ktp';
    if (startsWithAny(t, WY_PREFIXES)) return 'wy';

    return 'other';
  }

  function calculateOverlap(preutterance, target) {
    if (!Number.isFinite(preutterance)) return null;

    const category = classify(target);
    if (category === 'ktp') return -5;
    if (category === 'wy' || category === 'ending') return preutterance * 2 / 5;
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

  function roundOne(value) {
    return Math.round((value + Number.EPSILON) * 10) / 10;
  }

  function formatCompactOne(value) {
    if (!Number.isFinite(value)) return '';
    const rounded = roundOne(value);
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  function parseBxSource(line) {
    const data = getAliasAndSound(line);
    if (!data) return null;
    const rawAlias = data.alias.trim();
    const m = rawAlias.match(/^-\s+(.+)$/u);
    if (!m) return null;

    const x = m[1];
    const offset = parseFloat(data.parts[1]);
    const consonant = parseFloat(data.parts[2]);
    const cutoff = parseFloat(data.parts[3]);
    const pre = parseFloat(data.parts[4]);
    if (![offset, consonant, cutoff, pre].every(Number.isFinite)) return null;

    const newOffset = 600;
    const delta = offset - newOffset;
    const newConsonant = consonant + delta;
    const newCutoff = cutoff - delta;
    const newPre = pre + delta;
    const newOverlap = roundOne(newPre / 3);

    return {
      left: data.left,
      sourceAlias: rawAlias,
      newAlias: `b${x}`,
      newOffset,
      newConsonant,
      newCutoff,
      newPre,
      newOverlap
    };
  }

  function getAliasByteRange(lineBytes) {
    let eq = -1;
    let comma = -1;
    for (let i = 0; i < lineBytes.length; i++) {
      if (eq < 0 && lineBytes[i] === 0x3D) eq = i;
      else if (eq >= 0 && lineBytes[i] === 0x2C) { comma = i; break; }
    }
    if (eq < 0 || comma < 0) return null;
    return { eq, aliasStart: eq + 1, aliasEnd: comma };
  }

  function buildBxByteLine(lineBytes, bx) {
    const range = getAliasByteRange(lineBytes);
    if (!range) return null;

    // Reuse the original Japanese bytes after "- " and only prepend ASCII "b".
    let xStart = range.aliasStart;
    while (xStart < range.aliasEnd && (lineBytes[xStart] === 0x20 || lineBytes[xStart] === 0x09)) xStart++;
    if (lineBytes[xStart] !== 0x2D) return null; // '-'
    xStart++;
    while (xStart < range.aliasEnd && (lineBytes[xStart] === 0x20 || lineBytes[xStart] === 0x09)) xStart++;
    const xBytes = lineBytes.slice(xStart, range.aliasEnd);

    const ascii = new TextEncoder();
    const fields = [
      ascii.encode('b'), xBytes,
      ascii.encode(',' + formatCompactOne(bx.newOffset)),
      ascii.encode(',' + formatCompactOne(bx.newConsonant)),
      ascii.encode(',' + formatCompactOne(bx.newCutoff)),
      ascii.encode(',' + formatCompactOne(bx.newPre)),
      ascii.encode(',' + formatNumber(bx.newOverlap))
    ];

    return concatBytes([
      lineBytes.slice(0, range.aliasStart),
      ...fields
    ]);
  }

  function buildBxPreview() {
    if (!originalText || !originalBytes) return;

    const { lines, newline } = parseText(originalText);
    const byteLines = splitByteLines(originalBytes);
    const rows = [];
    const textLines = [];
    const byteChunks = [];

    for (let i = 0; i < lines.length; i++) {
      const bx = parseBxSource(lines[i]);
      if (!bx) continue;

      const newLine = `${bx.left}=${bx.newAlias},${formatCompactOne(bx.newOffset)},${formatCompactOne(bx.newConsonant)},${formatCompactOne(bx.newCutoff)},${formatCompactOne(bx.newPre)},${formatNumber(bx.newOverlap)}`;
      textLines.push(newLine);
      rows.push(bx);

      const byteLine = byteLines[i];
      if (byteLine) {
        const newByteLine = buildBxByteLine(byteLine.content, bx);
        if (newByteLine) {
          byteChunks.push(newByteLine, byteLine.ending.length ? byteLine.ending : new TextEncoder().encode(newline));
        }
      }
    }

    bxModifiedText = textLines.join(newline);
    if (bxModifiedText && originalText.endsWith(newline)) bxModifiedText += newline;
    bxResultText.value = bxModifiedText;
    bxResultBox.style.display = rows.length ? 'block' : 'none';

    if (byteChunks.length) {
      bxModifiedBytes = concatBytes(byteChunks);
    } else {
      bxModifiedBytes = null;
    }

    if (!rows.length) {
      bxStatus.innerHTML = '<span class="error">没有找到 Alias 为 “- X” 的条目</span>';
      bxPreviewContainer.innerHTML = '';
      copyBxBtn.disabled = true;
      copyBxMojibakeBtn.disabled = true;
      return;
    }

    bxStatus.textContent = `已生成 ${rows.length} 条 bX`;
    copyBxBtn.disabled = false;
    copyBxMojibakeBtn.disabled = originalEncoding !== 'shift_jis' || !bxModifiedBytes;

    bxPreviewContainer.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>来源 Alias</th>
              <th>新 Alias</th>
              <th>Offset</th>
              <th>Consonant</th>
              <th>Cutoff</th>
              <th>Preutterance</th>
              <th>Overlap</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${escapeHtml(r.sourceAlias)}</td>
                <td><strong>${escapeHtml(r.newAlias)}</strong></td>
                <td>${escapeHtml(formatCompactOne(r.newOffset))}</td>
                <td>${escapeHtml(formatCompactOne(r.newConsonant))}</td>
                <td>${escapeHtml(formatCompactOne(r.newCutoff))}</td>
                <td>${escapeHtml(formatCompactOne(r.newPre))}</td>
                <td>${escapeHtml(formatNumber(r.newOverlap))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  }


  function splitSimplePitchAlias(alias) {
    const raw = alias.trim();
    const m = raw.match(/^(.*?)([\s_-]*[A-G](?:#|b)?-?\d+)$/i);
    if (!m) return { base: raw, suffix: '' };
    return { base: m[1].trimEnd(), suffix: m[2] };
  }

  function encodeGeneratedKanaAlias(alias) {
    if (originalEncoding !== 'shift_jis') {
      return new TextEncoder().encode(alias);
    }
    const first = alias[0];
    const rest = alias.slice(1);
    const map = {
      'を': new Uint8Array([0x82, 0xF0]),
      'づ': new Uint8Array([0x82, 0xC3])
    };
    const head = map[first];
    if (!head) return null;
    if (!/^[\x00-\x7F]*$/.test(rest)) return null;
    return concatBytes([head, new TextEncoder().encode(rest)]);
  }

  function replaceAliasInByteLine(lineBytes, newAlias) {
    const range = getAliasByteRange(lineBytes);
    if (!range) return null;
    let contentStart = range.aliasStart;
    while (contentStart < range.aliasEnd && (lineBytes[contentStart] === 0x20 || lineBytes[contentStart] === 0x09)) contentStart++;
    let contentEnd = range.aliasEnd;
    while (contentEnd > contentStart && (lineBytes[contentEnd - 1] === 0x20 || lineBytes[contentEnd - 1] === 0x09)) contentEnd--;
    const encodedAlias = encodeGeneratedKanaAlias(newAlias);
    if (!encodedAlias) return null;
    return concatBytes([lineBytes.slice(0, contentStart), encodedAlias, lineBytes.slice(contentEnd)]);
  }

  function replaceAliasInTextLine(line, newAlias) {
    const eq = line.indexOf('=');
    if (eq < 0) return line;
    const comma = line.indexOf(',', eq + 1);
    if (comma < 0) return line;
    const field = line.slice(eq + 1, comma);
    const lead = (field.match(/^\s*/) || [''])[0];
    const trail = (field.match(/\s*$/) || [''])[0];
    return line.slice(0, eq + 1) + lead + newAlias + trail + line.slice(comma);
  }

  function buildKanaCompletionForMain(lines, modifiedLineBytes, lineEndings, newline) {
    let hasWo = false;
    let hasDu = false;
    const sources = [];

    for (let i = 0; i < lines.length; i++) {
      const data = getAliasAndSound(lines[i]);
      if (!data || !data.alias) continue;
      const parsed = splitSimplePitchAlias(data.alias);
      if (parsed.base === 'を') hasWo = true;
      if (parsed.base === 'づ') hasDu = true;
      if (parsed.base === 'お' || parsed.base === 'ず') {
        sources.push({ index: i, sourceAlias: data.alias.trim(), base: parsed.base, suffix: parsed.suffix });
      }
    }

    const rows = [];
    const textLines = [];
    const byteChunks = [];
    const decoder = new TextDecoder(originalEncoding === 'shift_jis' ? 'shift_jis' : 'utf-8');
    const fallbackEnding = new TextEncoder().encode(newline);

    for (const source of sources) {
      const targetBase = source.base === 'お' ? 'を' : 'づ';
      if ((targetBase === 'を' && hasWo) || (targetBase === 'づ' && hasDu)) continue;

      const newAlias = targetBase + source.suffix;
      const sourceBytes = modifiedLineBytes[source.index];
      if (!sourceBytes) continue;
      const newByteLine = replaceAliasInByteLine(sourceBytes, newAlias);
      if (!newByteLine) continue;

      textLines.push(decoder.decode(newByteLine));
      rows.push({ sourceAlias: source.sourceAlias, newAlias });
      byteChunks.push(newByteLine, (lineEndings[source.index] && lineEndings[source.index].length) ? lineEndings[source.index] : fallbackEnding);
    }

    const missing = [];
    if (!hasWo && !sources.some(s => s.base === 'お')) missing.push('を（没有可复制的 お）');
    if (!hasDu && !sources.some(s => s.base === 'ず')) missing.push('づ（没有可复制的 ず）');

    return { rows, textLines, byteChunks, missing, hasWo, hasDu };
  }

  function buildPreview() {
    if (!originalText || !originalBytes) return;

    const { lines, newline } = parseText(originalText);
    const byteLines = splitByteLines(originalBytes);
    const rows = [];
    const outByteChunks = [];
    const modifiedLineBytes = [];
    const lineEndings = [];
    let changed = 0;
    let skipped = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const byteLine = byteLines[i] || { content: new Uint8Array(0), ending: new Uint8Array(0) };
      const data = getAliasAndSound(line);
      lineEndings[i] = byteLine.ending;

      if (!data) {
        modifiedLineBytes[i] = byteLine.content;
        outByteChunks.push(byteLine.content, byteLine.ending);
        continue;
      }

      const { target, alias, parts } = data;
      const pre = parseFloat(parts[4]);
      const oldOverlap = parts[5];
      const newOverlap = calculateOverlap(pre, target);

      if (!Number.isFinite(pre) || newOverlap === null) {
        modifiedLineBytes[i] = byteLine.content;
        outByteChunks.push(byteLine.content, byteLine.ending);
        skipped++;
        continue;
      }

      const category = classify(target);
      const newText = formatNumber(newOverlap);
      const newByteLine = replaceOverlapInByteLine(byteLine.content, newText);
      modifiedLineBytes[i] = newByteLine;
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

    const kana = buildKanaCompletionForMain(lines, modifiedLineBytes, lineEndings, newline);
    if (kana.byteChunks.length) {
      // If the original file had no final newline, insert one before appended aliases.
      const lastOriginal = outByteChunks.length ? outByteChunks[outByteChunks.length - 1] : null;
      if (lastOriginal && lastOriginal.length === 0) outByteChunks.push(new TextEncoder().encode(newline));
      outByteChunks.push(...kana.byteChunks);
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

    const kanaNote = kana.rows.length
      ? `；同时补全 ${kana.rows.map(r => r.newAlias).join('、')}`
      : (kana.missing.length ? `；${kana.missing.join('、')}` : '；を / づ 已齐全');
    previewStatus.textContent = `可处理 ${changed} 行${skipped ? `，跳过 ${skipped} 行` : ''}${kanaNote}`;
    copyBtn.disabled = false;
    copyMojibakeBtn.disabled = originalEncoding !== 'shift_jis';

    const completionHtml = kana.rows.length ? `
      <div class="status" style="margin-bottom:10px;">自动补全：${kana.rows.map(r => `${escapeHtml(r.sourceAlias)} → <strong>${escapeHtml(r.newAlias)}</strong>`).join('；')}</div>` : '';

    const html = `
      ${completionHtml}
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
      generateBxBtn.disabled = false;
      copyBxBtn.disabled = true;
      copyBxMojibakeBtn.disabled = true;
      bxModifiedText = '';
      bxModifiedBytes = null;
      bxPreviewContainer.innerHTML = '';
      bxResultBox.style.display = 'none';
      bxResultText.value = '';
      bxStatus.textContent = '点击“生成 bX”查看结果';
      const encodingLabel = originalEncoding === 'shift_jis' ? '日文 ANSI（CP932 / Shift_JIS）' : 'UTF-8';
      fileStatus.textContent = `${sourceFileName} · 已读取 · 读取编码：${encodingLabel}`;
      previewStatus.textContent = '点击“生成完整结果”查看修改及补全结果';
    } catch (e) {
      fileStatus.innerHTML = '<span class="error">读取文件失败</span>';
      previewBtn.disabled = true;
      copyBtn.disabled = true;
      copyMojibakeBtn.disabled = true;
      generateBxBtn.disabled = true;
      copyBxBtn.disabled = true;
      copyBxMojibakeBtn.disabled = true;
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

  generateBxBtn.addEventListener('click', buildBxPreview);

  copyBxBtn.addEventListener('click', async () => {
    if (!bxModifiedText) return;
    try {
      await navigator.clipboard.writeText(bxModifiedText);
      const oldText = copyBxBtn.textContent;
      copyBxBtn.textContent = '已复制';
      setTimeout(() => { copyBxBtn.textContent = oldText; }, 1200);
    } catch (e) {
      bxResultText.focus();
      bxResultText.select();
      document.execCommand('copy');
    }
  });

  copyBxMojibakeBtn.addEventListener('click', async () => {
    if (!bxModifiedBytes || originalEncoding !== 'shift_jis') return;
    try {
      const mojibakeText = bytesToChineseAnsiMojibake(bxModifiedBytes);
      await navigator.clipboard.writeText(mojibakeText);
      const oldText = copyBxMojibakeBtn.textContent;
      copyBxMojibakeBtn.textContent = '已复制乱码文本';
      setTimeout(() => { copyBxMojibakeBtn.textContent = oldText; }, 1200);
    } catch (e) {
      alert('当前浏览器不支持 GBK 转码，请使用最新版 Chrome 或 Edge。');
    }
  });


})();
