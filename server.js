import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { analyzePalm } from './lib/analyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: true, message: 'APIキーが設定されていません。サーバー管理者にお問い合わせください。' });
  }

  try {
    const base64 = req.file.buffer.toString('base64');
    const mediaType = req.file.mimetype;

    const result = await analyzePalm(base64, mediaType);
    res.json(result);
  } catch (err) {
    console.error('Analysis error:', err.message);

    if (err.message.includes('rate_limit') || err.message.includes('overloaded')) {
      return res.status(429).json({ error: true, message: 'サービスが混み合っています。少し待ってから再試行してください。' });
    }

    res.status(500).json({ error: true, message: '分析中にエラーが発生しました。再度お試しください。' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`手相鑑定アプリ v3.0 起動中 → http://localhost:${PORT}`);
});
