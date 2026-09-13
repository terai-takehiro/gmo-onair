/**
 * 運営マニュアル 段C — 差し込みブロックの resolver: 配信設定
 * （`streaming.list`＝配信先の一覧／`streaming.webMeeting`＝WEB会議）。
 * 設計: docs/design/v4/production-manual.md §4-3（カタログ）・§5-4（`resolve` API）・
 * §7-2（秘密の伏せ字）。レジストリは `shared/src/production/manualBlocks.ts`
 * （`server/src/shared/production/manualBlocks.ts` は複製・変更しない）。
 *
 * ⚠️⚠️ **この resolver は12種のうち唯一「秘密」を扱う。レビューはここを最優先で見ること。**
 * `streaming.list` のストリームキー・`streaming.webMeeting` のパスコードは、
 * `link.reveal?.fields` に対応する field 名が入っているときだけ平文で返し、
 * それ以外は必ず伏せ字にする（§7-2）。破ると配信の鍵・会議のパスコードが紙面に漏れる。
 *
 * ── 実際に読んだ既存サービス ─────────────────────────────────────────
 *   - `server/src/contexts/qsheet/services/device-settings.service.ts` の `getStreaming(owner)`
 *     （`destinations` は内部で `toDestinationOut()` を通した後の姿——`streamKeyMasked`/
 *     `hasStreamKey` だけを持ち、`streamKeyEnc`（暗号文）は戻り値に含まれない。
 *     `meetings` は一切加工されず**平文のまま**返る——WEB会議のパスコード伏せ字化は
 *     いまの実装のどこにも存在しない、という前提でここに書く）
 *   - `server/src/contexts/qsheet/device-settings-owner.ts` の `Owner`/`ownerWhere`
 *   - `server/src/contexts/qsheet/device-settings-types.ts` の `Destination`/`DestinationOut`/`Meeting`
 *   - `server/src/shared/utils/secret-box.ts` の `decrypt()`/`mask()`
 *
 * ⚠️ **`device-settings.service.ts` は一切変更しない**（配信設定の編集画面がそのまま
 * 平文の `streamKeyEnc` を必要とするため）。ストリームキーの解除表示に要る生の
 * `destinations`（`streamKeyEnc` 付き）は、この resolver の中だけで別途1回 SQL を引いて取る。
 * WEB会議のパスコード伏せ字化も、`getStreaming()` の戻り値に対してこの resolver の中だけで
 * 後がけする（`mask()` を import してそのまま使う）。
 *
 * ── 共通ポリシー ──────────────────────────────────────────────────────
 * resolve はサーバーの実行権限で読む。呼び出しユーザーが `qsheet` モジュール権限を個別に
 * 持っているかはここでは再チェックしない——**冊子自体が `canAccessManual` を通っていること
 * だけ**をゲートにする。この resolver は `resolve` 経由専用で、単体で外部公開しない。
 *
 * ── どの日の配信設定を返すか（v1 の割り切り） ────────────────────────────────
 * `recording.resolver.ts` と同じ理由で、`owner.date` は指定せず「その owner でいちばん
 * 新しい `service_date`」に委ねる（`getStreaming` 内部の `resolveDate` 任せ）。
 *
 * ── data の形（client-linked-ui 担当向け） ───────────────────────────────────
 * `streaming.list` → `{ serviceDate: string; destinations: StreamingListDestination[] } | null`
 *   - `link.reveal?.fields` に `'streamKey'` が**無い**とき: 各要素は `DestinationOut`
 *     （`streamKeyMasked`/`hasStreamKey` を持つ。ストリームキーの平文は一切含まない）
 *   - `'streamKey'` が**あるとき**: 各要素は `Omit<Destination, 'streamKey'> & { streamKey: string | null }`
 *     （`decrypt()` した実際の値。復号に失敗した/鍵が無い行は `null`）
 *   - owner が無い、またはその owner に配信設定が1件も無ければ `null`
 *
 * `streaming.webMeeting` → `{ serviceDate: string; meetings: Meeting[] } | null`
 *   - `link.reveal?.fields` に `'passcode'` が**無い**とき: 各 `meeting.passcode` を
 *     `mask()`（`****` + 末尾4桁。4桁未満は全部 `****`）に置き換える（`passcode` が
 *     元々無い行はそのまま無し）
 *   - `'passcode'` が**あるとき**: `getStreaming()` の戻り値をそのまま返す（平文）
 *   - owner が無い、またはその owner に配信設定が1件も無ければ `null`
 */
