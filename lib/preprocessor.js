/**
 * 手相画像前処理モジュール
 *
 * Claude Vision APIに渡す前に画像を最適化する。
 * 手のひらの線はやや暗い凹みとして現れるため、コントラスト強調と
 * エッジシャープニングにより線の視認性を高めてAIの観察精度を向上させる。
 */

import sharp from 'sharp';

/**
 * @param {Buffer} buffer - 元の画像バッファ
 * @returns {Promise<{ buffer: Buffer, mediaType: string }>}
 */
export async function preprocessPalmImage(buffer) {
  try {
    const processed = await sharp(buffer)
      .normalize()                              // コントラスト正規化（薄い線を浮き彫りに）
      .modulate({ saturation: 0.85 })          // 彩度をわずかに下げて線のコントラストを相対的に強調
      .sharpen({ sigma: 0.7, m1: 1.2, m2: 0.6 }) // エッジシャープニング（過剰処理を避ける設定）
      .jpeg({ quality: 95, mozjpeg: false })
      .toBuffer();

    return { buffer: processed, mediaType: 'image/jpeg' };
  } catch {
    // sharp が失敗した場合（非対応フォーマット等）は元バッファをそのまま返す
    return { buffer, mediaType: null };
  }
}
