const $ = id => document.getElementById(id);

const sections = {
  upload:   $('uploadSection'),
  preview:  $('previewSection'),
  loading:  $('loadingSection'),
  result:   $('resultSection'),
  error:    $('errorSection'),
};

function show(name) {
  Object.values(sections).forEach(s => s.classList.add('hidden'));
  sections[name].classList.remove('hidden');
  sections[name].classList.add('fade-in');
}

let selectedFile = null;

function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  selectedFile = file;
  const url = URL.createObjectURL(file);
  $('previewImage').src = url;
  $('resultThumb').src = url;
  show('preview');
}

$('cameraInput').addEventListener('change', e => handleFile(e.target.files[0]));
$('galleryInput').addEventListener('change', e => handleFile(e.target.files[0]));

$('retakeBtn').addEventListener('click', resetToUpload);
$('retakeBtn2').addEventListener('click', resetToUpload);
$('errorRetryBtn').addEventListener('click', resetToUpload);

function resetToUpload() {
  selectedFile = null;
  $('cameraInput').value = '';
  $('galleryInput').value = '';
  show('upload');
}

// Loading animation steps
async function runLoadingSteps() {
  const steps = ['step1', 'step2', 'step3'];
  const delays = [600, 1400, 2400];
  const texts = ['手相を解析中...', '線の特徴を分析中...', '運勢を鑑定中...'];

  steps.forEach(id => { const el = $(id); el.classList.remove('active','done'); });
  $('loadingText').textContent = '手相を読み取り中...';

  for (let i = 0; i < steps.length; i++) {
    await new Promise(r => setTimeout(r, delays[i]));
    const el = $(steps[i]);
    el.classList.add('active');
    $('loadingText').textContent = texts[i];
    if (i > 0) $(steps[i - 1]).classList.add('done');
  }
}

$('analyzeBtn').addEventListener('click', async () => {
  if (!selectedFile) return;

  show('loading');
  runLoadingSteps();

  const formData = new FormData();
  formData.append('palm', selectedFile);

  try {
    const res = await fetch('/analyze', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok || data.error) {
      showError(data.error || '分析に失敗しました。再度お試しください。');
      return;
    }

    renderResult(data);
    show('result');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch {
    showError('通信エラーが発生しました。ネットワークを確認してください。');
  }
});

function showError(msg) {
  $('errorText').textContent = msg;
  show('error');
}

function renderResult(data) {
  $('overallText').textContent = data.overall || '';
  $('personalityText').textContent = data.personality || '';
  $('specialText').textContent = data.special_marks || '';
  $('yearText').textContent = data.year_fortune || '';
  $('adviceText').textContent = data.advice || '';

  // Lines
  const linesGrid = $('linesGrid');
  linesGrid.innerHTML = '';
  const lineOrder = ['life', 'heart', 'head', 'fate'];
  (data.lines ? lineOrder : []).forEach(key => {
    const line = data.lines[key];
    if (!line) return;
    const card = document.createElement('div');
    card.className = `line-card line-${key} fade-in`;
    card.innerHTML = `
      <div class="line-header">
        <span class="line-emoji">${line.emoji || '✦'}</span>
        <span class="line-name">${line.name}</span>
      </div>
      <div class="line-body">
        <p class="line-reading">${line.reading}</p>
        <p class="line-fortune-label">アドバイス</p>
        <p class="line-fortune">${line.fortune}</p>
      </div>
    `;
    linesGrid.appendChild(card);
  });

  // Lucky
  const luckyGrid = $('luckyGrid');
  luckyGrid.innerHTML = '';
  if (data.lucky) {
    const items = [
      { label: 'ラッキーカラー', value: data.lucky.color, icon: '🎨' },
      { label: 'ラッキーナンバー', value: data.lucky.number, icon: '🔢' },
      { label: 'ラッキーストーン', value: data.lucky.stone, icon: '💎' },
      { label: 'ラッキー方角', value: data.lucky.direction, icon: '🧭' },
    ];
    items.forEach(({ label, value, icon }) => {
      if (!value) return;
      const div = document.createElement('div');
      div.className = 'lucky-item';
      div.innerHTML = `<div class="lucky-label">${icon} ${label}</div><div class="lucky-value">${value}</div>`;
      luckyGrid.appendChild(div);
    });
  }
}
