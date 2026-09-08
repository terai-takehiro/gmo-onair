/**
 * 制作技術支援トップ（`/qsheet/top`）— 番組・イベントの一覧をひとまとめにして返す。
 *
 * 案件管理の GLS 案件（`projects`）と、ここだけの番組（`qsheet_programs`）を
 * 同じ形（`TopItemRow`）で返す。**日付をここにコピーしない** — 案件管理・
 * `qsheet_programs` 自身が持つ日付をそのつど引く（唯一の情報源はそちら）。
 *
 * - `next_date` … 直近の本番・収録（きょう以降でいちばん近い日）。無ければ `null`。
 *   **開始日が無く終了日だけ未来にある案件はその終了日を入れる** — 入れないと
 *   「`last_date` だけ未来」になり、画面が「開催中」と誤って読む（Codex P2・PR #646）
 * - `last_date` … 最後の回・実施日。**「最後の回の翌日」からアーカイブ扱い**にする
 *   （2026-08-22 ご指示）。判定そのものはクライアント側で行う（きょうの日付は
 *   クライアントの壁時計を使う方が「開いた瞬間」と一致するため）
 *
 * ── 何を出すか（2026-09-08 のご指示で絞り直した）────────────────────────
 *
 * ここは**番組・イベントを選ぶ入口**なので、**制作物にならない案件は出さない**。
 * 以前は「GLS 番号が付いていれば全部」だったため、工事・構築のプロジェクト
 * （`GLS-B###`・改番後の `GMO-####`。第3本社プロジェクト・スタジオ構築など）が
 * 日付を持たないまま一覧の末尾に残り続けていた。
 *
 *   - **案件分類が `B`（プロジェクト）のものは出さない。** 2026年10月の事業再編で
 *     A/B の1字は番号から消えたが（旧A → `SCS-`/`GSS-`、旧B → `GMO-`）、
 *     `projects.gls_category` は残るのでそちらで判定する
 *     （`docs/reorg-2026-10-plan.md` §4.4）。**分類が未設定の古い案件は A 扱い**
 *     ——「案件を編集」・`missingOf` と同じ基準（v4.6.6）
 *   - **失注（`e_lost`）は出さない。** 本番が来ないため
 *
 * `stage` も返す。**日付を1つも持たない案件**（実施日未定のまま完了・実施済みに
 * なったもの）を終わったものとして畳むのに使う（判定はクライアント側）。
 *
 * GLS 案件は `episodes.broadcast_date`（無ければ `recording_date`）を見る。
 * **episodes が1件も無い案件は `projects.event_start`/`event_end` にフォールバック**
 * する（回を作っていない単発イベントがあるため）。**`NULLIF(…, '')` を通す** —
 * この2列は TEXT で、空文字が入っている行があると `''` がそのまま日付として
 * クライアントへ渡り、`nextDayStr('')` が Invalid Date で落ちる。
 * ここだけの番組（`qsheet_programs`）は `event_date` 1つだけを next/last 両方に使う
 * （日付が無い番組は `next_date`/`last_date` とも `null` ＝ 終了しない扱いになる）。
 *
 * 「今日」は **Postgres 側の `NOW() AT TIME ZONE 'Asia/Tokyo'`** で取る
 * （`server/src/shared/utils/jst.ts` の助言どおり。コンテナは tzdata を持たない UTC）。
 */
import { Router, Request, Response } from 'express';
import { queryAll } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

export type TopItemKind = 'gls' | 'own';

export interface TopItemRow {
  kind: TopItemKind;
  id: string;
  name: string;
  gls_number: string | null;
  customer_name: string | null;
  next_date: string | null;
  last_date: string | null;
  /**
   * 案件のステージ（`a_won` など）。ここだけの番組（`kind==='own'`）は `null`。
   * **日付を1つも持たない案件をアーカイブへ畳むため**にだけ使う
   * （`r_delivered`＝実施済・`s_completed`＝完了。判定は `topHelpers.ts`）
   */
  stage: string | null;
  /**
   * 改番で退役した旧番号（`project_numbers.number` where `retired_at IS NOT NULL`）。
   * 2026年10月の事業再編・P1（docs/reorg-2026-10-plan.md §4.10）— 旧番号でもこの一覧の
   * 検索から引けるようにするため。`kind==='own'`（案件管理に無い番組）は常に空配列
   */
  retired_numbers: string[];
}

