// テロップCG — 種類（部品）カタログデータ（読み取り専用）。
//
// **2026-09-06 のゼロベース再設計（graphics-redesign.md §6）で作り直した。**
// 旧カタログ（`v4-mockup-graphics.dc.html` の `libVals()` 由来）は `used`/`fields`/`ctl`/`data`
// に「24番組」「4 フィールド」のような**実データと無関係な固定文字列**を持っており、
// 診断（同文書 §2-6）で「死んだ・嘘の UI」として指摘した。この版では `desc`（実際に役立つ
// 一言説明）だけを残し、他は削除した。`partKey` は `GraphicsPartKey` に対応付け、
// スロットは既存の `PART_DEFAULT_SLOT`（graphicsApi.ts）から導く。
//
// ⚠️ 旧カタログは `ranking`（ランキング発表）を欠いたまま9件で止まっていた
// （段6-5でパーツ自体は実装済みだったのにカタログへの追加漏れ）。この版で10件に揃えた。
import {
  User, Heading, Table, MoveHorizontal, Clock, Trophy, Zap, PanelLeft, BarChart3, Award,
  type LucideIcon,
} from 'lucide-react';
import type { GraphicsPartKey } from '@/lib/graphicsApi';

export interface PartLibraryCard {
  partKey: GraphicsPartKey;
  icon: LucideIcon;
  name: string;
  desc: string;
}

export const PART_LIBRARY_CARDS: PartLibraryCard[] = [
  { partKey: 'name', icon: User, name: 'ネーム', desc: '氏名・肩書・所属の定番。番組でいちばん多い1枚。' },
  { partKey: 'title', icon: Heading, name: '題字', desc: '講演・発表・コーナーのタイトル画面。写真枠つき。' },
  { partKey: 'list', icon: Table, name: '一覧表', desc: '受賞者・登壇者・要点の一覧。列は自動割付。' },
  { partKey: 'ticker', icon: MoveHorizontal, name: 'ティッカー', desc: '下端を流れる案内。速度は読める速さに固定。' },
  { partKey: 'countdown', icon: Clock, name: 'カウントダウン・時計', desc: '開演まで・現在時刻。サーバー時刻に同期。' },
  { partKey: 'score', icon: Trophy, name: 'スコア', desc: '対戦・ポイントの常駐。本番中に±で更新。' },
  { partKey: 'flash', icon: Zap, name: '速報帯', desc: '割り込みの速報。ほかより前に出る。' },
  { partKey: 'side', icon: PanelLeft, name: 'サイドスーパー', desc: '画面隅の常駐見出し。提供・注記に。' },
  { partKey: 'vote', icon: BarChart3, name: '投票・クイズ', desc: '選択肢と票数。視聴者投票と連携できる。' },
  { partKey: 'ranking', icon: Award, name: 'ランキング発表', desc: '下位から順に発表。アワードの演出を継承。' },
];
