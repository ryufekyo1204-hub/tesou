/**
 * 手相分析エンジン v3.0
 *
 * 二段階アプローチで精度を最大化:
 * Step 1 — 画像品質チェック + 観察 (何が見えるかの客観的な記録)
 * Step 2 — データベース参照による解釈生成
 *
 * プロンプトキャッシュを活用してコストと遅延を削減。
 */

import Anthropic from '@anthropic-ai/sdk';
import { buildDatabaseContext } from '../data/palmistry-db.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// =========================================================
// Step 1: 画像品質チェック + 客観的な特徴観察
// =========================================================
const OBSERVATION_PROMPT = `あなたは手相の専門家として画像を分析します。

【重要な指示】
- 見えているものだけを報告する。見えないものは "not_visible" と報告する。
- 不確かな場合は confidence を "low" にする。推測で断言しない。
- これは「観察フェーズ」です。解釈は行わない。事実だけを報告する。

以下のJSON形式のみで回答してください（余計なテキスト不要）:

{
  "image_quality": {
    "overall": "excellent | good | fair | poor",
    "sharpness": "clear | slightly_blurry | blurry | very_blurry",
    "lighting": "good | too_dark | too_bright | uneven | backlit",
    "palm_visibility": "full | partial | minimal | not_palm",
    "palm_orientation": "facing_camera | angled | facing_down | unclear",
    "can_analyze": true または false,
    "quality_issues": ["問題のリスト。なければ空配列"]
  },
  "hand": {
    "which_hand": "right | left | unclear",
    "confidence": "high | medium | low",
    "shape_category": "earth | fire | water | air | unclear",
    "shape_reason": "判定理由を一文で",
    "palm_proportion": "square | elongated | wider_than_long | unclear",
    "finger_relative_length": "long | medium | short | unclear"
  },
  "lines": {
    "life_line": {
      "visible": true または false,
      "confidence": "high | medium | low",
      "length": "very_long | long | medium | short | unclear",
      "depth": "deep | normal | faint | chained | unclear",
      "trajectory": "wide_arc | normal | close_to_thumb | toward_moon | unclear",
      "start": "from_jupiter | normal | joined_with_head | unclear",
      "end": "circles_venus | toward_moon | branches_out | unclear",
      "breaks": false または true,
      "break_count": 0,
      "notable_marks": ["観察された特徴のリスト。なければ空配列"],
      "raw_observation": "見えた特徴の客観的説明を一文で"
    },
    "heart_line": {
      "visible": true または false,
      "confidence": "high | medium | low",
      "length": "very_long | long | medium | short | unclear",
      "curvature": "strongly_curved | moderate_curve | straight | unclear",
      "end_position": "under_jupiter | between_jupiter_saturn | under_saturn | unclear",
      "notable_marks": [],
      "raw_observation": "客観的説明"
    },
    "head_line": {
      "visible": true または false,
      "confidence": "high | medium | low",
      "length": "very_long | long | medium | short | unclear",
      "direction": "straight | slight_downward | strong_downward_toward_moon | unclear",
      "life_line_connection": "widely_separated | slightly_separated | touching | joined_long | unclear",
      "notable_marks": [],
      "raw_observation": "客観的説明"
    },
    "fate_line": {
      "visible": true または false,
      "confidence": "high | medium | low",
      "presence": "clear_strong | faint | multiple | absent",
      "start_position": "from_wrist | from_life_line | from_moon_mount | from_mid_palm | from_head_line | unclear",
      "end_position": "toward_saturn | toward_jupiter | toward_apollo | unclear",
      "notable_marks": [],
      "raw_observation": "客観的説明（線が見えない場合は明記）"
    },
    "sun_line": {
      "visible": true または false,
      "confidence": "high | medium | low",
      "presence": "clear_long | short_clear | multiple | absent",
      "start_position": "from_wrist | from_life_line | from_head_line | from_heart_line | unclear",
      "raw_observation": "客観的説明"
    },
    "mercury_line": {
      "visible": true または false,
      "confidence": "high | medium | low",
      "presence": "absent | clear | chained | broken",
      "raw_observation": "客観的説明"
    },
    "girdle_of_venus": {
      "visible": true または false,
      "confidence": "high | medium | low",
      "presence": "complete | broken | absent",
      "raw_observation": "客観的説明"
    },
    "marriage_lines": {
      "visible": true または false,
      "confidence": "high | medium | low",
      "count": 0,
      "quality": "long_deep | short | mixed | unclear",
      "notable_marks": [],
      "raw_observation": "客観的説明"
    },
    "other_notable_lines": "その他観察された特徴的な線があれば記述。なければ空文字列"
  },
  "mounts": {
    "venus": "high_firm | high_soft | normal | flat | unclear",
    "jupiter": "high | normal | flat | unclear",
    "saturn": "high | normal | flat | unclear",
    "apollo": "high | normal | flat | unclear",
    "mercury": "high | normal | flat | unclear",
    "moon": "high | normal | flat | unclear",
    "overall_mount_confidence": "high | medium | low"
  },
  "special_marks": {
    "simian_line": false または true,
    "buddhist_eye": false または true,
    "mystic_cross": false または true,
    "stars": [],
    "squares": [],
    "islands": [],
    "triangles": [],
    "grilles": [],
    "rascettes_count": 0,
    "rascettes_first_arched": false または true,
    "other_marks": ""
  },
  "fingers": {
    "thumb": {
      "length": "long | medium | short | unclear",
      "flexibility": "very_flexible | normal | stiff | unclear",
      "tip_shape": "wide | pointed | square | unclear"
    },
    "index_vs_ring": "index_longer | ring_longer | equal | unclear",
    "little_finger": "long | normal | short | unclear",
    "spacing": "wide_all | close_all | gap_ring_little | gap_index_middle | normal | unclear"
  },
  "overall_readability": "高解像度で明確に読める程度を high | medium | low で評価",
  "key_observations": "この手相で最も目立つ3〜5つの特徴を箇条書きで"
}`;