router.get('/top-items', async (_req: Request, res: Response) => {
  try {
    const glsRows = await queryAll(`
      SELECT
        p.id,
        p.name,
        p.gls_number,
        p.stage,
        c.name AS customer_name,
        COALESCE(
          (SELECT MIN(COALESCE(e.broadcast_date, e.recording_date))
           FROM episodes e
           WHERE e.project_id = p.id AND e.deleted_at IS NULL
             AND COALESCE(e.broadcast_date, e.recording_date)
                 >= to_char(NOW() AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD')),
          CASE WHEN NULLIF(p.event_start, '') >= to_char(NOW() AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD')
               THEN NULLIF(p.event_start, '') END,
          -- **開始日が無く終了日だけ未来にある案件**（台帳・一括編集では片方だけ入れられる）は、
          -- その終了日が「いちばん近い本番日」。ここを落とすと next_date が null のまま
          -- last_date だけ未来になり、画面が**始まってもいないのに「開催中」**と読む
          -- （Codex レビュー P2・PR #646）
          CASE WHEN NULLIF(p.event_start, '') IS NULL
                AND NULLIF(p.event_end, '') >= to_char(NOW() AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD')
               THEN NULLIF(p.event_end, '') END
        ) AS next_date,
        COALESCE(
          (SELECT MAX(COALESCE(e.broadcast_date, e.recording_date))
           FROM episodes e
           WHERE e.project_id = p.id AND e.deleted_at IS NULL),
          NULLIF(p.event_end, ''), NULLIF(p.event_start, '')
        ) AS last_date
      FROM projects p
      LEFT JOIN companies c ON c.id = p.customer_id
      WHERE p.gls_number IS NOT NULL AND p.deleted_at IS NULL
        -- 工事・構築のプロジェクト（GLS-B###・改番後の GMO-####）は制作物ではないので出さない。
        -- 分類が未設定の古い案件は A 扱い（「案件を編集」・missingOf と同じ基準・v4.6.6）
        AND COALESCE(p.gls_category, 'A') <> 'B'
        -- 失注は本番が来ない
        AND p.stage <> 'e_lost'
      ORDER BY p.gls_number DESC
    `);

    const ownRows = await queryAll(`
      SELECT
        id,
        name,
        to_char(event_date, 'YYYY-MM-DD') AS event_date,
        CASE
          WHEN event_date >= (NOW() AT TIME ZONE 'Asia/Tokyo')::date
          THEN to_char(event_date, 'YYYY-MM-DD')
        END AS next_date
      FROM qsheet_programs
      WHERE deleted_at IS NULL
      ORDER BY event_date DESC NULLS LAST, created_at DESC
    `);

    // 改番で退役した旧番号（案件ごとに配列へ畳む）。1行ずつ引くと一覧の件数ぶん
    // 往復が増えるため、案件IDをまとめて1回で引く（studio-booking.service.ts の
    // fetchAssigneesByBookingIds と同じ形）。旧番号でも検索から引けるようにするため
    // （2026年10月の事業再編・P1・§4.10）
    const projectIds = glsRows.map((r) => r.id as string);
    const retiredRows = projectIds.length === 0 ? [] : await queryAll(
      `SELECT project_id, number FROM project_numbers
        WHERE project_id = ANY(?::text[]) AND retired_at IS NOT NULL
        ORDER BY retired_at`,
      [projectIds]
    );
    const retiredByProject = new Map<string, string[]>();
    for (const r of retiredRows) {
      const pid = r.project_id as string;
      const list = retiredByProject.get(pid) ?? [];
      list.push(r.number as string);
      retiredByProject.set(pid, list);
    }

    const items: TopItemRow[] = [
      ...glsRows.map((r) => ({
        kind: 'gls' as const,
        id: r.id as string,
        name: r.name as string,
        gls_number: r.gls_number as string | null,
        customer_name: r.customer_name as string | null,
        next_date: r.next_date as string | null,
        last_date: r.last_date as string | null,
        stage: r.stage as string | null,
        retired_numbers: retiredByProject.get(r.id as string) ?? [],
      })),
      ...ownRows.map((r) => ({
        kind: 'own' as const,
        id: r.id as string,
        name: r.name as string,
        gls_number: null,
        customer_name: null,
        next_date: r.next_date as string | null,
        last_date: r.event_date as string | null,
        // ここだけの番組にステージは無い（実施日だけで終わりを判断する）
        stage: null,
        retired_numbers: [] as string[],
      })),
    ];

    res.json({ success: true, data: items });
  } catch (err: unknown) {
    console.error('GET /top-items error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

export default router;
