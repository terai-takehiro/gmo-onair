import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, CheckCircle, Download, Upload } from 'lucide-react';

export default function SettingsPage() {
  const [youtubeApiKey, setYoutubeApiKey] = useState('');
  const [jstreamToken, setJstreamToken] = useState('');
  const [pollingInterval, setPollingInterval] = useState('10');
  const [showYt, setShowYt] = useState(false);
  const [showJs, setShowJs] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data: settings, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/liveops/settings').then(r => r.data.data),
  });

  useEffect(() => {
    if (settings) setPollingInterval(String(settings.pollingIntervalSec));
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () => api.put('/liveops/settings', {
      youtubeApiKey: youtubeApiKey || undefined,
      jstreamToken: jstreamToken || undefined,
      pollingIntervalSec: parseInt(pollingInterval, 10),
    }),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setYoutubeApiKey('');
      setJstreamToken('');
      refetch();
    },
  });

  const handleExport = async () => {
    const [progs, setts] = await Promise.all([
      api.get('/liveops/programs').then(r => r.data.data),
      api.get('/liveops/settings').then(r => r.data.data),
    ]);
    const blob = new Blob([JSON.stringify({ programs: progs, settings: setts, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `liveops-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.programs) {
        for (const p of data.programs) {
          await api.post('/liveops/programs', {
            name: p.name, youtubeUrls: p.youtube_urls, jstreamLpid: p.jstream_lpid,
          }).catch(() => {});
        }
      }
      alert('インポートが完了しました');
    };
    input.click();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-card px-4 py-2">
        <h1 className="text-sm font-bold">設定</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-lg space-y-6">
          {/* API Keys */}
          <section className="rounded-xl border bg-card p-4 space-y-4">
            <h2 className="text-sm font-semibold">APIキー設定</h2>
            <p className="text-xs text-muted-foreground">
              APIキーはサーバーでAES-256-GCM暗号化して保存されます。入力した値は画面を離れると消去されます。
            </p>

            <div className="space-y-1.5">
              <Label>YouTube Data API v3 キー</Label>
              <div className="flex items-center gap-2">
                <Input
                  type={showYt ? 'text' : 'password'}
                  value={youtubeApiKey}
                  onChange={e => setYoutubeApiKey(e.target.value)}
                  placeholder={settings?.hasYoutubeKey ? '****' + (settings?.youtubeApiKeyMasked?.slice(-4) || '') : '未設定'}
                  className="flex-1"
                />
                <Button variant="ghost" size="sm" onClick={() => setShowYt(!showYt)}>
                  {showYt ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {settings?.hasYoutubeKey && (
                <p className="text-xs text-green-600">設定済み ({settings.youtubeApiKeyMasked})</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Jstream トークン</Label>
              <div className="flex items-center gap-2">
                <Input
                  type={showJs ? 'text' : 'password'}
                  value={jstreamToken}
                  onChange={e => setJstreamToken(e.target.value)}
                  placeholder={settings?.hasJstreamToken ? '****' + (settings?.jstreamTokenMasked?.slice(-4) || '') : '未設定'}
                  className="flex-1"
                />
                <Button variant="ghost" size="sm" onClick={() => setShowJs(!showJs)}>
                  {showJs ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {settings?.hasJstreamToken && (
                <p className="text-xs text-green-600">設定済み ({settings.jstreamTokenMasked})</p>
              )}
            </div>
          </section>

          {/* Polling */}
          <section className="rounded-xl border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold">ポーリング設定</h2>
            <div className="flex items-center gap-3">
              <Label className="w-32 shrink-0">取得間隔 (秒)</Label>
              <Input
                type="number" min={5} max={300}
                value={pollingInterval}
                onChange={e => setPollingInterval(e.target.value)}
                className="w-24"
              />
            </div>
          </section>

          <Button
            className="w-full"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saved ? <><CheckCircle className="h-4 w-4 mr-2" />保存しました</> : '設定を保存'}
          </Button>

          {/* Export / Import */}
          <section className="rounded-xl border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold">設定の書き出し・読み込み</h2>
            <p className="text-xs text-muted-foreground">
              番組プリセットをJSONファイルとして保存・復元できます。（APIキーは含まれません）
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-1" />エクスポート
              </Button>
              <Button variant="outline" size="sm" onClick={handleImport}>
                <Upload className="h-4 w-4 mr-1" />インポート
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
