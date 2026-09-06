/**
 * 資料ビルダーの「構成（デッキ）」— 会議日ごとの KeepDeck の版と、人の直しの差分（migration 291）。
 *
 * ── 版の考え方（docs/design/v4/keep-report.md §6.1・§10）────────────
 * - `keep_decks` は最新、`keep_deck_versions` に全文の版（切り詰めない。条件1）
 * - ONAiR が組んだ版は `source = 'auto'`（初回・組み直し）、人が保存した版は `'human'`
 * - **人の直しの差分は「いちばん新しい auto の版 → 保存した版」で作る**（条件2）。
 *   人の保存どうしで差を取ると、2回目の保存で1回目の直しが消えて見えるため。
 *   だから版 N の `keep_deck_edits` は「機械の出力からその版までの人の直しの全部」で、
 *   集計（条件4）は**デッキごとに最新の人の版の行だけ**を数えればよい（版をまたいで足さない）
 * - 初めての会議日は、前回（会議日が一つ前）の構成を写して自動ページを組み直す。前回が無ければ標準の構成
 *
 * ── 同時に触ったとき ───────────────────────────────────────────
 * - 初めて開く2人が同時に版1を作る → `keep_decks.meeting_date` の UNIQUE に `ON CONFLICT DO NOTHING` で
 *   負けた側は相手の版を読み直す（自分の版1は捨てる。版の番号が飛ばない）
 * - 保存・組み直しは **`UPDATE … WHERE version = 今の版`** で書き、更新できなければ 409（画面が送ってきた
 *   `expectedVersion` の前検査だけでは、読んでから書くまでの間に入った保存を止められない）
 *
 * 純粋な部分（構成を組む・差分を作る）は `keep-deck-compose.ts` / `keep-deck-diff.ts`（shared の写し）。
 * ここは DB の出し入れだけ。
 */
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute, withTransaction, type Row, type TxClient } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import type { KeepDeck, KeepReportPack, SlidePage, SlidePart } from './keep-deck.types';
import { SLIDE_TEMPLATES } from './keep-templates';
import { composeDeckPages } from './keep-deck-compose';
import { diffDecks } from './keep-deck-diff';
import { loadPackForMeeting } from './keep-deck-pack';
import { getInputs } from './keep-pack-inputs.service';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface DeckEnvelope {
  deck: KeepDeck;
  pack: KeepReportPack | null;
  /** 読んだパックが凍結版か（false は「いまの数字」） */
  pack_frozen: boolean;
  /** 構成の写し元になった（なる）前回の会議日。無ければ null */
  previous_meeting_date: string | null;
  /** ONAiR に無い数字の手入力（keep_report_inputs）。key → value。部品の `inputs.*` が読む */
  inputs: Record<string, unknown>;
}

/** 手入力を key → value の辞書にする（無ければ空） */
async function loadInputs(meetingDate: string): Promise<Record<string, unknown>> {
  const rows = await getInputs(meetingDate);
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export interface DeckListItem {
  id: string; meeting_date: string; version: number; pack_id: string | null;
  page_count: number; exported_box_file_id: string | null; exported_at: string | null;
  updated_at: string; updated_by: string | null;
}

export function assertMeetingDate(s: unknown): string {
  if (typeof s !== 'string' || !DATE_RE.test(s)) throw new AppError(400, 'VALIDATION_ERROR', '会議日は YYYY-MM-DD で指定してください');
  return s;
}

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));

function rowToDeck(row: Row): KeepDeck {
  const stored = (row.deck ?? {}) as { pages?: SlidePage[] };
  return {
    id: String(row.id),
    meeting_date: String(row.meeting_date),
    pack_id: row.pack_id == null ? null : String(row.pack_id),
    version: Number(row.version),
    pages: Array.isArray(stored.pages) ? stored.pages : [],
    exported: row.exported_box_file_id
      ? { box_file_id: String(row.exported_box_file_id), exported_at: iso(row.exported_at), by: String(row.exported_by ?? '') }
      : null,
    updated_at: iso(row.updated_at),
    updated_by: String(row.updated_by ?? ''),
  };
}

