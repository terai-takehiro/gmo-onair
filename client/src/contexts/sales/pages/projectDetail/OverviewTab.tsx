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
 *
 * ── 事実の帯はスマホ専用のカード積みにした（v4ネイティブUI監査・この回） ──
 *
 * 監査時点では PC/スマホ共通の1つの実装で、モックの「2段組・区切り線つきの帯」
 * を375pxでもそのまま描いていました。**2列グリッドに `border-l`（列の区切り線）
 * を付ける実装は、3列目以降の行の先頭（2枚目の行の左端）にも区切り線が出て
 * しまいます**（`first:border-l-0` はDOM上の最初の1枚にしか効かないため）。
 * 行の境目のはずが列の境目に見える、というPC専用の想定を持ち込んだ結果の
 * 見た目の崩れでした。
 *
 * スマホでは**縦積みのカード**（区切り線ではなく1枚ずつ枠で囲む）に描き直し、
 * PC は従来の2段組・区切り線のままにしています。**中身（何を出すか）は
 * 1つも変えていません** — `Fact` の呼び出し順・渡す値は共通です。
 */
import { CalendarDays, MapPin, Wallet, CalendarClock, Building2, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { BoxLogo } from '@/components/BoxLogo';
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import { localDateStr, formatShortDate } from '@/lib/format';
import { GlsNumberField } from './glsGuide';
import { classificationText } from './classificationText';
import { channelLabel } from '../projectList/intake';
import { ENTITY_BADGE_LABEL } from '../projectList/stages';
import { AiReviewBanner } from './AiReviewBanner';
import { ThreadDigest } from './ThreadDigest';
import { nextActionLine, parseNextAction } from './thread/nextAction';
/** 期限の書き方は**やり取りタブ・概要のダイジェストと同じ1本**（`dueText`） */
import { dueText } from './thread/NextActionNote';
import { venueSummary, venuesOf, venueLine } from './venue';
import { Fact, Section, Field } from './overviewParts';
import type { ProjectDetail, StudioBooking, ActivityLog } from './types';

export function OverviewTab({
  project, bookings, activities, activityTotal, mobile,
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
  /**
   * スマホ。**薄い親（`ProjectDetailPage`）が1回だけ呼んだ `useIsMobile()` を渡す**
   * （このタブでは呼び直さない）。事実の帯だけカード積みに切り替える
   */
  mobile?: boolean;
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
  // 期限超過の判定に使う。やり取りタブと同じ作り方にそろえる
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
  /**
   * 期限超過かどうか。**色を付けるのは文字だけ**（今回の設計方針で面は塗らない）。
   * 判定はやり取りタブと同じ（`next_action_date < 本日`）。
   */
  const nextActionOverdue = !!nextAction?.next_action_date && nextAction.next_action_date < today;

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

          ⚠️ **モックは4列だが、「次のアクション」だけ1行ぶん使う**
          （`docs/v4-mock-deviations.md` に記録）。モックの値は「田中：見積を送る」の
          **8文字**だが、本番に入っている言い切りの1文は
          「★8/14(金)までに 8/28分の備品レンタル発注可否を確定し発注する(…)」で
          **40〜60文字**ある。4列だと1枠 200px（12〜13文字）で、**2行に折り返しても
          半分以上が読めない**（利用者からのご指摘。実測で確認）。
          幅をやるほうが、文を縮めたり隠したりするより素直
        */}
        <div
          className={mobile
            ? 'flex flex-col gap-2'
            : 'grid grid-cols-2 gap-y-4 rounded-card border border-border bg-card px-1 py-4 lg:grid-cols-3'}
        >
          <Fact icon={CalendarDays} label="実施日" mobile={mobile}>
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
          <Fact icon={MapPin} label="会場・スタジオ" mobile={mobile}>
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
          <Fact icon={Wallet} label={isEstimate ? '見積金額' : '想定金額'} mobile={mobile}>
            {/*
              見積がまだ無い案件は想定金額を薄字で出す（一覧と同じ見せ方）。
              **`inline`** は「¥ を数字のすぐ左に付ける」指定（モックの帯は `gap:4px`）。
              既定は列で桁をそろえる形なので、枠いっぱいに ¥ と数字が引き離される
              — 縦に1つしか無いここでは円記号だけが遠くに見えていた（ご指摘）

              ⚠️ **ラベルも値の出どころで出し分ける**（UXレポート指摘）。以前は常に
              「見積金額」と出ており、見積タブの「見積はまだありません」と矛盾して見えた
              （名前は「想定金額」だけにして、注記は値の下へ移した）
            */}
            <Money inline value={amount} className={cn('text-list', !isEstimate && 'text-muted-foreground')} />
            {!isEstimate && <p className="text-sub-sm text-muted-foreground">見積はまだありません</p>}
          </Fact>
          {/*
            **1行ぶんまるごと使う**（上記）。PC は行の頭に来るので左の罫線を消し、
            上に細い罫線を引いて「別の段」だと分かるようにする。**スマホは他のカードと
            同じ縦積みの1枚**なので、その位置合わせの `className` は渡さない
          */}
          <Fact
            icon={CalendarClock}
            label="次のアクション"
            mobile={mobile}
            className={mobile ? undefined : 'col-span-2 border-l-0 border-t border-border-faint pt-3 lg:col-span-3'}
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
                    ほか <span className="font-number">{subTasks}</span> 件（すべて表示）
                  </Link>
                )}
                {/*
                  ⚠️ **期限は `YYYY-MM-DD` のまま出さない**（利用者のご指摘・`docs/wording.md`）。
                  **「期限 9/18（4日超過）」**の形にそろえる（やり取りタブ・概要の
                  ダイジェストと同じ1本 = `dueText`）。日付だけだと、**それが
                  期限超過なのか来週なのかが読み取れません**。
                */}
                <p className={cn(
                  'text-sub-sm font-number',
                  nextActionOverdue ? 'font-bold text-destructive' : 'text-muted-foreground',
                )}>
                  {dueText(nextAction, today)}
                </p>
                {/*
                  **直す道をここから1本出す**（ご指摘3）。
                  完了・延期・編集・削除はやり取りタブの行の中にあります。
                  概要から辿れないと、関係なくなった行がここに出続けたまま片づきません
                */}
                <Link
                  to={`/sales/projects/${project.id}/thread`}
                  className="text-sub-sm min-h-tap inline-flex items-center text-primary hover:underline lg:min-h-0"
                >
                  完了・延期・編集
                </Link>
              </>
            ) : (
              <span className="text-sub text-muted-foreground">次のアクションは未設定</span>
            )}
          </Fact>
        </div>

        {/*
          並びは**登録の16項目と同じ**にしてある（`projectNew/fields.ts`）。
          入れた順に読めないと、どこに入れた値なのかを検索ことになる。
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
          <Field label="回のある案件か">
            {project.recurrence === 'regular' ? 'レギュラー（回を持つ）' : '単発'}
          </Field>
          {/* **無観客の案件には来場人数を出さない**（人が来ないので欄ごと意味が無い） */}
          {project.audience !== 'no_audience' && (
            <Field label="来場人数">
              {project.attendee_count ? <><span className="font-number">{project.attendee_count}</span> 名</> : null}
            </Field>
          )}
          <Field label="案件内容">{project.goal}</Field>
          <Field label="どこから来た話か">{channelLabel(project.intake_channel) === '—' ? null : channelLabel(project.intake_channel)}</Field>
          <Field label="管理番号">
            <GlsNumberField glsNumber={project.gls_number} stage={project.stage} />
          </Field>
          {/* 計上会社（2026年10月の事業再編）。未導出（null）は `Field` 既定の「—」に任せる */}
          <Field label="計上会社">
            {project.entity_code ? ENTITY_BADGE_LABEL[project.entity_code] : null}
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
          ⚠️ **見出しは「押さえている部屋」→「予約済みの日程」**（UXレポート指摘）。
          場所が空の行の「場所が未設定」と矛盾して読めていたため
        */}
        <Section title="予約済みの日程">
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
          **タグの節は 2026-08-27 の棚卸しで削除した**（Phase B・ユーザー判断。
          `docs/project-ledger-simplification-plan.md` §5 の `tags`）。v4 は入力欄も
          絞り込む口も持たず、v3 で付いた値を読むためだけにこの節が残っていたが、
          育てる（正式なタグ管理UIを作る）よりも列ごと廃止することを選んだ。
        */}

        {/*
          **「最後の更新」はヘッダーの1段目へ移しました**（指示書 第5章）。
          どのタブでも同じ位置に出したいものなので、概要タブの末尾に置くと
          他のタブでは見えません
        */}
      </div>
    </div>
  );
}
