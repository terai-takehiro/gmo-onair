/**
 * 案件詳細の頭 (v4 ⑥) — 一覧に戻る / 案件名 / ステージ / タブ
 *
 * ── どのタブでも同じ位置に出しつづける ──────────────────────
 *
 * モックの言葉そのままです:
 * 「まわりのヘッダー (一覧に戻る・案件名・ステージ・タブ) は、
 *   どのタブでも同じ位置に出しつづけます」。
 * タブごとに見出しの高さが変わると、タブを切り替えるたびに本文が上下に跳ねて
 * **読んでいた場所を見失います**。だからここは1か所にまとめて、
 * タブは中身だけを差し替えます。
 *
 * ── ステージは「押して変える」ものにしてある ────────────────
 *
 * モックは E→D→C→B→A を横に並べ、いまの段だけ名前を出します。
 * 状態を見る場所と変える場所を分けると、**変えたあとに見に戻る**ことになるので
 * 同じ場所にしました。押すと確認を出します (`confirmAction`) — ステージは
 * 売上の見込みと連動していて、取り違えると数字が動くためです。
 *
 * ── PC は固定2段。**選んでも動かない** ──────────────────────
 *
 * 前は タブとステージ帯を1行に並べていました。入り切らないので横スクロールになり、
 * さらに**選択中のステージだけ名前を出していた**ので、押すたびに帯の幅が動いて
 * タブの位置がずれました（押した先が別のタブになる）。
 *
 * 行数と高さを決め打ちます:
 *   1段目（42px）ラベル「ステージ」＋ E〜A の5つ（**各104px の等幅**）
 *                ＋ 完了・失注（各60px）＋ 右端に「最後の更新」
 *   2段目（44px）タブを**均等割り**（`flex:1`）。横スクロールにしない
 *
 * ステージは**常に「E 問合せ」のように記号＋名前**を出します。
 * 幅が変わらないので、選んでも1pxも動きません。
 *
 * ── 「完了」と「失注」を別の組にして必ず出す ──────────────────
 *
 * 最初は E〜A の5段だけを出し、終わった案件では帯ごと消して名前を書いていました。
 * ところが**この画面から「完了にする」「失注にする」ができない**ので、
 * 終わらせるためだけに編集画面（旧フォームのステージ変更カード）を開く必要があり、
 * そのカードを外すと**終わらせる手段が画面から消えます**。
 *
 * そこで終わり方2つを**別の組**として右に並べました。E〜A と続けて並べると
 * 「A の次が完了」という順路に見えますが、実際は途中のどこからでも失注しますし、
 * 完了は受注のあとに来ます。組を分けて、区切りを挟んであります。
 *
 * 終わった案件では E〜A のどれも光りません（居ないので嘘になる）。押せば戻せます —
 * 戻すのは間違いを直すときなので、確認の文面で「終わった案件を進行中に戻す」と伝えます。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Plus, AlarmClock } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useRail } from '@gmo-onair/shared/src/client-v4/rail';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/platform/AuthContext';
import { SnoozeDialog, useSnooze } from '../projectList/snooze';
import { PROJECT_TABS, MOBILE_TABS_BY_PHASE, type ProjectPhase, type ProjectTabKey } from './tabs';
import { ProjectStageLabels, type ProjectStage } from '@/types';

/** ステージの並び。モックと同じ「問合せ → 受注」。終わったもの2つは横に並べない */
const STAGE_STEPS: { stage: ProjectStage; key: string }[] = [
  { stage: 'neta', key: 'E' },
  { stage: 'd_hold', key: 'D' },
  { stage: 'c_proposal', key: 'C' },
  { stage: 'b_verbal', key: 'B' },
  { stage: 'a_won', key: 'A' },
];

/**
 * 終わり方。**E〜A の続きではない**ので組を分ける
 * (失注は途中のどこからでも起きるし、完了は受注のあとに来る)。
 */
const END_STEPS: { stage: ProjectStage; label: string }[] = [
  { stage: 's_completed', label: '完了' },
  { stage: 'e_lost', label: '失注' },
];

/**
 * ステージ帯の寸法（指示書 第5章の指定）。**7段の列幅とは別の物差し**です —
 * 表の列ではなく、**選んでも動かないための等幅**なので、
 * 「E 問合せ」〜「A 受注済」が同じ幅で収まる値を決め打ちます。
 */
const STAGE_W = 'w-[104px]';  // ui-tokens-ok: E〜A の5つを等幅にする（記号＋名前が入る幅）
const END_W = 'w-[60px]';     // ui-tokens-ok: 完了・失注。2文字ぶん

/** ステージの短い名前 (押せる帯に入る長さ) */
const STAGE_SHORT: Record<string, string> = {
  neta: '問合せ', d_hold: '仮押さえ', c_proposal: '見積提案', b_verbal: '口頭決定', a_won: '受注済',
};

