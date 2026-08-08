// 投入口 — **すべての依頼はここから入る**（v4 で 1 本化した）。
//
// 要件: docs/requirements/2026-07-25-collaboration-and-personal-agent.md (D4 / D9)
//       ＋ v4 のトップページ（モック `v4-live`）「投入口を1本化する」
//
// GMO イズムに従う点:
//   - 目標達成10カ条 2-3「会話だけでなく、形に残さないとメンバーは動かない」
//     → 朝会・ミーティング・隣の席で出た依頼を、その場で形に残す入口。
//   - 同 1-1「期限は何日何時何分まで。『今週中』などの曖昧な表現を使うな」
//     → 期限が曖昧なものは登録前に必ず聞く。AI が時刻を補完したら印を見せる。
//   - 同 1-1「期限はできるだけ短く設定する」
//     → クイック選択は短い順。遠い期限には注意を添える。
//
// 設計の要点:
//   - **入力欄は 1 つ。** 「ひとこと / 議事録」の切替は廃止した。
//     切替は押す人に AI の都合を選ばせていただけで、行き先はどちらもタスクだった。
//   - **行き先は AI が 1 件ずつ決める**（タスク / ネタ案件 / 活動記録 / 議事録）。
//     確認画面の 1 行目に札で出し、人が付け替えられる。
//   - **案件（ネタ）を作ったら、その案件を開く**（`canOpenProject` を渡された人だけ）。
//     「引き合いを貼る」ための別の入口は置かない — 同じ文をどちらの口に入れるかを
//     押す人に選ばせることになり、1 本化の意味が消える。
//   - 投げた直後に**同じ画面のモーダル**で確認させる (別ページに飛ばすと離脱する)
//   - 既定はチェック済み (opt-out)。ただし足りないものがある行は既定 OFF
//   - 確定するまで**何も登録しない** (AI の誤読がそのまま相手に飛ぶのを防ぐ)
//
// 中身は `intake/` に分けてある（この画面とスマホのシートで**同じものを使う**ため）:
//   `useIntake`（状態と通信） / `IntakeComposer`（入力・添付・録音） / `IntakeReview`（確認）

import { IntakeComposer } from './intake/IntakeComposer';
import { IntakeReview } from './intake/IntakeReview';
import { useIntake } from './intake/useIntake';

export function TaskIntakeBox({ canOpenProject = false }: { canOpenProject?: boolean }) {
  const it = useIntake({ canOpenProject });

  return (
    <>
      <IntakeComposer
        text={it.text}
        onTextChange={(v) => { it.setText(v); it.setDoneMsg(null); }}
        files={it.files}
        onAddFiles={it.addFiles}
        onRemoveFile={it.removeFile}
        onSubmit={() => it.submit.mutate()}
        onAudio={it.submitWithAudio}
        canSubmit={it.canSubmit}
        pending={it.submit.isPending}
        error={it.intake ? null : it.error}
        doneMsg={it.doneMsg}
        createdProjects={it.createdProjects}
      />

      {it.intake && (
        <IntakeReview
          intake={it.intake}
          rows={it.rows}
          onChange={it.updateRow}
          onCommit={() => it.commit.mutate()}
          onDiscard={() => it.discard.mutate()}
          onClose={it.dismiss}
          committing={it.commit.isPending}
          discarding={it.discard.isPending}
          error={it.error}
        />
      )}
    </>
  );
}
