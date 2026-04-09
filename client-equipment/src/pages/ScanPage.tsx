import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { QrCode, Search, ArrowRight } from "lucide-react";

export default function ScanPage() {
  const navigate = useNavigate();
  const [manualCode, setManualCode] = useState("");
  const [searchCode, setSearchCode] = useState("");
  const [error, setError] = useState("");

  const { data: searchResult, isFetching } = useQuery({
    queryKey: ["equipment-search-code", searchCode],
    queryFn: async () => {
      const res = await api.get("/equipment/items", { params: { search: searchCode } });
      return res.data.data;
    },
    enabled: searchCode.length >= 3,
  });

  const handleSearch = () => {
    if (!manualCode.trim()) return;
    setError("");
    setSearchCode(manualCode.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="heading-page text-xl lg:text-2xl">QRスキャン</h1>
        <p className="text-sm text-muted-foreground">
          EQコードを入力して機材を検索
        </p>
      </div>

      {/* Manual input */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <QrCode className="h-5 w-5 text-primary" />
            <span className="font-medium">EQコード入力</span>
          </div>
          <div className="flex gap-2">
            <Input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="EQ-XXXXXXXXXX"
              className="font-mono text-lg"
            />
            <Button onClick={handleSearch}>
              <Search className="h-4 w-4 mr-1" />
              検索
            </Button>
          </div>
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </CardContent>
      </Card>

      {/* Search results */}
      {searchCode && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {isFetching ? "検索中..." : `${searchResult?.length || 0}件の結果`}
          </p>
          {(searchResult ?? []).map((item: any) => (
            <Card
              key={item.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/equipment/items/${item.id}`)}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <span className="font-mono text-sm text-primary">{item.eq_code}</span>
                  <h3 className="font-medium">{item.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {item.manufacturer} {item.model_number}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Instructions */}
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          <QrCode className="h-16 w-16 mx-auto mb-4 text-primary/20" />
          <p className="font-medium text-foreground mb-2">QRコードの使い方</p>
          <ol className="text-left space-y-1 max-w-sm mx-auto">
            <li>1. テプラで印刷したQRラベルを機材に貼付</li>
            <li>2. スマホのカメラでQRコードを読み取り</li>
            <li>3. EQコードが表示されるので、上の入力欄に入力</li>
            <li>4. 機材の詳細・貸出・故障報告が可能</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
