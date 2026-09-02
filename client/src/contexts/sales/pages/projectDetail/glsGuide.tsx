/**
 * GLS 番号がまだ無いときの案内文（v4.1.8）。
 *
 * 「GLS発番がどこでできるのか分からない」というご指摘を受けて足した。
 * 発番できる境界は**書き写さず `contexts/sales/glsIssue.ts` を読む** —
 * 書き写すと、境界を直したときにここだけ古いまま残り
 * 「採れないのに採れると案内する（またはその逆）」になる。
 * サーバー（`project.service.ts` の `issueGls`）も同じ境界で弾く
 */
import { ProjectStageLabels, type ProjectStage } from '@/types';
import { canIssueNewGlsAt, GLS_ISSUE_BLOCKED_HINT } from '../../glsIssue';

export function glsGuideText(stage: ProjectStage): string {
  if (!canIssueNewGlsAt(stage)) {
    return `${ProjectStageLabels.a_won}になると自動で発番されます。`
      + `急ぐときは${GLS_ISSUE_BLOCKED_HINT}`;
  }
  if (stage === 'c_proposal' || stage === 'b_verbal') {
    return `${ProjectStageLabels.a_won}になると自動で発番されます。`
      + '「案件を直す」画面から先に発番することもできます。';
  }
  // a_won / s_completed なのに番号が無い＝案件分類が未設定で自動発番に失敗した例外ケース
  // （`changeStage` の gls_error。まとめて直す統合チェックにも同じ案内がある）
  return '受注済みですが自動発番に失敗しています。「案件を直す」画面で案件分類を選んでから発番してください。';
}

/**
 * 案件詳細（概要タブ）の「GLS 番号」欄。**未発番のときだけ**案内文を添える。
 * `OverviewTab.tsx` は400行の上限に近く、ここに1行呼ぶだけで済むように
 * 表示ごと切り出した（中身は書き写していない — `glsGuideText` を呼ぶだけ）
 */
export function GlsNumberField({ glsNumber, stage }: { glsNumber: string | null; stage: ProjectStage }) {
  if (glsNumber) return <>{glsNumber}</>;
  return (
    <span className="space-y-0.5">
      <span className="block text-muted-foreground">まだ発番していません（ヨミ段階）</span>
      {/* **発番できる条件をここに書く**（ご要望）。「どこで採れるのか分からない」
          という声を受けて足した */}
      <span className="text-note block text-muted-foreground">{glsGuideText(stage)}</span>
    </span>
  );
}
