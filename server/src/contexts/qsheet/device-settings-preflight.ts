// 書き出す前の点検（#279 §4-5 の3段）。画面と Excel で判定がずれないよう、
// **画面はこの API の結果だけを表示する**（画面側に判定式を書かない — impl doc §4-4）。
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

    for (const dest of dests) {
      const where = `${encoderId} / ${dest.name || '(名称未設定)'}`;
      if (dest.protocol === 'RTMP' && !dest.streamKey) {
        red.push({ where, code: 'RTMP_KEY_EMPTY', message: 'RTMP なのにストリームキーが空です' });
      }
      if ((dest.protocol === 'SRT Caller' || dest.protocol === 'SRT Listener') && !dest.port) {
        red.push({ where, code: 'SRT_PORT_EMPTY', message: 'SRT なのにポートが空です' });
      }
      if (dest.aes && dest.aes !== 'なし' && !dest.passphrase) {
        red.push({ where, code: 'PASSPHRASE_EMPTY', message: '暗号化ありなのにパスフレーズが空です' });
      }
      if (dest.name && !SESSION_NAME_RE.test(dest.name)) {
        red.push({ where, code: 'NAME_INVALID', message: 'セッション名は半角32文字以内・前後空白なしにしてください' });
      }
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
