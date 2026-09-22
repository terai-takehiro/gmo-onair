/**
 * 「その他のブロック」の一覧（`/` を打っても同じものが開く）
 *
 * ツールバーに出す6つ（見出し・箇条書き・チェックリスト・表・画像・リンク）以外を
 * ここに集めます。**設計 §4-2 の表に無いものは足さないこと** — 書き方を増やすと、
 * 書き出した `.md` を GitHub や VS Code で開いたときに描けないものが混ざります。
 */
import {
  AlertTriangle,
  ChevronRight,
  Code2,
  Info,
  Lightbulb,
  Link2,
  Minus,
  Quote,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import { insertBlock, type Edit } from './markdownEdits';

export interface WikiBlockChoice {
  id: string;
  label: string;
  /** 何に使うかの1行。押す前に選べるようにする */
  hint: string;
  icon: LucideIcon;
  edit: Edit;
}

/** 注意書き（GitHub の書き方と同じ。`WikiAlert` が色付きで描く） */
const noticeBlock = (mark: string, sample: string): Edit =>
  insertBlock(`> [!${mark}]\n> ${sample}`, sample);

export const WIKI_BLOCKS: WikiBlockChoice[] = [
  {
    id: 'note',
    label: '注意書き（補足）',
    hint: '読む人に添えておきたいこと',
    icon: Info,
    edit: noticeBlock('NOTE', '補足しておきたいこと'),
  },
  {
    id: 'tip',
    label: '注意書き（こつ）',
    hint: 'うまくやる方法・近道',
    icon: Lightbulb,
    edit: noticeBlock('TIP', 'うまくやる方法'),
  },
  {
    id: 'warning',
    label: '注意書き（注意）',
    hint: '間違えやすいところ',
    icon: AlertTriangle,
    edit: noticeBlock('WARNING', '気をつけること'),
  },
  {
    id: 'caution',
    label: '注意書き（警告）',
    hint: '事故や損失につながること',
    icon: ShieldAlert,
    edit: noticeBlock('CAUTION', '事故につながること'),
  },
  {
    id: 'fold',
    label: '折りたたみ',
    hint: '長い補足を畳んでおく',
    icon: ChevronRight,
    edit: insertBlock('<details><summary>見出しの文</summary>\n\n畳んでおく中身\n\n</details>', '見出しの文'),
  },
  {
    id: 'code',
    label: 'コード',
    hint: '設定値・コマンドをそのまま載せる',
    icon: Code2,
    edit: insertBlock('```\nここに設定値やコマンド\n```', 'ここに設定値やコマンド'),
  },
  {
    id: 'quote',
    label: '引用',
    hint: '他の文書から引いてくる',
    icon: Quote,
    edit: insertBlock('> 引用する文', '引用する文'),
  },
  {
    id: 'divider',
    label: '区切り線',
    hint: '話題の切れ目に1本引く',
    icon: Minus,
    edit: insertBlock('---'),
  },
  {
    id: 'onair',
    label: 'ONAiR のカード',
    hint: '案件・機材・部屋・ページへのリンク。貼るとカードになります',
    icon: Link2,
    edit: insertBlock('[案件の名前](/sales/projects/GLS-0000)', '/sales/projects/GLS-0000'),
  },
];
