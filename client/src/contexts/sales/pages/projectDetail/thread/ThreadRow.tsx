/**
 * やり取りの1行 (v4 ⑥ 案件記録)
 *
 * ── 整えた本文を HTML で描く ────────────────────────────────
 *
 * `body_html` は **サーバーが保存する前にサニタイズ済み**です
 * (`server/src/shared/services/html-sanitize.ts`)。許可タグは9つ、
 * **属性は1つも通していない**ので、`dangerouslySetInnerHTML` で描けます。
 *
 * ⚠️ **画面側でサニタイズし直しません。** 2か所で削ると、片方だけ直したときに
 * 「保存はできるのに表示だけ消える」という追いにくい壊れ方をします。
 * 守りは**入口（保存時）に1か所**置く、というのがこの製品の決めです。
 *
 * ── 原文に戻せるようにする ──────────────────────────────────
 *
 * AI の整形が的外れなときのために、**原文（`description`）を開けます**。
 * 開けないと「AI が変なことを書いた」で終わってしまい、直しようがありません。
 */
import { useState } from 'react';
import { Sparkles, Check, ChevronDown, Phone, Mail, Users, Presentation, Pencil, MoreHorizontal } from 'lucide-react';
import { Row, RowMain, RowTitle, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { RichContent } from '@gmo-onair/shared/src/client-v4/richContent';
import { parseNoteText } from '@gmo-onair/shared/src/client-v4/noteText';
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { ActivityLog } from '../types';

/** 種類。**DB の `activity_type` と同じ集合**（migration 184 で `memo` を足した） */
export const KIND: Record<string, { label: string; icon: typeof Phone }> = {
  call: { label: '電話', icon: Phone },
  email: { label: 'メール', icon: Mail },
  meeting: { label: '打合せ', icon: Users },
  visit: { label: '訪問', icon: Users },
  proposal: { label: '提案', icon: Presentation },
  demo: { label: 'デモ', icon: Presentation },
  followup: { label: '追いかけ', icon: MoreHorizontal },
  follow_up: { label: '追いかけ', icon: MoreHorizontal },
  memo: { label: 'メモ', icon: Pencil },
  other: { label: 'その他', icon: MoreHorizontal },
};

export function ThreadRow({ a, today }: { a: ActivityLog; today: string }) {
  const [showOriginal, setShowOriginal] = useState(false);
  const k = KIND[a.activity_type ?? 'other'] ?? KIND.other;
  const overdue = a.next_action && !a.next_action_done_at
    && !!a.next_action_date && a.next_action_date < today;
  const points = a.key_points ?? [];

  return (
    <Row divider align="start" stackOnMobile>
      <RowMain>
        <div className="flex flex-wrap items-center gap-2">
          <RowTitle>{a.subject}</RowTitle>
          {a.ai_formatted && (
            <span className="text-badge inline-flex items-center gap-1 rounded-badge bg-ai-surface px-1.5 py-0.5 font-bold text-ai">
              <Sparkles className="h-3 w-3" aria-hidden="true" />AI 整形
            </span>
          )}
        </div>

        {a.body_html ? (
          <div
            className="thread-body text-sub mt-1 text-secondary-foreground"
            // 保存時にサニタイズ済み（上の説明を参照）
            dangerouslySetInnerHTML={{ __html: a.body_html }}
          />
        ) : a.description ? (
          // **整形前の本文も「読める形」で描く。** メール取込は素のテキストしか
          // 入れられない（MCP の `create_activity_log` は `description` だけ）ので、
          // ここは**毎日の取込ぶんが必ず通る道**。素の段落1つに流すと見出しも
          // 箇条書きも同じ見た目になり、`**強調**` はアスタリスクのまま出ていた。
          // 読み替えられなかった行は素の段落として必ず出る（`parseNoteText`）
          <div className="mt-1">
            <RichContent blocks={parseNoteText(a.description)} fallback={a.description} />
          </div>
        ) : null}

        {points.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {points.map((p, i) => (
              <span key={i} className="text-note inline-flex items-center gap-1.5 rounded-chip bg-muted px-2.5 py-1 text-secondary-foreground">
                <Check className="h-3 w-3 text-success" aria-hidden="true" />{p}
              </span>
            ))}
          </div>
        )}

        {/*
          「次にやること」は `text-sub-sm`(11.5px) から上げた。あの段は**スマホでも
          上げない**ので（件数の数字・列見出し・バッジの札のための段）、読ませる文が
          375px で 11.5px になっていた（概要のダイジェストと同じ理由）
        */}
        {a.next_action && (
          <p className={cn('text-sub mt-1', overdue ? 'font-bold text-destructive' : 'text-muted-foreground')}>
            次にやること: {a.next_action}
            {a.next_action_date && `（${a.next_action_date}${overdue ? ' 過ぎています' : ''}）`}
            {a.next_action_done_at && '（済み）'}
          </p>
        )}

        {/* **整形の元になった文に戻れる。** 直しようがない状態にしない */}
        {a.ai_formatted && a.description && (
          <>
            <button
              type="button"
              onClick={() => setShowOriginal((v) => !v)}
              aria-expanded={showOriginal}
              className="text-note min-h-tap mt-1 inline-flex items-center gap-1 text-muted-foreground hover:text-foreground lg:min-h-[28px]"
            >
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showOriginal && 'rotate-180')} aria-hidden="true" />
              打った文をみる
            </button>
            {showOriginal && (
              <p className="text-note rounded-note mt-1 whitespace-pre-line border border-border-subtle bg-surface-subtle px-3 py-2 text-muted-foreground">
                {a.description}
              </p>
            )}
          </>
        )}
      </RowMain>

      <TableBadge w={96} label={k.label} variant="outline" />
      <RowSlot w={96} align="right" className="text-sub font-number text-muted-foreground">
        {a.activity_date}
      </RowSlot>
    </Row>
  );
}
