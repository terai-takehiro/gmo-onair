// 収録設定・配信設定（機器設定）の CRUD と「前回の設定を写す」。
//
// ⚠️ decks / destinations / meetings は「まるごと差し替え」。行単位のマージはしない
// （同時編集しない前提。2人が同時に開いていたら後勝ち — impl doc §4-2 / §9-2 の6）。
import { v4 as uuidv4 } from 'uuid';
import { queryOne, execute } from '../../../shared/db/connection';
import { encrypt, decrypt, mask } from '../../../shared/utils/secret-box';
import { Owner, ownerWhere } from '../device-settings-owner';
import {
  Deck,
  Destination,
  DestinationOut,
  Meeting,
  RecordingSettings,
  StreamingSettings,
} from '../device-settings-types';

const MASK_PREFIX = '****';

function ownerCols(owner: Owner): { col: 'project_id' | 'program_id' | 'doc_no'; value: string } {
  if (owner.kind === 'project') return { col: 'project_id', value: owner.projectId };
  if (owner.kind === 'program') return { col: 'program_id', value: owner.programId };
  return { col: 'doc_no', value: owner.docNo };
}

/** `?date=` が無いとき、その owner で最も新しい service_date を引く */
// ⚠️ service_date は DATE。pg は JS の Date で返すので、`String(row.service_date)` だと
// "Sat Aug 22 2026 00:00:00 GMT+0000 (...)" のような toString() 表記になり、
// この文字列をそのまま次の SQL の service_date = $N に渡すと
// invalid input syntax for type date で 500 になる（実際に踏んだ・schedule.service.ts と
// 同じ罠。04-schedule-impl.md §3-1）。必ず SQL 側で to_char() して YYYY-MM-DD 文字列にする。
async function resolveDate(table: string, owner: Owner): Promise<string | null> {
  if (owner.date) return owner.date;
  const { clause, params } = ownerWhere(owner, 1);
  const row = await queryOne(
    `SELECT to_char(service_date, 'YYYY-MM-DD') AS service_date FROM ${table}
     WHERE ${clause} AND deleted_at IS NULL
     ORDER BY service_date DESC LIMIT 1`,
    params
  );
  return row ? (row.service_date as string) : null;
}

// ============================================================
// 収録設定
// ============================================================
export async function getRecording(owner: Owner): Promise<RecordingSettings | null> {
  const date = await resolveDate('qsheet_recording_settings', owner);
  if (!date) return null;
  const { clause, params } = ownerWhere(owner, 1);
  const row = await queryOne(
    `SELECT * FROM qsheet_recording_settings WHERE ${clause} AND service_date = $${params.length + 1}
       AND deleted_at IS NULL`,
    [...params, date]
  );
  if (!row) return null;
  return {
    serviceDate: date,
    decks: (row.decks as Deck[]) ?? [],
    lastExportedAt: (row.last_exported_at as string) ?? null,
    lastExportedBy: (row.last_exported_by as string) ?? null,
    lastExportName: (row.last_export_name as string) ?? null,
  };
}

