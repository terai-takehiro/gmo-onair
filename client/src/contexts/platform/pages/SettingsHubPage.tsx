/**
 * SettingsHubPage — 設定の入口 (§4.17)
 *
 * これまでサイドバーに散っていたマスター・管理系を 8 グループにまとめた入口。
 * 日常のレールからは消し、必要なときにここから辿る。
 *
 * Phase 12 で各設定画面そのものを作り直す (役割テンプレート・4段階の権限など)。
 * この画面はその前段として「どこに何があるか」を1枚にする役目。
 */
import { Link } from "react-router-dom";
import {
  Users,
  Building2,
  Calendar,
  Package,
  DollarSign,
  FileText,
  Sparkles,
  Server,
  ChevronRight,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/platform/AuthContext";

interface SettingLink {
  label: string;
  /** 何を決める場所なのか。1文 */
  description: string;
  to: string;
  /** 別アプリ (フルリロードで開く) */
  external?: boolean;
  module?: string;
  adminOnly?: boolean;
}

interface SettingGroup {
  title: string;
  Icon: LucideIcon;
  /** グループ全体が管理者専用 */
  adminOnly?: boolean;
  links: SettingLink[];
}

const GROUPS: SettingGroup[] = [
  {
    title: "人と権限",
    Icon: Users,
    adminOnly: true,
    links: [
      {
        label: "ユーザー管理",
        description: "メンバーの追加と、誰がどこまで見えるかの設定。",
        to: "/admin/users",
        adminOnly: true,
      },
    ],
  },
  {
    title: "お客様・取引先",
    Icon: Building2,
    links: [
      { label: "取引先マスター", description: "請求先の名前・住所・支払条件。", to: "/sales/companies", module: "sales" },
      { label: "仕入先", description: "発注先の登録と適格請求書の番号。", to: "/budget/vendors", module: "budget" },
      { label: "パートナー", description: "外部スタッフの登録。", to: "/budget/partners", module: "budget" },
    ],
  },
  {
    title: "スタジオと部屋",
    Icon: Calendar,
    links: [
      {
        label: "スタジオカレンダー",
        description: "拠点・部屋の予約状況。カレンダー連携のURLもここから。",
        to: "/studio/calendar",
        module: "studio",
      },
    ],
  },
  {
    title: "機材のマスター",
    Icon: Package,
    links: [
      { label: "保管場所", description: "機材を置く場所の一覧。", to: "/equipment/locations", external: true, module: "equipment" },
      { label: "メーカー", description: "機材のメーカー名の一覧。", to: "/equipment/manufacturers", external: true, module: "equipment" },
      { label: "機材色", description: "識別用の色の一覧。", to: "/equipment/colors", external: true, module: "equipment" },
      { label: "貸出機材設定", description: "貸出のカテゴリと付属品の既定。", to: "/equipment/rental-settings", external: true, module: "equipment" },
    ],
  },
  {
    title: "お金の決めごと",
    Icon: DollarSign,
    links: [
      { label: "料金表", description: "見積に使う単価。定価とグループ内価格。", to: "/sales/pricing", module: "sales" },
      {
        label: "決算インポート",
        description: "仕訳帳CSVから売上・仕入・販管費を取り込む。",
        to: "/budget/kessan-import",
        adminOnly: true,
      },
      {
        label: "同じ支払いが2回入っていないか調べる",
        description: "手入力と決算取込が重なった行を見つけて片方を消す。",
        to: "/budget/dedup-screening",
        adminOnly: true,
      },
    ],
  },
  {
    title: "Qシートのマスター",
    Icon: FileText,
    links: [
      {
        label: "Qシート",
        description: "マイクCh・LED/XRシーン・立ち位置図のひな形は各シートの中で編集する。",
        to: "/qsheet",
        external: true,
        module: "qsheet",
      },
    ],
  },
  {
    title: "AI と連携",
    Icon: Sparkles,
    links: [
      {
        label: "AI がやったこと",
        description: "AI が作ったり直したりした記録。誰の指示だったかも残る。",
        to: "/sales/ai-activity",
        module: "sales",
      },
    ],
  },
  {
    title: "システム",
    Icon: Server,
    adminOnly: true,
    links: [
      { label: "システム設定", description: "アプリ全体の設定。", to: "/admin/settings", adminOnly: true },
      { label: "データビューア", description: "テーブルの中身を直接見る。", to: "/admin/data-viewer", adminOnly: true },
      { label: "DBバックアップ", description: "3時間ごとの控えの一覧と、戻し方。", to: "/admin/db-backups", adminOnly: true },
    ],
  },
];

export default function SettingsHubPage() {
  const { currentUser, hasPermission } = useAuth();
  const isAdmin = currentUser?.role === "system_admin";

  const visibleGroups = GROUPS.map((g) => ({
    ...g,
    links: g.links.filter((l) => {
      if (l.adminOnly) return isAdmin;
      if (l.module) return isAdmin || hasPermission(l.module);
      return true;
    }),
  })).filter((g) => g.links.length > 0 && (!g.adminOnly || isAdmin));

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-bold sm:text-2xl">設定</h1>
        <p className="mt-1 text-[13px] text-secondary-foreground">
          毎日使わないもの (マスター・権限・取り込み) はここにまとめました。
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleGroups.map((group) => (
          <section key={group.title} className="rounded-lg border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-divider px-4 py-3">
              <group.Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <h2 className="min-w-0 flex-1 truncate text-sm font-bold">{group.title}</h2>
              {group.adminOnly && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-warning-surface px-2 py-0.5 text-[11px] font-bold text-warning-strong">
                  <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                  管理者のみ
                </span>
              )}
            </div>
            <ul className="divide-y divide-divider">
              {group.links.map((link) =>
                link.external ? (
                  <li key={link.to}>
                    <a
                      href={link.to}
                      className="flex items-start gap-2 px-4 py-3 transition-colors hover:bg-secondary"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-bold text-foreground">{link.label}</span>
                        <span className="mt-0.5 block text-[12px] leading-relaxed text-secondary-foreground">
                          {link.description}
                        </span>
                      </span>
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </a>
                  </li>
                ) : (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="flex items-start gap-2 px-4 py-3 transition-colors hover:bg-secondary"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-bold text-foreground">{link.label}</span>
                        <span className="mt-0.5 block text-[12px] leading-relaxed text-secondary-foreground">
                          {link.description}
                        </span>
                      </span>
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                )
              )}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
