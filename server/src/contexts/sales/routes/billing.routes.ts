/**
 * ⑤ 見積・請求（全案件） — 案件をまたいだ一覧
 *
 * ── 案件詳細の見積タブとの違い ──────────────────────────────
 *
 * あちらは「この案件の見積」、こちらは**全案件を横に見て、
 * 返事待ち・入金待ちを取りこぼさない**ための画面です。
 * 数字は同じテーブルから読むので食い違いません。
 *
 * ── 「回」ごとに1行にしない ──────────────────────────────
 *
 * 請求は `revenues` の1行 = 1請求です。
 *
 * ⚠️ **按分（グループ請求）も1行です。** 以前ここには「按分の親行は子行と
 * 二重に数えないよう `group_id IS NULL` で絞る」と書いてありましたが、
 * **`revenues` に子行はありません** — 按分の内訳は別表（`revenue_allocations`）で、
 * グループ請求は `group_id` が入った**1行だけ**です（migration 006）。
 * 絞っていたせいで、**グループ請求はこの一覧にも締め処理にも1行も出ず、
 * 請求書も入金も検収も記録できませんでした**（レビューでの指摘 #53）。
 */
import { Router } from 'express';
import { withCanApprove } from '../services/estimate.service';
import { requireAuth, requirePermission, meetsPermissionLevel } from '../../../shared/middleware/auth';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { assignInvoiceNumbers } from '../../finance/services/invoice-number.service';
import { BILLING_STATE_SQL, billingStateSql } from '../../../shared/services/billing-state';

const router = Router();

/**
 * 同じ請求を2つの入口から扱います:
 *   案件管理 ⑤ 見積・請求  … 案件をまたいで取りこぼさない
 *   財務   ② 請求・入金   … 月次の締めを一括でやる
 *
 * 以前は `sales` と `budget` が別区画で、`sales` だけを要求していたせいで
 * **経理だけの人は月次の締めができない**事故があった。権限モデル単純化で
 * `budget` は `sales` に統合されたため、いまはこの2入口とも同じ `sales` 区画
 * を見ればよい（docs/reviews/permission-model-simplification-plan.md）。
 */
router.use(requireAuth, requirePermission('sales'));
const canEdit = requirePermission('sales', 'editor');

/** 日付の形。**画面から来た値をそのまま SQL に置かない** */
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** 入金日を**入れよう**としているか（取り消し＝`null` は含まない） */
function isSettingPaidDate(body: Record<string, unknown>): boolean {
  return 'paid_date' in body && body.paid_date !== null;
}

/**
 * この更新のあと、請求書を出した状態になっているか。
 *
 * **同じ回で `invoice_issued: true` を送っているなら出したことにする** —
 * 「出して入金も記録する」を1回でやるのは普通の操作で、そこを弾くと
 * 画面が2回叩くだけになる（そして片方だけ通った行ができる）。
 */
function isIssuedAfter(body: Record<string, unknown>, current: boolean): boolean {
  return 'invoice_issued' in body ? body.invoice_issued === true : current === true;
}

/**
 * 一覧に並べる上限。**件数と合計はこれとは別に数えます**（レビューでの指摘 #53）。
 * 行を切るのは画面を固まらせないためで、**数字まで切ってよい理由にはなりません**。
 */
const LIST_LIMIT = 300;

/**
 * 見積の一覧。**旧版 (`superseded`) は出しません** — 一覧に出す意味が
 * 「返事待ちを取りこぼさない」なので、差し替え済みの版が並ぶと数が合いません。
 * 版そのものは案件詳細で見られます。
 */