import { queryOne, type Row } from '../../../../shared/db/connection';
import { getStreaming } from '../device-settings.service';
import { ownerWhere, type Owner } from '../../device-settings-owner';
import type { Destination, Meeting, StreamingSettings } from '../../device-settings-types';
import { decrypt, mask } from '../../../../shared/utils/secret-box';
import type { ManualResolverCtx, ManualResolverResult } from './project.resolver';

/** ctx の projectId/programId から `Owner` を組み立てる。どちらも無ければ null */
function toOwner(ctx: ManualResolverCtx): Owner | null {
  if (ctx.projectId) return { kind: 'project', projectId: ctx.projectId };
  if (ctx.programId) return { kind: 'program', programId: ctx.programId };
  return null;
}

/** `recording.resolver.ts` と同じ理由（`RecordingSettings`/`StreamingSettings` に updated_at が無い） */
async function fetchRowUpdatedAt(owner: Owner, serviceDate: string): Promise<string | null> {
  const { clause, params } = ownerWhere(owner, 1);
  const row = (await queryOne(
    `SELECT updated_at FROM qsheet_streaming_settings WHERE ${clause} AND service_date = $${params.length + 1} AND deleted_at IS NULL`,
    [...params, serviceDate],
  )) as Row | undefined;
  return row?.updated_at ? new Date(row.updated_at as string).toISOString() : null;
}

export type StreamingListDestination =
  | (Destination & { streamKeyMasked: string; hasStreamKey: boolean }) // 既定（伏せ字）
  | (Omit<Destination, 'streamKey'> & { streamKey: string | null }); // 解除済み（平文）

/**
 * ストリームキーを解除して返す用に、`destinations` を生の姿（`streamKeyEnc` 付き）のまま
 * もう一度引く。`getStreaming()` は内部で `toDestinationOut()` を通してしまい
 * `streamKeyEnc` を落とすため、これでは復号できない——だからといって
 * `device-settings.service.ts` 側に「生のまま返すモード」を足す（＝編集用の関数を
 * 万人向けに変える）と平文が漏れる経路を増やすことになるため、ここで別クエリにする。
 */
async function loadRevealedDestinations(
  owner: Owner,
  serviceDate: string,
): Promise<(Omit<Destination, 'streamKey'> & { streamKey: string | null })[]> {
  const { clause, params } = ownerWhere(owner, 1);
  const row = (await queryOne(
    `SELECT destinations FROM qsheet_streaming_settings WHERE ${clause} AND service_date = $${params.length + 1} AND deleted_at IS NULL`,
    [...params, serviceDate],
  )) as Row | undefined;
  const raw = ((row?.destinations as (Destination & { streamKeyEnc?: string | null })[]) ?? []);
  return raw.map((d) => {
    const { streamKeyEnc, ...rest } = d;
    return { ...rest, streamKey: streamKeyEnc ? decrypt(streamKeyEnc) : null };
  });
}

/** `streaming.list`: 配信先の一覧。鍵は既定で伏せ字（§7-2） */
export async function resolveStreamingList(ctx: ManualResolverCtx): Promise<ManualResolverResult> {
  const owner = toOwner(ctx);
  if (!owner) return { data: null, updatedAt: null };

  const settings: StreamingSettings | null = await getStreaming(owner);
  if (!settings) return { data: null, updatedAt: null };

  const reveal = ctx.revealFields.includes('streamKey');
  const destinations: StreamingListDestination[] = reveal
    ? await loadRevealedDestinations(owner, settings.serviceDate)
    : settings.destinations;

  const updatedAt = await fetchRowUpdatedAt(owner, settings.serviceDate);
  return { data: { serviceDate: settings.serviceDate, destinations }, updatedAt };
}

/** `streaming.webMeeting`: WEB会議。パスコードは既定で伏せ字（§7-2） */
export async function resolveStreamingWebMeeting(ctx: ManualResolverCtx): Promise<ManualResolverResult> {
  const owner = toOwner(ctx);
  if (!owner) return { data: null, updatedAt: null };

  const settings: StreamingSettings | null = await getStreaming(owner);
  if (!settings) return { data: null, updatedAt: null };

  const reveal = ctx.revealFields.includes('passcode');
  // ⚠️ getStreaming() は meetings を一切加工しない（passcode は平文のまま）。
  // 伏せ字化はここでしか行われていないので、省略すると事故る。
  const meetings: Meeting[] = reveal
    ? settings.meetings
    : settings.meetings.map((m) => (m.passcode ? { ...m, passcode: mask(m.passcode) } : m));

  const updatedAt = await fetchRowUpdatedAt(owner, settings.serviceDate);
  return { data: { serviceDate: settings.serviceDate, meetings }, updatedAt };
}
