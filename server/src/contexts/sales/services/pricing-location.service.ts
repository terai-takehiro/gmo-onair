/**
 * 料金表を場所ごとに扱う (v4 大③・migration 172)
 *
 * ── 「案件の場所」はどこから来るか ────────────────────────────
 *
 * `projects` に場所の列はありません。持っているのは**スタジオの予約**
 * (`studio_bookings` → `studio_rooms.location_id`) だけです。
 * 予約が1つの場所に揃っていればそれを使い、揃っていない（複数拠点をまたぐ・
 * まだ予約が無い）ときは**推測しません** — 料金の入っている最初の場所を出し、
 * 「なぜその場所なのか」を画面が書きます。
 *
 * 黙って別の場所の料金を出すのがいちばん危ない（**金額が変わるのに気づけない**）。
 */
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../../../shared/middleware/errorHandler';

export interface PricingLocation {
  id: string;
  name: string;
  sort_order: number;
  category_count: number;
  item_count: number;
}

export const pricingLocationService = {
  /** 場所の一覧。**料金が0件の場所も出す**（「まだ入れていない」が読み取れるように） */
  async list(): Promise<PricingLocation[]> {
    const rows = await queryAll(
      `SELECT l.id, l.name, l.sort_order,
              COUNT(DISTINCT c.id)::int AS category_count,
              COUNT(i.id)::int          AS item_count
         FROM studio_locations l
         LEFT JOIN pricing_categories c ON c.location_id = l.id AND c.deleted_at IS NULL
         LEFT JOIN pricing_items      i ON i.category_id = c.id AND i.deleted_at IS NULL
        WHERE l.deleted_at IS NULL
        GROUP BY l.id, l.name, l.sort_order
        ORDER BY l.sort_order, l.name`,
    );
    return rows.map((r) => ({
      id: String(r.id), name: String(r.name), sort_order: Number(r.sort_order ?? 0),
      category_count: Number(r.category_count ?? 0), item_count: Number(r.item_count ?? 0),
    }));
  },

  /**
   * 案件に使う場所を決める。
   *
   * 返り値の `reason` は**画面にそのまま出します**。どの表の金額を見ているかが
   * 分からないまま見積を組むと、あとから「渋谷の案件なのに用賀の値段」が起きます。
   */
  async resolveForProject(projectId: string | null): Promise<{
    location_id: string | null;
    reason: 'booking' | 'only_priced' | 'ambiguous' | 'none';
    candidates: string[];
  }> {
    const priced = await queryAll(
      `SELECT DISTINCT c.location_id AS id FROM pricing_categories c
         JOIN pricing_items i ON i.category_id = c.id AND i.deleted_at IS NULL
        WHERE c.deleted_at IS NULL AND c.location_id IS NOT NULL`,
    );
    const pricedIds = priced.map((r) => String(r.id));

    if (projectId) {
      const rows = await queryAll(
        // 予約と部屋は**中間表**でつながる（1つの予約が複数の部屋を押さえる）。
        // `studio_bookings.room_id` は存在しない
        `SELECT DISTINCT r.location_id AS id
           FROM studio_bookings b
           JOIN studio_booking_rooms br ON br.booking_id = b.id
           JOIN studio_rooms r          ON r.id = br.room_id
          WHERE b.project_id = ? AND b.deleted_at IS NULL AND r.deleted_at IS NULL`,
        [projectId],
      );
      const ids = rows.map((r) => String(r.id)).filter(Boolean);
      if (ids.length === 1) return { location_id: ids[0], reason: 'booking', candidates: ids };
      // **複数の拠点にまたがっている案件で片方を選ばない。** どちらの料金でも
      // 間違いになりうるので、選んでもらう
      if (ids.length > 1) return { location_id: null, reason: 'ambiguous', candidates: ids };
    }

    if (pricedIds.length === 1) return { location_id: pricedIds[0], reason: 'only_priced', candidates: pricedIds };
    return { location_id: pricedIds[0] ?? null, reason: pricedIds.length ? 'only_priced' : 'none', candidates: pricedIds };
  },

  /**
   * ほかの場所の料金表を丸ごと写す（モックの「用賀の料金表をコピー」）。
   *
   * **空の場所にしか写しません。** 2回押すと分類も品目も倍になり、
   * 見積の選択肢に同じ品目が2つ並びます（どちらを選んだかで金額が変わる）。
   */
  async copyTable(fromId: string, toId: string, userId: string): Promise<{ categories: number; items: number }> {
    if (fromId === toId) throw new AppError(400, 'VALIDATION_ERROR', '同じ場所には写せません');
    for (const id of [fromId, toId]) {
      const loc = await queryOne('SELECT id FROM studio_locations WHERE id = ? AND deleted_at IS NULL', [id]);
      if (!loc) throw new AppError(404, 'NOT_FOUND', '場所が見つかりません');
    }
    const existing = await queryOne(
      `SELECT COUNT(*)::int AS c FROM pricing_categories WHERE location_id = ? AND deleted_at IS NULL`, [toId]);
    if (Number(existing?.c ?? 0) > 0) {
      throw new AppError(409, 'ALREADY_HAS_TABLE',
        'この場所にはすでに料金表があります。写すと同じ品目が2つ並ぶので、先に消してください');
    }

    const cats = await queryAll(
      `SELECT id, name, sort_order FROM pricing_categories
        WHERE location_id = ? AND deleted_at IS NULL ORDER BY sort_order, created_at`, [fromId]);
    if (cats.length === 0) throw new AppError(400, 'VALIDATION_ERROR', '写す元の料金表が空です');

    let items = 0;
    for (const c of cats) {
      const newCatId = uuidv4();
      await execute(
        `INSERT INTO pricing_categories (id, name, sort_order, location_id, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [newCatId, c.name, c.sort_order ?? 0, toId, userId, userId],
      );
      const its = await queryAll(
        `SELECT name, sub_label, unit_price, group_price, calc_type, sort_order
           FROM pricing_items WHERE category_id = ? AND deleted_at IS NULL ORDER BY sort_order, created_at`,
        [c.id]);
      for (const it of its) {
        await execute(
          `INSERT INTO pricing_items
             (id, category_id, name, sub_label, unit_price, group_price, calc_type, sort_order, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), newCatId, it.name, it.sub_label ?? null, it.unit_price ?? null,
           it.group_price ?? null, it.calc_type, it.sort_order ?? 0, userId, userId],
        );
        items++;
      }
    }
    return { categories: cats.length, items };
  },
};
