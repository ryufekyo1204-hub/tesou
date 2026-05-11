import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import { analyzePalm, analyzeComparison } from './lib/analyzer.js';
import { preprocessPalmImage } from './lib/preprocessor.js';

// ===== ジョブストア（分析結果をポーリングで取得するため） =====
const jobStore = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobStore) {
    if (job.createdAt + 10 * 60 * 1000 < now) jobStore.delete(id);
  }
}, 5 * 60 * 1000);

// ===== 共有データの一時保存（メモリ内・24時間TTL） =====
const shareStore = new Map();
function cleanupExpiredShares() {
  const now = Date.now();
  for (const [id, entry] of shareStore) {
    if (entry.expires < now) shareStore.delete(id);
  }
}
setInterval(cleanupExpiredShares, 60 * 60 * 1000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY が設定されていません。.env ファイルを確認してください。');
  process.exit(1);
}

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('画像ファイルのみアップロード可能です'));
  },
});

app.use(express.static(join(__dirname, 'public')));

// ===== 片手鑑定: ジョブ開始（即座に jobId を返す） =====
app.post('/analyze', upload.single('palm'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: true, message: '画像をアップロードしてください' });
  }

  const userSelectedHand = req.body?.hand || 'unclear';
  const theme = req.body?.theme || 'overall';
  const customQuestion = (req.body?.customQuestion || '').trim().slice(0, 100);
  const userAge = (req.body?.userAge || '').trim().slice(0, 3);
  const userGender = (req.body?.userGender || '').trim();

  const jobId = randomUUID();
  jobStore.set(jobId, { status: 'pending', createdAt: Date.now() });
  res.json({ jobId }); // 即座にレスポンス（Renderのタイムアウト回避）

  // バックグラウンドで分析実行
  (async () => {
    try {
      const { buffer: processedBuffer, mediaType: processedType } = await preprocessPalmImage(req.file.buffer);
      const base64 = processedBuffer.toString('base64');
      const mediaType = processedType || req.file.mimetype;
      const result = await analyzePalm(base64, mediaType, userSelectedHand, theme, customQuestion, userAge, userGender);
      jobStore.set(jobId, { status: 'done', result, createdAt: Date.now() });
    } catch (err) {
      console.error('Analysis error:', err.message);
      let message = err.message || '分析中にエラーが発生しました。再度お試しください。';
      if (err.message.includes('rate_limit') || err.message.includes('overloaded')) {
        message = 'サービスが混み合っています。少し待ってから再試行してください。';
      }
      jobStore.set(jobId, { status: 'error', message, createdAt: Date.now() });
    }
  })();
});

// ===== 結果ポーリングエンドポイント =====
app.get('/result/:jobId', (req, res) => {
  const job = jobStore.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: true, message: '結果が見つかりません。' });
  if (job.status === 'pending') return res.status(202).json({ status: 'pending' });
  if (job.status === 'error') return res.status(500).json({ error: true, message: job.message });
  res.json(job.result);
});

// ===== 共有エンドポイント =====
app.use(express.json({ limit: '2mb' }));

app.post('/share', (req, res) => {
  const data = req.body;
  if (!data?.interpretation && !data?.comparison) {
    return res.status(400).json({ error: true, message: '無効なデータです' });
  }
  cleanupExpiredShares();
  if (shareStore.size >= 500) {
    const oldest = [...shareStore.entries()].sort((a, b) => a[1].expires - b[1].expires)[0];
    if (oldest) shareStore.delete(oldest[0]);
  }
  const id = randomUUID();
  shareStore.set(id, { data, expires: Date.now() + 24 * 60 * 60 * 1000 });
  res.json({ shareId: id });
});

app.get('/share/:id', (req, res) => {
  const entry = shareStore.get(req.params.id);
  if (!entry || entry.expires < Date.now()) {
    return res.status(404).json({ error: true, message: '共有リンクが見つからないか期限切れです（有効期限: 24時間）' });
  }
  res.json(entry.data);
});

// ===== 両手比較: ジョブ開始（即座に jobId を返す） =====
const compUpload = upload.fields([
  { name: 'right_palm', maxCount: 1 },
  { name: 'left_palm', maxCount: 1 },
]);

app.post('/analyze-comparison', compUpload, (req, res) => {
  const rightFile = req.files?.right_palm?.[0];
  const leftFile = req.files?.left_palm?.[0];
  if (!rightFile || !leftFile) {
    return res.status(400).json({ error: true, message: '右手と左手の両方の画像をアップロードしてください' });
  }

  const theme = req.body?.theme || 'overall';
  const customQuestion = (req.body?.customQuestion || '').trim().slice(0, 100);

  const jobId = randomUUID();
  jobStore.set(jobId, { status: 'pending', createdAt: Date.now() });
  res.json({ jobId });

  (async () => {
    try {
      const [rPre, lPre] = await Promise.all([
        preprocessPalmImage(rightFile.buffer),
        preprocessPalmImage(leftFile.buffer),
      ]);
      const result = await analyzeComparison(
        rPre.buffer.toString('base64'), rPre.mediaType || rightFile.mimetype,
        lPre.buffer.toString('base64'), lPre.mediaType || leftFile.mimetype,
        theme, customQuestion
      );
      jobStore.set(jobId, { status: 'done', result, createdAt: Date.now() });
    } catch (err) {
      console.error('Comparison error:', err.message);
      let message = err.message || '分析中にエラーが発生しました。再度お試しください。';
      if (err.message.includes('rate_limit') || err.message.includes('overloaded')) {
        message = 'サービスが混み合っています。少し待ってから再試行してください。';
      }
      jobStore.set(jobId, { status: 'error', message, createdAt: Date.now() });
    }
  })();
});

// ===== Multer エラーハンドラ =====
app.use((err, req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: true, message: '画像ファイルのサイズが大きすぎます（最大20MB）。圧縮してからお試しください。' });
  }
  if (err.message === '画像ファイルのみアップロード可能です') {
    return res.status(400).json({ error: true, message: err.message });
  }
  console.error('Middleware error:', err.message);
  res.status(500).json({ error: true, message: 'サーバーエラーが発生しました。' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`手相鑑定アプリ v3.2 起動中 → http://localhost:${PORT}`);
});
