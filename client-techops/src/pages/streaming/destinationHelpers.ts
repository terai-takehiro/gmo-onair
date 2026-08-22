/**
 * 配信設定の画面まわりの小さな道具。
 *
 * **判定そのもの（規則違反・キーの状態）は `@/lib/deviceSettingsShared` が正。**
 * ここに置くのは「画面の都合」だけ（色・既定値・行の作り方・まとめ方）。
 * 判定をここへ写すと、サーバーの preflight と食い違って
 * 「画面は赤いのに書き出しは通る」が起きるため。
 */
import { keyStatus, sessionNameError } from '@/lib/deviceSettingsShared';
import { genId } from '@/lib/stableIds';
import type { Destination, DestinationOut } from '@/lib/deviceSettingsApi';

export const ENCODER_IDS = Array.from({ length: 10 }, (_, i) => `ENC${i + 1}`);

export const PROTOCOLS = ['RTMP', 'SRT Caller', 'SRT Listener'] as const;
export type Protocol = (typeof PROTOCOLS)[number];

/**
 * プロトコルの見分けの色（モック Stream.dc.html:175 の PROTO_TONE と同じ役割）。
 * ⚠️ 状態の色（success / warning / destructive）は流用しない。
 * 「RTMP だから緑」のように**状態と読み違える**ため、意味を持たない `cat-*` を使う。
 */
export function protocolBadgeClass(protocol?: Protocol): string {
  switch (protocol ?? 'RTMP') {
    case 'SRT Caller': return 'bg-cat-3/10 text-cat-3';
    case 'SRT Listener': return 'bg-cat-7/10 text-cat-7';
    default: return 'bg-cat-1/10 text-cat-1';
  }
}

/**
 * サーバーから来た行を画面用に整える。
 *
 * ⚠️ ここが以前いちばん壊れていた（監査 2026-08-22・実機で再現）:
 *   ① 伏せ字（`****abcd`）を `streamKey` に入れて描いていたため、利用者が
 *      キー欄に触ると伏せ字が**そのまま新しい鍵として**保存されかけた。
 *      いまは `streamKey` は常に未設定で始める（＝いまの鍵を残す）。
 *   ② `destId` を持たない古い行があり、鍵の引き継ぎが名前頼りだった。
 *      **読み込んだその場で採番**して、以後は id で突き合わせる。
 *   ③ `protocol` 未選択の行は、同じ画面が「キー不要」「新規は必須」と
 *      **食い違うことを言っていた**。読み込んだ時点で RTMP に寄せる
 *      （サーバーも「省くと新規は RTMP 扱い」・#279 §2-2）。
 */
export function fromWire(rows: DestinationOut[]): Destination[] {
  return rows.map((r) => ({
    ...r,
    destId: r.destId ?? genId('dst'),
    protocol: r.protocol ?? 'RTMP',
    streamKey: undefined,
  }));
}

/** 配信先を1件足す。**足した時点で RTMP を既定にする**（「未選択」という状態を作らない） */
export function newDestination(encoderId: string): Destination {
  return { destId: genId('dst'), encoderId, name: '', protocol: 'RTMP', aes: 'なし' };
}

export type KeyTone = 'ok' | 'bad' | 'mute';

/**
 * 一覧・インスペクタに出すキーの状態。
 * 共有の `keyStatus()` に「消す」だけを足したもの（共有側は収録設定と両方から
 * 使うので、この画面だけの状態はここで足す）。`streamKey === ''` は
 * 「保存したら鍵を消す」の意味（`deviceSettingsApi.ts` の型のコメント）。
 */
export function keyState(d: Destination): { label: string; tone: KeyTone } {
  if (d.streamKey === '' && d.hasStreamKey) return { label: '鍵を消す', tone: 'bad' };
  return keyStatus(d);
}

export function keyToneClass(tone: KeyTone): string {
  return tone === 'ok' ? 'text-success' : tone === 'bad' ? 'text-destructive' : 'text-muted-foreground';
}

/**
 * **保存を止める**ほどの規則違反だけを返す。
 * サーバー（`device-settings-types.ts` の zod）が弾くのはセッション名の規則で、
 * ⚠️ 1行でも弾かれると**配信先も WEB会議もまとめて保存されない**。
 * 実機では全角のセッション名1つで、打ち込んだ会議情報まで消えた。
 * それをサーバーに投げる前に気づけるように、押す前にここで見る。
 * （鍵の未入力・ポート未入力などは「直したほうがよい」であって規則違反ではないので止めない）
 */
export function blockingError(d: Destination): string | null {
  return sessionNameError(d.name ?? '');
}

/** 「ENC3〜ENC10」のように連番をまとめる（折りたたみの見出しに出す） */
export function summarizeEncoders(ids: string[]): string {
  const nums = ids.map((id) => Number(id.replace('ENC', ''))).sort((a, b) => a - b);
  const parts: string[] = [];
  let start = nums[0];
  let prev = nums[0];
  for (const n of nums.slice(1)) {
    if (n === prev + 1) { prev = n; continue; }
    parts.push(start === prev ? `ENC${start}` : `ENC${start}〜ENC${prev}`);
    start = n; prev = n;
  }
  if (nums.length > 0) parts.push(start === prev ? `ENC${start}` : `ENC${start}〜ENC${prev}`);
  return parts.join('・');
}
