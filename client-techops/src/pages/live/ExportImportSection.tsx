// 計時・視聴者（liveops）— 組織の鍵設定「設定の書き出し・読み込み」節。
// `LiveOrgSettingsPage.tsx` から役割で切り出した（`npm run lint` の400行基準対応）。
// `client-live/src/pages/SettingsPage.tsx` の同節の移植（番組プリセットのJSON export/import）。
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Download, Upload } from 'lucide-react';
import { notifySuccess } from '@/lib/notify';

async function handleExport() {
  const [progs, setts] = await Promise.all([
    api.get('/liveops/programs').then(r => r.data.data),
    api.get('/liveops/settings').then(r => r.data.data),
  ]);
  const blob = new Blob([JSON.stringify({ programs: progs, settings: setts, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `liveops-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}

function handleImport() {
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
    notifySuccess('読み込みが終わりました');
  };
  input.click();
}

export default function ExportImportSection() {
  return (
    <section className="rounded-xl border bg-card p-4 space-y-3">
      <h2 className="text-sm font-semibold">設定の書き出し・読み込み</h2>
      <p className="text-xs text-muted-foreground">
        番組の設定をファイルに保存して、あとから戻せます。（APIキーは含まれません）
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-1" />書き出す
        </Button>
        <Button variant="outline" size="sm" onClick={handleImport}>
          <Upload className="h-4 w-4 mr-1" />読み込む
        </Button>
      </div>
    </section>
  );
}
