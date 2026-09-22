/**
 * やり取りの1件（v4 ⑥ 案件記録）— 会話の形で描き、その場で編集する
 *
 * ── なぜ表の行をやめたのか ──────────────────────────────────
 *
 * 着手前は `Row` に件名・本文・要点チップ・次のアクションを詰めていました。
 * 取り込んだメールは**先方の依頼と当社の回答が交互に並ぶやり取り**なのに、
 * 本文が1本の HTML だったので**どちらの発言かは文の中にしか残らず**、
 * 読む人が毎回頭で分解していました（利用者から「読みづらい」と2度）。
 *
 * いまは AI が**意味の単位**を返し（`server/src/shared/services/activity-struct.ts`）、
 * `ThreadBody.tsx` が見せ方を決めます。**AI に HTML を書かせない**という取込側の
 * 決めごと（`richContent.tsx` の冒頭）と、やり取り側の作りが揃いました。
 *
 * ── この回で足したこと（利用者のご指摘3・4）────────────────
 *
 *   ・**次のアクションを片づけられる**（完了 / 延期 / 編集 / 削除）
 *     → `NextActionActions.tsx`。前は読むだけで、不要になった行が永久に残った
 *   ・**本文を手動で編集できる**（Notion のように、その場で）
 *     → `ThreadCardEdit.tsx`。AI が整えたあとでも自分の言葉に直せる
 *
 * ── 原文に戻せるようにする ──────────────────────────────────
 *
 * AI の整形が的外れなときのために、**原文（`description`）を開けます**。
 * 開けないと「AI が変なことを書いた」で終わってしまい、直しようがありません。
 * 言い方は**「原文を表示」**（`docs/wording.md` ルール8・9。「打った文をみる」は口語）。
 *
 * ── ファイルを分けた理由 ────────────────────────────────────
 *
 * 本文の描き方は `ThreadBody.tsx`、編集の枠は `ThreadCardEdit.tsx` に出しました。
 * **1ファイル 400 行の上限**（`scripts/check-file-size.mjs`）があり、
 * 1か所直すのに 400 行読む形をやめるためです。中身の決めごとは動かしていません。
 */
import { useState } from 'react';
import { Sparkles, ChevronDown, ChevronRight, RotateCcw, Pencil, FileText } from 'lucide-react';
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { ActivityLog } from '../types';
import { kindOf } from './kinds';
import { NextAction } from './NextActionNote';
import { NextActionActions } from './NextActionActions';
import { ThreadBody, Statuses, Facts } from './ThreadBody';
import { ThreadCardEdit } from './ThreadCardEdit';
import { readActivityStruct } from './struct';
import type { ThreadEdit } from './useThreadEdit';

/**
 * 本文の出どころの札（1行に1枚だけ）。
 *
 * **面を塗るのは AI の札だけ**にしてあります。手動編集は「誰かが直した」という
 * 事実の注記で、目で追う必要が無いからです（色は文字にだけ使う・今回の設計方針）。
 */
function EditedBadge({ manual }: { manual: boolean }) {
  if (manual) {
    return (
      <span className="text-badge inline-flex shrink-0 items-center gap-1 font-bold text-muted-foreground">
        <Pencil className="h-3 w-3" aria-hidden="true" />手動で編集
      </span>
    );
  }
  return (
    <span className="text-badge inline-flex shrink-0 items-center gap-1 rounded-badge bg-ai-surface px-1.5 py-0.5 font-bold text-ai">
      <Sparkles className="h-3 w-3" aria-hidden="true" />AI が整えました
    </span>
  );
}

