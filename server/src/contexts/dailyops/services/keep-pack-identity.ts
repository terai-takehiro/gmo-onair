/**
 * 定例報告パックの「中身が同じか」— **純粋関数だけ**（DB も HTTP も触らない）
 *
 * `keep-pack-store.service.ts` の凍結が使う。同じ会議日・同じ絞り込みの凍結が短い間隔で
 * 2回来たとき（週報の確定の hook と手押しが重なる）、**中身が同じなら 1 行にまとめ、
 * 違えば新しい版として残す**ための比較。時刻だけで束ねると、数字を直してすぐ確定し直した
 * ときに直した版が捨てられる。
 *
 * PostgreSQL の jsonb は鍵の並びを保存しない（長さ順→辞書順に並べ替える）ので、
 * 読み戻した pack と組み立て直した pack を `JSON.stringify` で比べると鍵の順で必ず食い違う。
 * 鍵を並べ替えてから文字列にする。
 *
 * `shared/tests/keepReportPackIdentity.test.ts` が固定する。
 */

/** 鍵を再帰的に辞書順へ並べ替えた JSON 文字列（`undefined` の値は JSON と同じく落とす） */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** 凍結のたびに変わる鍵。中身の比較からは外す */
export const PACK_VOLATILE_KEYS: readonly string[] = ['generated_at', 'frozen_at'];

/** 2つのパックが同じ数字・同じ材料か（時刻の鍵は見ない・鍵の並びは見ない） */
export function samePackContent(a: unknown, b: unknown): boolean {
  return canonicalJson(stripVolatile(a)) === canonicalJson(stripVolatile(b));
}

function stripVolatile(pack: unknown): unknown {
  if (pack === null || typeof pack !== 'object' || Array.isArray(pack)) return pack;
  const out: Record<string, unknown> = { ...(pack as Record<string, unknown>) };
  for (const k of PACK_VOLATILE_KEYS) delete out[k];
  return out;
}
