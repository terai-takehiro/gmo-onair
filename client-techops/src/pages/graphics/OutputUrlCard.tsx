// テロップCG — 「出力URLの配り方」カード（ハブ画面・モック①の下段）。
//
// OBS・スイッチャーのブラウザソースに貼る**ログイン不要の公開URL**
// （docs/design/v4/graphics.md §7 — 旧 `/awards/output/*` の運用資産の継承）。
// 1920×1080 固定・既定は透過、`?bg=1` で不透明の黒背景。
import { Share2, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { notifyError, notifySuccess } from '@/lib/notify';
import { graphicsOutputPath } from '@/lib/graphicsApi';

export default function OutputUrlCard({ projectId }: { projectId: string }) {
  const rows = [
    { key: 'main', label: 'メイン合成（透過）', path: graphicsOutputPath(projectId) },
    { key: 'bg', label: '確認用（黒背景）', path: graphicsOutputPath(projectId, { bg: true }) },
  ];

  const copy = async (path: string) => {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      notifySuccess('出力URLをコピーしました');
    } catch {
      notifyError('コピーできませんでした', { description: url });
    }
  };

  return (
    <section className="rounded-card border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Share2 className="h-4 w-4 text-primary" aria-hidden="true" />
        <h3 className="text-cardtitle">出力URLの共有方法</h3>
      </div>
      <p className="mt-2 text-note text-muted-foreground">
        OBS・スイッチャーのブラウザソースに貼る<strong>ログイン不要の公開URL</strong>です。
        1920×1080・既定は透過（「透明度を許可」を有効に）。確認だけなら黒背景の方を開きます。
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2 rounded-control-md border border-border-subtle bg-surface-subtle px-3 py-2">
            <span className="w-36 shrink-0 text-sub font-bold">{r.label}</span>
            <span className="font-number min-w-0 flex-1 truncate text-note text-muted-foreground">{r.path}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => copy(r.path)}>
              <Copy className="mr-1 h-3.5 w-3.5" aria-hidden="true" />コピー
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              {/* 出力画面はシェル無しの別ルート。運用（OBS）と同じ形で別タブで開く */}
              <a href={r.path} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1 h-3.5 w-3.5" aria-hidden="true" />開く
              </a>
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