router.get('/estimates', async (req, res) => {
  const mine = req.query.scope === 'mine';
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const params: unknown[] = [];
  // **`gls_category = 'A'` を必ず付ける。** `estimates` にはプロジェクト（GLS-B）の
  // 見積も入るので、外すと案件管理の見積・請求一覧にプロジェクトの見積が並ぶ
  // （migration 179 より前は `e.gpm_project_id IS NULL` が同じ役目をしていた）
  let where = `WHERE e.deleted_at IS NULL AND p.gls_category = 'A' AND e.status <> 'superseded' AND p.deleted_at IS NULL`;

  if (mine) { where += ' AND e.created_by = ?'; params.push(req.user!.id); }
  // **承認待ちだけを見る。** 承認する人は案件を1件ずつ開いて回れないので、
  // ここから探せる必要がある（`?approval=pending`）
  if (req.query.approval === 'pending') where += " AND e.approval_state = 'pending'";
  if (status) {
    // **知らない状態名は素通しさせない** (絞り込んだのに全件返ると気づけない)
    const list = status.split(',').map((s) => s.trim())
      .filter((s) => ['draft', 'sent', 'accepted', 'rejected'].includes(s));
    where += list.length ? ` AND e.status IN (${list.map(() => '?').join(',')})` : ' AND FALSE';
    params.push(...list);
  }

  const rows = await queryAll(
    `SELECT e.id, e.project_id, e.group_id, e.version, e.title, e.status,
            e.subtotal, e.discount, e.sent_at, e.valid_until, e.approval_state,
            p.name AS project_name, p.gls_number,
            c.name AS customer_name,
            u.name AS created_by_name
       FROM estimates e
       -- 案件の見積だけ。estimates にはプロジェクト管理 (GPM) の見積も入る
       -- (migration 173)。内部結合で自然に落ちるが、偶然そうなっている状態に
       -- 頼らず where で明示する (左結合に直した瞬間に GPM の見積が混ざる)
       JOIN projects p ON p.id = e.project_id
       LEFT JOIN companies c ON c.id = p.customer_id
       LEFT JOIN users u ON u.id = e.created_by
       ${where}
      ORDER BY
        -- 出したまま返事が無いものを先頭に。**期限が近い順**
        CASE e.status WHEN 'sent' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
        e.valid_until ASC NULLS LAST,
        e.updated_at DESC
      LIMIT ${LIST_LIMIT}`,
    params,
  );
  /*
   * ⚠️ **件数と合計はサーバーが数える**（レビューでの指摘 #53）。
   *
   * 行は 300 件で切っています（全部並べると画面が固まる）。ところが画面は
   * **並んだ行を数えて「見積 300」と出し、並んだ行を足して合計を出して**いました。
   * つまり 301 件目からは**件数にも合計にも入りません**。しかも画面には
   * それらしい数字が出るだけなので、**月末に合計が合わないまで気づけません**。
   */
  const agg = await queryOne(
    `SELECT COUNT(*) AS n,
            COALESCE(SUM(COALESCE(e.subtotal, 0) - COALESCE(e.discount, 0)), 0) AS amount
       FROM estimates e
       JOIN projects p ON p.id = e.project_id
       ${where}`,
    params,
  ) as { n: string; amount: string } | undefined;

  // 「あなたは承認できるか」をサーバーが決めて渡す（押して 403 にしない）。
  // ここに並ぶのは**案件（GLS-A）の見積だけ**なので、承認の口が要求するのは
  // `sales` の編集権限（この一覧は `budget` だけの人も開けるので、
  // その人には false になる — 押せる口がそもそも無い）
  const canEditSales = meetsPermissionLevel(req.user?.role, req.user?.permissions?.sales, 'editor');
  res.json({
    success: true,
    data: await withCanApprove(rows as never[], req.user!.id, canEditSales),
    // 絞り込み全体の件数と合計（**並んだ行のぶんではない**）
    total_count: Number(agg?.n ?? 0),
    total_amount: Number(agg?.amount ?? 0),
    /** 行を切ったか。**画面はこれを見て「ほか N 件」を出す** */
    truncated: Number(agg?.n ?? 0) > rows.length,
  });
});

/**
 * 請求の一覧。**確定 (`confirmed`) だけ**を出します —
 * 見積段階の行を混ぜると請求額の合計が実態より大きくなります
 * (`revenues` を読む多くの箇所が `status` を見ていない、という前例があるので明示)。
 */
