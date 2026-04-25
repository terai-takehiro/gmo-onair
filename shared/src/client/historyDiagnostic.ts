/**
 * shared/src/client/historyDiagnostic.ts
 *
 * `history.replaceState` を monkey-patch して、短期間に大量に呼ばれた場合に
 * console に警告 + スタックトレースを出力する。
 *
 * v2.3.1 (RedirectOnce) で対処したつもりの replaceState 暴走が dev 環境で
 * 再現するため、実機でどのコードパスから呼ばれているかを観測する目的。
 *
 * 使い方: 各アプリの main.tsx で `installHistoryDiagnostic()` を最上部で呼ぶ。
 * Production で有効でも害なし (10秒で 30回以下なら無音、超えたら 1回だけ警告)。
 */

const WINDOW_MS = 10_000;
const WARNING_THRESHOLD = 30; // 10 秒で 30 回 = 過剰
const HARD_ABORT_THRESHOLD = 80; // ブラウザ上限 (100/10s) 直前で実行を阻止

let installed = false;

interface CallRecord {
  t: number;
  url: string;
  stack: string;
}

const records: CallRecord[] = [];
let warned = false;
let hardAborted = false;

function trim(): void {
  const cutoff = Date.now() - WINDOW_MS;
  while (records.length > 0 && records[0].t < cutoff) {
    records.shift();
  }
}

function getStack(): string {
  try {
    throw new Error('replaceState diagnostic');
  } catch (e) {
    return (e as Error).stack ?? '(no stack)';
  }
}

export function installHistoryDiagnostic(): void {
  if (installed || typeof window === 'undefined' || !window.history) return;
  installed = true;

  const originalReplaceState = window.history.replaceState.bind(window.history);
  const originalPushState = window.history.pushState.bind(window.history);

  window.history.replaceState = function patched(
    state: unknown,
    title: string,
    url?: string | URL | null,
  ) {
    const now = Date.now();
    const urlStr = typeof url === 'string' ? url : url?.toString() ?? '(undefined)';
    records.push({ t: now, url: urlStr, stack: getStack() });
    trim();

    if (records.length >= HARD_ABORT_THRESHOLD && !hardAborted) {
      hardAborted = true;
      // eslint-disable-next-line no-console
      console.error(
        `🛑 [historyDiagnostic] history.replaceState was called ${records.length} times in 10s — aborting further calls to prevent SecurityError.`,
      );
      // eslint-disable-next-line no-console
      console.table(
        records.slice(-10).map((r) => ({
          time: new Date(r.t).toISOString().slice(11, 23),
          url: r.url.length > 80 ? r.url.slice(0, 80) + '…' : r.url,
        })),
      );
      // eslint-disable-next-line no-console
      console.error('[historyDiagnostic] Last 5 stack traces:');
      records.slice(-5).forEach((r, i) => {
        // eslint-disable-next-line no-console
        console.error(`--- replaceState call #${records.length - 5 + i} ---\n${r.stack}`);
      });
      return; // 上限を超えるのでブラウザの SecurityError を未然に防ぐ
    }

    if (records.length >= WARNING_THRESHOLD && !warned) {
      warned = true;
      // eslint-disable-next-line no-console
      console.warn(
        `⚠️ [historyDiagnostic] history.replaceState was called ${records.length} times in 10s.`,
        '\nMost recent URLs:',
        records.slice(-5).map((r) => r.url),
      );
      // eslint-disable-next-line no-console
      console.warn('[historyDiagnostic] Last 3 stack traces:');
      records.slice(-3).forEach((r, i) => {
        // eslint-disable-next-line no-console
        console.warn(`--- replaceState call ${i + 1} ---\n${r.stack}`);
      });
    }

    return originalReplaceState(state as object, title, url);
  };

  // pushState もカウントしておく (参考情報)
  window.history.pushState = function patched(
    state: unknown,
    title: string,
    url?: string | URL | null,
  ) {
    return originalPushState(state as object, title, url);
  };

  // eslint-disable-next-line no-console
  console.info('[historyDiagnostic] installed (warn @30/10s, abort @80/10s)');
}