/** 画面から来た構成の形を確かめる。数字そのものは入っていない（binding で読む）ので、形だけ見る */
export function assertDeckPages(input: unknown): SlidePage[] {
  const pages = (input as { pages?: unknown })?.pages;
  if (!Array.isArray(pages)) throw new AppError(400, 'VALIDATION_ERROR', 'deck.pages が配列ではありません');
  const ids = new Set<string>();
  return pages.map((p, i) => {
    const pg = p as Partial<SlidePage>;
    if (typeof pg.id !== 'string' || !pg.id) throw new AppError(400, 'VALIDATION_ERROR', `ページ ${i + 1} に id がありません`);
    if (ids.has(pg.id)) throw new AppError(400, 'VALIDATION_ERROR', `ページの id が重複しています: ${pg.id}`);
    ids.add(pg.id);
    if (typeof pg.template !== 'string' || !(pg.template in SLIDE_TEMPLATES)) throw new AppError(400, 'VALIDATION_ERROR', `ページ ${pg.id} のテンプレが不明です`);
    if (!Array.isArray(pg.parts)) throw new AppError(400, 'VALIDATION_ERROR', `ページ ${pg.id} の parts が配列ではありません`);
    const parts: SlidePart[] = pg.parts.map((x, j) => {
      const pt = x as Partial<SlidePart>;
      if (typeof pt.id !== 'string' || !pt.id) throw new AppError(400, 'VALIDATION_ERROR', `ページ ${pg.id} の部品 ${j + 1} に id がありません`);
      for (const k of ['x', 'y', 'w', 'h'] as const) {
        if (typeof pt[k] !== 'number' || !Number.isFinite(pt[k])) throw new AppError(400, 'VALIDATION_ERROR', `部品 ${pt.id} の ${k} が数値ではありません`);
      }
      return {
        id: pt.id, type: (pt.type ?? 'text') as SlidePart['type'], binding: typeof pt.binding === 'string' ? pt.binding : null,
        x: pt.x!, y: pt.y!, w: pt.w!, h: pt.h!,
        text_override: typeof pt.text_override === 'string' ? pt.text_override : null,
        ...(pt.options && typeof pt.options === 'object' ? { options: pt.options as Record<string, unknown> } : {}),
      };
    });
    return {
      id: pg.id, template: pg.template, title: typeof pg.title === 'string' ? pg.title : SLIDE_TEMPLATES[pg.template].defaultTitle,
      auto: pg.auto !== false, parts, removed: pg.removed === true, notes: typeof pg.notes === 'string' ? pg.notes : null,
      agenda: pg.agenda === undefined ? null : pg.agenda,
    };
  });
}

async function findRow(meetingDate: string): Promise<Row | undefined> {
  return queryOne('SELECT * FROM keep_decks WHERE meeting_date = ?', [meetingDate]);
}

/**
 * 最新の版を1つ進める。**読んだときの版（`current.version`）のままの行だけ**を更新し、その間に
 * 別の保存が入っていれば（更新できる行が無い）409 で止める — 取引ごと ROLLBACK される
 */
async function bumpVersion(tx: TxClient, current: KeepDeck, next: KeepDeck): Promise<void> {
  const updated = await tx.queryOne(
    `UPDATE keep_decks SET deck = ?::jsonb, version = ?, pack_id = ?, updated_at = NOW(), updated_by = ?
      WHERE id = ? AND version = ? RETURNING id`,
    [JSON.stringify(next), next.version, next.pack_id, next.updated_by, current.id, current.version],
  );
  if (!updated) {
    throw new AppError(409, 'CONFLICT', `別の保存が先に入っています（開いたときの版 ${current.version}）。開き直してください`);
  }
}

async function previousMeetingDate(meetingDate: string): Promise<{ date: string; pages: SlidePage[] } | null> {
  const row = await queryOne('SELECT meeting_date, deck FROM keep_decks WHERE meeting_date < ? ORDER BY meeting_date DESC LIMIT 1', [meetingDate]);
  if (!row) return null;
  return { date: String(row.meeting_date), pages: rowToDeck(row).pages };
}

