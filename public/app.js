/* 手相鑑定アプリ v3.1 — App Logic */

// ============================================================
// State
// ============================================================
let selectedFile = null;
let selectedHand = 'right';
let selectedTheme = 'overall';
let currentMode = 'single'; // 'single' | 'comparison'
let currentPreviewUrl = null;
let compRightFile = null;
let compLeftFile = null;
let compRightUrl = null;
let compLeftUrl = null;

// ============================================================
// DOM helpers
// ============================================================
const $ = id => document.getElementById(id);

const SECTIONS = ['uploadSection', 'previewSection', 'loadingSection', 'resultSection', 'compResultSection', 'errorSection'];

function showSection(name) {
  SECTIONS.forEach(id => {
    const el = $(id);
    if (!el) return;
    el.classList.toggle('hidden', id !== name);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// Image preprocessing (compress before upload)
// ============================================================
function compressImage(file, maxPx = 1800, quality = 0.88) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        const ratio = Math.min(maxPx / width, maxPx / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// ============================================================
// File selection
// ============================================================
function handleFile(file) {
  if (!file?.type.startsWith('image/')) return;
  selectedFile = file;

  // 古いObject URLを解放してからメモリリークを防ぐ
  if (currentPreviewUrl) {
    URL.revokeObjectURL(currentPreviewUrl);
  }
  currentPreviewUrl = URL.createObjectURL(file);
  $('previewImage').src = currentPreviewUrl;
  $('resultThumb').src = currentPreviewUrl;

  showSection('previewSection');
}

$('cameraInput').addEventListener('change', e => handleFile(e.target.files[0]));
$('galleryInput').addEventListener('change', e => handleFile(e.target.files[0]));

// ============================================================
// Mode tabs
// ============================================================
document.querySelectorAll('.mode-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    currentMode = btn.dataset.mode;
    document.querySelectorAll('.mode-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === currentMode);
      b.setAttribute('aria-selected', String(b.dataset.mode === currentMode));
    });
    const isSingle = currentMode === 'single';
    $('singleUploadBtns').classList.toggle('hidden', !isSingle);
    $('compUploadGrid').classList.toggle('hidden', isSingle);
    $('compAnalyzeBtn').classList.add('hidden');
    compRightFile = compLeftFile = null;
    resetCompSlot('compRightThumbArea', 'rightPalmInput');
    resetCompSlot('compLeftThumbArea', 'leftPalmInput');
  });
});

function resetCompSlot(areaId, inputId) {
  const area = $(areaId);
  if (!area) return;
  area.innerHTML = `<label class="comp-upload-btn" for="${inputId}">📸 アップロード</label>
    <input type="file" id="${inputId}" accept="image/*" hidden>`;
  reattachCompInput(inputId);
}

function reattachCompInput(inputId) {
  const el = $(inputId);
  if (!el) return;
  el.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file?.type.startsWith('image/')) return;
    if (inputId === 'rightPalmInput') handleCompFile('right', file);
    else handleCompFile('left', file);
  });
}

function handleCompFile(side, file) {
  if (side === 'right') {
    if (compRightUrl) URL.revokeObjectURL(compRightUrl);
    compRightFile = file;
    compRightUrl = URL.createObjectURL(file);
    $('compRightSlot').classList.add('has-image');
    const area = $('compRightThumbArea');
    area.innerHTML = `<img src="${compRightUrl}" class="comp-thumb" alt="右手">
      <label class="comp-upload-btn" for="rightPalmInput" style="font-size:0.7rem">📸 撮り直す</label>
      <input type="file" id="rightPalmInput" accept="image/*" hidden>`;
    reattachCompInput('rightPalmInput');
  } else {
    if (compLeftUrl) URL.revokeObjectURL(compLeftUrl);
    compLeftFile = file;
    compLeftUrl = URL.createObjectURL(file);
    $('compLeftSlot').classList.add('has-image');
    const area = $('compLeftThumbArea');
    area.innerHTML = `<img src="${compLeftUrl}" class="comp-thumb" alt="左手">
      <label class="comp-upload-btn" for="leftPalmInput" style="font-size:0.7rem">📸 撮り直す</label>
      <input type="file" id="leftPalmInput" accept="image/*" hidden>`;
    reattachCompInput('leftPalmInput');
  }
  $('compAnalyzeBtn').classList.toggle('hidden', !(compRightFile && compLeftFile));
}

reattachCompInput('rightPalmInput');
reattachCompInput('leftPalmInput');