router.get('/invoices', async (req, res) => {
  const mine = req.query.scope === 'mine';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const params: unknown[] = [];
  // **グループ請求も出す**（`revenues` の1行 = 1請求。子行は無い）
  let where = `WHERE r.deleted_at IS NULL AND r.status = 'confirmed'
                 AND p.deleted_at IS NULL`;

  if (mine) { where += ' AND r.assigned_to = ?'; params.push(req.user!.id); }
  /*
   * 進み具合の言葉は**財務の売上台帳（`GET /revenues`）と同じもの**を読みます
   * （`shared/services/billing-state.ts`。レビューでの指摘 #125）。
   *
   * ⚠️ **ここに式を直接書かないこと。** 前は `unpaid` を「入金日が空」だけにしており、
   * 台帳の `unpaid`（請求書を出したのに入金がまだ）と**同じ言葉で違う集合**でした。
   * 2つの画面で違う件数が出て、**どちらが正しいか画面からは分かりません**。
   */
  const common = billingStateSql(state);
  if (common) where += ` AND ${common}`;
  /*
   * **期日超過も「請求書を出したもの」に限る。**
   * 出していない売上の期日が過ぎているのは「お客様が遅れている」ではなく
   * **こちらが請求していない**という別の話で、押しても入金は来ません。
   * 出していないものは「未請求」（`unissued`）から拾えます。
   */
  else if (state === 'overdue') where += ` AND ${BILLING_STATE_SQL.unpaid} AND r.payment_due_date < to_char(NOW(), 'YYYY-MM-DD')`;
  else if (state === 'uninspected') where += ' AND r.inspection_date IS NULL';
  else if (state) where += ' AND FALSE';   // 知らない状態は空で返す

  const rows = await queryAll(
    `SELECT r.id, r.project_id, r.episode_id, r.subtitle, r.amount, r.tax_category,
            r.billing_date, r.payment_due_date, r.invoice_issued, r.invoice_no,
            r.inspection_date, r.paid_date,
            p.name AS project_name, p.gls_number,
            c.name AS customer_name,
            e.episode_code,
            -- **按分（グループ請求）だと分かるようにする。** 金額はグループ全体のもので、
            -- 出ている案件名は代表の1件でしかない（内訳は按分グループの画面）
            r.group_id, g.name AS group_name,
            u.name AS assigned_to_name
       FROM revenues r
       JOIN projects p ON p.id = r.project_id
       LEFT JOIN companies c ON c.id = p.customer_id
       LEFT JOIN episodes e ON e.id = r.episode_id
       LEFT JOIN project_groups g ON g.id = r.group_id
       LEFT JOIN users u ON u.id = r.assigned_to
       ${where}
      ORDER BY
        -- 入金がまだのものを先頭に。**期日が近い順** (超過が上に来る)
        CASE WHEN r.paid_date IS NULL THEN 0 ELSE 1 END,
        r.payment_due_date ASC NULLS LAST,
        r.billing_date DESC NULLS LAST
      LIMIT ${LIST_LIMIT}`,
    params,
  );
  // **件数と合計はサーバーが数える**（上の見積と同じ理由・レビューでの指摘 #53）。
  // 請求は1行 = 1請求なので、`amount` をそのまま足す（分け合う請求の
  // `amount` はグループ全体の額で、それがこの一覧に出す金額そのもの）
  const agg = await queryOne(
    `SELECT COUNT(*) AS n, COALESCE(SUM(r.amount), 0) AS amount
       FROM revenues r
       JOIN projects p ON p.id = r.project_id
       ${where}`,
    params,
  ) as { n: string; amount: string } | undefined;

  res.json({
    success: true,
    data: rows,
    total_count: Number(agg?.n ?? 0),
    total_amount: Number(agg?.amount ?? 0),
    truncated: Number(agg?.n ?? 0) > rows.length,
  });
});

/**
 * 検収日・入金日を入れる／消す。
 *
 * **フラグではなく日付**を持たせているので、「済みにする」は日付を入れること、
 * 「取り消す」は `null` を入れることです (`{ inspection_date: null }`)。
 * 渡さなかった項目は触りません — 片方を入れるつもりで
 * もう片方を消してしまう事故を防ぎます。
 */
