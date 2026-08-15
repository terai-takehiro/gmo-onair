/**
 * 案件の整合性チェック — 「v4 より前のデータが揃っているか」を数える
 *
 * ── 何のためにあるか ────────────────────────────────────────
 *
 * v4 で列を足し、決めごとを増やしました（2段分類・リード経路・GLS の発番の段）。
 * **既にあった案件はその決めごとを知らないまま残っています。** しかも
 * **画面を見ても分かりません** — 空欄は空欄として普通に並ぶだけです。
 *
 * → **何が・全体で何件おかしいか**をここで数え、案件台帳から拾って直せるようにします。
 *
 * ── 決めごと ────────────────────────────────────────────────
 *
 *  ・**数えるのも絞るのも同じ式**（`sql`）を使います。別々に書くと
 *    「12 件」と出したのに開くと 9 行、という食い違いが起き、
 *    **どちらが本当か画面からは分かりません**
 *  ・**規則はこの製品が既に決めていることだけ**を書きます。
 *    「たぶんこうあるべき」を足すと、直す必要の無いものを直させることになります。
 *    どの決めごとから来たかを `why` に必ず書きます
 *  ・**直し方を書きます**（`how`）。「おかしい」とだけ言われても手が止まります
 *  ・⚠️ **ここでは何も直しません。** 数えて見せるだけです —
 *    機械で埋められるものと、人が決めるものが混ざっているためです
 *    （`project_type='other'` からはどちらの分類か決められません）
 */
import { projectTypeSqlCase } from './project-classification';

export interface IntegrityCheck {
  key: string;
  /** 画面に出す短い名前 */
  label: string;
  /** なぜ困るのか（この製品のどの決めごとから来ているか） */
  why: string;
  /** どう直すか */
  how: string;
  /** `projects p` に対する条件。**数えるのも絞るのもこれ1つ** */
  sql: string;
}

/** 受注が固まった段（GLS を採り、実施日が決まっているはずの段） */
const WON_STAGES = `p.stage IN ('a_won', 's_completed')`;

export const INTEGRITY_CHECKS: IntegrityCheck[] = [
  {
    key: 'no_classification',
    label: '案件分類が入っていない',
    why: '標準工程テンプレートは「客入れの有無 × 案件分類」で型を選ぶので、'
       + '空だと型が1つも当たりません。v4 の移行で埋め戻せたのは旧「案件種類」が'
       + '入っていた4種だけで、種類が「その他」だった案件は空のまま残っています。',
    how: '選んで「まとめて直す → 案件分類」。どちらの分類かは人が決めてください — '
       + '旧「案件種類」が「その他」の案件は、機械では配信か収録かを決められません。',
    sql: `p.gls_category = 'A' AND (p.audience IS NULL OR p.project_category IS NULL)`,
  },
  {
    key: 'type_mismatch',
    label: '分類と旧「案件種類」がずれている',
    why: '旧「案件種類」は2段分類から導くのがこの製品の決めごとです。'
       + 'ずれていると、種類で見る画面と2段で見る画面とで、'
       + '同じ案件に違う分類が出ます。',
    how: '選んで「まとめて直す → 案件分類」で2段を入れ直すと、旧種類はサーバーが導き直します。',
    sql: `p.audience IS NOT NULL AND p.project_category IS NOT NULL
          AND p.project_type IS DISTINCT FROM ${projectTypeSqlCase('p.audience', 'p.project_category')}`,
  },
  {
    key: 'gls_b_with_classification',
    label: 'GLS-B なのに2段分類が入っている',
    why: '工事・構築のプロジェクト（GLS-B）は「客入れの有無」も「配信か収録か」も'
       + '意味を持たないので 「NULL のまま」にする決めごとです。入っていると'
       + '集計で「無観客のイベント」として数えられます。',
    how: 'プロジェクト管理へ移すべき案件かを確かめてください。'
       + '案件（GLS-A）であるべきなら GLS 分類のほうを直します。',
    sql: `p.gls_category = 'B' AND (p.audience IS NOT NULL OR p.project_category IS NOT NULL)`,
  },
  {
    key: 'attendee_no_audience',
    label: '無観客なのに来場人数が入っている',
    why: '無観客の案件には来場人数を持たせない決めごとです。'
       + '入っていると規模別の集計が狂います。いまの画面は無観客のとき欄ごと'
       + '出しませんが、AI（MCP）や旧フォームから入った行が残っています。',
    how: '客入れの有無が本当に「無観客」かを確かめ、有観客なら'
       + '「まとめて直す → 案件分類」で直してください（無観客のままにすると来場人数は落ちます）。',
    sql: `p.audience = 'no_audience' AND COALESCE(p.attendee_count, 0) > 0`,
  },
  {
    key: 'won_no_gls',
    label: '受注しているのに GLS 番号が無い',
    why: 'GLS 番号が空であること自体が「まだヨミ段階」という意味を持ちます。'
       + '受注が固まったら案件詳細から採る決めごとなので、受注・完了なのに空だと、'
       + 'どの一覧でもヨミ段階として扱われます。',
    how: '案件詳細を開いて「GLS を発番」。まとめては直せません — '
       + '番号は1件ずつ採るものだからです。',
    sql: `${WON_STAGES} AND (p.gls_number IS NULL OR p.gls_number = '')`,
  },
  {
    key: 'won_no_event_date',
    label: '受注しているのに実施日が無い',
    why: '標準工程の期限は実施日からの逆算で出すので、空だと逆算の工程が'
       + '全部 期限なしで入ります。案件一覧の「実施日が近い順」からも外れます。',
    how: '選んで「まとめて直す → 実施日」。'
       + '⚠️ ここで入るのは案件の期間だけで、スタジオの予約は動きません。',
    sql: `${WON_STAGES} AND (p.event_start IS NULL OR p.event_start = '')`,
  },
  {
    key: 'no_intake_channel',
    label: 'リード経路が入っていない',
    why: '案件を作るときだけ入る項目で、あとから直す道が長いあいだ無く'
       + '（v4 で直した）、それ以前の案件は空のままです。空だと'
       + 'どの入口から来た案件が受注に至ったかを数えられません。',
    how: 'まとめては直せません（一括で直せる項目に入れていません）。'
       + '案件を直す画面から1件ずつ入れてください。',
    sql: `p.gls_category = 'A' AND (p.intake_channel IS NULL OR p.intake_channel = '')`,
  },
  {
    key: 'inactive_owner',
    label: '社内の担当が今いない人になっている',
    why: '担当が退職・無効になっていると、その案件は誰の「自分のタスク」にも出ず、'
       + '通知も届きません。担当は空にできない項目なので、必ず誰かに付け替えます。',
    how: '選んで「まとめて直す → 社内の担当」。',
    sql: `NOT EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = p.assigned_to AND u.deleted_at IS NULL AND u.status = 'active'
          )`,
  },
];

export function findCheck(key: unknown): IntegrityCheck | null {
  return INTEGRITY_CHECKS.find((c) => c.key === key) ?? null;
}

/**
 * 全部のチェックを1回の SQL で数える。
 *
 * **1件ずつ問い合わせない** — チェックが増えるほど画面を開くのが遅くなり、
 * しかも数え終わった順に数字が入れ替わって読み間違えます。
 */
export function buildIntegrityCountSql(): string {
  const cols = INTEGRITY_CHECKS
    .map((c) => `COUNT(*) FILTER (WHERE ${c.sql})::int AS "${c.key}"`)
    .join(',\n         ');
  return `SELECT ${cols},
                 COUNT(*)::int AS "_total"
          FROM projects p
          WHERE p.deleted_at IS NULL`;
}
