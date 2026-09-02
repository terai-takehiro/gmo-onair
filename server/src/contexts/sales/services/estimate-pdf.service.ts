/**
 * 見積書 PDF (v4 ⑥ 見積タブ)
 *
 * ── なぜ新しく要るのか ──────────────────────────────────────
 *
 * PDF を作る道具（`shared/services/pdf.service.ts`）は前からありますが、
 * **読んでいるのは `revenues` だけ**でした。v4 の見積は migration 138 で
 * `estimates` / `estimate_items` という別の表になった（`revenues` を読む
 * 41 か所が `status` を見ておらず、見積を相乗りさせると売上に足されるため）
 * ので、**見積タブから PDF を出す道がどこにも無い**状態でした。
 *
 * ここは `estimates` を `pdf.service` が読める形に**詰め替えるだけ**です。
 * **PDF の描き方は写しません** — 写すと、様式を直した日から見積書だけ
 * 古い形のまま出ます。
 *
 * ── 値引きは明細の1行にする ─────────────────────────────────
 *
 * `estimates.discount` は見積そのものが持つ1つの数（モックの「値引きは単価を
 * 下げず別建て」）。`pdf.service` は**金額がマイナスの明細**を割引として数え、
 * 「定価 / 割引額 / お見積金額」の3列を出します。そこで**マイナス1行として
 * 渡します** — 合計だけ引いて渡すと、紙の上で値引きが消えて
 * 「なぜこの金額なのか」が相手に伝わりません。
 */
import { queryAll, queryOne } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { generateEstimatePdf } from '../../../shared/services/pdf.service';

export interface EstimatePdf {
  buffer: Buffer;
  /** ダウンロード時のファイル名 */
  filename: string;
  /** BOX の格納先を引くための案件 id */
  projectId: string;
  /**
   * **承認待ちかどうか**（`none` / `pending` / `approved`）。
   * 呼ぶ側（口）が「社外フォルダに置くか」を決めるのに使います。
   */
  approvalState: string;
}

/**
 * 明細の分類（帯の文字）。
 *
 * `estimate_items.category` に入るのは**画面が持つ3つの鍵**
 * （`client/src/contexts/sales/pages/projectDetail/EstimateItems.tsx` の `CATEGORIES`）で、
 * **そのまま紙に出すと帯が「studio」「tech」と英語で並びます**（実際にそう出ていた）。
 *
 * 知らない値は**そのまま出します** — 売上の明細（請求書・検収書）は分類が自由入力で、
 * 「音響」のように日本語がそのまま入っており、ここで落とすと帯が消えます。
 * 値引きの行（`値引き`）も同じ道を通ります。
 *
 * ⚠️ 画面と食い違うと**同じ見積が画面と紙で違う分け方に見える**ので、
 * `shared/tests/estimateCategory.test.ts` が画面側の表と突き合わせます。
 */
export const ESTIMATE_CATEGORY_LABEL: Record<string, string> = {
  studio: 'スタジオ',
  tech: '技術・人員',
  other: '制作・その他',
};

/**
 * `/revenues/:id/pdf`（請求書・検収書）もこの表を要る — **見積を売上に変換すると
 * `estimate_items.category` の鍵（`studio`/`tech`/`other`）がそのまま
 * `revenue_items.category` へ写る**（`estimate.service.ts` の `convertToRevenue`）。
 * ここだけ翻訳して revenues 側を素通しにすると、変換元が見積の明細だけ
 * 「studio」のまま検収書・請求書に出る（実際にそう出ていた・ユーザー指摘）。
 * 直接入力された自由文の分類（例:「音響」）は表に無いのでそのまま通す。
 */
export function categoryLabel(category: string | null): string | null {
  if (!category) return null;
  return ESTIMATE_CATEGORY_LABEL[category] ?? category;
}

