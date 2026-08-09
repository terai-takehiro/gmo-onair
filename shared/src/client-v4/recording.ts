/**
 * 録音したものに**正しい拡張子**を付ける
 *
 * ── なぜ要るか（iPhone / Safari で必ず失敗する）──────────────
 *
 * `MediaRecorder` が作る形式は**ブラウザによって違います**:
 *   ・Chrome / Edge / Firefox … `audio/webm`
 *   ・**Safari（iPhone を含む）… `audio/mp4`**
 *
 * 実装は録音の名前を `打合せ_2026-08-09.webm` のように**`.webm` 決め打ち**で
 * 付けていました。**Whisper は拡張子で形式を判断する**ので、
 * Safari の mp4 を `.webm` として渡すと**中身と名前が食い違って断られます**。
 * つまり **iPhone から録ると必ず文字起こしに失敗する**状態でした。
 *
 * ここで `MediaRecorder.mimeType` から拡張子を決めます。
 *
 * ── 知らない形式は `webm` に倒す ────────────────────────────
 *
 * 新しいブラウザが別の形式を返すことはありえます。そのときに
 * **拡張子なしで送ると確実に断られる**ので、いちばん多い形に倒します
 * （サーバー側も MIME から直すので、二重に守っています）。
 */

/** Whisper が受け付ける拡張子（OpenAI のドキュメントの一覧） */
export const STT_EXTENSIONS = ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'wav', 'webm'] as const;

/** MIME → 拡張子。`;codecs=opus` のような後ろの飾りは落とす */
export function extensionForAudio(mimeType: string | null | undefined): string {
  const base = String(mimeType ?? '').split(';')[0].trim().toLowerCase();
  switch (base) {
    case 'audio/mp4':
    case 'video/mp4':
      return 'mp4';        // Safari / iOS はこちら
    case 'audio/x-m4a':
    case 'audio/m4a':
      return 'm4a';
    case 'audio/mpeg':
    case 'audio/mp3':
      return 'mp3';
    case 'audio/ogg':
    case 'application/ogg':
      return 'ogg';
    case 'audio/wav':
    case 'audio/x-wav':
    case 'audio/wave':
      return 'wav';
    case 'audio/webm':
    case 'video/webm':
      return 'webm';
    default:
      // 知らない形式。**拡張子なしにはしない**（確実に断られるため）
      return 'webm';
  }
}

/** `打合せ_2026-08-09.mp4` のような名前を作る。`prefix` に拡張子を含めないこと */
export function recordingFileName(prefix: string, mimeType: string | null | undefined): string {
  return `${prefix}.${extensionForAudio(mimeType)}`;
}
