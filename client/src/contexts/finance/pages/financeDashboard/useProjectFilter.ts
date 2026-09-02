/**
 * 案件での絞り込み（① 財務ダッシュボード）
 *
 * ── なぜ URL に持つか ──────────────────────────────────────
 *
 * 内訳の売上行を押すと、案件管理へ出ずに**この画面のままその案件で絞り込みます**
 * （ご要望「案件管理に飛ぶのではなく、財務管理内でその案件に絞り込んだ画面へ」）。
 * 絞り込みをコンポーネントの `useState` で持つと、押したあと**ブラウザの「戻る」で
 * 全案件に戻れず、その状態のリンクも共有できません**。売上台帳（`RevenueListPage`）も
 * `project_id` を URL で受けているので、そちらとそろえて `?project_id=` を正にします。
 *
 * ルートは同じでクエリだけが変わるため React Router は画面を作り直さず、
 * **期間（月・四半期など）の state はそのまま生き残ります**。
 *
 * ── 案件を選ぶ経路が2つあるのはわざと ────────────────────────
 *
 * `selectProject`（絞り込み帯のプルダウン）は「案件を選んだら全期間へ」倒しますが、
 * `focusProject`（内訳の行）は**期間を動かしません**。理由は各関数のコメント。
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { PeriodMode } from './PeriodBar';

/**
 * 期間の種類の初期値。**案件つきの URL を直接開いたときだけ「全期間」**にする。
 *
 * 案件はその月に計上があるとは限らず、既定の今月のままだとほぼ必ず ¥0 の画面になる。
 * ⚠️ **画面の中で内訳の行を押して絞り込むときには効かない**（`useState` の初期化関数は
 * 最初の1回しか走らない）。そこで期間が飛ぶと押した行が消えてしまうため、これで正しい。
 */
export function initialPeriodMode(): PeriodMode {
  return new URLSearchParams(window.location.search).get('project_id') ? 'all' : 'month';
}

export function useProjectFilter(mode: PeriodMode, setMode: (m: PeriodMode) => void) {
  const [searchParams, setSearchParams] = useSearchParams();
  /** 絞り込み中の案件。**正は URL**（この文書の冒頭参照） */
  const projectId = searchParams.get('project_id') ?? '';

  /** URL の `project_id` だけを差し替える（期間ラベルなど他のクエリは残す） */
  const putProjectId = (id: string, opts?: { replace?: boolean }) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('project_id', id);
    else next.delete('project_id');
    setSearchParams(next, { replace: opts?.replace ?? false });
  };

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
    // プルダウンは回すたびに履歴を積まない（`replace`）。「戻る」で解除できればよいのは行クリックだけ
    putProjectId(id, { replace: true });
  };

  /*
   * 内訳の行から、その案件で**この画面のまま**絞り込む。
   *
   * ⚠️ **`selectProject` を使い回さないこと。** あちらは「案件を選んだら全期間へ」
   * 倒すが、内訳の行は**いま出ている期間に実在する行**なので、期間を飛ばすと
   * 押した行が画面から消える（何が起きたのか分からなくなる）。
   */
  const focusProject = (id: string) => {
    if (!id || id === projectId) return;
    putProjectId(id); // push ＝ ブラウザの「戻る」で全案件へ戻れる
    // 内訳は画面のいちばん下。**絞り込みが効いたことが見えないと壊れたと思われる**
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return { projectId, selectProject, focusProject };
}
