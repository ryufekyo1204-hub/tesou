/**
 * 手相分析エンジン v4.0
 *
 * 三段階アプローチで精度を最大化:
 * Step 1 — 画像品質チェック + 観察 (何が見えるかの客観的な記録)
 * Step 2 — データベース参照による解釈生成
 * Step 3 — 自己検証（信頼度整合性・断定表現・矛盾チェック）
 *
 * プロンプトキャッシュを活用してコストと遅延を削減。
 */

import Anthropic from '@anthropic-ai/sdk';
import { buildDatabaseContext } from '../data/palmistry-db.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// API呼び出しのタイムアウト (ms)
const API_TIMEOUT_MS = 90_000;

// =========================================================
// Step 1: 画像品質チェック + 客観的な特徴観察
// =========================================================
const OBSERVATION_PROMPT = `あなたは手相の専門家として画像を分析します。

【重要な指示】
- 見えているものだけを報告する。見えないものは "not_visible" と報告する。
- 不確かな場合は confidence を "low" にする。推測で断言しない。
- これは「観察フェーズ」です。解釈は行わない。事実だけを報告する。
- 手の形の判定: 四角＋短指=地の手(earth), 縦長＋短指=火の手(fire), 縦長＋長指=水の手(water), 四角＋長指=風の手(air)

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
    "shape_reason": "判定理由を一文で（例：縦長の手のひらと長い指→水の手）",
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
      "raw_observation": "客観的説明（ない場合も明記：これは健康の吉相）"
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
    "mars_plain": "well_developed | hollow | normal | unclear",
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
      "tip_shape": "wide | pointed | square | unclear",
      "phalanges": "first_long | second_long | balanced | unclear"
    },
    "index_vs_ring": "index_longer | ring_longer | equal | unclear",
    "little_finger": "long | normal | short | unclear",
    "spacing": "wide_all | close_all | gap_ring_little | gap_index_middle | normal | unclear"
  },
  "overall_readability": "high | medium | low",
  "key_observations": "この手相で最も目立つ3〜5つの特徴を箇条書きで"
}`;

// =========================================================
// Step 3: 自己検証プロンプト
// Step2 の鑑定結果を Step1 の観察データと照合し、
// 信頼度不整合・断定表現・根拠のない記述を修正する
// =========================================================
const VERIFICATION_SYSTEM = `あなたは手相鑑定の品質管理専門家です。
AI が生成した鑑定結果を観察データと照合し、正確性・倫理性を検証します。
修正が必要な箇所のみを訂正し、問題がない箇所はそのまま維持してください。`;

function buildVerificationPrompt(observations, interpretation) {
  return `=== Step 1 観察データ（信頼度情報を含む客観的記録）===
${JSON.stringify(observations, null, 2)}

=== Step 2 生成された鑑定結果 ===
${JSON.stringify(interpretation, null, 2)}

=== 検証タスク ===
上記の鑑定結果を以下のルールで検証してください。

【修正すべき問題】
1. confidence="low" の線・特徴について断定的な記述がある
   → 「詳細の確認が難しい状況でした」「〜の可能性があります」と軟化する
2. visible=false なのに線の存在を前提とした解釈がある
   → 「この線は確認できませんでした。一般的にこの線がない場合は〜を意味します」に変更
3. special_marks が false/0 なのに鑑定文でその印に言及している
   → 削除または「確認されませんでした」に変更
4. 観察で確認されていない丘・特徴を根拠とした断言がある
   → 削除または仮定表現に変更
5. セクション間の矛盾（例：個性では「慎重」と書きながら行動力を強く推奨）
   → 整合性のとれた表現に統一
6. 「必ず」「確実に」「絶対に」「間違いなく」などの断定語
   → 「〜の可能性があります」「〜傾向があります」「〜と読み取れます」に変換
7. 組み合わせパターンDB に該当する吉相が見落とされていたら closing または life_advice に追加
8. ネガティブな記述に対処法・前向きなメッセージが不足している場合は追記

【重要ルール】
- 問題がない箇所は変更しない。不必要な書き直しを行わない。
- 修正後も鑑定全体のトーンと流れを維持する。
- Step 2 と同じ JSON フォーマットで完全な鑑定結果を返す（余計なテキスト不要）。`;
}

