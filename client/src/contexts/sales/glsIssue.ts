/**
 * 「新しい番組」として GLS 番号を採れるステージの決めごと（client 側の唯一のもと）
 *
 * ── なぜ1か所に置くか ──────────────────────────────────────
 *
 * 同じ境界を「案件を直す画面の発番ボタン（`useProjectForm`）」「発番ダイアログ
 * （`GlsDialog`）」「案件詳細の案内文（`projectDetail/glsGuide`）」の3か所が
 * 別々に書き写していました。境界を1段動かしたときに片方だけ古いまま残ると、
 * 「押せるのにサーバーが 400 で弾く」「採れないのに採れると案内する」という
 * **画面とサーバーが食い違う壊れ方**になります（実際にそうなっていました）。
 *
 * **境界を変えるときは、ここと
 * `server/src/contexts/sales/services/project.service.ts` の
 * `GLS_BLOCKED_STAGES` の2か所だけ**を直すこと。値が2つに分かれているのは、
 * server が rootDir の都合で `shared/` を import できないためです。
 *
 * ── いまの境界: D 仮押さえから採れる（2026-09-08 変更）─────────────
 *
 * D 仮押さえの段階でも新しい番組として GLS 番号が必要な実務があるため、
 * `d_hold` から採れるようにしました（2026-09-02 に一度 `c_proposal` からに
 * 前倒ししたが、D で発番できず編集不能に見えるという指摘を受けさらに前倒し）。
 * 止めるのは `neta`（ネタ・未見積、引き合いにすら至っていない）だけです。
 *
 * ⚠️ **発番してもステージは上げません。** 以前は手前のステージから発番すると
 * 勝手に「B 口頭決定」へ昇格していましたが、受注していない案件が口頭決定として
 * 数えられ、ファネルが嘘になります（サーバー側も同時に外しました）。
 */
import { ProjectStageLabels, type ProjectStage } from '@/types';

/** ここに入るステージからは新しい GLS 番号を採れない */
export const GLS_BLOCKED_STAGES: readonly ProjectStage[] = ['neta'];

/** この案件のステージで「新しい番組」として発番できるか */
export function canIssueNewGlsAt(stage: ProjectStage): boolean {
  return !GLS_BLOCKED_STAGES.includes(stage);
}

/**
 * 採れないときに画面へ出す一言。**「押せません」で終わらせず、
 * 何をすれば採れるか**まで言う（黙って disabled にしていたのが元の不具合）。
 */
export const GLS_ISSUE_BLOCKED_HINT =
  `${ProjectStageLabels.d_hold}まで進めると、新しい番号を採れます。`;