// =========================================================
// Step 2: データベース参照による解釈生成
// =========================================================
function buildInterpretationPrompt(observations) {
  const dbContext = buildDatabaseContext();

  return `${dbContext}

=== 観察結果（Step 1で取得した客観的データ）===
${JSON.stringify(observations, null, 2)}

=== 指示 ===
上記の観察結果と手相データベースを基に、以下のJSON形式で日本語の手相鑑定結果を生成してください。

【厳守事項】
1. confidence が "low" または visible が false の特徴については「詳細は確認できませんでした」と正直に示す
2. ネガティブな兆候には必ず対処法・前向きなメッセージを添える
3. 「必ず〇〇になる」「〇〇が起きる」などの断定表現を避ける
4. 見えない・不明確な線を存在するかのように解釈しない
5. データベースの解釈を基盤として使用し、創造的な追加解釈を行う場合は根拠を明確にする
6. 左手・右手の意味を考慮した読み方を行う

以下のJSON形式のみで回答（余計なテキスト不要）:

{
  "meta": {
    "hand": "right | left | unclear",
    "hand_meaning": "この手の意味（右手なら現在・未来、左手なら潜在能力など）",
    "hand_shape": "手の形状の名前（例：火の手）",
    "overall_readability": "high | medium | low",
    "reading_disclaimer": "この鑑定の信頼度に関するコメント"
  },
  "opening": "この手相から読み取れる全体的な印象（2〜3文。温かく引き込まれるような書き出し）",
  "personality": {
    "core": "手の形状から読み取れる基本的な個性・性格（2〜3文）",
    "strengths": ["強み1", "強み2", "強み3"],
    "life_theme": "この人の人生の主テーマ（一言で）"
  },
  "lines": {
    "life": {
      "title": "生命線",
      "emoji": "💚",
      "confidence": "high | medium | low | not_visible",
      "reading": "生命線の分析（データベースに基づく詳細な読み。2〜3文）",
      "timing": "おおよその時期の読み（例：30代に転機の可能性）。不明な場合は空文字",
      "advice": "具体的で実践的なアドバイス（1〜2文）",
      "modern_lens": "2025〜2026年の視点からのコメント（1文）"
    },
    "heart": {
      "title": "感情線",
      "emoji": "❤️",
      "confidence": "high | medium | low | not_visible",
      "reading": "感情線の詳細な分析",
      "love_style": "恋愛・感情スタイルの一言まとめ",
      "advice": "感情・人間関係のアドバイス",
      "modern_lens": "現代の恋愛・関係性への言及"
    },
    "head": {
      "title": "知能線",
      "emoji": "💙",
      "confidence": "high | medium | low | not_visible",
      "reading": "知能線の詳細な分析",
      "thinking_style": "思考スタイルの一言まとめ",
      "career_hint": "向いている仕事・分野のヒント",
      "advice": "知的活動・仕事へのアドバイス",
      "modern_lens": "AI時代・2025年への言及"
    },
    "fate": {
      "title": "運命線",
      "emoji": "⭐",
      "confidence": "high | medium | low | not_visible",
      "reading": "運命線の分析（ない場合はその吉相の意味も説明）",
      "career_path": "キャリアの方向性",
      "advice": "仕事・人生方向性へのアドバイス",
      "modern_lens": "2025〜2026年の働き方への言及"
    },
    "sun": {
      "title": "太陽線",
      "emoji": "☀️",
      "confidence": "high | medium | low | not_visible",
      "reading": "太陽線の分析（ない場合の意味も）",
      "advice": "成功・才能の活かし方のアドバイス"
    },
    "other_notable": "金星帯・水星線・結婚線など他の特徴的な線についての言及。なければ空文字"
  },
  "mounts_summary": "丘から読み取れる特徴（最も目立つ丘について1〜2文）",
  "special_marks": {
    "found": ["発見された特別な印のリスト（名前と簡単な説明）"],
    "summary": "特別な印の総合的な意味（なければ「特筆すべき特別な印は確認されませんでした」）"
  },
  "annual_fortune": {
    "2025": "2025年の運勢と注目すべき時期（1〜2文）",
    "2026": "2026年への展望（1〜2文）",
    "focus_area": "特に注力すべき分野（例：仕事・恋愛・健康）"
  },
  "life_advice": "手相全体から導き出される人生アドバイス（2〜3文。温かく、具体的に）",
  "lucky": {
    "color": "ラッキーカラー（手相の特徴から導出）",
    "number": "ラッキーナンバー（数字のみ）",
    "stone": "パワーストーン（手相の特徴に合ったもの）",
    "direction": "ラッキー方角",
    "keyword": "今年のラッキーキーワード"
  },
  "closing": "締めくくりのメッセージ（1〜2文。希望と励ましを込めて）"
}`;
}