router.patch('/invoices/:id', canEdit, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const sets: string[] = [];
  const params: unknown[] = [];

  for (const col of ['inspection_date', 'paid_date', 'billing_date'] as const) {
    if (!(col in body)) continue;                       // 渡していない = 触らない
    const v = body[col];
    if (v !== null && !(typeof v === 'string' && YMD.test(v))) {
      throw new AppError(400, 'VALIDATION_ERROR', `${col} は YYYY-MM-DD か null で指定してください`);
    }
    sets.push(`${col} = ?`);
    params.push(v);
  }
  // 請求書を出したか。**日付ではなく真偽値**なので別に扱う
  // (`billing_date` は「いつ出す予定か」で、出したかどうかとは別の列)
  if ('invoice_issued' in body) {
    sets.push('invoice_issued = ?');
    params.push(body.invoice_issued === true);
  }
  if (sets.length === 0) throw new AppError(400, 'VALIDATION_ERROR', '変更する項目がありません');

  const existing = await queryOne(
    'SELECT id, status, invoice_issued FROM revenues WHERE id = ? AND deleted_at IS NULL', [req.params.id],
  ) as { status: string; invoice_issued: boolean } | undefined;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '請求が見つかりません');
  /*
   * ⚠️ **請求書を出していない売上に入金日を入れさせない**（レビューでの指摘・P1）。
   *
   * 画面で押せなくするだけでは足りません — **直接叩けば通ります**。しかも
   * できあがるのは「**請求していないのに入金済み**」という、
   * どの一覧にも出てこない行です（`unpaid` は出したものだけ、`unissued` は入金前だけ）。
   *
   * **同じ回で発行するのは通します**（「出して入金も記録する」は普通の操作）。
   * **取り消し（`null`）は止めません** — 止めると、間違って入った入金日を
   * 消せなくなります（いちばん直したい行が直せない）。
   */
  if (isSettingPaidDate(body) && !isIssuedAfter(body, existing.invoice_issued)) {
    throw new AppError(400, 'VALIDATION_ERROR',
      '請求書を出してから入金を記録してください（未請求の売上には入金日を入れられません）');
  }
  // ⚠️ **確定した売上だけ**（レビューでの指摘 #53）。`status` を見ていなかったので、
  // **見積段階（`estimate`）の行にも請求書の発行・入金・検収を記録できました** —
  // 一覧はこの状態の行を出さないので、記録したことに誰も気づけません
  if (existing.status !== 'confirmed') {
    throw new AppError(400, 'VALIDATION_ERROR',
      '確定した売上だけ請求書の発行・入金・検収を記録できます（見積段階の行は対象外です）');
  }

  params.push(req.user!.id, req.params.id);
  await execute(
    `UPDATE revenues SET ${sets.join(', ')}, updated_at = NOW(), updated_by = ? WHERE id = ?`,
    params,
  );

  // **請求書を出した瞬間に番号を採る** (migration 163)。
  // すでに番号があれば飛ばすので、取り消して出し直しても番号は変わらない
  if ('invoice_issued' in body && body.invoice_issued === true) {
    await assignInvoiceNumbers([String(req.params.id)]);
  }

  res.json({ success: true, data: await queryOne('SELECT * FROM revenues WHERE id = ?', [req.params.id]) });
});


// ══════════════════════════════════════════════════════════
// ② 請求・入金（財務） — 月次の締めを一括でやる
//
// ⑤ 見積・請求が「案件をまたいで取りこぼさない」ための一覧なのに対して、
// こちらは**締め月を決めて、その月ぶんをまとめて処理する**ための画面です。
// 書き込む列は同じ (`invoice_issued` / `paid_date` / `inspection_date`) で、
// **同じ `PATCH /invoices/:id` と同じ検査**を通します。
// ══════════════════════════════════════════════════════════

/** `YYYY-MM`。締め月 */
const YM = /^\d{4}-\d{2}$/;

