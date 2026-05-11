import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { analyzePalm, analyzeComparison } from './lib/analyzer.js';
import { preprocessPalmImage } from './lib/preprocessor.js';

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

  try {
    // 画像前処理: コントラスト強調・シャープニングで手相の線を見やすくする
    const { buffer: processedBuffer, mediaType: processedType } = await preprocessPalmImage(req.file.buffer);
    const base64 = processedBuffer.toString('base64');
    const mediaType = processedType || req.file.mimetype;

    const result = await analyzePalm(base64, mediaType, userSelectedHand, theme);
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

  try {
    const [rPre, lPre] = await Promise.all([
      preprocessPalmImage(rightFile.buffer),
      preprocessPalmImage(leftFile.buffer),
    ]);
    const result = await analyzeComparison(
      rPre.buffer.toString('base64'), rPre.mediaType || rightFile.mimetype,
      lPre.buffer.toString('base64'), lPre.mediaType || leftFile.mimetype,
      theme
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
