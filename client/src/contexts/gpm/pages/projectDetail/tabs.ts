/**
 * ③ プロジェクト詳細のタブ (v4 GPM)
 *
 * **案件詳細⑥の `projectDetail/tabs.ts` に合わせて切り出した**（PR③・
 * `docs/design/v4/mockups/gpm-format-alignment.html` 項目7）。以前は
 * タブの定義・段階ごとのスマホ用タブ・判定関数がぜんぶ `DetailHeader.tsx`
 * に混ざっていた。案件詳細と同じ作法で1ファイルにまとめ、各タブに
 * `icon: LucideIcon` を持たせる（案件詳細のタブは最初からアイコン付きだが、
 * GPM 側だけアイコンが無かった）。
 *
 * 中身（段階の考え方・「未解決事項」を段階に関係なく足す仕組み）は
 * 移しただけで変えていない — 各関数の説明もそのまま持ってきてある。
 */
import {
  LayoutDashboard, CircleHelp, Users, Mic, Receipt, Wallet, FolderCheck,
  type LucideIcon,
} from 'lucide-react';
import type { ProjectStage } from '@/types';

export interface DetailTabDef {
  key: string;
  label: string;
  icon: LucideIcon;
}

export const DETAIL_TABS = [
  { key: 'overview', label: '概要', icon: LayoutDashboard },
  { key: 'asks', label: '持ち帰り', icon: CircleHelp },
  { key: 'members', label: '体制', icon: Users },
  // 打合せの録音 → 文字起こし → AI の下書き。**案件と同じ表・同じサービス**
  // （`project_minutes` は `projects` にぶら下がる）。持ち帰りの行き先だけが違う
  { key: 'minutes', label: '議事録', icon: Mic },
  // v4 大⑤: 提出先ごとの個別見積（migration 173）
  { key: 'estimates', label: '見積', icon: Receipt },
  // migration 179 で案件詳細から移した「月次請求（月締め）」
  { key: 'billing', label: '請求', icon: Wallet },
  { key: 'files', label: '書類', icon: FolderCheck },
] as const satisfies readonly DetailTabDef[];

export type DetailTabKey = (typeof DETAIL_TABS)[number]['key'];

export function isDetailTab(v: string | undefined): v is DetailTabKey {
  return DETAIL_TABS.some((t) => t.key === v);
}

/**
 * スマホのタブは**段階で入れ替える**（案件詳細⑥の `MOBILE_TABS_BY_PHASE` と同じ考え方・
 * 2026-08 v4ネイティブUI化）。
 *
 * ── なぜ固定3つではだめか ────────────────────────────────────
 *
 * 7タブを 375px に並べると1タブが 40px 弱になり押し分けられないので、
 * スマホは3つに絞ります。ところが**3つを固定にすると、どの段階でも
 * 1つは使わないタブが混ざります**——
 *
 *   ・見積を出している段階（準備中）ではまだ体制も工程も定まっていないことが多い
 *   ・受注して動かしている段階（進行中）では見積のやり取りより
 *     工程・未確認事項・体制の3つを行き来する
 *   ・終わった／見送った段階（完了）では議事録と納品書類を読み返すだけになる
 *
 * 段階で入れ替えると、3つとも**その日に使うもの**になります。
 *
 * ── 段階の束ねは一覧・ダッシュボードと同じものを使う ────────────
 *
 * `types.ts` の `STAGE_GROUPS`（一覧の絞り込みチップ・サーバーの `gpm.service.ts` と共通）
 * をそのまま流用します。ここだけ別の束ね方を持つと、「一覧では進行中なのに詳細を開くと
 * 別の段階のタブが出る」がおきます。
 */
export type DetailPhase = 'planning' | 'active' | 'done';

export function gpmDetailPhase(stage: ProjectStage): DetailPhase {
  if (stage === 'a_won') return 'active';
  // r_delivered（実施済・財務処理中）は制作の仕事としては終わっているので、
  // モバイルタブは done と同じ（議事録・書類を読み返す）扱いにする
  if (stage === 'r_delivered' || stage === 's_completed' || stage === 'e_lost') return 'done';
  return 'planning';
}

