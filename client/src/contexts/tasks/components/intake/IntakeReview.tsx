/**
 * 「AI が読み取りました」— 投入の確認画面
 *
 * ── 押すまで何も登録しない ────────────────────────────────
 *
 * 見出しに `下書き` の札を付け、`押すまで登録しません` と**書きます**。
 * 投入口を 1 本にして行き先まで AI が決めるようになった以上、
 * 「勝手に案件が作られるのでは」という不安をここで消さないと、
 * 怖くて使われない口になります。
 *
 * ── 画面遷移させない ──────────────────────────────────────
 *
 * 投げた直後に**同じ画面のモーダル**で確認させます（別ページに飛ばすと離脱する）。
 * スマホではボトムシートの中に同じものが出ます（呼び出し側が `embedded` を渡す）。
 */
import { AlertTriangle, Check, Info, Loader2, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { DraftRow } from './DraftRow';
import { rowBlockers, type IntakeResponse, type Row } from './types';

export interface IntakeReviewProps {
  intake: IntakeResponse;
  rows: Row[];
  onChange: (draftKey: string, patch: Partial<Row>) => void;
  onCommit: () => void;
  onDiscard: () => void;
  onClose: () => void;
  committing: boolean;
  discarding: boolean;
  error: string | null;
  /** スマホのシートの中に埋め込むとき。モーダルの枠を出さない */
  embedded?: boolean;
}

export function IntakeReview(props: IntakeReviewProps) {
  if (props.embedded) return <ReviewBody {...props} />;

  // **フッターは FormDialog の下端固定スロットへ渡す**（`Sheet` と同じく本文だけが
  // スクロールする形にするため）。判定は ReviewBody の中身と同じ式（rowBlockers）
  const checked = props.rows.filter((r) => r.checked);
  const blockers = checked.flatMap(rowBlockers);

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) props.onClose(); }}
      // **背景の誤クリックで下書きを消さない**（`BusinessProjectView.tsx:1405` と同じ理由）。
      // 押すまで登録しない下書き（原文・AI抽出行・編集内容）を、確認も破棄APIの呼び出しも
      // 無いまま失うのを防ぐ。閉じるには右上の × か「全部いらない」を使う
      onInteractOutside={(e) => e.preventDefault()}
      title="AI が読み取りました"
      sub="下書き・押すまで登録しません"
      wide
      footer={
        <FormDialogFooter className="sm:justify-between">
          <ReviewButtons
            count={checked.length}
            disabled={checked.length === 0 || blockers.length > 0 || props.committing}
            committing={props.committing}
            discarding={props.discarding}
            onCommit={props.onCommit}
            onDiscard={props.onDiscard}
          />
        </FormDialogFooter>
      }
    >
      <ReviewBody {...props} />
    </FormDialog>
  );
}

function ReviewBody({
  intake, rows, onChange, onCommit, onDiscard, committing, discarding, error, embedded,
}: IntakeReviewProps) {
  const checked = rows.filter((r) => r.checked);
  const blockers = checked.flatMap(rowBlockers);
  const users = intake.users ?? [];
  const projects = intake.projects ?? [];
  /*
   * 拾わなかったもの。**打ち込んだときは応答（`skipped`）・録音のときは行（`warnings`）**
   * に入るので、両方を見る（同じ行が二度並ばないように鍵で潰す）。
   */
  const notPicked = Array.from(
    new Map(
      [...(intake.skipped ?? []), ...(intake.warnings ?? [])]
        .map((w) => [`${w.line}|${w.reason}`, w] as const),
    ).values(),
  );

  return (
    <div className="flex flex-col gap-2.5">
      {embedded && (
        <p className="text-cardtitle flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-ai" aria-hidden="true" />
          AI が読み取りました
          <span className="rounded-badge border border-warning-border bg-warning-surface px-2 py-0.5 text-badge text-warning">
            下書き
          </span>
          <span className="text-note text-muted-foreground">押すまで登録しません</span>
        </p>
      )}

      {/* **AI が落ちた日は、そう書く。** 黙って全部タスクになると
          「行き先を決めてくれない」と読まれ、次から使われなくなる */}
      {intake.parsed_by === 'rules' && (
        <p className="rounded-note flex items-start gap-2 border border-warning-border bg-warning-surface px-2.5 py-2 text-note text-secondary-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
          <span>
            <strong className="font-bold">いまは AI が使えないので、行き先は全部タスクにしています。</strong>
            行き先は下の欄で変えられます。
          </span>
        </p>
      )}

      {/*
        拾わなかった行（決定事項など）・読めなかった添付・規則ベースへの縮退。
        ⚠️ **`skipped` と `warnings` の両方を見る** — 打ち込んだときは応答に載り、
        **録音のときは行に残ります**（裏で解析するので応答に載せられない）。
        片方だけ見ると「打つと出るのに、録音だと出ない」になります。
      */}
      {notPicked.length > 0 && (
        <div className="rounded-note border border-border bg-muted/40 p-2.5 text-note">
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
            登録しなかった行（記録には残ります）
          </p>
          <ul className="mt-1 space-y-0.5">
            {notPicked.map((s, i) => (
              <li key={i} className="text-muted-foreground">
                <span className="text-secondary-foreground">{s.line}</span>
                <span className="ml-1.5">— {s.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="py-4 text-sub text-secondary-foreground">
          登録できるものが読み取れませんでした。文を分けて書き直すか、「タスク・依頼」から直接登録してください。
        </p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <DraftRow
              key={r.draft_key}
              r={r}
              users={users}
              projects={projects}
              onChange={(patch) => onChange(r.draft_key, patch)}
            />
          ))}
        </ul>
      )}

      {blockers.length > 0 && (
        <div className="rounded-note border border-warning-border bg-warning-surface p-2.5">
          <p className="flex items-center gap-1.5 text-sub text-warning">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            登録する前に決めてください
          </p>
          <ul className="mt-1 space-y-0.5 text-sub text-secondary-foreground">
            {blockers.map((b, i) => <li key={i}>・{b}</li>)}
          </ul>
        </div>
      )}

      {/* **元の文を残す。** どこを読み違えたのか後から確かめられないと直せない */}
      <p className="truncate text-note text-muted-foreground" title={intake.raw_text}>
        投げた文: {intake.raw_text}
      </p>

      {error && <p className="text-sub text-destructive">{error}</p>}

      {/*
        **埋め込み（スマホのシートの中）だけここで描く。** デスクトップは
        `IntakeReview` が `FormDialog` の下端固定フッタースロットへ同じ
        `ReviewButtons` を渡す（本文と一緒にスクロールさせないため）。
      */}
      {embedded && (
        <div className="flex items-center justify-between gap-2">
          <ReviewButtons
            count={checked.length}
            disabled={checked.length === 0 || blockers.length > 0 || committing}
            committing={committing}
            discarding={discarding}
            onCommit={onCommit}
            onDiscard={onDiscard}
          />
        </div>
      )}
    </div>
  );
}

function ReviewButtons({
  count, disabled, committing, discarding, onCommit, onDiscard,
}: {
  count: number; disabled: boolean;
  committing: boolean; discarding: boolean; onCommit: () => void; onDiscard: () => void;
}) {
  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-9 gap-1 text-note"
        disabled={discarding} onClick={onDiscard}>
        <X className="h-3.5 w-3.5" aria-hidden="true" />全部いらない
      </Button>
      <Button type="button" size="sm" className="h-9 gap-1.5" disabled={disabled} onClick={onCommit}>
        {committing
          ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          : <Check className="h-4 w-4" aria-hidden="true" />}
        登録する（{count}件）
      </Button>
    </>
  );
}
