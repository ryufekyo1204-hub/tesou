import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('画像ファイルのみアップロード可能です'));
  },
});

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.static(join(__dirname, 'public')));

const PALM_PROMPT = `この手のひらの画像を手相占いの専門家として分析してください。

以下のJSON形式のみで回答してください（説明文は不要）：

{
  "overall": "全体的な手相の印象と総評（2〜3文で具体的に）",
  "personality": "手の形・大きさ・指から読み取れる性格（1〜2文）",
  "lines": {
    "life": {
      "name": "生命線",
      "emoji": "💚",
      "reading": "生命線の特徴と意味（長さ・深さ・形など具体的に）",
      "fortune": "健康・生命力・活力についてのアドバイス"
    },
    "heart": {
      "name": "感情線",
      "emoji": "❤️",
      "reading": "感情線の特徴と意味（具体的に）",
      "fortune": "恋愛・人間関係・感情面についてのアドバイス"
    },
    "head": {
      "name": "知能線",
      "emoji": "💙",
      "reading": "知能線の特徴と意味（具体的に）",
      "fortune": "思考力・仕事・学習についてのアドバイス"
    },
    "fate": {
      "name": "運命線",
      "emoji": "⭐",
      "reading": "運命線の特徴と意味（見えない場合はその意味も）",
      "fortune": "人生の方向性・キャリアについてのアドバイス"
    }
  },
  "special_marks": "特別な印や紋（ます掛け、仏眼、金星環など。なければ「特別な印は見当たりません」）",
  "year_fortune": "今年の運勢と注目すべき時期（1〜2文）",
  "advice": "総合的な人生アドバイス（前向きなメッセージで締めくくる）",
  "lucky": {
    "color": "ラッキーカラー",
    "number": "ラッキーナンバー（数字のみ）",
    "stone": "ラッキーストーン",
    "direction": "ラッキー方角"
  }
}

手のひらが不鮮明・写っていない場合は:
{"error": "手のひらをカメラに向けて、明るい場所で正面から撮影してください"}

必ずJSON形式のみで回答し、前後に余計なテキストを含めないでください。`;

app.post('/analyze', upload.single('palm'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '画像をアップロードしてください' });
  }

  const base64 = req.file.buffer.toString('base64');
  const mediaType = req.file.mimetype;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            { type: 'text', text: PALM_PROMPT },
          ],
        },
      ],
    });

    const text = message.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: '分析結果の取得に失敗しました' });

    const result = JSON.parse(jsonMatch[0]);
    res.json(result);
  } catch (err) {
    console.error('Analysis error:', err.message);
    if (err instanceof SyntaxError) {
      return res.status(500).json({ error: '分析結果の解析に失敗しました。再度お試しください' });
    }
    res.status(500).json({ error: 'サーバーエラーが発生しました。しばらく待ってから再試行してください' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`手相分析アプリ起動中 → http://localhost:${PORT}`);
});
