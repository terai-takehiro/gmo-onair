/**
 * 設定トップに並べるカード（v4・モックの `hub.groups`）
 *
 * ── 7枚すべて開くようになりました ──────────────────────────
 *
 * 着手時は3枚（お金のルール / 休日・営業時間 / 通知とテンプレート）が
 * 画面を持たず、`to: null` と `todo` で「これから作ります」と出していました。
 * **いまは 7 枚とも押せます。**
 *
 * `to: null` ＋ `todo` の仕組みは残してあります — 今後また
 * 「並べるが押せない」枚が出たときに、押しても何も起きないカードを
 * 置かずに済むようにするためです（押せないカードが1枚あると、
 * 以後この画面全体が信用されなくなる）。
 */
import type { LucideIcon } from 'lucide-react';
import {
  Building2, ReceiptJapaneseYen, ListChecks, Contact, Scale, CalendarClock, Users, Mail,
} from 'lucide-react';

export interface HubCard {
  key: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  tone: string;
  /** 行き先。**まだ画面が無いものは `null`**（押せなくする） */
  to: string | null;
  /** 何が足りないか。`to` が null のときだけ出す */
  todo?: string;
  /** 見るのに要る権限。無い人にはカードごと出さない */
  module?: string;
  /** 直せるのは誰か。**画面に書く**（押してから 403 で気づくのを避ける） */
  who: string;
}

export interface HubGroup { label: string; cards: HubCard[] }

export const HUB_GROUPS: HubGroup[] = [
  {
    label: 'マスター',
    cards: [
      {
        key: 'sites', title: '拠点・部屋', desc: '予約できる部屋と、料金表の分かれ目',
        icon: Building2, tone: 'bg-primary-surface text-primary',
        // **`system_admin` を要求するのはサーバー側の実装** — `studio` の manager でも
        // `POST /studios/locations` は 403 になる（`requireRole('system_admin')`）
        to: '/settings/sites', module: 'studio', who: '管理者',
      },
      {
        key: 'pricing', title: '料金表', desc: '見積の積算に使う品目と金額',
        icon: ReceiptJapaneseYen, tone: 'bg-success-surface text-success',
        to: '/sales/pricing', module: 'sales', who: '案件管理の所有者',
      },
      {
        key: 'flow', title: '標準工程テンプレート', desc: '案件の種類ごとに立つ工程のひな形',
        icon: ListChecks, tone: 'bg-info-surface text-info',
        to: '/gpm/templates', module: 'gpm', who: 'プロジェクト管理の編集者',
      },
      {
        key: 'partner', title: '取引先・仕入先', desc: '見積・請求・発注の宛先',
        icon: Contact, tone: 'bg-warning-surface text-warning',
        to: '/budget/vendors', module: 'budget', who: '財務管理の編集者',
      },
    ],
  },
  {
    label: 'ルール',
    cards: [
      {
        key: 'money', title: 'お金のルール', desc: '締め日・支払サイト・消費税の扱い',
        icon: Scale, tone: 'bg-success-surface text-success',
        to: '/settings/money', module: 'budget', who: '経理',
      },
      {
        key: 'cal', title: '休日・営業時間', desc: '予約できる時間帯と休業日',
        icon: CalendarClock, tone: 'bg-warning-surface text-warning',
        to: '/settings/hours', module: 'studio', who: 'システム管理者',
      },
    ],
  },
  {
    label: '組織',
    cards: [
      {
        key: 'member', title: '権限とメンバー', desc: '誰がどこまで見られる・直せるか',
        icon: Users, tone: 'bg-ai-surface text-ai',
        to: '/settings/users', module: 'admin', who: '管理者',
      },
      {
        key: 'notify', title: '通知とテンプレート', desc: 'メール文面と通知の送り先',
        icon: Mail, tone: 'bg-primary-surface text-primary',
        to: '/settings/notify', module: 'admin', who: 'システム管理者',
      },
    ],
  },
];
