/**
 * やり取りの1件（v4 ⑥ 案件記録）— 会話の形で描く
 *
 * ── なぜ表の行をやめたのか ──────────────────────────────────
 *
 * 着手前は `Row` に件名・本文・要点チップ・次にやることを詰めていました。
 * 取り込んだメールは**先方の依頼と当社の回答が交互に並ぶやり取り**なのに、
 * 本文が1本の HTML だったので**どちらの発言かは文の中にしか残らず**、
 * 読む人が毎回頭で分解していました（利用者から「読みづらい」と2度）。
 *
 * いまは AI が**意味の単位**を返し（`server/src/shared/services/activity-struct.ts`）、
 * ここが見せ方を決めます。**AI に HTML を書かせない**という取込側の決めごと
 * （`richContent.tsx` の冒頭）と、やり取り側の作りが揃いました。
 *
 * ── 3段に落ちる ────────────────────────────────────────────
 *
 *   ① `body_struct` がある … この形（会話・状態・事実）
 *   ② `body_html` がある   … v1 で整えた行。**そのまま HTML で描く**
 *   ③ どちらも無い         … 原文を `parseNoteText` で読める形にする
 *
 * **②を捨てないこと。** v1 で整えた行を作り直すには1件ずつ AI を呼ぶので、
 * 作り直す前でも読める状態を保ちます。
 *
 * ── 整えた本文を HTML で描く（②の道）────────────────────────
 *
 * `body_html` は **サーバーが保存する前にサニタイズ済み**です
 * （`server/src/shared/services/html-sanitize.ts`）。許可タグは9つ、
 * **属性は1つも通していない**ので `dangerouslySetInnerHTML` で描けます。
 * ⚠️ **画面側でサニタイズし直しません** — 2か所で削ると、片方だけ直したときに
 * 「保存はできるのに表示だけ消える」という追いにくい壊れ方をします。
 *
 * ── 原文に戻せるようにする ──────────────────────────────────
 *
 * AI の整形が的外れなときのために、**原文（`description`）を開けます**。
 * 開けないと「AI が変なことを書いた」で終わってしまい、直しようがありません。
 */
import { useState } from 'react';
import {
  Sparkles, ChevronDown, ChevronRight, ArrowRight, RotateCcw,
  CalendarDays, Users, Lightbulb, ReceiptText, MapPin, FileText,
} from 'lucide-react';
import { RichContent, InlineText } from '@gmo-onair/shared/src/client-v4/richContent';
import { parseNoteText } from '@gmo-onair/shared/src/client-v4/noteText';
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { ActivityLog } from '../types';
/**
 * 「済み」の理由の言い方は **営業活動記録と同じ1本**（`autoClosedLabel`）。
 * ここに写すと、同じ行がやり取りタブと一覧で違う言葉になる。
 */
