/**
 * GLS 番号がまだ無いときの案内文（v4.1.8）。
 *
 * 「GLS発番がどこでできるのか分からない」というご指摘を受けて足した。
 * サーバー側の実際の発番条件（`project.service.ts` の `issueGls` のステージ
 * ガード）と**同じ境界**（口頭決定＝B）で説明する — 数字を書き写すと、
 * 条件を直したときにここだけ古いまま残るので、境界の考え方だけ揃えている
 */
import { ProjectStageLabels, type ProjectStage } from '@/types';

const BEFORE_VERBAL: ProjectStage[] = ['neta', 'd_hold', 'c_proposal'];

export function glsGuideText(stage: ProjectStage): string {
  if (BEFORE_VERBAL.includes(stage)) {
    return `${ProjectStageLabels.a_won}になると自動で発番されます。急ぐときは`
      + `${ProjectStageLabels.b_verbal}まで進めると、編集画面から先に発番できます。`;
  }
  if (stage === 'b_verbal') {
    return `${ProjectStageLabels.a_won}になると自動で発番されます。`
      + '編集画面から先に発番することもできます。';
  }
  // a_won / s_completed なのに番号が無い＝案件分類が未設定で自動発番に失敗した例外ケース
  // （`changeStage` の gls_error。まとめて直す統合チェックにも同じ案内がある）
  return '受注済みですが自動発番に失敗しています。編集画面で案件分類を選んでから発番してください。';
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