/**
 * 締め月の3つの束。**1本のリクエストで返す** —
 * 3本に分けるとタブを切り替えるたびに数字が後から差し替わります。
 *
 * ・issue   請求書を出す … まだ出していない
 * ・collect 入金の確認   … 出したが入金が無い
 * ・inspect 検収書を出す … 検収日が無い
 *
 * **申込書 (`projects.application_form`) が無い案件は `blocked` を立てます。**
 * 出せないわけではなく、**選べない**ようにするための印です
 * (モックの「申込書が揃っていない案件は選べません」)。
 */
router.get('/closing', async (req, res) => {
  const month = typeof req.query.month === 'string' && YM.test(req.query.month)
    ? req.query.month
    : new Date().toISOString().slice(0, 7);

  const rows = await queryAll(
    `SELECT r.id, r.project_id, r.amount, r.tax_category,
            r.recognition_date, r.billing_date, r.payment_due_date,
            r.invoice_issued, r.invoice_no, r.inspection_date, r.paid_date,
            p.name AS project_name, p.gls_number,
            -- 申込書が揃っていない案件は選ばせない (0 = 未提出)
            (COALESCE(p.application_form, 0) = 0) AS blocked,
            c.name AS customer_name,
            e.episode_code,
            -- 按分（グループ請求）も締められる。金額はグループ全体のもの
            r.group_id, g.name AS group_name
       FROM revenues r
       JOIN projects p ON p.id = r.project_id
       LEFT JOIN companies c ON c.id = p.customer_id
       LEFT JOIN episodes e ON e.id = r.episode_id
       LEFT JOIN project_groups g ON g.id = r.group_id
      WHERE r.deleted_at IS NULL AND r.status = 'confirmed'
        AND p.deleted_at IS NULL
        AND r.recognition_date LIKE ?
      ORDER BY p.gls_number ASC NULLS LAST, r.amount DESC`,
    [`${month}-%`],
  );

  type Row = Record<string, unknown> & {
    invoice_issued: boolean; paid_date: string | null; inspection_date: string | null;
  };
  const all = rows as Row[];
  const issue = all.filter((r) => !r.invoice_issued);
  const collect = all.filter((r) => r.invoice_issued && !r.paid_date);
  const inspect = all.filter((r) => !r.inspection_date);

  const today = new Date().toISOString().slice(0, 10);
  res.json({
    success: true,
    data: { month, issue, collect, inspect },
    counts: {
      issue: issue.length,
      collect: collect.length,
      inspect: inspect.length,
      // 出せない (申込書が無い) もの。**「出していない」とは別に数える**
      blocked: issue.filter((r) => r.blocked).length,
      // 期日を過ぎた入金待ち
      overdue: collect.filter((r) => {
        const due = r.payment_due_date as string | null;
        return !!due && due < today;
      }).length,
    },
  });
});

/**
 * まとめて記録する（月次の締め）。
 *
 * **1件ずつと同じ検査を通します** — 別に書くと片方だけ緩くなります。
 * 途中で失敗しても**どこまで進んだかを返します**（黙って一部だけ入るのが最悪）。
 */