export async function putRecording(
  owner: Owner,
  serviceDate: string,
  decks: Deck[],
  userId: string
): Promise<void> {
  const { col, value } = ownerCols(owner);
  const existing = await queryOne(
    `SELECT id FROM qsheet_recording_settings WHERE ${col} = $1 AND service_date = $2 AND deleted_at IS NULL`,
    [value, serviceDate]
  );
  if (existing) {
    await execute(
      `UPDATE qsheet_recording_settings SET decks = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(decks), existing.id]
    );
  } else {
    await execute(
      `INSERT INTO qsheet_recording_settings (id, ${col}, service_date, decks, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [uuidv4(), value, serviceDate, JSON.stringify(decks), userId]
    );
  }
}

// ============================================================
// 配信設定
// ============================================================

/** ストリームキーの応答用の姿（常にマスク・平文は絶対に返さない） */
function toDestinationOut(d: Destination & { streamKeyEnc?: string | null }): DestinationOut {
  const { streamKeyEnc, streamKey: _drop, ...rest } = d as Destination & { streamKeyEnc?: string | null; streamKey?: string };
  const plain = streamKeyEnc ? decrypt(streamKeyEnc) : null;
  return { ...rest, streamKeyMasked: mask(plain), hasStreamKey: !!streamKeyEnc };
}

export async function getStreaming(owner: Owner): Promise<StreamingSettings | null> {
  const date = await resolveDate('qsheet_streaming_settings', owner);
  if (!date) return null;
  const { clause, params } = ownerWhere(owner, 1);
  const row = await queryOne(
    `SELECT * FROM qsheet_streaming_settings WHERE ${clause} AND service_date = $${params.length + 1}
       AND deleted_at IS NULL`,
    [...params, date]
  );
  if (!row) return null;
  const rawDests = ((row.destinations as (Destination & { streamKeyEnc?: string | null })[]) ?? []);
  return {
    serviceDate: date,
    destinations: rawDests.map(toDestinationOut),
    meetings: (row.meetings as Meeting[]) ?? [],
    keyMode: (row.key_mode as 'blank' | 'plain') ?? 'blank',
    lastExportedAt: (row.last_exported_at as string) ?? null,
    lastExportedBy: (row.last_exported_by as string) ?? null,
    lastExportName: (row.last_export_name as string) ?? null,
  };
}

/**
 * 入力の `destinations[].streamKey` を保存用の姿（`streamKeyEnc`。平文は持たない）に直す。
 *
 * ── 3値の意味（device-settings-types.ts の `StreamKeyIntent`） ──────────
 *   `undefined` … **いまの鍵をそのまま残す**（画面は鍵の欄を常に空で描くので、これが既定）
 *   `''`        … **鍵を消す**（利用者が「キーを消す」を押したときだけ）
 *   それ以外    … その値を新しい鍵にする
 *
 * ⚠️ **以前の実装は事故を起こしていた。** 画面に伏せ字（`****abcd`）を出し、
 *    それをそのまま送り返させ、サーバーは `(encoderId, name)` で前の暗号文を探していた。
 *    名前は利用者が自由に変える値なので、**配信先の名前を直して保存した瞬間に鍵が消えた**
 *    （画面は「保存しました」と出る）。実機で再現済み。
 *    いまは **行の安定した id（`destId`）** で突き合わせ、伏せ字は送り返させない。
 */
function toStoredDestinations(
  incoming: Destination[],
  previous: (Destination & { streamKeyEnc?: string | null })[]
): (Destination & { streamKeyEnc?: string | null })[] {
  const byId = new Map(previous.filter((p) => p.destId).map((p) => [p.destId as string, p]));

  return incoming.map((d) => {
    const { streamKey, ...rest } = d;

    // 前の行を探す。destId が正。無い行（この変更より前に保存されたもの）だけ
    // 旧来の (encoderId, name) に落とす — 移行のあいだだけの保険。
    const prior =
      (d.destId ? byId.get(d.destId) : undefined) ??
      previous.find((p) => !p.destId && p.encoderId === d.encoderId && p.name === d.name);

    let streamKeyEnc: string | null;
    if (streamKey === undefined) {
      streamKeyEnc = prior?.streamKeyEnc ?? null;      // keep
    } else if (streamKey === '') {
      streamKeyEnc = null;                              // clear
    } else if (streamKey.startsWith(MASK_PREFIX)) {
      // 伏せ字が送られてきたら「変更なし」として扱う（古い画面との互換）。
      streamKeyEnc = prior?.streamKeyEnc ?? null;
    } else {
      streamKeyEnc = encrypt(streamKey);                // set
    }
    // destId が無い行（この変更より前に保存されたもの）はここで採番して安定させる。
    return { ...rest, destId: rest.destId ?? prior?.destId ?? `dst_${uuidv4()}`, streamKeyEnc };
  });
}

export async function putStreaming(
  owner: Owner,
  serviceDate: string,
  destinations: Destination[],
  meetings: Meeting[],
  userId: string
): Promise<void> {
  const { col, value } = ownerCols(owner);
  const existing = await queryOne(
    `SELECT id, destinations FROM qsheet_streaming_settings
       WHERE ${col} = $1 AND service_date = $2 AND deleted_at IS NULL`,
    [value, serviceDate]
  );
  const previous = (existing?.destinations as (Destination & { streamKeyEnc?: string | null })[]) ?? [];
  const stored = toStoredDestinations(destinations, previous);

  if (existing) {
    await execute(
      `UPDATE qsheet_streaming_settings SET destinations = $1, meetings = $2, updated_at = NOW() WHERE id = $3`,
      [JSON.stringify(stored), JSON.stringify(meetings), existing.id]
    );
  } else {
    await execute(
      `INSERT INTO qsheet_streaming_settings (id, ${col}, service_date, destinations, meetings, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), value, serviceDate, JSON.stringify(stored), JSON.stringify(meetings), userId]
    );
  }
}

export async function recordExport(
  kind: 'recording' | 'streaming',
  owner: Owner,
  serviceDate: string,
  userId: string,
  filename: string
): Promise<void> {
  const table = kind === 'recording' ? 'qsheet_recording_settings' : 'qsheet_streaming_settings';
  const { col, value } = ownerCols(owner);
  await execute(
    `UPDATE ${table} SET last_exported_at = NOW(), last_exported_by = $1, last_export_name = $2
       WHERE ${col} = $3 AND service_date = $4`,
    [userId, filename, value, serviceDate]
  );
}

// ============================================================
// copy-from（前回の設定を写す）
// ============================================================
export interface CopyFromResult {
  recording: boolean;
  streaming: boolean;
}

/**
 * `from` の設定を `owner`/`serviceDate` へ写す。
 * ⚠️ `meetings` は写さない（会議URL・パスコードは日ごとに別物。古い会議に人を集めてしまう）。
 * ⚠️ `streamKey` も写さない（「前回の設定を写す」で鍵まで付いてくるのは意図しない配信につながる）。
 */
export async function copyFrom(
  owner: Owner,
  serviceDate: string,
  from: Owner,
  what: ('recording' | 'streaming')[],
  userId: string
): Promise<CopyFromResult> {
  const result: CopyFromResult = { recording: false, streaming: false };

  if (what.includes('recording')) {
    const src = await getRecording(from);
    if (src) {
      await putRecording(owner, serviceDate, src.decks, userId);
      result.recording = true;
    }
  }

  if (what.includes('streaming')) {
    const src = await getStreaming(from);
    if (src) {
      // hasStreamKey な情報は落とし、鍵無しの入力の形に戻してから putStreaming に渡す
      // （putStreaming は「****」を「変更なし」と解釈するため、素の undefined で渡す）
      // ⚠️ 鍵は写さない。`streamKey: ''`（消す）を明示し、行の id も新しく振る。
      // 省略（undefined）にすると「いまの鍵を残す」の意味になり、
      // 写した先に同じ destId の行があると鍵まで引き継いでしまう。
      const destinations: Destination[] = src.destinations.map((d) => {
        const { streamKeyMasked: _m, hasStreamKey: _h, destId: _old, ...rest } = d;
        return { ...rest, destId: `dst_${uuidv4()}`, streamKey: '' };
      });
      // ⚠️ **写し先の WEB会議を消さないこと。**
      // 以前はここで `[]` を渡していたため、会議URL・会議ID・パスコードを入れて保存したあとに
      // 「前回の設定を写す」を押すと、**その日の会議が全件消えた**（ダイアログには
      // 「WEB会議は写しません」と書いてあるので、利用者は消えるとは思わない）。
      // 「写さない」は「写し元の会議を持ってこない」であって「写し先の会議を消す」ではない。
      const keep = await getStreaming({ ...owner, date: serviceDate });
      await putStreaming(owner, serviceDate, destinations, keep?.meetings ?? [], userId);
      result.streaming = true;
    }
  }

  return result;
}