// ============================================================
// Theme selector
// ============================================================
document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedTheme = btn.dataset.theme;
    document.querySelectorAll('.theme-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === selectedTheme);
      b.setAttribute('aria-pressed', String(b.dataset.theme === selectedTheme));
    });
  });
});

// ============================================================
// Hand selector
// ============================================================
const HAND_HINTS = {
  right: '右手：現在の状態・努力・これからの人生を示します',
  left:  '左手：生まれ持った潜在能力・本来の資質を示します',
  unclear: '両手を合わせてより詳細な読み取りが可能です',
};

document.querySelectorAll('.hand-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedHand = btn.dataset.hand;
    document.querySelectorAll('.hand-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.hand === selectedHand);
      b.setAttribute('aria-pressed', String(b.dataset.hand === selectedHand));
    });
    $('handHint').textContent = HAND_HINTS[selectedHand] || '';
  });
});

// ============================================================
// Retake / Reset
// ============================================================
function resetToUpload() {
  selectedFile = null;
  $('cameraInput').value = '';
  $('galleryInput').value = '';
  // 手の選択をデフォルト（右手）にリセット
  selectedHand = 'right';
  document.querySelectorAll('.hand-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.hand === 'right');
    b.setAttribute('aria-pressed', String(b.dataset.hand === 'right'));
  });
  $('handHint').textContent = HAND_HINTS['right'];
  showSection('uploadSection');
}

$('retakeFromPreview').addEventListener('click', resetToUpload);
$('retakeBtn2').addEventListener('click', resetToUpload);
$('errorRetryBtn').addEventListener('click', resetToUpload);
$('compRetakeBtn').addEventListener('click', resetToUpload);

// ============================================================
// Comparison Analyze button
// ============================================================
$('compAnalyzeBtn').addEventListener('click', async () => {
  if (!compRightFile || !compLeftFile) return;
  $('compAnalyzeBtn').disabled = true;
  showSection('loadingSection');
  startLoadingAnimation();

  try {
    const [rightComp, leftComp] = await Promise.all([
      compressImage(compRightFile),
      compressImage(compLeftFile),
    ]);
    const formData = new FormData();
    formData.append('right_palm', rightComp, 'right.jpg');
    formData.append('left_palm', leftComp, 'left.jpg');
    formData.append('theme', selectedTheme);

    const res = await fetch('/analyze-comparison', { method: 'POST', body: formData });
    let data;
    try { data = await res.json(); } catch {
      stopLoadingAnimation();
      showError(res.status === 413 ? '画像ファイルが大きすぎます。' : 'サーバーエラーが発生しました。');
      return;
    }
    stopLoadingAnimation();
    if (!res.ok || data.error) { showError(data.message || '分析に失敗しました。'); return; }
    renderComparisonResult(data);
    showSection('compResultSection');
    requestAnimationFrame(() => {
      const title = document.querySelector('#compResultSection .result-title');
      if (title) { title.setAttribute('tabindex', '-1'); title.focus(); }
    });
  } catch {
    stopLoadingAnimation();
    showError('通信エラーが発生しました。ネットワーク接続を確認してください。');
  } finally {
    $('compAnalyzeBtn').disabled = false;
  }
});

// ============================================================
// Share
// ============================================================
$('shareBtn').addEventListener('click', async () => {
  const text = `🔮 AI手相鑑定を体験しました！\n手相から個性・運勢・恋愛・仕事まで詳しく鑑定。\nあなたも試してみて！`;
  if (navigator.share) {
    try { await navigator.share({ title: '手相鑑定', text }); } catch { /* cancelled */ }
  } else {
    await navigator.clipboard.writeText(text).catch(() => {});
    const btn = $('shareBtn');
    const orig = btn.innerHTML;
    btn.innerHTML = '<span>✓</span> コピーしました';
    setTimeout(() => { btn.innerHTML = orig; }, 2000);
  }
});

// ============================================================
// Loading steps
// ============================================================
let loadingTimer = null;

