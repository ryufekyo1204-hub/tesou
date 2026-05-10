/* 手相鑑定アプリ v3.0 — App Logic */

// ============================================================
// State
// ============================================================
let selectedFile = null;
let selectedHand = 'right';

// ============================================================
// DOM helpers
// ============================================================
const $ = id => document.getElementById(id);

const SECTIONS = ['uploadSection', 'previewSection', 'loadingSection', 'resultSection', 'errorSection'];

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

  const url = URL.createObjectURL(file);
  $('previewImage').src = url;
  $('resultThumb').src = url;

  showSection('previewSection');
}

$('cameraInput').addEventListener('change', e => handleFile(e.target.files[0]));
$('galleryInput').addEventListener('change', e => handleFile(e.target.files[0]));

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
  showSection('uploadSection');
}

$('retakeFromPreview').addEventListener('click', resetToUpload);
$('retakeBtn2').addEventListener('click', resetToUpload);
$('errorRetryBtn').addEventListener('click', resetToUpload);

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
    { id: 'lStep2', text: '手相の各線を観察中...', delay: 3500 },
    { id: 'lStep3', text: 'データベースと照合中...', delay: 9000 },
    { id: 'lStep4', text: '鑑定結果を生成中...', delay: 16000 },
  ];

  ['lStep1','lStep2','lStep3','lStep4'].forEach(id => {
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

  loadingTimer = () => timers.forEach(clearTimeout);
}

function stopLoadingAnimation() {
  if (loadingTimer) { loadingTimer(); loadingTimer = null; }
  ['lStep1','lStep2','lStep3','lStep4'].forEach(id => {
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

    const res = await fetch('/analyze', { method: 'POST', body: formData });
    const data = await res.json();

    stopLoadingAnimation();

    if (!res.ok || data.error) {
      showError(data.message || '分析に失敗しました。再度お試しください。');
      return;
    }

    renderResult(data);
    showSection('resultSection');
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
  setText('fortune2025', af['2025']);
  setText('fortune2026', af['2026']);
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
            <div class="detail-label">${d.label}</div>
            <div class="detail-value">${d.value}</div>
          </div>`).join('')}</div>`
      : '';

    const modernHTML = line.modern_lens
      ? `<p class="line-modern">🌐 ${escHtml(line.modern_lens)}</p>`
      : '';

    card.innerHTML = `
      <div class="line-card-header">
        <span class="line-emoji">${line.emoji || '✦'}</span>
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
// Utilities
// ============================================================
function setText(id, text) {
  const el = $(id);
  if (el && text) el.textContent = text;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
