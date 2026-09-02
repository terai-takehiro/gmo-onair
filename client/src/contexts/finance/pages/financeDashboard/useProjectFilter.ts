/**
 * 案件での絞り込み（① 財務ダッシュボード）
 *
 * ── なぜ URL に持つか ──────────────────────────────────────
 *
 * 絞り込み帯のプルダウンで案件を選ぶと、この画面の集計（損益フローと3列の内訳）が
 * その案件だけになります。絞り込みをコンポーネントの `useState` で持つと、
 * **ブラウザの「戻る」で全案件に戻れず、その状態のリンクも共有できません**。
 * 売上台帳（`RevenueListPage`）も `project_id` を URL で受けているので、
 * そちらとそろえて `?project_id=` を正にします。
 *
 * ルートは同じでクエリだけが変わるため React Router は画面を作り直さず、
 * **期間（月・四半期など）の state はそのまま生き残ります**。
 *
 * ⚠️ **内訳の行クリックはここを使いません。** 3列とも「押す＝その台帳の明細一覧へ
 * 飛ぶ」に揃えたため（ご指摘「明細一覧に飛ばしてください」）、行から画面内の
 * 絞り込みを掛ける経路（旧 `focusProject`）は無くしました。この画面で案件を絞る
 * 道はプルダウン1本です。
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { PeriodMode } from './PeriodBar';

/**
 * 期間の種類の初期値。**案件つきの URL を直接開いたときだけ「全期間」**にする。
 *
 * 案件はその月に計上があるとは限らず、既定の今月のままだとほぼ必ず ¥0 の画面になる。
 * 台帳から案件つきのリンクで戻ってきたときにも効く（`useState` の初期化関数なので
 * 最初の1回だけ）。
 */
export function initialPeriodMode(): PeriodMode {
  return new URLSearchParams(window.location.search).get('project_id') ? 'all' : 'month';
}

export function useProjectFilter(mode: PeriodMode, setMode: (m: PeriodMode) => void) {
  const [searchParams, setSearchParams] = useSearchParams();
  /** 絞り込み中の案件。**正は URL**（この文書の冒頭参照） */
  const projectId = searchParams.get('project_id') ?? '';

  /*
   * **案件を選んだら期間は「全期間」にする**（ご要望）。案件は「その月に計上がある」
   * とは限らず、既定の今月のままだとほぼ必ず ¥0 の画面になる。そこから期間を外そうと
   * して月の欄を空にする、というのが以前のエラー報告の導線だった。
   * ⚠️ **切り替えるのは「絞っていない → 案件を選んだ」ときだけ**（毎回戻すと選び直す
   * たびに期間が飛ぶ）。解除したら元の期間へ戻す。
   */
  const [modeBeforeProject, setModeBeforeProject] = useState<PeriodMode | null>(null);
  const selectProject = (id: string) => {
    if (id && !projectId) { setModeBeforeProject(mode); setMode('all'); }
    if (!id && projectId) { if (modeBeforeProject) setMode(modeBeforeProject); setModeBeforeProject(null); }
    // 期間ラベルなど他のクエリは残したまま `project_id` だけ差し替える。
    // プルダウンは回すたびに履歴を積まない（`replace`）
    const next = new URLSearchParams(searchParams);
    if (id) next.set('project_id', id);
    else next.delete('project_id');
    setSearchParams(next, { replace: true });
  };

  return { projectId, selectProject };
}
