// v2.9.43: クライアント↔サーバー間の時計ずれ補正用シングルトン。
// `oneshot:sync` / `cue:sync` 等の broadcast payload に含まれる `timestamp`
// (= サーバー側 Date.now()) を受信したタイミングで、ローカル受信時刻と
// 比較してオフセットを保持する。CountdownCG など絶対時刻に依存する CG は
// `getServerNow()` を呼ぶことで「サーバー時刻基準の Date.now()」を取得し、
// 異なるマシン (operator PC / vMix 等) で同期した残時間を表示できる。

let offsetMs = 0;

/**
 * sync payload の `timestamp` (server Date.now() at broadcast) からオフセットを更新する。
 * ネットワーク遅延 ε はそのまま誤差として残るが、CG countdown 用途では問題ない (±100ms)。
 */
export function updateServerOffsetFromTimestamp(serverTimestamp: number | undefined | null): void {
  if (typeof serverTimestamp !== 'number' || !isFinite(serverTimestamp)) return;
  offsetMs = serverTimestamp - Date.now();
}

/** サーバー時刻基準の現在 epoch ms。 */
export function getServerNow(): number {
  return Date.now() + offsetMs;
}

/** 現在のオフセット (server - client) ms。デバッグ用。 */
export function getServerOffsetMs(): number {
  return offsetMs;
}
