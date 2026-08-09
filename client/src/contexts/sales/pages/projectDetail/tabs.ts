/**
 * 案件詳細のタブ (v4 ⑥)
 *
 * ── URL の鍵が「短い英語」なのはなぜか ────────────────────────
 *
 * `/sales/projects/:id/:tab` の `:tab` に入る値です。
 * **`episodes` / `tasks` にしていないのは、既存のルートとぶつかるから**です
 * (`/sales/projects/:projectId/episodes` と `/tasks` は別画面として生きています)。
 * React Router は静的な区切りを優先するので、同じ綴りにすると
 * タブを押した瞬間に**枠ごと消えて古い画面に飛びます**。
 * ⑥-B / ⑥-C で古い画面をこの枠に畳んだら、綴りを揃え直します。
 *
 * ── ラベルはモックどおり ──────────────────────────────────────
 *
 * 「エピソード」は `docs/wording.md` で一度「回」に言い換える決めにしていましたが、
 * **モックが v4 の正**なのでモックの語に戻しました（`check-ui-tokens` の
 * `forbidden-wording` からも外してあります）。「見積」も同じで、請求は
 * ⑤ 見積・請求（全案件）で見ます。
 *
 * ── 「ふりかえり」だけ中身が無い ──────────────────────────────
 *
 * **モック自身が「このタブの中身はこれから作ります」と書いています。**
 * 勝手に想像で作らず、枠だけ置いて同じことを画面に出します
 * (タブが無いより「これから」と分かるほうがよい)。
 */
import {
  LayoutDashboard, MessageSquare, Clapperboard, ListChecks,
  Receipt, FolderCheck, ClipboardList, LineChart,
  type LucideIcon,
} from 'lucide-react';

export type ProjectTabKey =
  | 'overview' | 'thread' | 'episode' | 'task' | 'estimate' | 'files' | 'day' | 'review';

export interface ProjectTabDef {
  key: ProjectTabKey;
  label: string;
  icon: LucideIcon;
  /** 連続もの (GLS-A・回を持つもの) のときだけ出すタブ */
  seriesOnly?: boolean;
  /** まだ作っていない (「これから作ります」と出す) */
  todo?: boolean;
}

export const PROJECT_TABS: ProjectTabDef[] = [
  { key: 'overview', label: '概要', icon: LayoutDashboard },
  { key: 'thread', label: 'やり取り', icon: MessageSquare },
  { key: 'episode', label: 'エピソード', icon: Clapperboard, seriesOnly: true },
  { key: 'task', label: 'タスク', icon: ListChecks },
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
  const days = (p.dates ?? []).map((d) => d.date).filter(Boolean);
  const all = days.length > 0 ? days : ([p.event_start, p.event_end].filter(Boolean) as string[]);
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
