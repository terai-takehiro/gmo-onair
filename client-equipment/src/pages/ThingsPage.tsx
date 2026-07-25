/**
 * ThingsPage — 機材 ＞ モノ (§4.16 / デザイン 17a)
 *
 * 機材一覧・貸出機材一覧・ケーブル・コネクタ・ラック図は**同じ「台帳」**なので、
 * 5つのメニューに分けるのをやめて **1つの種別タブ** (`?kind=`) にまとめた。
 * 表示列・カスタム列・Excel入出力・印刷は各台帳の現行機能をそのまま使う。
 */
import { useSearchParams } from "react-router-dom";
import { Package, Layers, Cable, Plug, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import EquipmentListPage from "./EquipmentListPage";
import ModelGroupPage from "./ModelGroupPage";
import CablePage from "./CablePage";
import ConnectorPage from "./ConnectorPage";
import RackLayoutPage from "./RackLayoutPage";

const KINDS = [
  { id: "items", label: "機材", Icon: Package },
  { id: "model-groups", label: "貸出機材", Icon: Layers },
  { id: "cables", label: "ケーブル", Icon: Cable },
  { id: "connectors", label: "コネクタ", Icon: Plug },
  { id: "racks", label: "ラック図", Icon: Server },
] as const;
type Kind = (typeof KINDS)[number]["id"];

export default function ThingsPage() {
  const [sp, setSp] = useSearchParams();
  const kind = (KINDS.some((k) => k.id === sp.get("kind")) ? sp.get("kind") : "items") as Kind;

  const setKind = (k: Kind) => {
    const next = new URLSearchParams(sp);
    if (k === "items") next.delete("kind");
    else next.set("kind", k);
    setSp(next, { replace: true });
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">機材 ＞ モノ</h1>
        <p className="mt-1 text-[13px] text-secondary-foreground">
          機材・貸出機材・ケーブル・コネクタ・ラック図の台帳です。種別で切り替えます。
        </p>
      </header>

      <div className="flex gap-1 overflow-x-auto border-b border-divider" role="tablist">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="tab"
            aria-selected={kind === k.id}
            onClick={() => setKind(k.id)}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[14px] transition-colors",
              kind === k.id
                ? "border-primary font-bold text-primary"
                : "border-transparent text-secondary-foreground hover:text-foreground"
            )}
          >
            <k.Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {k.label}
          </button>
        ))}
      </div>

      {kind === "items" && <EquipmentListPage embedded />}
      {kind === "model-groups" && <ModelGroupPage embedded />}
      {kind === "cables" && <CablePage embedded />}
      {kind === "connectors" && <ConnectorPage embedded />}
      {kind === "racks" && <RackLayoutPage embedded />}
    </div>
  );
}
