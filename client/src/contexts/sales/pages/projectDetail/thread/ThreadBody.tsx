/**
 * やり取りの1件の**本文**の描き方（`ThreadCard.tsx` から切り出し）
 *
 * ⚠️ **`ThreadCard.tsx` から出したのは行数のため**（編集の枠を足すと 400 行を
 * 超える・`scripts/check-file-size.mjs`）。中身と決めごとは動かしていない。
 *
 * ── 3段に落ちる ────────────────────────────────────────────
 *
 *   ① `body_struct` がある … この形（会話・状態・事実）
 *   ② `body_html` がある   … 整えた行・人が手動で編集した行。**そのまま HTML で描く**
 *   ③ どちらも無い         … 原文を `parseNoteText` で読める形にする
 *
 * **②を捨てないこと。** v1 で整えた行を作り直すには1件ずつ AI を呼ぶので、
 * 作り直す前でも読める状態を保ちます。**手動で編集した本文もここを通ります**
 * （`bodyEdit.ts` が許可タグだけの HTML にして保存する）。
 *
 * ── 整えた本文を HTML で描く（②の道）────────────────────────
 *
 * `body_html` は **サーバーが保存する前にサニタイズ済み**です
 * （`server/src/shared/services/html-sanitize.ts`）。許可タグは9つ、
 * **属性は1つも通していない**ので `dangerouslySetInnerHTML` で描けます。
 * ⚠️ **画面側でサニタイズし直しません** — 2か所で削ると、片方だけ直したときに
 * 「保存はできるのに表示だけ消える」という追いにくい壊れ方をします。
 */
import {
  CalendarDays, Users, Lightbulb, ReceiptText, MapPin, FileText,
} from 'lucide-react';
import { RichContent, InlineText } from '@gmo-onair/shared/src/client-v4/richContent';
import { parseNoteText } from '@gmo-onair/shared/src/client-v4/noteText';
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { ActivityLog } from '../types';
import {
  initialOf,
  type ActivityStruct, type ActivityStatusTone, type ActivityFactIcon, type ActivityTurn,
} from './struct';

/**
 * 状態の色。**塗りピルにしない** — 2つ並べると色の塊が件名より目立ちます。
 * 6px の点と文字だけにすると、色は伝わって面積は 1/8 で済みます。
 */
const TONE_CLASS: Record<ActivityStatusTone, string> = {
  decided: 'text-success',
  waiting: 'text-warning',
  risk: 'text-destructive',
  info: 'text-muted-foreground',
};

/** 事実に添える絵。**AI は種類の名前だけを返す**（絵を決めるのはここ） */
const FACT_ICON: Record<ActivityFactIcon, typeof CalendarDays> = {
  date: CalendarDays,
  people: Users,
  gear: Lightbulb,
  money: ReceiptText,
  place: MapPin,
  doc: FileText,
};

export function Statuses({ items }: { items: ActivityStruct['statuses'] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((s) => (
        <span key={s.label} className={cn('text-sub inline-flex items-center gap-1.5 font-bold', TONE_CLASS[s.tone])}>
          {/* 点は文字の色を継ぐ（色を2か所に書かない） */}
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-chip bg-current" />
          {s.label}
        </span>
      ))}
    </div>
  );
}

export function Facts({ items }: { items: ActivityStruct['facts'] }) {
  return (
    // **区切り文字を使わない。** `・` や `|` を並べると、4つ出したときに
    // 記号のほうが行の中で数が多くなる。余白とアイコンで足りる
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
      {items.map((f) => {
        const Icon = FACT_ICON[f.icon];
        return (
          <span key={`${f.icon}-${f.value}`} className="text-sub inline-flex items-center gap-1.5 text-secondary-foreground">
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            {f.value}
          </span>
        );
      })}
    </div>
  );
}

function Turn({ t }: { t: ActivityTurn }) {
  const us = t.side === 'us';
  const initial = initialOf(t.name);
  return (
    <div className="flex gap-2.5">
      {/* 頭文字のアバター。**丸にしない** — 完全な円は SNS の人物写真の記号で、
          業務の記録には強すぎる。角丸の四角なら話者の区別だけが伝わる */}
      <div className="flex shrink-0 flex-col items-center gap-1">
        <span
          aria-hidden="true"
          className={cn(
            'text-badge flex h-6 w-6 items-center justify-center rounded-control-md border',
            us ? 'border-primary-border bg-primary-surface text-primary'
               : 'border-border-subtle bg-muted text-muted-foreground',
          )}
        >
          {initial ?? (us ? '当' : '先')}
        </span>
        {/* 発言をつなぐ線。次の発言まで伸ばす（`flex-1`）*/}
        <span aria-hidden="true" className="w-px flex-1 bg-border-faint" />
      </div>

      <div className="min-w-0 flex-1 pb-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {t.name && <span className="text-list">{t.name}</span>}
          {t.org && <span className="text-sub text-muted-foreground">{t.org}</span>}
          {t.at && <span className="text-sub-sm font-number ml-auto text-muted-foreground">{t.at}</span>}
        </div>

        {t.quote && (
          <p className="text-sub mt-1 whitespace-pre-line text-secondary-foreground">
            <InlineText text={t.quote} />
          </p>
        )}
        {t.note && (
          <p className="text-sub mt-1 whitespace-pre-line text-muted-foreground">
            <InlineText text={t.note} />
          </p>
        )}

        {t.fields.length > 0 && (
          // **当社の回答は薄い面に載せる。** 誰の言葉かを色で1回だけ言う
          // （長い発言では上端のアバターが画面の外に出るため）
          <dl className={cn(
            'rounded-note mt-1.5 flex flex-col gap-1.5 px-3 py-2.5',
            us ? 'bg-surface-subtle' : 'border border-border-subtle',
          )}>
            {t.fields.map((f) => (
              <div key={f.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <dt className="text-sub w-20 shrink-0 text-muted-foreground sm:text-right">{f.label}</dt>
                <dd className="text-sub min-w-0 flex-1 break-words text-secondary-foreground">
                  <InlineText text={f.value} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

/** 本文（3段の落ち先を1か所にまとめた）。**順番を変えないこと** */
export function ThreadBody({ a, s }: { a: ActivityLog; s: ActivityStruct | null }) {
  if (s) {
    return (
      <>
        {s.lead && (
          <p className="text-sub mt-3 whitespace-pre-line text-secondary-foreground">
            <InlineText text={s.lead} />
          </p>
        )}
        {s.turns.length > 0 && (
          <>
            {/* 節見出しは `v4-eyebrow`（12px/800・字間 .1em）。トップの節見出しと同じ段 */}
            <p className="v4-eyebrow mt-3.5 text-muted-foreground">やり取り</p>
            <div className="mt-1.5">
              {s.turns.map((t, i) => <Turn key={`${t.side}-${i}`} t={t} />)}
            </div>
          </>
        )}
      </>
    );
  }
  if (a.body_html) {
    return (
      <div
        className="thread-body text-sub mt-3 text-secondary-foreground"
        // 保存時にサニタイズ済み（このファイルの冒頭を参照）
        dangerouslySetInnerHTML={{ __html: a.body_html }}
      />
    );
  }
  if (a.description) {
    // **整形前の本文も「読める形」で描く。** メール取込は素のテキストしか
    // 入れられない（MCP の `create_activity_log` は `description` だけ）ので、
    // ここは**まだ整えていない取込ぶんが必ず通る道**
    return (
      <div className="mt-3">
        <RichContent blocks={parseNoteText(a.description)} fallback={a.description} />
      </div>
    );
  }
  return null;
}
