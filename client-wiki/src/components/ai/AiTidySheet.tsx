/**
 * 「AI で整える」（設計 §6-③・§6-⑨・§7-1 ③）
 *
 * **主な使い方は「手入力のメモを手順書の形（見出し・箇条書き・注意書き）の
 * Markdown に整える」**（2026-09-22 のご指示）。文字を選んでいればそこだけ、
 * 選んでいなければ本文全体を整えます。
 *
 * ── 決めたことを必ずサーバーへ返す（§7-3 条件2）────────────────
 *
 * 「置き換える」＝ `replaced`（人が手を入れていたら、その文を添える）／
 * 「キャンセル」と**やり方を変えて出し直したとき**＝ `cancelled` を送ります。
 * 送らないと「AI が出したものを人がどう直したか」が1件も貯まらず、
 * 改善に戻す材料が無くなります（会社方針「AIを使い捨てにしない」）。
 * **結果を受け取ったのに何も返さないまま閉じる道を作らないこと。**
 *
 * ── 「編集して置き換える」を別のボタンにしていない理由 ─────────────
 *
 * 設計 §6-③ は「置き換える」「編集して置き換える」「キャンセル」の3つを挙げて
 * いますが、**結果の欄をそのまま打てる欄にしてあります**（`AiTidyPanes`）。
 * 直したいときはその場で直して「置き換える」を押すだけで済み、押す前に
 * 「直す／直さない」を選ばせる必要がありません。サーバーに渡るものは同じ
 * （置き換えた文そのもの）なので、条件2 の差分の取り方も変わりません。
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import { notifySuccess } from '@gmo-onair/shared/src/client/notify';
import type { WikiTidyMode, WikiTidyResult } from '@gmo-onair/shared/src/wiki/types';
import { sendTidyDecision, tidyText, type WikiTidyDecision } from './aiApi';
import { DEFAULT_TIDY_MODE } from './tidyModes';
import AiTidyPanes from './AiTidyPanes';

export interface AiTidySheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pageId: string;
  /** 整える元の文（選んだところ・または本文全部） */
  source: string;
  /** 選んだところだけか、本文全部か */
  scope: 'selection' | 'all';
  /** 置き換える。本文に入れる Markdown を渡す */
  onReplace: (next: string) => void;
}

export default function AiTidySheet({
  open, onOpenChange, pageId, source, scope, onReplace,
}: AiTidySheetProps) {
  const [mode, setMode] = useState<WikiTidyMode>(DEFAULT_TIDY_MODE);
  const [result, setResult] = useState<WikiTidyResult | null>(null);
  /** 画面で直したあとの文（置き換えるのはこちら） */
  const [edited, setEdited] = useState('');
  /** まだ「置き換えた／やめた」を返していない結果の id */
  const pendingRef = useRef<string | null>(null);

  const decide = useMutation({
    meta: { action: '整えた結果の記録を保存' },
    mutationFn: (v: { outputId: string; decision: WikiTidyDecision; final_md?: string }) =>
      sendTidyDecision(v.outputId, { decision: v.decision, final_md: v.final_md }),
  });

  /** 受け取ったままにしている結果があれば「やめた」として返す */
  const decideRef = useRef(decide.mutate);
  decideRef.current = decide.mutate;
  const rejectPending = () => {
    const outputId = pendingRef.current;
    pendingRef.current = null;
    if (outputId) decideRef.current({ outputId, decision: 'cancelled' });
  };

  /*
   * 画面ごと離れたときも返す（戻るボタン・別のページへ移った）。
   * ここを抜かすと「結果を受け取ったのに何も返っていない」件が貯まり、
   * 置き換え率が実際より低く見えます。
   */
  useEffect(() => () => {
    const outputId = pendingRef.current;
    pendingRef.current = null;
    if (outputId) decideRef.current({ outputId, decision: 'cancelled' });
  }, []);

  const run = useMutation({
    meta: { action: 'AI で文章を整理' },
    mutationFn: (m: WikiTidyMode) => tidyText({ text: source, mode: m, page_id: pageId }),
    onSuccess: (res) => {
      // 記録に失敗した回（id が返らない）は、返す先が無いので持たない
      pendingRef.current = res.ai_output_id || null;
      setResult(res);
      setEdited(res.result_md);
    },
  });
  // 効果の中から呼ぶので、描画のたびに変わらない入れ物に置いておく
  const runRef = useRef(run.mutate);
  runRef.current = run.mutate;

  /** 開いた時に1回だけ走らせる（開くたびに最初のやり方からやり直す） */
  const startedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      startedRef.current = false;
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    setMode(DEFAULT_TIDY_MODE);
    setResult(null);
    setEdited('');
    runRef.current(DEFAULT_TIDY_MODE);
  }, [open]);

  const changeMode = (m: WikiTidyMode) => {
    if (m === mode && result) return;
    // 出し直す＝いまの結果は使わなかった、ということ（条件2）
    rejectPending();
    setMode(m);
    setResult(null);
    setEdited('');
    run.mutate(m);
  };

  const replace = () => {
    const outputId = pendingRef.current;
    pendingRef.current = null;
    onReplace(edited);
    if (outputId) {
      // そのまま置き換えたときは添えない（サーバーが無修正採用として数える）
      const touched = edited !== result?.result_md;
      decide.mutate({ outputId, decision: 'replaced', final_md: touched ? edited : undefined });
    }
    onOpenChange(false);
    notifySuccess('整えた文に置き換えました', {
      description: '元の文は履歴に残ります。おかしいところがあれば、そのまま打ち直せます。',
    });
  };

  const close = () => {
    rejectPending();
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) close();
        else onOpenChange(true);
      }}
      title="AI で整える"
      sub={scope === 'selection'
        ? '選んでいるところだけを整えます。置き換えるまで本文は変わりません'
        : '本文全体を整えます。置き換えるまで本文は変わりません'}
      size="xl"
      swipeDownHandle
      /* 下敷きを触っただけで結果を失わない（もう一度 AI を呼ぶことになる） */
      onInteractOutside={(e) => e.preventDefault()}
      footer={
        <div className="flex gap-2 lg:justify-end">
          <Button
            type="button"
            variant="outline"
            className="h-[52px] flex-1 lg:h-10 lg:flex-none"
            onClick={close}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            className="h-[52px] flex-1 lg:h-10 lg:flex-none"
            disabled={run.isPending || !result || !edited.trim()}
            onClick={replace}
          >
            置き換える
          </Button>
        </div>
      }
    >
      <AiTidyPanes
        mode={mode}
        onModeChange={changeMode}
        source={source}
        result={result ? edited : null}
        onResultChange={setEdited}
        changedTerms={result?.changed_terms ?? []}
        /* 送り始める前の一瞬も「整えています」のままにする（空の枠を挟まない） */
        busy={run.isPending || (!result && !run.isError)}
        failed={run.isError}
        onRetry={() => run.mutate(mode)}
      />
    </Sheet>
  );
}