export const MOBILE_TABS_BY_PHASE: Record<DetailPhase, DetailTabKey[]> = {
  planning: ['overview', 'estimates', 'asks'],
  active: ['overview', 'asks', 'members'],
  done: ['overview', 'minutes', 'files'],
};

/**
 * `MOBILE_TABS_BY_PHASE` に**未解決の未確認事項があるときだけ**「未確認事項」を足す。
 *
 * 完了・失注（done）はもともと「未確認事項」を持たない — 終わった案件は
 * 議事録・書類を読み返すだけ、という想定。ところが未確認事項の解決を
 * 段階変更が待ってくれるわけではない（サーバー側にそのガードが無い）ので、
 * **未解決のまま完了・失注になったプロジェクトが実在しうる**。しかも
 * ダッシュボードの「未確認事項」「止まっているプロジェクト」パネルと
 * ⑤ 全プロジェクトの未確認事項一覧は**段階を見ずに** `/gpm/projects/:id/asks`
 * へ直接リンクしてくる。done のタブバーに asks が無いと、その項目を
 * 見る・解決する手段がスマホのどこにも無くなる（他の6タブは代わりにならない）。
 *
 * **残っている間だけ**足す — 0件になれば元の3つに戻り、完了段階の
 * タブはまた締まる（「終わった案件は読み返すだけ」の前提を壊さない）。
 * タブバー（`DetailHeader` 本体）と `GpmProjectDetailPage` の
 * 段階違いリダイレクト判定が**同じ関数**を通るようにして、
 * 「タブには出ているのに開くと弾かれる」／「タブに出ていないのに
 * リンクを踏むと弾かれる」の食い違いを防ぐ。
 */
export function effectiveMobileTabs(phase: DetailPhase, openAsksCount: number): DetailTabKey[] {
  const base = MOBILE_TABS_BY_PHASE[phase];
  return openAsksCount > 0 && !base.includes('asks') ? [...base, 'asks'] : base;
}

/**
 * **請求（月次・`BusinessProjectView` をそのまま呼ぶ）はどの段階でもスマホに出しません。**
 * 案件と共用の 2,000 行超の PC 向け表で、この回では作り直していないためです
 * （工程・体制・未確認事項・議事録・見積・書類の6タブとは違い、実測しても
 * 縦積みで読める形になっていません）。`GpmProjectDetailPage` の `everMobile` 判定は
 * この表に載っていないタブを自動でその扱いにするので、ここには載せません。
 */

/**
 * 押して切り替えられるステージ。**案件と同じ 8 段のうち、よく使う5つだけ**を出す。
 * 残り（ネタ・仮押さえ）は「直す」から変える — ここに 8 つ並べると
 * 帯が横に伸びてスマホで押せなくなるうえ、押し間違いが起きやすい。
 *
 * `r_delivered`（実施済・財務処理中、2026-09 追加）は `a_won` と `s_completed` の間。
 *
 * ── 「完了」「失注」は別組（PR③・項目9）────────────────────────
 *
 * 案件詳細⑥の `STAGE_STEPS`/`END_STEPS` と同じ考え方で、進める段
 * （C 見積提案・B 口頭決定・A 受注済・R 実施済）と終わり方（完了・失注）を
 * 分ける。以前は `s_completed` だけを進める帯の末尾に混ぜ、`e_lost` は
 * この帯からは変えられなかった（「直す」からしか失注にできなかった）。
 * 終わり方2つを帯に並べたのは、この画面から「終わらせる」手段が
 * 無くなるのを避けるため（案件詳細と同じ理由）。
 */
export const STAGE_STEPS: ProjectStage[] = ['c_proposal', 'b_verbal', 'a_won', 'r_delivered'];
export const END_STEPS: ProjectStage[] = ['s_completed', 'e_lost'];