// =========================================================
// ユーティリティ: JSON パース（マークダウンコードブロック対応）
// =========================================================
function parseJSON(text) {
  const cleaned = text.replace(/```(?:json)?\n?/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON が見つかりません');
  return JSON.parse(match[0]);
}

// =========================================================
// メイン分析関数
// =========================================================
export async function analyzePalm(base64, mediaType) {
  // --- Step 1: 画像品質チェック + 客観的観察 ---
  let observations;
  try {
    const step1 = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: OBSERVATION_PROMPT,
          },
        ],
      }],
    });

    observations = parseJSON(step1.content[0].text);
  } catch (err) {
    throw new Error(`観察フェーズエラー: ${err.message}`);
  }

  // --- 品質チェック: 分析不能な場合は早期リターン ---
  const q = observations.image_quality;
  if (!q.can_analyze || q.palm_visibility === 'not_palm') {
    return {
      error: true,
      quality_issues: q.quality_issues || [],
      message: buildQualityErrorMessage(q),
    };
  }

  // --- Step 2: データベース参照による解釈生成 ---
  // データベースコンテキストをキャッシュ可能な形で渡す
  const interpretationPrompt = buildInterpretationPrompt(observations);

  let interpretation;
  try {
    const step2 = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3500,
      system: [
        {
          type: 'text',
          text: buildDatabaseContext(),
          cache_control: { type: 'ephemeral' }, // プロンプトキャッシュでコスト削減
        },
      ],
      messages: [{
        role: 'user',
        content: interpretationPrompt,
      }],
    });

    interpretation = parseJSON(step2.content[0].text);
  } catch (err) {
    throw new Error(`解釈フェーズエラー: ${err.message}`);
  }

  return {
    error: false,
    observations,   // デバッグ用（必要に応じてフロントへ
    interpretation,
    quality: {
      overall: q.overall,
      readability: observations.overall_readability,
      palm_visibility: q.palm_visibility,
    },
  };
}

// =========================================================
// 品質エラーメッセージ生成
// =========================================================
function buildQualityErrorMessage(q) {
  const issues = q.quality_issues || [];

  if (q.palm_visibility === 'not_palm') {
    return '手のひらが検出できませんでした。手を広げて手のひら側をカメラに向けて撮影してください。';
  }

  const tips = [];
  if (issues.includes('blur') || q.sharpness === 'very_blurry' || q.sharpness === 'blurry') {
    tips.push('カメラをできるだけ近づけ、ブレないようにしっかり固定してください');
  }
  if (issues.includes('lighting') || q.lighting === 'too_dark') {
    tips.push('明るい場所（窓際・照明の近く）で撮影してください');
  }
  if (q.lighting === 'backlit') {
    tips.push('逆光を避けて、光源が手の正面側に来るようにしてください');
  }
  if (q.palm_orientation === 'facing_down' || q.palm_orientation === 'unclear') {
    tips.push('手のひら側（線が見える面）をカメラに向けてください');
  }
  if (q.palm_visibility === 'minimal') {
    tips.push('手全体がフレームに収まるよう、少し離れて撮影してください');
  }

  if (tips.length === 0) {
    tips.push('明るい場所で、手のひらを広げてカメラの正面に向けて撮影してください');
  }

  return `画像の品質が不十分です。以下のヒントをお試しください：\n${tips.map(t => `• ${t}`).join('\n')}`;
}