// =========================================================
// Step 2: 解釈生成プロンプト（DBはsystemに注入済みのため重複しない）
// =========================================================
function buildInterpretationPrompt(observations, userSelectedHand) {
  // ユーザーが明示的に選択した手を優先する
  const handNote = userSelectedHand && userSelectedHand !== 'unclear'
    ? `ユーザーが選択した手: ${userSelectedHand === 'right' ? '右手' : '左手'}（この情報を優先して使用してください）`
    : `AIが画像から判定した手: ${observations.hand?.which_hand || 'unclear'}`;

  return `=== 観察結果（Step 1で取得した客観的データ）===
${handNote}
${JSON.stringify(observations, null, 2)}

=== 指示 ===
上記の観察結果と、systemに提供された手相データベースを基に、以下のJSON形式で日本語の手相鑑定結果を生成してください。

【厳守事項】
1. confidence が "low" または visible が false の特徴については「詳細は確認できませんでした」と正直に示す
2. ネガティブな兆候には必ず対処法・前向きなメッセージを添える
3. 「必ず〇〇になる」「〇〇が起きる」などの断定表現を避ける。「〜の可能性があります」「〜傾向があります」を使う
4. 見えない・不明確な線を存在するかのように解釈しない
5. データベースの解釈を基盤として使用する
6. ${userSelectedHand === 'right' ? '右手は現在の状態・努力・これからの人生を示す' : userSelectedHand === 'left' ? '左手は生まれ持った潜在能力・先天的な資質を示す' : '両手の意味を考慮した読み方を行う'}
7. rascettes_first_arched の解釈は性別不明のため適用しない
8. 2025〜2026年の運勢は「可能性」「傾向」として記述し、断定しない

以下のJSON形式のみで回答（余計なテキスト不要）:

{
  "meta": {
    "hand": "right | left | unclear",
    "hand_meaning": "この手の意味（右手なら現在・努力、左手なら潜在能力など）",
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
    "2025": "2025年の運勢の傾向と可能性（1〜2文。断定しない）",
    "2026": "2026年への展望（1〜2文。断定しない）",
    "focus_area": "特に意識すると良い分野（例：仕事・恋愛・健康）"
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
  if (!match) {
    // モデルの拒否メッセージか構造エラーかを区別
    if (text.includes('申し訳') || text.includes('できません') || text.length < 200) {
      throw new Error('MODEL_REFUSAL');
    }
    throw new Error('JSON_NOT_FOUND');
  }
  return JSON.parse(match[0]);
}

// =========================================================
// タイムアウト付き Promise ラッパー
// AbortController を使わず Promise.race で実装する
// （Anthropic SDK は signal を受け付けるが、接続中断まで保証しないため
//   レースで「タイムアウトを先にreject」する方が確実）
// =========================================================
function withTimeout(promise, ms = API_TIMEOUT_MS) {
  let timerId;
  const timeout = new Promise((_, reject) => {
    timerId = setTimeout(() => reject(new Error('API_TIMEOUT')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timerId));
}

// =========================================================
// メイン分析関数
// =========================================================
export async function analyzePalm(base64, mediaType, userSelectedHand = 'unclear') {
  // --- Step 1: 画像品質チェック + 客観的観察 ---
  let observations;
  try {
    const step1 = await withTimeout(
      client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: OBSERVATION_PROMPT },
          ],
        }],
      })
    );
    observations = parseJSON(step1.content[0].text);
  } catch (err) {
    if (err.message === 'API_TIMEOUT') throw new Error('分析がタイムアウトしました。しばらく待ってから再試行してください。');
    throw new Error(`観察フェーズエラー: ${err.message}`);
  }

  // --- 品質チェック: 分析不能な場合は早期リターン ---
  const q = observations.image_quality;
  if (!q.can_analyze || q.palm_visibility === 'not_palm') {
    return {
      error: true,
      message: buildQualityErrorMessage(q),
    };
  }

  // --- Step 2: DB参照による解釈生成 ---
  // DBはsystemブロックに注入（キャッシュ対象）。ユーザーメッセージには含めない。
  let interpretation;
  try {
    const step2 = await withTimeout(
      client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 3500,
        system: [
          {
            type: 'text',
            text: buildDatabaseContext(),
            cache_control: { type: 'ephemeral' }, // 同一DBを繰り返し送る際にキャッシュ
          },
        ],
        messages: [{
          role: 'user',
          content: buildInterpretationPrompt(observations, userSelectedHand),
        }],
      }),
      60_000
    );
    interpretation = parseJSON(step2.content[0].text);
  } catch (err) {
    if (err.message === 'API_TIMEOUT') throw new Error('解釈生成がタイムアウトしました。再試行してください。');
    if (err.message === 'MODEL_REFUSAL') throw new Error('AIが手相を解析できませんでした。別の画像でお試しください。');
    throw new Error(`解釈フェーズエラー: ${err.message}`);
  }

  // --- Step 3: 自己検証（信頼度整合性・断定表現・矛盾チェック）---
  let verifiedInterpretation = interpretation;
  try {
    const step3 = await withTimeout(
      client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 3500,
        system: [
          {
            type: 'text',
            text: VERIFICATION_SYSTEM,
          },
        ],
        messages: [{
          role: 'user',
          content: buildVerificationPrompt(observations, interpretation),
        }],
      }),
      60_000
    );
    verifiedInterpretation = parseJSON(step3.content[0].text);
  } catch {
    // Step 3 が失敗しても Step 2 の結果をそのまま使用（フォールバック）
    verifiedInterpretation = interpretation;
  }

  return {
    error: false,
    interpretation: verifiedInterpretation,
    quality: {
      overall: q.overall,
      readability: observations.overall_readability,
      palm_visibility: q.palm_visibility,
    },
    // observations はサーバー側のみで使用（クライアントには返さない）
  };
}

// =========================================================
// 品質エラーメッセージ生成
// =========================================================
function buildQualityErrorMessage(q) {
  if (q.palm_visibility === 'not_palm') {
    return '手のひらが検出できませんでした。手を広げて手のひら側をカメラに向けて撮影してください。';
  }

  const issues = q.quality_issues || [];
  const tips = [];

  if (issues.includes('blur') || q.sharpness === 'very_blurry' || q.sharpness === 'blurry') {
    tips.push('カメラをできるだけ近づけ、ブレないようにしっかり固定してください');
  }
  if (q.lighting === 'too_dark' || issues.includes('lighting')) {
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