export interface DetailHeaderProps {
  id: string;
  name: string;
  customerName: string | null;
  glsNumber: string | null;
  code: string | null;
  stage: ProjectStage;
  tab: ProjectTabKey;
  counts: Partial<Record<ProjectTabKey, number>>;
  onChangeStage: (next: ProjectStage) => void;
  /** スマホ。タブを3つに絞り、上辺のボタン1つを畳む */
  mobile?: boolean;
  /** 案件の段階。**スマホのタブの組**を決める（PC は7タブのまま変えない） */
  phase: ProjectPhase;
  /** 最後の更新。**1段目の右端**に出す（概要タブの右カラムから移した） */
  updatedAt?: string | null;
}

export function DetailHeader({
  id, name, customerName, glsNumber, code, stage, tab, counts,
  onChangeStage, mobile, phase, updatedAt,
}: DetailHeaderProps) {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('sales', 'editor');
  const [snoozeOpen, setSnoozeOpen] = useState(false);

  /**
   * スヌーズの状態（docs/core-redesign-plan.md §3-1）。props を増やさず、
   * **ページと同じ鍵**（`['project', id]`）でキャッシュから読む — 同じ鍵なので
   * 追加のリクエストは飛ばず、`useSnooze` の invalidate でここも一緒に更新される。
   */
  const { data: p } = useQuery<{ health?: string; snooze_until?: string | null }>({
    queryKey: ['project', id],
    queryFn: async () => (await api.get(`/projects/${id}`)).data.data,
    enabled: !!id,
  });
  const snoozed = p?.health === 'snoozed' && !!p?.snooze_until;
  const snooze = useSnooze(id);

  /**
   * ステージ帯はレール（掴んで滑らせる・続きがある側だけ端が溶ける）。
   * スマホでは B 以降が画面外に描かれるので、**マウント時に現在のステージを
   * 視野の中央へ寄せる** — 寄せないと初期表示でこの案件のステージが読めない
   * （完了・A 受注済の案件で実測）。
   */
  const rail = useRail();
  const bandRef = useRef<HTMLDivElement | null>(null);
  const setBandRef = useCallback((el: HTMLDivElement | null) => {
    bandRef.current = el;
    rail.ref(el);
  }, [rail.ref]);
  useEffect(() => {
    bandRef.current
      ?.querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest' });
    // マウント時だけ。開いたあとの変更は本人が押したボタン＝すでに視野の中
  }, []);

  const mobileKeys = MOBILE_TABS_BY_PHASE[phase];
  const tabs = PROJECT_TABS
    // **スマホは3つだけ。** 7タブを 375px に並べると1つ 40px 弱になり押し分けられない
    .filter((t) => !mobile || mobileKeys.includes(t.key));

  return (
    <div className="border-b border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 px-4 pb-3 pt-3.5 lg:px-6">
        <Link
          to="/sales/projects"
          aria-label="案件一覧に戻る"
          className="min-h-tap min-w-tap flex h-11 w-11 shrink-0 items-center justify-center rounded-control-lg border border-border hover:bg-muted lg:h-10 lg:w-10 lg:min-h-0 lg:min-w-0"
        >
          <ArrowLeft className="h-4 w-4 text-secondary-foreground" aria-hidden="true" />
        </Link>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {/* **スマホでは案件名を折り返す。** 似た名前の案件を truncate で見分けられない */}
          <h1 className={mobile ? 'text-h1 min-w-0 [overflow-wrap:anywhere]' : 'text-h1 min-w-0 truncate'} title={name}>{name}</h1>
            <button
              type="button"
              onClick={() => navigate(`/sales/projects/${id}/edit`)}
              aria-label="案件の内容を直す"
              title="案件の内容を直す"
              className="min-h-tap min-w-tap flex h-11 w-11 shrink-0 items-center justify-center rounded-control-md hover:bg-muted lg:h-9 lg:w-9 lg:min-h-0 lg:min-w-0"
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            </button>
          </div>
          <p className="text-sub mt-0.5 truncate text-muted-foreground">
            {customerName || 'お客様 未設定'}
            {(glsNumber || code) && ` ・ ${glsNumber || code}`}
          </p>
        </div>

        {/*
          **「打合せを録音」はここから外しました**（指示書 1-5）。
          トップページの投入口に同じ機能があり、案件詳細のヘッダーにも置くと
          **同じことをする入口が2つ**になります。案件の中で録るときは
          やり取りタブの書く枠にある「録音から起こす」を使います。

          **スマホでは「タスクを追加」も出しません。** タスクタブの中に同じものがあります。
        */}
        {!mobile && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button onClick={() => navigate(`/sales/projects/${id}/task`)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />タスクを追加
          </Button>
        </div>
        )}
      </div>

      {/*
        ── 1段目（PC 42px・スマホ 52px）: ステージ ─────────────────
        **各104px の等幅**。記号＋名前を常に出すので、選んでも幅が変わりません。
        スマホでは横に並べきれないので、**押せる帯のままレール**にします
        （畳んでシートにすると、ステージを変えるのに2タップ増えます）。
        スマホはタップ 44px（`h-11`）が要るぶん帯を 52px に広げます。
      */}
      <div
        ref={setBandRef}
        onScroll={rail.onScroll}
        style={rail.style}
        className="v4-rail flex min-h-[52px] items-center gap-2 overflow-x-auto px-4 lg:min-h-0 lg:h-[42px] lg:px-6"
      >
        <span className="text-note shrink-0 font-bold text-muted-foreground">ステージ</span>
        <div className="inline-flex shrink-0 overflow-hidden rounded-control border border-border" role="group" aria-label="ステージを変える">
          {STAGE_STEPS.map((st, i) => {
            const on = st.stage === stage;
            return (
              <button
                key={st.key}
                type="button"
                onClick={() => { if (!on) onChangeStage(st.stage); }}
                aria-pressed={on}
                className={`text-sub inline-flex h-11 lg:h-8 ${STAGE_W} shrink-0 items-center justify-center gap-1.5 ${
                  i > 0 ? 'border-l border-border' : ''
                } ${on ? 'bg-primary font-bold text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                <span className="font-number">{st.key}</span>
                {STAGE_SHORT[st.stage]}
              </button>
            );
          })}
        </div>

        <div className="inline-flex shrink-0 overflow-hidden rounded-control border border-border" role="group" aria-label="案件を終わらせる">
          {END_STEPS.map((st, i) => {
            const on = st.stage === stage;
            const lost = st.stage === 'e_lost';
            return (
              <button
                key={st.stage}
                type="button"
                onClick={() => { if (!on) onChangeStage(st.stage); }}
                aria-pressed={on}
                title={ProjectStageLabels[st.stage]}
                className={`text-sub inline-flex h-11 lg:h-8 ${END_W} shrink-0 items-center justify-center ${
                  i > 0 ? 'border-l border-border' : ''
                } ${
                  on
                    ? lost
                      ? 'bg-destructive font-bold text-destructive-foreground'
                      : 'bg-secondary font-bold text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {st.label}
              </button>
            );
          })}
        </div>

        {/*
          スヌーズ（docs/core-redesign-plan.md §3-1）。再開日を決めて意図して寝かせる —
          寝ているあいだは停滞にも自動整理にも出ない。**掛かっているときは
          押した先のダイアログに「解除」がある**ので、ここはボタン1つで済む。
        */}
        {canEdit && (
          <button
            type="button"
            onClick={() => setSnoozeOpen(true)}
            aria-pressed={snoozed}
            className={`text-sub inline-flex h-11 shrink-0 items-center gap-1.5 rounded-control border px-2.5 lg:h-8 ${
              snoozed
                ? 'border-border bg-muted font-bold text-foreground'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            <AlarmClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            スヌーズ
          </button>
        )}

        <span className="flex-1" />
        {/* 最後の更新。**概要タブの右カラムから移した**（どのタブでも同じ位置に出る） */}
        {updatedAt && !mobile && (
          <span className="text-note font-number shrink-0 text-muted-foreground">
            最後の更新 {String(updatedAt).slice(0, 10)}
          </span>
        )}
      </div>

      {/*
        スヌーズ中の帯。**控えめにする** — 意図して寝かせた静かな状態なので、
        警告色で騒がない。解除はここから1クリック（掛け直しはスヌーズボタンから）。
      */}
      {snoozed && p?.snooze_until && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border-faint bg-muted/50 px-4 py-1.5 lg:px-6">
          <AlarmClock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-note text-muted-foreground">
            スヌーズ中 — {p.snooze_until.replace(/-/g, '/')} に自動で再開します（それまで停滞にも自動整理にも出ません）
          </span>
          {canEdit && (
            <button
              type="button"
              onClick={() => snooze.mutate(null)}
              disabled={snooze.isPending}
              className="text-note font-bold text-primary hover:underline disabled:opacity-50"
            >
              いま解除する
            </button>
          )}
        </div>
      )}

      <SnoozeDialog
        open={snoozeOpen}
        onOpenChange={setSnoozeOpen}
        projectId={id}
        current={snoozed ? p?.snooze_until : null}
      />

      {/*
        ── 2段目（44px）: タブ ───────────────────────────────────
        **均等割り**（`flex-1`）。横スクロールにしません — スクロールすると
        「まだ右にタブがある」ことに気づけず、押されないタブができます。
      */}
      <div className="flex h-11 px-4 lg:px-6">
        {tabs.map((t) => {
          const on = t.key === tab;
          const n = counts[t.key];
          return (
            <Link
              key={t.key}
              to={`/sales/projects/${id}/${t.key}`}
              aria-current={on ? 'page' : undefined}
              className={`text-list -mb-px inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 border-b-2 px-1 ${
                on ? 'border-primary text-primary' : 'border-transparent font-normal text-muted-foreground hover:text-foreground'
              }`}
            >
              <t.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{t.label}</span>
              {n !== undefined && n > 0 && (
                <span className="text-badge font-number inline-flex h-[19px] min-w-[19px] shrink-0 items-center justify-center rounded-chip bg-muted px-1.5 text-muted-foreground">
                  {n}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