function startLoadingAnimation() {
  const steps = [
    { id: 'lStep1', text: '画像の品質を確認中...', delay: 0 },
    { id: 'lStep2', text: '手相の各線を観察中...', delay: 4000 },
    { id: 'lStep3', text: 'データベースと照合中...', delay: 12000 },
    { id: 'lStep4', text: '鑑定結果を生成中...', delay: 22000 },
    { id: 'lStep5', text: '鑑定結果を最終検証中...', delay: 38000 },
  ];

  ['lStep1','lStep2','lStep3','lStep4','lStep5'].forEach(id => {
    const el = $(id);
    if (el) { el.classList.remove('active', 'done'); }
  });

  const timers = [];
  steps.forEach(({ id, text, delay }, i) => {
    const t = setTimeout(() => {
      if (i > 0) {
        const prev = $(steps[i-1].id);
        if (prev) { prev.classList.remove('active'); prev.classList.add('done'); }
      }
      const el = $(id);
      if (el) { el.classList.add('active'); }
      const mainText = $('loadingMainText');
      if (mainText) mainText.textContent = text;
    }, delay);
    timers.push(t);
  });

  // 全ステップ完了後（最終ステップの delay + 5s）に継続フィードバックを開始
  // 即時開始するとステップメッセージと競合するため遅延させる
  const WAIT_START = steps[steps.length - 1].delay + 5000;
  const waitMessages = ['AIが詳しく解析しています...', '手相の細部を確認しています...', 'もうすぐ完成します...'];
  let waitIdx = 0;
  let waitIntervalId = null;

  const waitStartTimer = setTimeout(() => {
    waitIntervalId = setInterval(() => {
      waitIdx = (waitIdx + 1) % waitMessages.length;
      const mainText = $('loadingMainText');
      if (mainText) mainText.textContent = waitMessages[waitIdx];
    }, 7000);
  }, WAIT_START);

  timers.push(waitStartTimer);

  loadingTimer = () => {
    timers.forEach(t => clearTimeout(t));
    if (waitIntervalId) clearInterval(waitIntervalId);
  };
}

function stopLoadingAnimation() {
  if (loadingTimer) { loadingTimer(); loadingTimer = null; }
  ['lStep1','lStep2','lStep3','lStep4','lStep5'].forEach(id => {
    const el = $(id);
    if (el) { el.classList.remove('active'); el.classList.add('done'); }
  });
}

// ============================================================
// Analyze
// ============================================================
$('analyzeBtn').addEventListener('click', async () => {
  if (!selectedFile) return;

  $('analyzeBtn').disabled = true;
  showSection('loadingSection');
  startLoadingAnimation();

  try {
    const compressed = await compressImage(selectedFile);
    const formData = new FormData();
    formData.append('palm', compressed, 'palm.jpg');
    formData.append('hand', selectedHand);
    formData.append('theme', selectedTheme);

    const res = await fetch('/analyze', { method: 'POST', body: formData });

    let data;
    try {
      data = await res.json();
    } catch {
      // サーバーがHTMLエラーページを返した場合（MulterError等）
      stopLoadingAnimation();
      showError(res.status === 413
        ? '画像ファイルが大きすぎます（最大20MB）。別の画像でお試しください。'
        : 'サーバーエラーが発生しました。再度お試しください。');
      return;
    }

    stopLoadingAnimation();

    if (!res.ok || data.error) {
      showError(data.message || '分析に失敗しました。再度お試しください。');
      return;
    }

    renderResult(data);
    showSection('resultSection');
    // アクセシビリティ: キーボードフォーカスを結果の先頭へ
    requestAnimationFrame(() => {
      const title = document.querySelector('#resultSection .result-title');
      if (title) { title.setAttribute('tabindex', '-1'); title.focus(); }
    });
  } catch {
    stopLoadingAnimation();
    showError('通信エラーが発生しました。ネットワーク接続を確認してください。');
  } finally {
    $('analyzeBtn').disabled = false;
  }
});

// ============================================================
// Error display
// ============================================================
function showError(msg) {
  $('errorMessage').textContent = msg;
  showSection('errorSection');
}

