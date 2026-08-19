/**
 * 案件詳細 / 概要タブ (v4 ⑥)
 *
 * モックは **左に本文・右に 320px の欄**の2段組で、上に「事実の帯」を置きます。
 * 事実の帯に出すのは**その案件で真っ先に確認されるもの**だけ:
 * 実施日 / 会場・スタジオ / 金額 / 次にやること。
 *
 * ── 直すのはここではありません ────────────────────────────
 *
 * この画面は**読む場所**です。直すのは見出しの鉛筆から入る編集画面
 * (`/sales/projects/:id/edit`)。1つの画面で読むと直すを兼ねると、
 * 入力欄が並ぶだけになって「いまどうなっているか」が読み取れなくなります
 * (いまの 2,178 行の画面がまさにそれでした)。
 */
import { CalendarDays, MapPin, Wallet, CalendarClock, Building2, Tag, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { BoxLogo } from '@/components/BoxLogo';
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import { localDateStr, formatShortDate } from '@/lib/format';
import { GlsNumberField } from './glsGuide';
import { classificationText } from './classificationText';
import { channelLabel } from '../projectList/intake';
import { AiReviewBanner } from './AiReviewBanner';
import { ThreadDigest } from './ThreadDigest';
import { nextActionLine, parseNextAction } from './thread/nextAction';
import { venueSummary, venuesOf, venueLine } from './venue';
import type { ProjectDetail, StudioBooking, ActivityLog } from './types';

/**
 * 事実の帯の1枠。
 *
 * `className` は**枠の取り方を変えるためだけ**に渡す（「次にやること」は
 * 1行ぶんまるごと使う。下記「なぜ4列にしないか」）。中身の書き方は渡す側が決めない
 */
function Fact({
  icon: Icon, label, children, className,
}: { icon: typeof CalendarDays; label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0 border-l border-border-subtle px-4 first:border-l-0', className)}>
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="text-sub-sm text-muted-foreground">{label}</span>
      </div>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-card">
      <h2 className="text-cardtitle border-b border-border-subtle px-4 py-3">{title}</h2>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

/** 名前と値が縦に並ぶ表。**値が無い行も残す** (無いことが分かるように) */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-border-faint py-2 last:border-b-0">
      <span className="text-sub w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="text-sub min-w-0 flex-1 text-foreground">{children || <span className="text-muted-foreground">—</span>}</span>
    </div>
  );
}

export function OverviewTab({
  project, bookings, activities, activityTotal,
}: {
  project: ProjectDetail;
  bookings: StudioBooking[];
  activities: ActivityLog[];
  /**
   * ⚠️ **やり取りの総数**（レビューでの指摘 #90）。並んでいる行の数ではありません。
   * 引いているのは 20 件までなので、`activities.length` を出すと
   * **どの案件も「20件」**になります（実データで 45 件の案件が 20 件と出ていました）。
   * 「すべて見る（N件）」は**押す前に量が分かる**ための数字なので、
   * ここが頭打ちだと「全部見た」と思って開かなくなります。
   */
  activityTotal?: number;
}) {
  /*
   * 事実の帯の3つ目は**見積金額**（モックの指定）。
   * **一覧と同じ数え方**にそろえる — 見積があればその額、まだ無ければ
   * 想定金額を薄字で出す（`ProjectRows` と同じ）。ここで別の計算を書くと、
   * 同じ案件が一覧と詳細で違う額になる。
   */
  const estimate = Number(project.estimate_amount) || 0;
  const expected = Number(project.expected_amount) || 0;
  const amount = estimate > 0 ? estimate : expected > 0 ? expected : null;
  const isEstimate = estimate > 0;
  // 期限切れの判定に使う。やり取りタブと同じ作り方にそろえる
  const today = localDateStr(new Date());

  // 未完了で期限がいちばん近い次回アクション。**無いことも出す** (空欄にしない)
  const nextAction = activities
    .filter((a) => a.next_action && !a.next_action_done_at)
    .sort((a, b) => (a.next_action_date ?? '9999').localeCompare(b.next_action_date ?? '9999'))[0];

  /**
   * ぶら下がっている作業の数（原文の `①②③…`）。**帯には出せないので数だけ出す**
   * （レビューでの指摘 #97）。数え方は**やり取りタブと同じ関数**を通す —
   * 書き写すと、同じ記録が画面によって違う件数になる。
   */
  const subTasks = nextAction ? parseNextAction(nextAction.next_action).items.length : 0;

  /*
   * 会場。**予約が持っているのは `rooms[]`（部屋マスター）と `location_note`（外現場）**の
   * 2つだけで、`room_name` という項目は返ってきません（`venue.ts` の冒頭に経緯）
   */
  const venue = venueSummary(bookings);
  const venueTitle = venuesOf(bookings).map((v) => v.name).join('・');

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-6">
      <div className="flex min-w-0 flex-col gap-3.5">
        {/*
          AI が作った案件だけに出る帯。**「確認した」はここにしかありません** —
          押されるまで「まだ誰も見ていない案件」として待ち行列に残ります。
        */}
        {project.is_ai_created && (
          <AiReviewBanner projectId={project.id} reviewedAt={project.ai_reviewed_at} />
        )}

        {/*
          事実の帯。

          ⚠️ **モックは4列だが、「次にやること」だけ1行ぶん使う**
          （`docs/v4-mock-deviations.md` に記録）。モックの値は「田中：見積を送る」の
          **8文字**だが、本番に入っている言い切りの1文は
          「★8/14(金)までに 8/28分の備品レンタル発注可否を確定し発注する(…)」で
          **40〜60文字**ある。4列だと1枠 200px（12〜13文字）で、**2行に折り返しても
          半分以上が読めない**（利用者からのご指摘。実測で確認）。
          幅をやるほうが、文を縮めたり隠したりするより素直
        */}
        <div className="grid grid-cols-2 gap-y-4 rounded-card border border-border bg-card px-1 py-4 lg:grid-cols-3">
          <Fact icon={CalendarDays} label="実施日">
            {/* **`flex-wrap` が要る。** 期間(201px)は枠に入らず**隣の会場に重なって終了日が
                読めない**（実測: 1024px で枠 127px に 90px・375px で 51px はみ出す。ページは
                横スクロールしないので気づけない）。日付は `whitespace-nowrap` のまま割れない */}
            <DateRange start={project.event_start} end={project.event_end} className="text-list flex-wrap" />
          </Fact>
          {/*
            会場は**予約の `rooms[]` と `location_note`** から組み立てる（`venue.ts`）。
            ここは `b.room_name ?? b.location_name` を読んでいて、**サーバーがその
            どちらも返さないので必ず「部屋 未設定」**になっていました（ご指摘）。
            **札を並べるのをやめてモックの形（先頭1つ ＋ 「ほか N室」）**にしたのは、
            札を4つ並べると1枠 250px では2行目以降が読めず、しかも会場の1つ目が
            どれなのか分からなくなるため
          */}
          <Fact icon={MapPin} label="会場・スタジオ">
            {venue ? (
              <>
                <p className="text-list truncate" title={venueTitle}>{venue.first}</p>
                {venue.extra > 0 && (
                  <p className="text-sub-sm text-muted-foreground">ほか {venue.extra}{venue.unit}</p>
                )}
              </>
            ) : (
              /*
                **「押さえていない」と「押さえたが場所が入っていない」は別**。
                前者は予約を取るところから、後者は予約を開いて部屋を選ぶだけ
              */
              <span className="text-sub text-muted-foreground">
                {bookings.length === 0 ? '押さえていません' : '場所が未設定'}
              </span>
            )}
          </Fact>
          <Fact icon={Wallet} label={isEstimate ? '見積金額' : '想定金額（見積未確定）'}>
            {/*
              見積がまだ無い案件は想定金額を薄字で出す（一覧と同じ見せ方）。
              **`inline`** は「¥ を数字のすぐ左に付ける」指定（モックの帯は `gap:4px`）。
              既定は列で桁をそろえる形なので、枠いっぱいに ¥ と数字が引き離される
              — 縦に1つしか無いここでは円記号だけが遠くに見えていた（ご指摘）

              ⚠️ **ラベルも値の出どころで出し分ける**（UXレポート指摘）。以前は常に
              「見積金額」と出ており、見積タブの「見積はまだありません」と矛盾して見えた
            */}
            <Money inline value={amount} className={cn('text-list', !isEstimate && 'text-muted-foreground')} />
          </Fact>
          {/*
            **1行ぶんまるごと使う**（上記）。行の頭に来るので左の罫線は消し、
            上に細い罫線を引いて「別の段」だと分かるようにする
          */}
          <Fact
            icon={CalendarClock}
            label="次にやること"
            className="col-span-2 border-l-0 border-t border-border-faint pt-3 lg:col-span-3"
          >
            {nextAction ? (
              <>
                {/*
                  **AI が作った「この枠に収まる一文」を出す**（migration 190・ご指示）。
                  本番の言い切り1文は 40〜60 字あり、枠を1行ぶんに広げてもスマホでは
                  収まりません。規則で切ると必ず途中で切れるので、
                  `next-action-short.service` が 28 字以内の一文を作って持っています。

                  **まだ作られていない行（取り込んだ直後・毎晩 3:10 に作る）では
                  規則で作った見出しに落ちます**（`nextActionLine`）。
                  `line-clamp` は残す — 落ちた先は長いので、**画面の最後の守り**として要る。
                  **全文は `title` と、やり取りタブで並びのまま読める**
                */}
                <p className="text-sub line-clamp-3 font-bold lg:line-clamp-2" title={nextAction.next_action ?? ''}>
                  {nextActionLine(nextAction)}
                </p>
                {/*
                  ⚠️ **ぶら下がる作業の数を出す**（レビューでの指摘 #97）。
                  ここに出るのは**言い切りの1文だけ**で、原文にぶら下がっている
                  「①…②…③…」は出しません（帯に入りません）。数も出さないと、
                  **やることは1つだと読まれます** — 実データでは1件の記録に
                  3〜5件ぶら下がっているので、**残りは誰にも見えないまま**でした。
                  「ほか N 件」を押すとやり取りタブで全部読めます。
                */}
                {subTasks > 0 && (
                  <Link
                    to={`/sales/projects/${project.id}/thread`}
                    className="text-sub-sm min-h-tap inline-flex items-center text-primary hover:underline lg:min-h-0"
                  >
                    ほか <span className="font-number">{subTasks}</span> 件（全部読む）
                  </Link>
                )}
                {nextAction.next_action_date && (
                  <p className="text-sub-sm font-number text-muted-foreground">{nextAction.next_action_date}</p>
                )}
              </>
            ) : (
              <span className="text-sub text-warning">決まっていません</span>
            )}
          </Fact>
        </div>

        {/*
          並びは**登録の16項目と同じ**にしてある（`projectNew/fields.ts`）。
          入れた順に読めないと、どこに入れた値なのかを探すことになる。
          `Field` は中身が空なら「—」を出すので、空欄でも列がずれない
        */}
        <Section title="この案件のこと">
          <Field label="お客様">{project.customer_name}</Field>
          <Field label="ご担当">{project.contact_name}</Field>
          {/*
            **案件分類は2段**（migration 182）。**出すか出さないかの決めごとは
            `classificationText.ts`** にあります — 旧「案件種類」を出す条件を
            間違えると、**決めていない案件がこの画面だけ登録済みに見え**、
            案件を直す画面では未登録になります（実際にご指摘をいただいた形）。
          */}
          <Field label="案件分類">{classificationText(project)}</Field>
          <Field label="継続区分">
            {project.recurrence === 'regular' ? 'レギュラー（回を持つ）' : '単発'}
          </Field>
          {/* **無観客の案件には来場人数を出さない**（人が来ないので欄ごと意味が無い） */}
          {project.audience !== 'no_audience' && (
            <Field label="来場人数">
              {project.attendee_count ? <><span className="font-number">{project.attendee_count}</span> 名</> : null}
            </Field>
          )}
          <Field label="案件内容">{project.goal}</Field>
          {/*
            **返事の期限と求められているものは、案件作成のフォームから外しました。**
            列は残っているので、**すでに入っている案件では読めるようにしておきます**
            （新しい案件には入りません）。空の案件では欄ごと出しません
          */}
          {project.reply_due && (
            <Field label="返事の期限"><span className="font-number">{project.reply_due}</span></Field>
          )}
          {project.wants && <Field label="求められているもの">{project.wants}</Field>}
          <Field label="リード経路">{channelLabel(project.intake_channel) === '—' ? null : channelLabel(project.intake_channel)}</Field>
          <Field label="GLS 番号">
            <GlsNumberField glsNumber={project.gls_number} stage={project.stage} />
          </Field>
          <Field label="社内コード">{project.code}</Field>
          {/*
            **メモの行は外しました**（migration 184）。メモという入れ物をやめて
            やり取りに一本化したので、`projects.notes` の列そのものがありません。
            社内の書き置きは、やり取りタブで「メモ」として同じ時系列に並びます
          */}
        </Section>

        <Section
          title={
            <span className="flex items-baseline justify-between gap-3">
              <span>お客様とのやり取り</span>
              {activities.length > 0 && (
                /*
                  ⚠️ **タブは URL の区間で持っています**（`/sales/projects/:id/:tab`）。
                  `?tab=thread` と書くと**アドレスだけ変わってタブは動きません** —
                  押しても何も起きないリンクに見えます（実際そうなっていました）。
                  クエリで持っていた頃の書き方が残っていたものです。
                */
                <Link
                  to={`/sales/projects/${project.id}/thread`}
                  className="text-note min-h-tap inline-flex items-center text-primary hover:underline lg:min-h-0"
                >
                  すべて見る（{activityTotal ?? activities.length}件）
                </Link>
              )}
            </span>
          }
        >
          {activities.length === 0 ? (
            <p className="text-sub text-muted-foreground">
              記録はまだありません。メールは AI が自動で取り込みます。
            </p>
          ) : (
            <ThreadDigest items={activities.slice(0, 5)} today={today} />
          )}
        </Section>
      </div>

      {/* 右の欄。スマホでは本文の下に回ります */}
      <div className="flex flex-col gap-3.5">
        {/*
          **「BOX」という文字は併記しません**（指示書 第6章）。ロゴ＋行き先で足ります。
          文字を並べると同じことを2回言うことになり、行が長くなります
        */}
        <Section title={<BoxLogo className="h-3.5 w-auto" />}>
          {project.box_url_internal || project.box_url_external ? (
            <div className="flex flex-col gap-2">
              {project.box_url_internal && (
                <a href={project.box_url_internal} target="_blank" rel="noopener noreferrer"
                   className="text-sub inline-flex min-h-tap items-center gap-1.5 text-primary hover:underline lg:min-h-[36px]">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />社内限りのフォルダ
                </a>
              )}
              {project.box_url_external && (
                <a href={project.box_url_external} target="_blank" rel="noopener noreferrer"
                   className="text-sub inline-flex min-h-tap items-center gap-1.5 text-primary hover:underline lg:min-h-[36px]">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />社外と共有するフォルダ
                </a>
              )}
            </div>
          ) : (
            <p className="text-sub text-muted-foreground">まだ作られていません。GLS を発番すると作られます。</p>
          )}
        </Section>

        {/*
          事実の帯と**同じ組み立て**（`venue.ts`）を使う。ここも
          `b.room_name ?? b.location_name` で「部屋 未設定」だけが並び、
          しかも日付は**存在しない `booking_date`** を描いていたので**空行**でした
          ⚠️ **見出しは「押さえている部屋」→「押さえている予定」**（UXレポート指摘）。
          場所が空の行の「場所が未設定」と矛盾して読めていたため
        */}
        <Section title="押さえている予定">
          {bookings.length === 0 ? (
            <p className="text-sub text-muted-foreground">押さえていません。</p>
          ) : (
            <ul className="flex flex-col">
              {bookings.map((b) => (
                <li key={b.id} className="flex gap-2 border-b border-border-faint py-2 last:border-b-0">
                  <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="text-sub block truncate font-bold">
                      {venueLine(b) ?? <span className="font-normal text-muted-foreground">場所は未入力（予約はあります）</span>}
                    </span>
                    {/* 日付は `start_time`（`YYYY-MM-DDTHH:mm`）から。終日の予約は時刻を出さない */}
                    <span className="text-sub-sm font-number block text-muted-foreground">
                      {formatShortDate(b.start_time)}
                      {!b.all_day && b.start_time.length > 10 ? ` ${b.start_time.slice(11, 16)}` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/*
          **タグは付いている案件にだけ出します**（v3 の置き土産）。
          v4 は入力欄を外し（モックどおり）、**絞り込む口も画面に1つも
          ありません**。空でも節を出していたので、ほぼ全部の案件で
          「タグ：付いていません。」という**永久に埋まらない枠**が並んでいました。
          **列と、すでに入っている値は消しません** — v3 で付けたタグを
          読む場所がここしか無いためです。
        */}
        {project.tags && (
          <Section title="タグ">
            <div className="flex flex-wrap gap-1.5">
              {project.tags.split(',').filter(Boolean).map((t) => (
                <span key={t} className="text-sub inline-flex items-center gap-1 rounded-chip bg-muted px-2.5 py-1">
                  <Tag className="h-3 w-3 text-muted-foreground" aria-hidden="true" />{t}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/*
          **「最後の更新」はヘッダーの1段目へ移しました**（指示書 第5章）。
          どのタブでも同じ位置に出したいものなので、概要タブの末尾に置くと
          他のタブでは見えません
        */}
      </div>
    </div>
  );
}
