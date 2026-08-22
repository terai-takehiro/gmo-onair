// 収録設定・配信設定への入口。
//
// ⚠️ 2026-08-22 追記: 本来の入口（`JourneyPage.tsx` のミニアプリタイル。案件・番組
// どちらのハブからも `panelPathOf('recording'|'streaming', ownerKey)` で直接遷移する）
// を実装した。ここは**その入口を通らない・GLS番号や案件IDだけ分かっているときの
// 簡易入口**として残す判断にした（コメントが挙げていた2択のうち「残す」を採用）。
// 収録設定・配信設定の URL を直接ブックマークしている人・口頭で番号だけ聞いた人向け。
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, Cast } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function DeviceSettingsHome() {
  const navigate = useNavigate();
  const [ownerKey, setOwnerKey] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const go = (kind: 'recording' | 'streaming') => {
    if (!ownerKey.trim()) return;
    navigate(`/qsheet/${kind}/${encodeURIComponent(ownerKey.trim())}?date=${encodeURIComponent(date)}`);
  };

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <h1 className="mb-1 text-lg font-bold">収録設定・配信設定</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        案件（GLS番号 または 案件ID）と実施日を入れて開きます。
      </p>

      <div className="space-y-4">
        <div>
          <Label htmlFor="owner-key">案件（GLS番号 または 案件ID）</Label>
          <Input id="owner-key" className="h-11" value={ownerKey} onChange={(e) => setOwnerKey(e.target.value)} placeholder="GLS-A012" />
        </div>
        <div>
          <Label htmlFor="service-date">実施日</Label>
          <Input id="service-date" type="date" className="h-11" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button className="h-[52px]" onClick={() => go('recording')} disabled={!ownerKey.trim()}>
          <Radio className="mr-2 h-4 w-4" /> 収録設定を開く
        </Button>
        <Button className="h-[52px]" variant="outline" onClick={() => go('streaming')} disabled={!ownerKey.trim()}>
          <Cast className="mr-2 h-4 w-4" /> 配信設定を開く
        </Button>
      </div>
    </div>
  );
}