// ============================================================
// Render result
// ============================================================
function renderResult(data) {
  const { interpretation: r, quality } = data;
  if (!r) { showError('鑑定結果の取得に失敗しました。'); return; }

  // Meta
  const meta = r.meta || {};
  $('resultMeta').textContent =
    [meta.hand_shape, meta.hand_meaning].filter(Boolean).join(' · ');

  // Readability badge
  const badge = $('readabilityBadge');
  const readability = quality?.readability || meta.overall_readability || 'medium';
  const badgeLabels = { high: '✓ 高精度で分析できました', medium: '⚡ 標準精度で分析しました', low: '⚠ 画像品質が低いため精度が下がっています' };
  badge.textContent = badgeLabels[readability] || '';
  badge.className = `readability-badge ${readability}`;
  badge.classList.remove('hidden');

  // Opening
  setText('openingText', r.opening);

  // Personality
  const pers = r.personality || {};
  setText('personalityCore', pers.core);

  const chipsEl = $('strengthChips');
  chipsEl.innerHTML = '';
  (pers.strengths || []).forEach(s => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = s;
    chipsEl.appendChild(chip);
  });

  const themeEl = $('lifeTheme');
  themeEl.textContent = pers.life_theme ? `🌙 人生のテーマ：${pers.life_theme}` : '';

  // Lines
  renderLines(r.lines);

  // Other notable lines
  const otherCard = $('otherLinesCard');
  const otherText = r.lines?.other_notable;
  if (otherText) {
    $('otherLinesText').textContent = otherText;
    otherCard.classList.remove('hidden');
  }

  // Mounts
  const mountsCard = $('mountsCard');
  const mountsText = r.mounts_summary;
  if (mountsText) {
    $('mountsText').textContent = mountsText;
    mountsCard.classList.remove('hidden');
  }

  // Special marks
  renderSpecialMarks(r.special_marks);

  // Annual fortune
  const af = r.annual_fortune || {};
  setText('fortune2026', af['2026']);
  setText('fortune2027', af['2027']);
  const focusEl = $('focusArea');
  focusEl.textContent = af.focus_area ? `注目エリア：${af.focus_area}` : '';

  // Life advice
  setText('lifeAdvice', r.life_advice);

  // Lucky
  renderLucky(r.lucky);

  // Closing
  setText('closingText', r.closing);
}

// ---- Lines ----
const LINE_ORDER = ['life', 'heart', 'head', 'fate', 'sun'];
const LINE_CLASS_MAP = { life: 'line-life', heart: 'line-heart', head: 'line-head', fate: 'line-fate', sun: 'line-sun' };

function confidenceLabel(c) {
  const map = { high: '高精度', medium: '標準', low: '低精度', not_visible: '確認できず' };
  return map[c] || c || '';
}
function confidenceClass(c) {
  return `confidence-badge conf-${c || 'medium'}`;
}

function renderLines(lines) {
  if (!lines) return;
  const container = $('linesContainer');
  container.innerHTML = '';

  LINE_ORDER.forEach((key, i) => {
    const line = lines[key];
    if (!line) return;

    const card = document.createElement('div');
    card.className = `line-card ${LINE_CLASS_MAP[key] || ''} fade-in-up`;
    card.style.animationDelay = `${i * 0.08}s`;

    const conf = line.confidence || 'medium';

    // Details rows
    const detailItems = [];
    if (line.thinking_style)  detailItems.push({ label: '思考スタイル', value: line.thinking_style });
    if (line.love_style)      detailItems.push({ label: '愛情スタイル', value: line.love_style });
    if (line.career_hint)     detailItems.push({ label: 'キャリアヒント', value: line.career_hint });
    if (line.career_path)     detailItems.push({ label: 'キャリア方向', value: line.career_path });
    if (line.timing)          detailItems.push({ label: '時期の目安', value: line.timing });

    const detailHTML = detailItems.length > 0
      ? `<div class="line-detail-row">${detailItems.slice(0, 2).map(d => `
          <div class="line-detail-item">
            <div class="detail-label">${escHtml(d.label)}</div>
            <div class="detail-value">${escHtml(d.value)}</div>
          </div>`).join('')}</div>`
      : '';

    const modernHTML = line.modern_lens
      ? `<p class="line-modern">🌐 ${escHtml(line.modern_lens)}</p>`
      : '';

    card.innerHTML = `
      <div class="line-card-header">
        <span class="line-emoji">${escHtml(line.emoji || '✦')}</span>
        <span class="line-name">${escHtml(line.title || '')}</span>
        <span class="${confidenceClass(conf)}">${confidenceLabel(conf)}</span>
      </div>
      <div class="line-card-body">
        <p class="line-reading">${escHtml(line.reading || '')}</p>
        ${detailHTML}
        ${line.advice ? `<div class="line-advice">
          <div class="line-advice-label">✨ アドバイス</div>
          <div class="line-advice-text">${escHtml(line.advice)}</div>
        </div>` : ''}
        ${modernHTML}
      </div>`;

    container.appendChild(card);
  });
}

// ---- Special Marks ----
const MARK_ICONS = {
  'ます掛け': '☯️',
  '仏眼': '👁',
  '神秘十字線': '✝️',
  '星紋': '⭐',
  '四角紋': '🟪',
  '島紋': '🏝️',
  '三角紋': '🔺',
  '格子紋': '🔲',
  '十字紋': '✚',
  '手頸線': '〰️',
};

