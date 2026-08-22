// 書き出す前の点検（#279 §4-5 の3段）。
//
// ⚠️ **方針を変えた**（監査 2026-08-22）。もとは「画面はこの API の結果だけを表示する
// （画面側に判定式を書かない）」だったが、この API は **保存済みの内容しか見ない**ため、
// 打ち込んだばかりの値は点検に映らず、**間違いに気づけるのは書き出しダイアログを
// 開いたときだけ**だった。いまは画面も同じ判定をその場で行う
// （`client-techops/src/lib/deviceSettingsShared.ts` の `destIssues` / `deckState`）。
// **両者は同じ判定にすること。** 食い違うと「画面は赤いのに書き出しは通る」が起きる。
//
// ⚠️ `meetings` は一度も見ない（08 §5-4-2 / impl doc §4-4）。未入力でも赤も橙も出さない。
import { Deck, Destination, PreflightIssue, PreflightResult } from './device-settings-types';
import { RECORDING_COLUMNS, STREAMING_COLUMNS } from './services/device-excel-columns';

const SESSION_NAME_RE = /^[A-Za-z0-9 ._\-+'[\]()]{1,32}$/;
/** HD Plus（控え）のデッキ。4K / DNxHR は Studio 4K Pro（本線）専用 */
const HD_PLUS_SUFFIX = '-P';
const ENCODER_IDS = Array.from({ length: 10 }, (_, i) => `ENC${i + 1}`);

export function buildPreflight(decks: Deck[], destinations: Destination[]): PreflightResult {
  const red: PreflightIssue[] = [];
  const amber: PreflightIssue[] = [];
  const gray: PreflightIssue[] = [];

  // ── 収録 ──────────────────────────────────────────────────
  const seenDeckIds = new Map<string, number>();
  for (const d of decks) {
    if (d.skip) {
      gray.push({ where: d.deckId, code: 'DECK_SKIPPED', message: '使わないと決めた台なので Excel に出ません' });
      continue;
    }
    seenDeckIds.set(d.deckId, (seenDeckIds.get(d.deckId) ?? 0) + 1);

    if (!d.videoFormat) amber.push({ where: d.deckId, code: 'FORMAT_EMPTY', message: '解像度が空欄です（現地の値を変えません）' });
    if (!d.codec) amber.push({ where: d.deckId, code: 'CODEC_EMPTY', message: 'コーデックが空欄です（現地の値を変えません）' });
    if (!d.filePrefix) amber.push({ where: d.deckId, code: 'FILE_PREFIX_EMPTY', message: 'ファイル名が空欄です（現地の値を変えません）' });

    const isHdPlus = d.deckId.endsWith(HD_PLUS_SUFFIX);
    if (isHdPlus && d.videoFormat === '3840x2160p59.94') {
      amber.push({ where: d.deckId, code: 'HDPLUS_4K', message: 'HD Plus に 4K の解像度が指定されています' });
    }
    if (isHdPlus && d.codec === 'DNxHR:HQ') {
      amber.push({ where: d.deckId, code: 'HDPLUS_DNXHR', message: 'HD Plus に DNxHR のコーデックが指定されています' });
    }
    // ⚠️ 以前は解像度とコーデックしか見ていなかったため、**収録先 SSD・8/16ch は
    // 警告すら出ずに Excel へ出ていた**（HD Plus は SSD を持たず 2/4ch まで）。
    if (isHdPlus && d.slot && d.slot.startsWith('SSD')) {
      amber.push({ where: d.deckId, code: 'HDPLUS_SSD', message: 'HD Plus に SSD の収録先が指定されています' });
    }
    if (isHdPlus && d.audioChannels && d.audioChannels > 4) {
      amber.push({ where: d.deckId, code: 'HDPLUS_CH', message: `HD Plus に ${d.audioChannels}ch が指定されています（2/4ch まで）` });
    }
  }
  for (const [deckId, count] of seenDeckIds) {
    if (count > 1) amber.push({ where: deckId, code: 'DECK_DUPLICATE', message: `${deckId} の行が${count}件あります` });
  }

  // ── 配信 ──────────────────────────────────────────────────
  const byEncoder = new Map<string, Destination[]>();
  for (const dest of destinations) {
    if (!byEncoder.has(dest.encoderId)) byEncoder.set(dest.encoderId, []);
    byEncoder.get(dest.encoderId)!.push(dest);
  }

  for (const encoderId of ENCODER_IDS) {
    if (!byEncoder.has(encoderId)) {
      gray.push({ where: encoderId, code: 'NO_DESTINATION', message: '配信先が無いので Excel に出ません' });
    }
  }
  // ENC1-10 の範囲外・未知の encoderId が来ても点検自体は続ける（弾かない）
  for (const [encoderId, dests] of byEncoder) {
    if (!ENCODER_IDS.includes(encoderId)) {
      gray.push({ where: encoderId, code: 'UNKNOWN_ENCODER', message: '想定外の ENC 番号です' });
    }

    const seenNames = new Set<string>();
    for (const dest of dests) {
      const where = `${encoderId} / ${dest.name || '(名称未設定)'}`;
      // ⚠️ プロトコル未選択は RTMP として扱う（画面の説明「未選択（新規は RTMP 扱い）」と揃える）。
      // 以前は `=== 'RTMP'` だけを見ていたため、**未選択の配信先は鍵が空でも点検を素通り**した。
      const proto = dest.protocol ?? 'RTMP';

      if (proto === 'RTMP') {
        if (!dest.url) red.push({ where, code: 'RTMP_URL_EMPTY', message: 'RTMP なのに宛先 URL が空です' });
        if (!dest.streamKey) red.push({ where, code: 'RTMP_KEY_EMPTY', message: 'RTMP なのにストリームキーが空です' });
      } else {
        if (!dest.port) red.push({ where, code: 'SRT_PORT_EMPTY', message: 'SRT なのにポートが空です' });
        if (proto === 'SRT Caller' && !dest.url) {
          red.push({ where, code: 'SRT_HOST_EMPTY', message: 'SRT Caller なのに宛先ホストが空です' });
        }
      }
      if (dest.aes && dest.aes !== 'なし' && !dest.passphrase) {
        red.push({ where, code: 'PASSPHRASE_EMPTY', message: '暗号化ありなのにパスフレーズが空です' });
      }
      if (!dest.name) {
        red.push({ where, code: 'NAME_EMPTY', message: 'セッション名が空です' });
      } else if (!SESSION_NAME_RE.test(dest.name) || dest.name !== dest.name.trim()) {
        red.push({ where, code: 'NAME_INVALID', message: 'セッション名は半角32文字以内・前後空白なしにしてください' });
      } else if (seenNames.has(dest.name)) {
        // ⚠️ 「ENC 内で一意」は #279 §2-2 の決めごとだが、誰も検査していなかった。
        red.push({ where, code: 'NAME_DUPLICATE', message: '同じ ENC の中で名前が重なっています' });
      }
      if (dest.name) seenNames.add(dest.name);
    }

    // 同じ台に「同じ宛先＋キー」の RTMP が2件（#279 §2-2 の重複の鍵）
    const rtmp = dests.filter((d) => d.protocol === 'RTMP');
    const seen = new Set<string>();
    for (const d of rtmp) {
      const key = `${d.url ?? ''}::${d.streamKey ?? ''}`;
      if (seen.has(key)) {
        red.push({ where: `${encoderId} / ${d.name}`, code: 'RTMP_DUPLICATE', message: '同じ宛先・キーの RTMP がこの台にもう1件あります' });
      }
      seen.add(key);
    }
  }

  return {
    red,
    amber,
    gray,
    headerPreview: {
      sheets: [
        { name: '収録設定', headers: RECORDING_COLUMNS.map((c) => c.header) },
        { name: '配信設定', headers: STREAMING_COLUMNS.map((c) => c.header) },
      ],
    },
  };
}
