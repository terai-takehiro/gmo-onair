/**
 * 収録設定・配信設定の「判定」を1か所にまとめる。
 *
 * ⚠️ **なぜ作ったか**（監査 2026-08-22）
 * これまで判定はサーバーの `preflight` にしか無く、画面はそれを
 * 「Excel を書き出す」ダイアログを開いたときにしか呼んでいなかった。
 * しかも `preflight` は **保存済みの内容**しか見ないので、
 * 打ち込んだばかりの値は点検にも Excel にも映らなかった。
 * 結果、**間違いに気づけるのは現場に渡した後**という状態になっていた。
 *
 * ここに置いた関数は画面がその場で使う。サーバーの
 * `server/src/contexts/qsheet/device-settings-preflight.ts` と
 * **同じ判定にすること**（食い違うと「画面は赤いのに書き出しは通る」が起きる）。
 */
import type { Deck, Destination } from './deviceSettingsApi';

// ── 収録: 1台の状態 ────────────────────────────────────────
export type DeckState = 'ready' | 'partial' | 'blank' | 'skip';

/** モックの `filled` / `partial` / `blank` と同じ数え方（Main.dc.html:207-210） */
export function deckState(d: Deck): DeckState {
  if (d.skip) return 'skip';
  const vals = [d.videoFormat, d.codec, d.audioChannels, d.slot];
  const filled = vals.filter((v) => v !== undefined && v !== null && v !== '').length;
  if (filled === vals.length) return 'ready';
  return filled === 0 ? 'blank' : 'partial';
}

export interface DeckCounts { ready: number; partial: number; blank: number; network: number; skip: number }

export function countDecks(decks: Deck[]): DeckCounts {
  const c: DeckCounts = { ready: 0, partial: 0, blank: 0, network: 0, skip: 0 };
  for (const d of decks) {
    c[deckState(d)] += 1;
    if (!d.skip && d.slot === 'ネットワーク') c.network += 1;
  }
  return c;
}

// ── 配信: その場の警告 ─────────────────────────────────────
/** セッション名の規則（サーバーの `SESSION_NAME_RE` と同じ） */
const SESSION_NAME_RE = /^[A-Za-z0-9 ._\-+'[\]()]{1,32}$/;

export function sessionNameError(name: string): string | null {
  if (!name) return 'セッション名を入れてください';
  if (name !== name.trim()) return '前後に空白は使えません';
  if (name.length > 32) return '32文字以内です';
  if (!SESSION_NAME_RE.test(name)) return "半角の英数と ._-+'[]() と空白のみ使えます";
  return null;
}

export interface DestIssue { field: string; message: string }

/**
 * 配信先1件の「直したほうがよい」。モックの `warnOf()`（Stream.dc.html:187-193）と同じ。
 * ⚠️ プロトコル未選択は RTMP として扱う（画面の説明と揃える）。
 */
export function destIssues(d: Destination, siblings: Destination[] = []): DestIssue[] {
  const out: DestIssue[] = [];
  const proto = d.protocol ?? 'RTMP';

  const nameErr = sessionNameError(d.name ?? '');
  if (nameErr) out.push({ field: 'name', message: nameErr });
  else if (siblings.some((s) => s !== d && s.encoderId === d.encoderId && s.name === d.name)) {
    out.push({ field: 'name', message: '同じ ENC の中で名前が重なっています' });
  }

  if (proto === 'RTMP') {
    if (!d.url) out.push({ field: 'url', message: '宛先 URL を入れてください' });
    if (!d.hasStreamKey && !d.streamKey) {
      out.push({ field: 'streamKey', message: 'RTMP は鍵が無いと現地で弾かれます' });
    }
  } else {
    if (!d.port) out.push({ field: 'port', message: 'SRT ではポートが必須です' });
    if (proto === 'SRT Caller' && !d.url) out.push({ field: 'url', message: '宛先ホストを入れてください' });
    if (d.aes && d.aes !== 'なし' && !d.passphrase) {
      out.push({ field: 'passphrase', message: '暗号化ありのときはパスフレーズが必須です' });
    }
  }
  return out;
}

/** キーの状態を「文字で」出す（色だけで伝えない・#279 §3-2） */
export function keyStatus(d: Destination): { label: string; tone: 'ok' | 'bad' | 'mute' } {
  const proto = d.protocol ?? 'RTMP';
  if (proto !== 'RTMP') return { label: 'キー不要', tone: 'mute' };
  if (d.streamKey) return { label: '新しい鍵を入力中', tone: 'ok' };
  if (d.hasStreamKey) return { label: '設定済み', tone: 'ok' };
  return { label: 'キー未入力', tone: 'bad' };
}

/** 表示用の宛先（SRT Listener は待受ポート） */
export function destTarget(d: Destination): string {
  if (d.protocol === 'SRT Listener') return `待受ポート ${d.port ?? '—'}`;
  return `${d.url ?? ''}${d.port ? `:${d.port}` : ''}` || '—';
}

// ── 日付 ───────────────────────────────────────────────────
/**
 * 日本時間の `YYYY-MM-DD`。
 * ⚠️ `new Date().toISOString().slice(0,10)` は **UTC** なので、
 * JST の 0〜9 時に開くと**前日**になる（本番前の仕込みでいちばん触る時間帯）。
 * 実施日を選べなかったため、そのまま前日の設定として保存されていた。
 */
export function jstToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

// ── エラーの伝え方 ─────────────────────────────────────────
/**
 * サーバーが返した理由をそのまま画面に出すための取り出し。
 * ⚠️ 以前は `catch { notifyError('保存に失敗しました') }` だけで、
 * **どの行の何が悪いのか利用者に一生分からなかった**。
 * サーバーは `error.message` に「ENC3 / 記念式典 本線: セッション名は…」まで載せている。
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const m = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
  return typeof m === 'string' && m ? m : fallback;
}