function renderSpecialMarks(sm) {
  if (!sm) return;
  const foundEl = $('specialMarksFound');
  foundEl.innerHTML = '';

  const found = sm.found || [];
  found.forEach(mark => {
    const item = document.createElement('div');
    item.className = 'special-mark-item';
    const name = typeof mark === 'string' ? mark : (mark.name || mark);
    const desc = typeof mark === 'object' ? (mark.description || mark.meaning || '') : '';
    const icon = Object.entries(MARK_ICONS).find(([k]) => name.includes(k))?.[1] || '✨';
    item.innerHTML = `
      <span class="mark-icon">${icon}</span>
      <div class="mark-content">
        <div class="mark-name">${escHtml(name)}</div>
        ${desc ? `<div class="mark-desc">${escHtml(desc)}</div>` : ''}
      </div>`;
    foundEl.appendChild(item);
  });

  setText('specialMarksSummary', sm.summary);
}

// ---- Lucky ----
function renderLucky(lucky) {
  if (!lucky) return;
  const grid = $('luckyGrid');
  grid.innerHTML = '';

  const items = [
    { label: '🎨 ラッキーカラー', value: lucky.color },
    { label: '🔢 ラッキーナンバー', value: lucky.number },
    { label: '💎 パワーストーン', value: lucky.stone },
    { label: '🧭 ラッキー方角', value: lucky.direction },
  ];

  items.forEach(({ label, value }) => {
    if (!value) return;
    const div = document.createElement('div');
    div.className = 'lucky-item';
    div.innerHTML = `<div class="lucky-label">${label}</div><div class="lucky-value">${escHtml(String(value))}</div>`;
    grid.appendChild(div);
  });

  const kwWrap = $('luckyKeyword');
  kwWrap.innerHTML = '';
  if (lucky.keyword) {
    kwWrap.innerHTML = `
      <div class="lucky-keyword-label">🔑 今年のキーワード</div>
      <div class="lucky-keyword-value">${escHtml(lucky.keyword)}</div>`;
  }
}

// ============================================================
// Render comparison result
// ============================================================
function renderComparisonResult(data) {
  const { comparison: c } = data;
  if (!c) { showError('比較鑑定結果の取得に失敗しました。'); return; }

  setText('compRightSummary', c.right_summary);
  setText('compLeftSummary', c.left_summary);
  setText('compConsistency', c.consistency);
  setText('compGap', c.gap);
  setText('compGrowth', c.growth_opportunity);
  setText('compOverallInsight', c.overall_insight);
  setText('compFortune2026', c.fortune_2026);
  setText('compFortune2027', c.fortune_2027);
  setText('compLifeAdvice', c.life_advice);
  setText('compClosing', c.closing);

  // Lucky
  const lucky = c.lucky || {};
  const grid = $('compLuckyGrid');
  grid.innerHTML = '';
  [
    { label: '🎨 ラッキーカラー', value: lucky.color },
    { label: '🔢 ラッキーナンバー', value: lucky.number },
  ].forEach(({ label, value }) => {
    if (!value) return;
    const div = document.createElement('div');
    div.className = 'lucky-item';
    div.innerHTML = `<div class="lucky-label">${label}</div><div class="lucky-value">${escHtml(String(value))}</div>`;
    grid.appendChild(div);
  });
  const kwWrap = $('compLuckyKeyword');
  kwWrap.innerHTML = lucky.keyword
    ? `<div class="lucky-keyword-label">🔑 2026年のキーワード</div>
       <div class="lucky-keyword-value">${escHtml(lucky.keyword)}</div>`
    : '';
}

$('compShareBtn').addEventListener('click', async () => {
  const text = `🤲 AI両手比較手相鑑定を体験しました！\n右手と左手を読み解いて、潜在能力と現在の自分を比較鑑定。\nあなたも試してみて！`;
  if (navigator.share) {
    try { await navigator.share({ title: '両手比較手相鑑定', text }); } catch { /* cancelled */ }
  } else {
    await navigator.clipboard.writeText(text).catch(() => {});
    const btn = $('compShareBtn');
    const orig = btn.innerHTML;
    btn.innerHTML = '<span>✓</span> コピーしました';
    setTimeout(() => { btn.innerHTML = orig; }, 2000);
  }
});

// ============================================================
// Utilities
// ============================================================
function setText(id, text) {
  const el = $(id);
  if (!el) return;
  // text が falsy でも空文字ならクリアする（前回の結果が残らないように）
  el.textContent = text != null ? text : '';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
