// テロップCG — 部品ライブラリのカタログデータ（読み取り専用）。
//
// 出所は docs/design/v4/mockups/v4-mockup-graphics.dc.html の `libVals()` 内
// `cards` 配列（9件）。**name / desc / used / fields / ctl / data の文言はモックの
// そのまま**（ユーザーが「AIっぽい」「テンプレっぽい」文言に拒否反応を示しているため、
// このファイルで書き換えない）。`partKey` だけこちらで `GraphicsPartKey` に対応付け、
// スロットは既存の `PART_DEFAULT_SLOT`（graphicsApi.ts）から導く
// （モックのカード側スロット表記「サイド」は `SlotBadge` の正式表記
// 「サイドスーパー」と揺れがあるため、正式な型から引き直す）。
import {
  User, Heading, Table, MoveHorizontal, Clock, Trophy, Zap, PanelLeft, BarChart3,
  type LucideIcon,
} from 'lucide-react';
import type { GraphicsPartKey } from '@/lib/graphicsApi';

export interface PartLibraryCard {
  partKey: GraphicsPartKey;
  icon: LucideIcon;
  name: string;
  used: string;
  desc: string;
  fields: string;
  ctl: string;
  data: string;
}

export const PART_LIBRARY_CARDS: PartLibraryCard[] = [
  {
    partKey: 'name', icon: User, name: 'ネーム', used: '24番組',
    desc: '氏名・肩書・所属の定番。1名〜2名並記、日英切替つき。',
    fields: '4 フィールド', ctl: '名簿から選ぶ', data: '手入力・名簿',
  },
  {
    partKey: 'title', icon: Heading, name: '題字＋肩書', used: '11番組',
    desc: '講演・発表もののタイトル画面。写真枠つき。',
    fields: '4 フィールド', ctl: '写真の差し替え', data: '手入力・名簿',
  },
  {
    partKey: 'list', icon: Table, name: '一覧表', used: '8番組',
    desc: '受賞者・登壇者・結果の一覧。列数と行数は自動割付。',
    fields: '列で可変', ctl: 'ページ送り', data: '名簿・Sheets',
  },
  {
    partKey: 'ticker', icon: MoveHorizontal, name: 'ティッカー', used: '9番組',
    desc: '画面下の流れる案内。項目のローテーションと速度調整。',
    fields: '項目リスト', ctl: 'ON/OFF・流す組', data: '手入力・Sheets',
  },
  {
    partKey: 'countdown', icon: Clock, name: 'カウントダウン・時計', used: '17番組',
    desc: '開演までの残り・現在時刻。サーバー時刻に同期し端末の時計ずれを吸収。',
    fields: '3 フィールド', ctl: '時刻指定・位置と大きさ', data: '自動（サーバー時刻）',
  },
  {
    partKey: 'score', icon: Trophy, name: 'スコアボード', used: '3番組',
    desc: '対戦・ポイントの常駐表示。±ボタンで即時反映（確定操作なし）。',
    fields: '6 フィールド', ctl: '±ボタン', data: '手入力・外部フィード',
  },
  {
    partKey: 'flash', icon: Zap, name: '速報帯', used: '5番組',
    desc: '割込の速報スーパー。最優先スロットで他のテロップより前に出る。',
    fields: '2 フィールド', ctl: '即TAKE（確認つき）', data: '手入力',
  },
  {
    partKey: 'side', icon: PanelLeft, name: 'サイドスーパー', used: '14番組',
    desc: '画面隅の常駐見出し。縦書き対応。',
    fields: '2 フィールド', ctl: '表示/非表示', data: '手入力',
  },
  {
    partKey: 'vote', icon: BarChart3, name: '投票・クイズ', used: 'アワード継承',
    desc: '選択肢と票数のリアルタイム表示。インタラクティブ連携。',
    fields: '選択肢で可変', ctl: '出題→締切→開票', data: '自動（票数push）',
  },
];