export function ThreadCard({ a, today, canEdit, edit, onRedo, redoing }: {
  a: ActivityLog;
  today: string;
  canEdit?: boolean;
  /** 保存・完了・延期・削除の口（`useThreadEdit`）。読むだけの画面では渡さない */
  edit?: ThreadEdit;
  /** 「この整形は違う」。待ち行列に戻し、`ai_corrections` に `reject` を残す */
  onRedo?: (id: string) => void;
  redoing?: boolean;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  /** 編集中の欄（閉じているときは `null`）。最初のフォーカスの位置も兼ねる */
  const [editing, setEditing] = useState<null | 'body' | 'next_action'>(null);
  const k = kindOf(a.activity_type);
  const KindIcon = k.icon;
  const s = readActivityStruct(a.body_struct);
  // 要点チップは v1 の欄。**構造がある行では出さない**（`facts` が同じ役割を担う）
  const points = s ? [] : (a.key_points ?? []);
  // **AI が整えたと言えるのは、整えた中身があるときだけ。** 「整え直す」を押した直後は
  // `ai_formatted` が立ったまま中身が空になるので、印だけで判定すると嘘になる
  const hasBody = !!s || !!a.body_html;
  /**
   * ⚠️ **「整った本文がある」と「AI が整えた」は別物**（レビューでの指摘 #93）。
   *
   * 前の版はどちらも `!!s || !!a.body_html` で判定していました。ところが
   * **`body_html` は人が書いた本文にも入ります**（AI を通していない古い記録・
   * **この回から増える手動編集の行**）。その行では:
   *
   * ・**「AI 整形」の札が出ます** — AI は一度も触っていないのに
   * ・**「整え直す」が出て、押しても何も起きません**。サーバーの待ち行列は
   *   `body_html IS NULL OR ai_formatted` を要求するので、
   *   **人が書いた本文の行は永久に対象になりません**（`PENDING_SQL`）
   *
   * **AI の印がある行だけ**を AI 扱いにします。
   */
  const aiFormatted = !!a.ai_formatted && hasBody;
  const waitingRedo = !!a.ai_formatted && !hasBody;
  /**
   * 手動で編集した行（migration 304）。**AI の札より優先して出す** —
   * 中身はもう人の文章なので、「AI が整えました」は嘘になります。
   * この行は `PENDING_SQL` の `body_edited_at IS NULL` から外れるので
   * 自動整形されず、「整え直す」もサーバーが 400 で止めます
   * （**押しても何も起きない導線を作らない**ので、画面からも出しません）。
   */
  const manuallyEdited = !!a.body_edited_at;

  return (
    <article className="rounded-card border border-border bg-card p-4 shadow-sm lg:p-5">
      <div className="flex items-start gap-3">
        <div className="text-sub min-w-0 flex-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          <span className="font-number">{a.activity_date}</span>
          <span className="inline-flex items-center gap-1.5">
            <KindIcon className="h-3.5 w-3.5" aria-hidden="true" />{k.label}
          </span>
        </div>
        {/*
          札は1枚だけ。**手動で編集した行では「AI が整えました」を出さない** —
          中身はもう人の文章なので嘘になる（ご指摘4への対応）。
          ⚠️ **`{aiFormatted && (` の形を崩さないこと** —
          `shared/tests/redoFormat.test.ts` がこの判定の形を固定している
          （`body_html` があるだけで AI 扱いにした前の版への戻りを止めるため）。
        */}
        {aiFormatted && (
          <EditedBadge manual={manuallyEdited} />
        )}
        {/* AI を一度も通していない行を手で編集したとき（`ai_formatted` は偽のまま） */}
        {manuallyEdited && !aiFormatted && (
          <EditedBadge manual />
        )}
      </div>

      {/* 件名は言い切りの短い部分だけを大きく、残りは副題に落とす
          （取り込んだ件名は長く、1行に切ると肝心なところが消える） */}
      <h3 className="text-h2 mt-1.5 break-words">{a.subject}</h3>
      {s?.subtitle && <p className="text-list mt-1 break-words text-secondary-foreground">{s.subtitle}</p>}
      {s && s.statuses.length > 0 && <div className="mt-1.5"><Statuses items={s.statuses} /></div>}

      {s && s.facts.length > 0 && (
        <div className="mt-3 border-t border-border-faint pt-3">
          <Facts items={s.facts} />
        </div>
      )}

      {/*
        編集中は本文と次のアクションを**欄に差し替える**（二重に出さない）。
        両方出すと、どちらが保存される値なのか読み取れません
      */}
      {editing && edit ? (
        <ThreadCardEdit a={a} edit={edit} focus={editing} onClose={() => setEditing(null)} />
      ) : (
        <>
          <ThreadBody a={a} s={s} />

          {points.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
              {points.map((p, i) => (
                <span key={i} className="text-sub inline-flex items-center gap-1.5 text-secondary-foreground">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />{p}
                </span>
              ))}
            </div>
          )}

          {a.next_action && (
            <NextAction a={a} today={today}>
              {canEdit && edit && (
                <NextActionActions a={a} edit={edit} onEdit={() => setEditing('next_action')} />
              )}
            </NextAction>
          )}
        </>
      )}

      {waitingRedo && (
        <p className="text-sub mt-3 text-muted-foreground">
          AI が整える順番に入っています（毎晩 3:00 に自動で整えます）。それまでは原文のまま表示します。
        </p>
      )}

      {/* **整形の元になった文に戻れる。** 直しようがない状態にしない */}
      {!editing && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 border-t border-border-faint pt-2">
          {a.description && (
            <button
              type="button"
              onClick={() => setShowOriginal((v) => !v)}
              aria-expanded={showOriginal}
              className="text-sub min-h-tap inline-flex items-center gap-1 text-muted-foreground hover:text-foreground lg:min-h-[28px]"
            >
              原文を表示
              {showOriginal
                ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          )}
          {/*
            **本文を手動で編集する**（ご指摘4）。AI が整えたあとでも、
            自分の言葉に直せる道を必ず1本置く（「整え直す」だけだと、
            直す手段が「AI にもう一度賭ける」しか無い）
          */}
          {canEdit && edit && (
            <button
              type="button"
              onClick={() => setEditing('body')}
              className="text-sub min-h-tap inline-flex items-center gap-1 text-muted-foreground hover:text-foreground lg:min-h-[28px]"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              編集
            </button>
          )}
          {/*
            **「この整形は違う」を押せるようにする。** v2 は AI が「誰の発言か」まで
            決めるので、取り違えると**当社が答えたことが取引先の発言として残ります**。
            押すと待ち行列に戻り、押した事実は `ai_corrections` に `reject` で残る
            （会社方針「AI を使い捨てにしない」の条件2）
          */}
          {/*
            ⚠️ **手動で編集した行では出さない。** サーバーの `redoFormat` が
            `body_edited_at IS NOT NULL` の行を 400 で止めるので、出すと
            **押しても何も起きないボタン**になる（`NOT_AI_FORMATTED` と同じ門）。
            外側で外すのは、内側の `{canEdit && aiFormatted && onRedo && (` の形を
            `shared/tests/redoFormat.test.ts` が固定しているため。
          */}
          {!manuallyEdited && (
            <>
              {canEdit && aiFormatted && onRedo && (
                <button
                  type="button"
                  onClick={() => onRedo(a.id)}
                  disabled={redoing}
                  className="text-sub min-h-tap inline-flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-50 lg:min-h-[28px]"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  整え直す
                </button>
              )}
            </>
          )}
          {showOriginal && a.description && (
            <p className={cn(
              'text-note rounded-note mt-1 w-full whitespace-pre-line border border-border-subtle',
              'bg-surface-subtle px-3 py-2 text-muted-foreground',
            )}>
              {a.description}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
