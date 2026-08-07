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
  { key: 'review', label: 'ふりかえり', icon: LineChart, todo: true },
];

/**
 * スマホで開けるタブ（⑥・モックの端末枠 6枚目）。
 *
 * モックの端末枠は **概要（実施日・会場・標準工程・個別タスク）だけ**で、
 * その下に「**見積・書類・やり取りは PC で**」と書いてあります。
 * 8タブを 375px に並べると1タブが 40px 弱になり、押し分けられません。
 *
 * **当日を入れているのはモックに無い足し算です。** 本番当日に現場で開く
 * 資料への入口で、**スマホで開く場面がいちばん多いタブ**だからです
 * （中身は既にある画面へのリンクだけなので、幅の問題もありません）。
 */
export const MOBILE_TAB_KEYS: ProjectTabKey[] = ['overview', 'task', 'day'];

export function isProjectTab(value: string | undefined): value is ProjectTabKey {
  return PROJECT_TABS.some((t) => t.key === value);
}