import { autoClosedLabel } from '../../activityLog/types';
import { kindOf } from './kinds';
import { shortYmd } from './format';
import { parseNextAction } from './nextAction';
import {
  readActivityStruct, initialOf,
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

function Statuses({ items }: { items: ActivityStruct['statuses'] }) {
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

function Facts({ items }: { items: ActivityStruct['facts'] }) {
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

/**
 * 次にやること。
 *
 * **色を使う枠はここだけ。** 複数の枠に色を付けると、どれが行動なのか読めない。
 * 期限切れは赤にする（概要タブのダイジェストと同じ判定 — 片方だけ灰色だと手遅れに気づけない）。
 *
 * ── 1つの段落にしない ──────────────────────────────────────
 *
 * 中身は自由文ですが、実際には**言い切り1文 ＋ 付随してやること数件**の形で
 * 書かれています（`nextAction.ts`）。1つの段落に太字で流し込むと**画面 10 行ぶんの
 * 塊**になり、しかも**期限が塊の最後**に付くので目に入りません
 * （利用者から「読みづらい」とご指摘）。
 *
 * - **見出しだけを太字**にする。全部太字は、太字を使っていないのと同じ
 * - **期限は見出しの直後**に置く。並びの後ろに回すと 10 行スクロールしないと読めない
 * - **並びは赤くしない。** 期限切れでも赤いのは枠と見出し（＝期限を持つ行）だけ。
 *   4行とも赤いと、何が期限切れなのか読めない
 */
function NextAction({ a, overdue }: { a: ActivityLog; overdue: boolean }) {
  const na = parseNextAction(a.next_action);
  return (
    <div className={cn(
      'rounded-note mt-3 flex items-start gap-2.5 border px-3 py-2.5',
      overdue ? 'border-destructive-border bg-destructive-surface' : 'border-primary-border bg-primary-surface',
    )}>
      <ArrowRight
        className={cn('mt-0.5 h-4 w-4 shrink-0', overdue ? 'text-destructive' : 'text-primary')}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sub break-words font-bold', overdue ? 'text-destructive' : 'text-foreground')}>
          <InlineText text={na.headline} />
          {/*
            **`text-sub-sm`(11.5px) を使わないこと。** スマホでも上げない段なので
            （件数の数字・列見出し・バッジの札のための段）、ここに当てると
            **期限切れの知らせが 375px で 11.5px** になる。数字だけは `font-number`
          */}
          {a.next_action_date && (
            <span className={cn('text-sub ml-2', overdue ? 'text-destructive' : 'text-primary')}>
              <span className="font-number">{shortYmd(a.next_action_date, a.activity_date)}</span>
              {' まで'}{overdue && '（過ぎています）'}
            </span>
          )}
          {/*
            ⚠️ **機械が閉じたものを「済み」と書かない**（migration 245）。
            案件が失注・完了に入ると、その案件のやることは自動で閉じる —
            **誰も片づけていない**ので「済み」は嘘になる。理由まで書いておけば、
            案件を戻せば開き直ることも察しがつく。改行させないので `whitespace-nowrap`
          */}
          {a.next_action_done_at && (
            <span className="text-sub ml-2 whitespace-nowrap text-muted-foreground">
              {autoClosedLabel(a.next_action_auto_closed_reason) ?? '済み'}
            </span>
          )}
        </p>

        {na.items.length > 0 && (
          <ul className="mt-1.5 flex flex-col gap-1">
            {na.items.map((it, i) => (
              <li key={`${it.marker ?? ''}-${i}`} className="text-sub flex gap-1.5 text-secondary-foreground">
                {/* 印は**原文に書かれていたものだけ**。無ければ `・` を描く（番号を作らない） */}
                <span aria-hidden="true" className="shrink-0 text-muted-foreground">{it.marker ?? '・'}</span>
                <span className="min-w-0 flex-1 break-words"><InlineText text={it.text} /></span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ThreadCard({ a, today, canEdit, onRedo, redoing }: {
  a: ActivityLog;
  today: string;
  canEdit?: boolean;
  /** 「この整形は違う」。待ち行列に戻し、`ai_corrections` に `reject` を残す */
  onRedo?: (id: string) => void;
  redoing?: boolean;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  const k = kindOf(a.activity_type);
  const KindIcon = k.icon;
  const s = readActivityStruct(a.body_struct);
  const overdue = a.next_action && !a.next_action_done_at
    && !!a.next_action_date && a.next_action_date < today;
  // 要点チップは v1 の欄。**構造がある行では出さない**（`facts` が同じ役割を担う）
  const points = s ? [] : (a.key_points ?? []);
  // **AI が整えたと言えるのは、整えた中身があるときだけ。** 「整え直す」を押した直後は
  // `ai_formatted` が立ったまま中身が空になるので、印だけで判定すると嘘になる
  const hasBody = !!s || !!a.body_html;
  /**
   * ⚠️ **「整った本文がある」と「AI が整えた」は別物**（レビューでの指摘 #93）。
   *
   * 前の版はどちらも `!!s || !!a.body_html` で判定していました。ところが
   * **`body_html` は人が書いた本文にも入ります**（AI を通していない古い記録）。
   * その行では:
   *
   * ・**「AI 整形」の札が出ます** — AI は一度も触っていないのに
   * ・**「整え直す」が出て、押しても何も起きません**。サーバーの待ち行列は
   *   `body_html IS NULL OR ai_formatted` を要求するので、
   *   **人が書いた本文の行は永久に対象になりません**（`PENDING_SQL`）。
   *   押すと `format_attempted_at` が消えるだけで、画面は1ドットも変わらず、
   *   「待っています」も出ません（それも `ai_formatted` を見ているため）
   *
   * **AI の印がある行だけ**を AI 扱いにします。
   */
  const aiFormatted = !!a.ai_formatted && hasBody;
  const waitingRedo = !!a.ai_formatted && !hasBody;

  return (
    <article className="rounded-card border border-border bg-card p-4 shadow-sm lg:p-5">
      <div className="flex items-start gap-3">
        <div className="text-sub min-w-0 flex-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          <span className="font-number">{a.activity_date}</span>
          <span className="inline-flex items-center gap-1.5">
            <KindIcon className="h-3.5 w-3.5" aria-hidden="true" />{k.label}
          </span>
        </div>
        {aiFormatted && (
          <span className="text-badge inline-flex shrink-0 items-center gap-1 rounded-badge bg-ai-surface px-1.5 py-0.5 font-bold text-ai">
            <Sparkles className="h-3 w-3" aria-hidden="true" />AI 整形
          </span>
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

      {s ? (
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
      ) : a.body_html ? (
        <div
          className="thread-body text-sub mt-3 text-secondary-foreground"
          // 保存時にサニタイズ済み（このファイルの冒頭を参照）
          dangerouslySetInnerHTML={{ __html: a.body_html }}
        />
      ) : a.description ? (
        // **整形前の本文も「読める形」で描く。** メール取込は素のテキストしか
        // 入れられない（MCP の `create_activity_log` は `description` だけ）ので、
        // ここは**まだ整えていない取込ぶんが必ず通る道**
        <div className="mt-3">
          <RichContent blocks={parseNoteText(a.description)} fallback={a.description} />
        </div>
      ) : null}

      {points.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
          {points.map((p, i) => (
            <span key={i} className="text-sub inline-flex items-center gap-1.5 text-secondary-foreground">
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />{p}
            </span>
          ))}
        </div>
      )}

      {a.next_action && <NextAction a={a} overdue={!!overdue} />}

      {waitingRedo && (
        <p className="text-sub mt-3 text-muted-foreground">
          整え直しの順番に入っています（毎晩 3:00 に自動で整えます）。それまでは打った文のまま出ます。
        </p>
      )}

      {/* **整形の元になった文に戻れる。** 直しようがない状態にしない */}
      {a.ai_formatted && a.description && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 border-t border-border-faint pt-2">
          <button
            type="button"
            onClick={() => setShowOriginal((v) => !v)}
            aria-expanded={showOriginal}
            className="text-sub min-h-tap inline-flex items-center gap-1 text-muted-foreground hover:text-foreground lg:min-h-[28px]"
          >
            打った文をみる
            {showOriginal
              ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
          {/*
            **「この整形は違う」を押せるようにする。** v2 は AI が「誰の発言か」まで
            決めるので、取り違えると**当社が答えたことが取引先の発言として残ります**。
            押すと待ち行列に戻り、押した事実は `ai_corrections` に `reject` で残る
            （会社方針「AI を使い捨てにしない」の条件2）
          */}
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
          {showOriginal && (
            <p className="text-note rounded-note mt-1 whitespace-pre-line border border-border-subtle bg-surface-subtle px-3 py-2 text-muted-foreground">
              {a.description}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
