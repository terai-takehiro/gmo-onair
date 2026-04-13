import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Copy, Loader2, Wrench, ArrowRightLeft, Package, QrCode, Printer,
} from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const statusLabels: Record<string, string> = {
  active: "稼働中", in_repair: "修理中", retired: "引退", disposed: "廃棄", lost: "紛失",
};
const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800", in_repair: "bg-amber-100 text-amber-800",
  retired: "bg-gray-100 text-gray-600", disposed: "bg-red-100 text-red-800",
  lost: "bg-red-200 text-red-900",
};
const conditionLabels: Record<string, string> = {
  excellent: "優良", good: "良好", fair: "可", poor: "不良",
};
const assetClassLabels: Record<string, string> = {
  fixed_asset: "固定資産", consumable: "消耗品", low_value: "少額資産",
};
const maintenanceTypeLabels: Record<string, string> = {
  breakdown: "故障", repair: "修理", maintenance: "メンテナンス", inspection: "点検",
};
const maintenanceStatusLabels: Record<string, string> = {
  reported: "報告済", in_progress: "対応中", completed: "完了", cancelled: "キャンセル",
};

export default function EquipmentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [qrOpen, setQrOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["equipment-item", id],
    queryFn: async () => (await api.get(`/equipment/items/${id}`)).data.data,
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center text-muted-foreground">機材が見つかりません</div>
    );
  }

  const item = data;

  const copyEqCode = () => {
    navigator.clipboard.writeText(item.eq_code);
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/equipment/items")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[item.status] || ""}`}>
              {statusLabels[item.status]}
            </span>
            <Badge variant="outline">{item.item_type === "rental" ? "貸出系" : "設備系"}</Badge>
            {item.category_name && (
              <span className="text-xs text-muted-foreground">{item.category_name}</span>
            )}
          </div>
          <h1 className="heading-page text-xl mt-1">
            {item.name}
            {item.unit_number && <span className="text-primary ml-2">No.{item.unit_number}</span>}
          </h1>
          <button
            onClick={copyEqCode}
            className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground mt-1 transition-colors"
            title="EQコードをコピー"
          >
            <QrCode className="h-3 w-3" />
            {item.eq_code}
            <Copy className="h-2.5 w-2.5 opacity-40" />
          </button>
        </div>
        <Button variant="outline" size="sm" onClick={() => setQrOpen(true)}>
          <Printer className="h-4 w-4 mr-1" />
          QRコード
        </Button>
      </div>

      {/* QRコード表示・印刷ダイアログ */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>QRコード — {item.name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-4">
            <img
              src={`/api/v1/internal/equipment/items/${id}/qr`}
              alt="QRコード"
              className="w-56 h-56 border rounded bg-white p-2"
            />
            <p className="font-mono text-sm">{item.eq_code}</p>
            <p className="text-xs text-muted-foreground text-center">{item.name}</p>
            <Button onClick={() => window.print()} className="w-full">
              <Printer className="h-4 w-4 mr-1" />
              印刷
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Basic info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              基本情報
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label="メーカー" value={item.manufacturer} />
            <InfoRow label="型番" value={item.model_number} />
            <InfoRow label="シリアルNo" value={item.serial_number} />
            <InfoRow label="カテゴリ" value={item.category_name} />
            <InfoRow label="コンディション" value={conditionLabels[item.condition]} />
            <InfoRow label="保管場所" value={item.location_detail} />
            {item.description && <InfoRow label="説明" value={item.description} />}
            {item.notes && <InfoRow label="メモ" value={item.notes} />}
          </CardContent>
        </Card>

        {/* Asset info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">資産情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label="資産区分" value={assetClassLabels[item.asset_class]} />
            <InfoRow label="管理番号" value={item.asset_number} />
            <InfoRow label="取得日" value={item.acquisition_date} />
            <InfoRow label="取得価額" value={item.acquisition_cost ? `¥${item.acquisition_cost.toLocaleString()}` : null} />
            <InfoRow label="耐用年数" value={item.useful_life ? `${item.useful_life}年` : null} />
          </CardContent>
        </Card>

        {/* Lending history (rental only) */}
        {item.item_type === "rental" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              貸出履歴
              {item.is_lendable ? (
                <Badge variant="outline" className="text-xs">貸出可</Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(item.lendings || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">履歴なし</p>
            ) : (
              <div className="space-y-2">
                {item.lendings.map((l: any) => (
                  <div key={l.id} className="text-sm border rounded-lg p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{l.borrower_name}</span>
                      <span className={`text-xs rounded-full px-2 py-0.5 ${l.status === "lent" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>
                        {l.status === "lent" ? "貸出中" : "返却済"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {l.lent_at?.split("T")[0]} → {l.returned_at?.split("T")[0] || l.due_date || "未定"}
                    </div>
                    {l.purpose && <div className="text-xs text-muted-foreground">{l.purpose}</div>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* Maintenance records */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              メンテナンス記録
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(item.maintenance || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">記録なし</p>
            ) : (
              <div className="space-y-2">
                {item.maintenance.map((m: any) => (
                  <div key={m.id} className="text-sm border rounded-lg p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{m.title}</span>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-xs">
                          {maintenanceTypeLabels[m.record_type]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {maintenanceStatusLabels[m.status]}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {m.reported_at?.split("T")[0]}
                      {m.repair_cost ? ` / 費用: ¥${m.repair_cost.toLocaleString()}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Accessories */}
        {(item.accessories?.length > 0 || item.parent_of?.length > 0) && (
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">付属品・セット</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {item.accessories?.map((a: any) => (
                  <Badge key={a.id} variant="secondary">
                    {a.child_name} ({a.child_eq_code})
                  </Badge>
                ))}
                {item.parent_of?.map((p: any) => (
                  <Badge key={p.id} variant="outline">
                    ← {p.parent_name} ({p.parent_eq_code}) の付属品
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