router.post('/invoices/bulk', canEdit, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const ids = Array.isArray(body.ids) ? body.ids.filter((v): v is string => typeof v === 'string') : [];
  if (ids.length === 0) throw new AppError(400, 'VALIDATION_ERROR', '対象が選ばれていません');
  if (ids.length > 200) throw new AppError(400, 'VALIDATION_ERROR', '一度に処理できるのは 200 件までです');

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const col of ['inspection_date', 'paid_date', 'billing_date'] as const) {
    if (!(col in body)) continue;
    const v = body[col];
    if (v !== null && !(typeof v === 'string' && YMD.test(v))) {
      throw new AppError(400, 'VALIDATION_ERROR', `${col} は YYYY-MM-DD か null で指定してください`);
    }
    sets.push(`${col} = ?`);
    values.push(v);
  }
  if ('invoice_issued' in body) {
    sets.push('invoice_issued = ?');
    values.push(body.invoice_issued === true);
  }
  if (sets.length === 0) throw new AppError(400, 'VALIDATION_ERROR', '変更する項目がありません');

  // **申込書が揃っていないものは弾く。** 画面でも選べないようにしているが、
  // ここで見ないと直接叩けば通ってしまう
  const blocked = await queryAll(
    `SELECT r.id FROM revenues r JOIN projects p ON p.id = r.project_id
      WHERE r.id = ANY($1::text[]) AND COALESCE(p.application_form, 0) = 0`,
    [ids],
  ) as { id: string }[];
  const blockedIds = new Set(blocked.map((b) => b.id));
  const target = ids.filter((id) => !blockedIds.has(id));

  // 請求書を出すときだけ申込書を要求する。入金・検収の記録は止めない
  const issuing = 'invoice_issued' in body && body.invoice_issued === true;
  let finalIds = issuing ? target : ids;

  /*
   * ⚠️ **請求書を出していないものに入金日を入れない**（レビューでの指摘・P1）。
   * 1件ずつの口（`PATCH /invoices/:id`）と**同じ決めごと**を、ここでも見ます —
   * 片方だけ塞ぐと、締めからまとめて押したときだけ通ります。
   *
   * ここは**落とさずに飛ばす**（申込書と同じ扱い）。200 件の締めを 1 件のために
   * 全部止めると、経理は原因の行を探すところから始めることになります。
   */
  let skippedUnissued: string[] = [];
  if (isSettingPaidDate(body)) {
    if ('invoice_issued' in body) {
      /*
       * ⚠️ **更新した「あと」の姿で見る**（レビューでの指摘・P1。前の版の穴）。
       *
       * 前は**いまの `invoice_issued`** だけを引いていたので、
       * `{ invoice_issued: false, paid_date: … }` を**発行済みの行に**送ると、
       * その行は「いま未請求」ではないので飛ばされず、UPDATE が
       * **発行の取り消しと入金日を同時に書きました** — つまり
       * **止めようとしていた「未請求なのに入金済み」がそのままできます**。
       *
       * ここは全件に同じ値を書くので、**`false` を送っているなら全部が該当**します。
       * 飛ばすと 0 件になるだけなので、**理由を言って落とす**ほうが分かります。
       */
      if (!issuing) {
        throw new AppError(400, 'VALIDATION_ERROR',
          '請求書の取り消しと入金の記録は同時にできません（未請求の売上には入金日を入れられません）');
      }
      // `invoice_issued: true` を送っているなら、あとの姿は全件「発行済み」— 飛ばすものは無い
    } else {
      // 発行の状態を触らないときだけ、**いまの姿**で飛ばす（あとの姿＝いまの姿）
      const unissued = await queryAll(
        `SELECT id FROM revenues WHERE id = ANY($1::text[]) AND deleted_at IS NULL
           AND (invoice_issued IS NOT TRUE)`,
        [finalIds],
      ) as { id: string }[];
      skippedUnissued = unissued.map((u) => u.id);
      const skip = new Set(skippedUnissued);
      finalIds = finalIds.filter((id) => !skip.has(id));
    }
  }

  if (finalIds.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', skippedUnissued.length > 0
      ? '選んだものはすべて請求書を出していません（先に請求書を出してください）'
      : '選んだものはすべて申込書が揃っていません');
  }

  await execute(
    `UPDATE revenues SET ${sets.join(', ')}, updated_at = NOW(), updated_by = ?
      WHERE id = ANY($${values.length + 2}::text[]) AND deleted_at IS NULL`,
    [...values, req.user!.id, finalIds],
  );

  // 締めからまとめて発行したぶんにも番号を採る。**1件ずつと同じ経路**を通す
  // (2つ書くと、片方だけ直したときに月次締めからだけ番号が付かなくなる)
  const numbered = issuing ? await assignInvoiceNumbers(finalIds) : [];

  res.json({
    success: true,
    data: {
      updated: finalIds.length,
      // **飛ばしたものを返す。** 黙って一部だけ処理するのがいちばん困る
      skipped_blocked: issuing ? [...blockedIds] : [],
      // 請求書を出していないので入金を記録しなかったもの（レビューでの指摘・P1）
      skipped_unissued: skippedUnissued,
      // 採った請求書番号。画面はこれを出して「何番で出したか」を見せる
      invoice_numbers: numbered,
    },
  });
});

export default router;
