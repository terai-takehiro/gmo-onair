/**
 * 案件詳細のタブ (v4 ⑥)
 *
 * ── URL の鍵が「短い英語」なのはなぜか ────────────────────────
 *
 * `/sales/projects/:id/:tab` の `:tab` に入る値です。
 * **`tasks` にしていないのは、既存のルートとぶつかるから**です
 * (`/sales/projects/:projectId/tasks` は別画面として生きています)。
 * React Router は静的な区切りを優先するので、同じ綴りにすると
 * タブを押した瞬間に**枠ごと消えて古い画面に飛びます**。
 * ⑥-B で古い画面をこの枠に畳んだら、綴りを揃え直します。
 *
 * ── ラベルはモックどおり ──────────────────────────────────────
 *
 * 「見積」は請求の分もここで見ます。請求は
 * ⑤ 見積・請求（全案件）でも見られます。
 *
 * ── 「ふりかえり」の中身は最新モックにある（この節は 2026-08 に訂正） ──────
 *
 * ここは以前「モック自身が『これから作ります』と書いている」としていましたが、
 * それは古い `v4-mockup-main.dc.html` の話でした。**v4 の正は `v4-live-sales.dc.html`**
 * （`docs/design/v4/mockups/README.md` が明示）で、そちらには KPT・写真・お金の内訳を
 * 持つ完成した「ふりかえり」の絵があります。実測すると `ReviewTab.tsx` / `ReviewSide.tsx` /
 * `review/KptPanel.tsx` / `review/PhotoGrid.tsx` は文言までほぼ一致していました
 * （お金の並び「想定していた金額／出した見積／確定した売上／仕入（原価）／粗利」等）。
 * つまり**中身はすでに合っている**が、この説明文だけが古いままだったので直しました。
 *
 * ── 「回」タブは**レギュラー案件にだけ**出す（2026-09・ご指摘で戻した） ────────
 *
 * 2026-08 にモック（`v4-live-sales.dc.html` の `det.tabs` は7つ）に合わせて
 * エピソード（回）タブを外し、回の表と「回を足す」はタスクタブの絞り込みの隣に
 * **畳んで**置いていた（`contexts/tasks/components/EpisodesPanel.tsx`）。
 * ところが 9/2 の仕様変更で「回ごとに見積・売上・請求を管理する」ことになり、
 * 回そのものが案件の主役になったのに、**開く手段がタスクタブの折りたたみの中にしか
 * 無く「エピソードのタブが出ない」と受け取られた**（実際に出ていない）。
 *
 * そこで `series: true` の「回」タブを足した。**単発案件には出さない**
 * （`DetailHeader` が `series` で絞る。URL で直接開かれたら概要へ落とす）ので、
 * 7タブのモックどおりの見た目は単発案件では変わらない。タスクタブ側の折りたたみは
 * 「タスクを回で絞る」流れのために残してある。
 *
 * ── 「売上・請求」ペインもモックの3カード設計に置き換えた（同時期） ────────
 *
 * 旧 `LegacyViewTab.tsx`（`BusinessProjectView.tsx` を呼ぶだけの薄いラッパー）は
 * この置き換えで呼び手が無くなったため削除した。`BusinessProjectView.tsx` 自体は
 * **プロジェクト管理（GPM）の見積タブ**（`contexts/gpm/pages/projectDetail/BillingTab.tsx`）
 * がいまも直接呼んでいるので残してある。
 */
import {
  LayoutDashboard, MessageSquare, ListChecks, Repeat,
  Receipt, FolderCheck, ClipboardList, LineChart,
  type LucideIcon,
} from 'lucide-react';

export type ProjectTabKey =
  | 'overview' | 'thread' | 'task' | 'episode' | 'estimate' | 'files' | 'day' | 'review';

export interface ProjectTabDef {
  key: ProjectTabKey;
  label: string;
  icon: LucideIcon;
  /** まだ作っていない (「これから作ります」と出す) */
  todo?: boolean;
  /** レギュラー（回を持つ）案件にだけ出す。単発案件のタブバーには並べない */
  series?: boolean;
}

