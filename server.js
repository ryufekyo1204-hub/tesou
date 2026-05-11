import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import { analyzePalm, analyzeComparison } from './lib/analyzer.js';
import { preprocessPalmImage } from './lib/preprocessor.js';

// 共有データの一時保存（メモリ内・24時間TTL）
const shareStore = new Map();
function cleanupExpiredShares() {
  const now = Date.now();
  for (const [id, entry] of shareStore) {
    if (entry.expires < now) shareStore.delete(id);
  }
}
setInterval(cleanupExpiredShares, 60 * 60 * 1000); // 1時間ごとにクリーンアップ

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 起動時にAPIキーを確認（リクエストを受ける前に失敗させる）
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY が設定されていません。.env ファイルを確認してください。');
  process.exit(1);
}

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('画像ファイルのみアップロード可能です'));
  },
});

app.use(express.static(join(__dirname, 'public')));

app.post('/analyze', upload.single('palm'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: true, message: '画像をアップロードしてください' });
  }

  const userSelectedHand = req.body?.hand || 'unclear';
  const theme = req.body?.theme || 'overall';
  const customQuestion = (req.body?.customQuestion || '').trim().slice(0, 100);
  const userAge = (req.body?.userAge || '').trim().slice(0, 3);
  const userGender = (req.body?.userGender || '').trim();

  try {
    const { buffer: processedBuffer, mediaType: processedType } = await preprocessPalmImage(req.file.buffer);
    const base64 = processedBuffer.toString('base64');
    const mediaType = processedType || req.file.mimetype;

    const result = await analyzePalm(base64, mediaType, userSelectedHand, theme, customQuestion, userAge, userGender);
    res.json(result);
  } catch (err) {
    console.error('Analysis error:', err.message);

    if (err.message.includes('rate_limit') || err.message.includes('overloaded')) {
      return res.status(429).json({ error: true, message: 'サービスが混み合っています。少し待ってから再試行してください。' });
    }
    if (err.message.includes('タイムアウト')) {
      return res.status(504).json({ error: true, message: err.message });
    }
    res.status(500).json({ error: true, message: err.message || '分析中にエラーが発生しました。再度お試しください。' });
  }
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
    // 古いエントリを強制削除
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

// ===== 両手比較エンドポイント =====
const compUpload = upload.fields([
  { name: 'right_palm', maxCount: 1 },
  { name: 'left_palm', maxCount: 1 },
]);

app.post('/analyze-comparison', compUpload, async (req, res) => {
  const rightFile = req.files?.right_palm?.[0];
  const leftFile = req.files?.left_palm?.[0];
  if (!rightFile || !leftFile) {
    return res.status(400).json({ error: true, message: '右手と左手の両方の画像をアップロードしてください' });
  }

  const theme = req.body?.theme || 'overall';
  const customQuestion = (req.body?.customQuestion || '').trim().slice(0, 100);

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
    res.json(result);
  } catch (err) {
    console.error('Comparison error:', err.message);
    if (err.message.includes('rate_limit') || err.message.includes('overloaded')) {
      return res.status(429).json({ error: true, message: 'サービスが混み合っています。少し待ってから再試行してください。' });
    }
    if (err.message.includes('タイムアウト')) {
      return res.status(504).json({ error: true, message: err.message });
    }
    res.status(500).json({ error: true, message: err.message || '分析中にエラーが発生しました。再度お試しください。' });
  }
});

// MulterError および その他のミドルウェアエラーを JSON で返す
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
  console.log(`手相鑑定アプリ v3.1 起動中 → http://localhost:${PORT}`);
});