/** BOX / OS のファイル名で使えない文字を落とす（案件名がそのまま入るため） */
function safeName(name: string): string {
  return name.replace(/[/\\:?*|"<>]/g, '').trim();
}

/**
 * 見積 1 件を PDF にする。
 *
 * ファイル名は `見積書_GLS001_v2_案件名.pdf`。**版を必ず入れる** —
 * 入れないと v1 と v2 が同じ名前になり、BOX では同じファイルの版として
 * 積み上がって「v1 として出したもの」が一覧から消えます。
 */
export async function buildEstimatePdf(estimateId: string): Promise<EstimatePdf> {
  const est = await queryOne(
    // **`sent_at` だけは TIMESTAMP**（ほかの日付は全部 TEXT）なので、
    // pg は文字列ではなく Date を返します。`String(...).slice(0, 10)` にすると
    // 紙の右上が **「Thu Jun 18」**になる（`toDateString()` の頭を切った形。実際にそう出ていた）。
    //
    // 日付は SQL で作ります。**時間帯を2回変える**のが要点で:
    //  ・`sent_at` は時間帯を持たない列に `NOW()` を入れたもの＝**DB の設定の壁時計**
    //    （コンテナは UTC なので UTC の時刻が入っている）
    //  ・`AT TIME ZONE current_setting('TimeZone')` で**書いたときと同じ時間帯として読み**、
    //    `AT TIME ZONE 'Asia/Tokyo'` で日本の壁時計にする
    // 片方だけ書くと、夕方に出した見積の発行日が1日ずれます（JST の朝 = 前日の UTC）。
    // 'UTC' とベタ書きしないのは、DB の時間帯が JST の環境で逆に9時間ずれるため
    `SELECT e.id, e.project_id, e.episode_id, e.version, e.title, e.status, e.tax_category, e.approval_state,
            e.subtotal, e.discount, e.valid_until, e.notes, e.created_at,
            to_char(e.sent_at AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'Asia/Tokyo',
                    'YYYY-MM-DD') AS sent_on,
            p.name AS project_name, p.gls_number,
            p.event_start AS project_start, p.event_end AS project_end,
            c.name AS customer_name, c.address AS customer_address,
            c.contact_name AS customer_contact,
            ep.episode_number AS episode_number
       FROM estimates e
       JOIN projects p ON p.id = e.project_id
       LEFT JOIN companies c ON c.id = COALESCE(e.customer_id, p.customer_id)
       LEFT JOIN episodes ep ON ep.id = e.episode_id
      WHERE e.id = ? AND e.deleted_at IS NULL AND p.deleted_at IS NULL`,
    [estimateId],
  ) as Record<string, unknown> | undefined;
  if (!est) throw new AppError(404, 'NOT_FOUND', '見積が見つかりません');

  const items = (await queryAll(
    // **`item_date`/`item_date_end` は DATE 列なので、素通しで選ぶと pg が
    // 文字列ではなく Date を返す**（上の `sent_at` と同じ落とし穴）。
    // `dateSlash()` は文字列前提で `.split('-')` するため、行に日付が
    // 入っている見積を発行すると "d.split is not a function" で 500 になっていた
    // （実 Postgres に当てて実際に踏んだ）。`to_char` で文字列に変換して渡す
    `SELECT description, quantity, unit, unit_price, list_unit_price, amount, category, item_notes,
            to_char(item_date, 'YYYY-MM-DD') AS item_date,
            to_char(item_date_end, 'YYYY-MM-DD') AS item_date_end
       FROM estimate_items WHERE estimate_id = ? ORDER BY sort_order, created_at`,
    [estimateId],
  )) as Record<string, unknown>[];

  const discount = Math.max(0, Number(est.discount) || 0);
  /*
   * ⚠️ **グループ内価格の値引きも紙に出す**（migration 261・ユーザー要望「グループ内
   * 見積でも定価→値引き→実額を表記したい」）。`list_unit_price`（定価）が
   * `unit_price`（実額）より高い行は、**定価×数量で印字**し、差額はこの行では
   * 引かず、まとめて1本の値引き行（「グループ価格による値引き」）に合算する —
   * 行ごとに割引を書くと、値引きの行だけが並ぶ既存の「お値引き」（手動値引き
   * `estimates.discount`）と紛れて「どちらの値引きか」が読めなくなるため。
   *
   * **ここは表示・印字だけ。** `amount`（実額）自体は変えず、印字用の値だけを
   * 別に組み立てる（サーバーの金額計算・売上変換には一切混ぜない — migration 261 コメント参照）。
   */
  let groupDiscountTotal = 0;
  const rows = items.map((it) => {
    // **行ごとの日付（migration 194 開始日・235 終了日）を紙にも出す。**
    // 終了日が無い行（単日 or 入れていない）は開始日をそのまま終了日にも使う —
    // `period_start`/`period_end` が別々に null だと PDF レンダラーが
    // 「期間なし」として案件全体の日付にフォールバックしてしまう（1日だけの
    // 利用なのに「期間なし」に化けるのを避けるため、開始日で埋める）。
    // 開始日そのものが無ければ両方 null のまま（従来どおりのフォールバック）
    const itemDate = (it.item_date as string | null) ?? null;
    const itemDateEnd = (it.item_date_end as string | null) ?? null;
    const qty = Number(it.quantity) || 0;
    const unitPrice = Number(it.unit_price) || 0;
    const listUnitPrice = it.list_unit_price != null ? Number(it.list_unit_price) : null;
    // 定価が実額より高い行だけ「定価×数量」で印字し、差額を積む
    const showListPrice = listUnitPrice != null && listUnitPrice > unitPrice;
    if (showListPrice) groupDiscountTotal += (listUnitPrice - unitPrice) * qty;
    return {
      description:  String(it.description ?? ''),
      quantity:     qty,
      unit:         (it.unit as string | null) ?? null,
      unit_price:   showListPrice ? (listUnitPrice as number) : unitPrice,
      amount:       showListPrice ? (listUnitPrice as number) * qty : (Number(it.amount) || 0),
      period_start: itemDate,
      period_end:   itemDateEnd ?? itemDate,
      item_notes:   (it.item_notes as string | null) ?? null,
      category:     categoryLabel(it.category as string | null),
    };
  });
  if (groupDiscountTotal > 0) {
    // **既存の「お値引き」（手動値引き）とはラベルを分けて共存させる**
    // （ユーザー要望どおり — どちらの値引きか読めるようにする）
    rows.push({
      description: 'グループ価格による値引き', quantity: 1, unit: null,
      unit_price: -groupDiscountTotal, amount: -groupDiscountTotal,
      period_start: null, period_end: null, item_notes: null, category: '値引き',
    });
  }
  if (discount > 0) {
    // **明細と同じ分類には入れない。** 入れるとその分類の小計から値引きが引かれ、
    // 「スタジオの小計」が定価と合わなくなる（値引きは見積全体に掛かるもの）。
    // かといって分類なしにすると、分類を使っている見積では
    // **「（未分類）」という帯**の下に値引きが並んで何の行か読めないので、
    // 値引き専用の分類にして帯にもそう出す
    rows.push({
      description: 'お値引き', quantity: 1, unit: null, unit_price: -discount, amount: -discount,
      period_start: null, period_end: null, item_notes: null, category: '値引き',
    });
  }

  const glsNumber = (est.gls_number as string | null) || null;
  const projectName = String(est.project_name ?? '');
  const version = Number(est.version) || 1;
  /*
   * ⚠️ **回（episode）に紐づく見積は「第N回」をファイル名・件名に含める**（仕様変更 #18）。
   *
   * レギュラー案件は回ごとに別の見積（別の `group_id`）を持てるが、どの回の見積も
   * 同じ GLS 番号・同じ案件名で始まる。回ごとに `episode_id` が違うだけなら
   * バージョン番号は独立に v1 から始まるため、**別の回の見積が同じファイル名
   * （`見積書_GLS001_v1_案件名.pdf`）になりうる**。BOX は同じ名前を「新しい版」として
   * 積むので、そのまま出すと**別の回の見積が同じ1本のファイルの版として混ざる**
   * （実害: 後から出した回の PDF が前の回の PDF を版として覆い、BOX 上で前の回の
   * 見積書が見えなくなる）。ファイル名に回番号を挟んで別ファイルにする。
   */
  const episodeNumber = est.episode_number != null ? Number(est.episode_number) : null;
  const episodeLabel = episodeNumber != null ? `第${episodeNumber}回` : null;

  const buffer = await generateEstimatePdf({
    // 紙に出す「見積コード」。GLS が無い（ヨミ段階の）案件では版だけを出す
    billing_key: glsNumber ? `${glsNumber}-v${version}` : `v${version}`,
    // 回に紐づく見積は件名の頭に「第N回」を出す。件名（タイトル）が無い見積でも
    // どの回のものか分かるようにする
    subtitle: [episodeLabel, (est.title as string | null) || null].filter(Boolean).join(' ') || null,
    customer_name: (est.customer_name as string | null) || '',
    customer_address: (est.customer_address as string | null) || null,
    customer_contact: (est.customer_contact as string | null) || null,
    project_name: projectName,
    gls_number: glsNumber,
    tax_category: String(est.tax_category ?? 'tax10'),
    amount: (Number(est.subtotal) || 0) - discount,
    // 発行日は「出した日」。まだ出していない下書きは今日の日付で出す
    recognition_date: null,
    billing_date: (est.sent_on as string | null) || null,
    payment_due_date: null,
    notes: (est.notes as string | null) || null,
    status: 'estimate',
    project_start: (est.project_start as string | null) || null,
    project_end: (est.project_end as string | null) || null,
    valid_until: (est.valid_until as string | null) || null,
    items: rows,
  });

  // **回番号をファイル名に挟む**（上のコメント参照）。無ければ今までどおりの並び
  const label = safeName([glsNumber, episodeLabel, `v${version}`, projectName].filter(Boolean).join('_'));
  return {
    buffer,
    filename: `見積書_${label || est.id}.pdf`,
    projectId: String(est.project_id),
    /**
     * **承認待ちかどうか。** 呼ぶ側（口）が「社外フォルダに置くか」を決めます —
     * 値引きが上限を超えた見積は送れない決めごとなのに、置き先は社外と
     * 共有するフォルダなので、置いた時点で送ったのと同じになります
     */
    approvalState: (est.approval_state as string | null) ?? 'none',
  };
}