export const PROJECT_TABS: ProjectTabDef[] = [
  { key: 'overview', label: '概要', icon: LayoutDashboard },
  { key: 'thread', label: 'やり取り', icon: MessageSquare },
  { key: 'task', label: 'タスク', icon: ListChecks },
  { key: 'episode', label: '回', icon: Repeat, series: true },
  { key: 'estimate', label: '見積', icon: Receipt },
  { key: 'files', label: '書類', icon: FolderCheck },
  { key: 'day', label: '当日', icon: ClipboardList },
  { key: 'review', label: 'ふりかえり', icon: LineChart },
];

/**
 * スマホのタブは**案件の段階で入れ替える**（v4 ⑥ 案件記録・指示書 第4章）。
 *
 * ── なぜ固定ではだめか ──────────────────────────────────────
 *
 * 8タブを 375px に並べると1タブが 40px 弱になり押し分けられないので、
 * スマホは3つに絞ります。ところが**3つを固定にすると、どの段階でも
 * 1つは使わないタブが混ざります** —
 *
 *   ・ふだんは「当日」を開かない（本番の日だけ）
 *   ・本番の日は「やり取り」を書いている暇がない
 *   ・終わった案件では「当日」も「タスク」も終わっている
 *
 * 段階で入れ替えると、3つとも**その日に使うもの**になります。
 *
 * ── 「当日」はいちばん右 ────────────────────────────────────
 *
 * 本番の日にいちばん押すタブですが、**左端に置くと押し間違いで開きます**。
 * 現場では片手で持っているので、親指の届く右端が安全です（指示書の指定）。
 */
export type ProjectPhase = 'base' | 'day' | 'done';

export const MOBILE_TABS_BY_PHASE: Record<ProjectPhase, ProjectTabKey[]> = {
  base: ['overview', 'thread', 'task'],
  day: ['overview', 'task', 'day'],
  done: ['overview', 'thread', 'review'],
};

/**
 * どの段階か。
 *
 * **実施日は「いずれかの日が今日なら本番日」**（指示書 第9章の確認事項への答え）。
 * 飛び日の案件があるので、`event_start` だけを見ると中日が本番日になりません。
 * かといって期間で判定するのも違います — 3日空いた飛び日の真ん中は
 * 本番ではないためです。`dates`（`project_dates`）があるときはそれを見て、
 * 無ければ開始・終了の**両端**だけを見ます。
 */
export function projectPhase(p: {
  stage: string;
  event_start?: string | null;
  event_end?: string | null;
  dates?: { date: string }[];
}, today: string): ProjectPhase {
  if (p.stage === 's_completed' || p.stage === 'e_lost') return 'done';
  /*
   * ⚠️ **実施日の両端は `dates` があっても必ず見る。**
   *
   * 予約（カレンダー）を直すと `event_start` / `event_end` は引き直されますが
   * （`server/.../project-event-dates.service.ts`）、`project_dates` は
   * **案件を作ったときのまま**です。`dates` があるときそちらだけを見ていたので、
   * **カレンダーで動かした本番日に「当日」タブが出ませんでした**
   * （出ないタブは現場で探しようがありません）。
   *
   * 足すのは**両端だけ**です。期間で判定してはいけません —
   * 飛び日（10/01 と 10/07 だけ本番）の中日が本番になります。
   */
  const days = (p.dates ?? []).map((d) => d.date).filter(Boolean);
  const all = [...days, p.event_start, p.event_end].filter(Boolean) as string[];
  return all.includes(today) ? 'day' : 'base';
}

/**
 * ふだんの3つ。**段階が分からない場所（部品の既定値）だけが使う。**
 * 画面は `MOBILE_TABS_BY_PHASE` を段階で引くこと
 */
export const MOBILE_TAB_KEYS: ProjectTabKey[] = MOBILE_TABS_BY_PHASE.base;

export function isProjectTab(value: string | undefined): value is ProjectTabKey {
  return PROJECT_TABS.some((t) => t.key === value);
}
