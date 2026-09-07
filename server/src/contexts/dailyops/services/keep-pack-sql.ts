/**
 * 帳簿の行を**案件ごと**に割った形にする SQL（売上／仕入で同じ形・純粋な文字列だけ）
 *
 * グループ請求（`group_id`）の行は `project_id` が先頭の案件しか指さず、内訳は
 * `revenue_allocations` / `purchase_allocations` にある（migration 005/006・`monthly-summary.service.ts` と同じ読み方）。
 * 案件の属性（ステージの確度・お客様の区分）で切るときは、按分のある行は allocation の額を各案件へ、
 * 按分の無い行はそのまま。代表案件の属性を行全体に掛けると按分先が無視される。
 *
 * 列: entity_code（行の会社）, project_id, recognition_date, amount。占位子は (from, to, from, to) の順。
 * 使う側: 見込の確度加味と注記（`keep-pack-pl.service.ts`）・推移グラフのグループ内／外部（`keep-pack-calendar.service.ts`）。
 */
export function perProjectRowsSql(table: 'revenues' | 'purchases', statusWhere: string): string {
  const alloc = table === 'revenues' ? 'revenue_allocations' : 'purchase_allocations';
  const fk = table === 'revenues' ? 'revenue_id' : 'purchase_id';
  return `
    SELECT t.entity_code, t.project_id, t.recognition_date, t.amount
      FROM ${table} t
     WHERE t.deleted_at IS NULL ${statusWhere}
       AND t.recognition_date >= ? AND t.recognition_date <= ?
       AND NOT EXISTS (SELECT 1 FROM ${alloc} a0 WHERE a0.${fk} = t.id)
    UNION ALL
    SELECT t.entity_code, a.project_id, t.recognition_date, a.allocated_amount
      FROM ${table} t JOIN ${alloc} a ON a.${fk} = t.id
     WHERE t.deleted_at IS NULL ${statusWhere}
       AND t.recognition_date >= ? AND t.recognition_date <= ?`;
}