export const keepDeckService = {
  async listDecks(): Promise<DeckListItem[]> {
    const rows = await queryAll(
      `SELECT id, meeting_date, version, pack_id, exported_box_file_id, exported_at, updated_at, updated_by,
              COALESCE(jsonb_array_length(deck->'pages'), 0) AS page_count
         FROM keep_decks ORDER BY meeting_date DESC`,
    );
    return rows.map((r) => ({
      id: String(r.id), meeting_date: String(r.meeting_date), version: Number(r.version),
      pack_id: r.pack_id == null ? null : String(r.pack_id), page_count: Number(r.page_count),
      exported_box_file_id: r.exported_box_file_id == null ? null : String(r.exported_box_file_id),
      exported_at: r.exported_at == null ? null : iso(r.exported_at),
      updated_at: iso(r.updated_at), updated_by: r.updated_by == null ? null : String(r.updated_by),
    }));
  },

  /**
   * 会議日の構成を読むだけ（無ければ null）。「前回の資料と見比べる」のように
   * 読むだけの場面で、うっかり版1を作らないための口。
   */
  async getDeckIfExists(meetingDate: string): Promise<DeckEnvelope | null> {
    assertMeetingDate(meetingDate);
    const existing = await findRow(meetingDate);
    if (!existing) return null;
    const [{ pack, frozen }, prev, inputs] = await Promise.all([loadPackForMeeting(meetingDate), previousMeetingDate(meetingDate), loadInputs(meetingDate)]);
    return { deck: rowToDeck(existing), pack, pack_frozen: frozen, previous_meeting_date: prev?.date ?? null, inputs };
  },

  /** 会議日の構成を読む。無ければ前回の構成（無ければ標準）から組んで版1（auto）として保存する */
  async getOrCreateDeck(meetingDate: string, userId: string): Promise<DeckEnvelope> {
    assertMeetingDate(meetingDate);
    const { pack, pack_id, frozen } = await loadPackForMeeting(meetingDate);
    const prev = await previousMeetingDate(meetingDate);
    const inputs = await loadInputs(meetingDate);
    const existing = await findRow(meetingDate);
    if (existing) return { deck: rowToDeck(existing), pack, pack_frozen: frozen, previous_meeting_date: prev?.date ?? null, inputs };

    const id = uuidv4();
    const now = new Date().toISOString();
    const deck: KeepDeck = {
      id, meeting_date: meetingDate, pack_id, version: 1,
      pages: composeDeckPages(prev?.pages ?? null, pack), exported: null, updated_at: now, updated_by: userId,
    };
    const created = await withTransaction(async (tx) => {
      // 同じ会議日を同時に初めて開いた相手がいれば、こちらの版1は作らない（UNIQUE (meeting_date) が砦）
      const inserted = await tx.queryOne(
        `INSERT INTO keep_decks (id, meeting_date, pack_id, deck, version, updated_by) VALUES (?, ?, ?, ?::jsonb, 1, ?)
         ON CONFLICT (meeting_date) DO NOTHING RETURNING id`,
        [id, meetingDate, pack_id, JSON.stringify(deck), userId],
      );
      if (!inserted) return false;
      await tx.execute(
        'INSERT INTO keep_deck_versions (id, deck_id, version, deck, source, created_by) VALUES (?, ?, 1, ?::jsonb, ?, ?)',
        [uuidv4(), id, JSON.stringify(deck), 'auto', userId],
      );
      return true;
    });
    if (!created) {
      const theirs = await findRow(meetingDate);
      if (!theirs) throw new AppError(409, 'CONFLICT', '同じ会議日の構成が同時に作られました。開き直してください');
      return { deck: rowToDeck(theirs), pack, pack_frozen: frozen, previous_meeting_date: prev?.date ?? null, inputs };
    }
    return { deck, pack, pack_frozen: frozen, previous_meeting_date: prev?.date ?? null, inputs };
  },

  /**
   * 人の保存。新しい版（human）を作り、いちばん新しい auto の版との差分を `keep_deck_edits` に入れる。
   * `expectedVersion` を渡すと、その間に別の人が保存していたら 409 で止める（上書き事故の防止）。
   */
  async saveDeck(meetingDate: string, input: unknown, userId: string, expectedVersion?: number | null): Promise<{ deck: KeepDeck; version: number; edits: number }> {
    assertMeetingDate(meetingDate);
    const pages = assertDeckPages(input);
    const row = await findRow(meetingDate);
    if (!row) throw new AppError(404, 'NOT_FOUND', 'この会議日の構成はまだありません（先に開いてください）');
    const current = rowToDeck(row);
    if (expectedVersion != null && expectedVersion !== current.version) {
      throw new AppError(409, 'CONFLICT', `別の保存が先に入っています（いまの版 ${current.version}）。開き直してください`);
    }
    const base = await queryOne(
      "SELECT deck FROM keep_deck_versions WHERE deck_id = ? AND source = 'auto' ORDER BY version DESC LIMIT 1", [current.id],
    );
    const basePages = base ? ((base.deck as { pages?: SlidePage[] }).pages ?? []) : current.pages;
    const edits = diffDecks(basePages, pages);
    const version = current.version + 1;
    const now = new Date().toISOString();
    const deck: KeepDeck = { ...current, pages, version, updated_at: now, updated_by: userId };
    await withTransaction(async (tx) => {
      await bumpVersion(tx, current, deck);
      await tx.execute('INSERT INTO keep_deck_versions (id, deck_id, version, deck, source, created_by) VALUES (?, ?, ?, ?::jsonb, ?, ?)',
        [uuidv4(), current.id, version, JSON.stringify(deck), 'human', userId]);
      for (const e of edits) {
        await tx.execute(
          `INSERT INTO keep_deck_edits (id, deck_id, version, page_id, part_id, field, before_value, after_value, kind, edited_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), current.id, version, e.page_id, e.part_id, e.field, e.before_value, e.after_value, e.kind, userId],
        );
      }
    });
    return { deck, version, edits: edits.length };
  },

  /** 自動ページをいまのパック（凍結版があればそれ）で組み直す。人の直しは残る。新しい版（auto） */
  async rebuildDeck(meetingDate: string, userId: string): Promise<DeckEnvelope> {
    assertMeetingDate(meetingDate);
    const row = await findRow(meetingDate);
    if (!row) return this.getOrCreateDeck(meetingDate, userId);
    const current = rowToDeck(row);
    const { pack, pack_id, frozen } = await loadPackForMeeting(meetingDate);
    const prev = await previousMeetingDate(meetingDate);
    const inputs = await loadInputs(meetingDate);
    const version = current.version + 1;
    const deck: KeepDeck = {
      ...current, pack_id, version, pages: composeDeckPages(current.pages, pack), updated_at: new Date().toISOString(), updated_by: userId,
    };
    await withTransaction(async (tx) => {
      await bumpVersion(tx, current, deck);
      await tx.execute('INSERT INTO keep_deck_versions (id, deck_id, version, deck, source, created_by) VALUES (?, ?, ?, ?::jsonb, ?, ?)',
        [uuidv4(), current.id, version, JSON.stringify(deck), 'auto', userId]);
    });
    return { deck, pack, pack_frozen: frozen, previous_meeting_date: prev?.date ?? null, inputs };
  },

  /** 出力した pptx の置き場（Box の file id）を最新に記録する（条件3） */
  async markExported(meetingDate: string, boxFileId: string, userId: string): Promise<void> {
    assertMeetingDate(meetingDate);
    await execute('UPDATE keep_decks SET exported_box_file_id = ?, exported_at = NOW(), exported_by = ? WHERE meeting_date = ?',
      [boxFileId, userId, meetingDate]);
  },

  /** 版ごとの人の直し（集計・画面の「前回との違い」用） */
  async listEdits(meetingDate: string, version?: number): Promise<Row[]> {
    assertMeetingDate(meetingDate);
    const row = await findRow(meetingDate);
    if (!row) return [];
    const v = version ?? Number(row.version);
    return queryAll('SELECT * FROM keep_deck_edits WHERE deck_id = ? AND version = ? ORDER BY edited_at, id', [String(row.id), v]);
  },
};
