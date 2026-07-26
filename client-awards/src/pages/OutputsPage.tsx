/**
 * 出力URLの配り方 — デザイン 20章 24b
 *
 * ── なにが問題だったか ──────────────────────────────────
 *
 * OBS に貼る URL は `?bg=1` `?audio=1` `?lang=en` の組み合わせで意味が変わる。
 * これを**人が手で組み立てていた**ので、本番で1文字違いの URL を貼る事故が起きる。
 * しかも間違いは「何も出ない」形で出るので、原因が分からない。
 *
 * ここでは**選ぶだけ**にして、URL は画面が組み立てる（サーバーが正）。
 *
 * ── 何を選ぶか ──────────────────────────────────────────
 *  1. 何を出すか（ランキングCG / 字幕スーパー / クイズ・アンケート）
 *  2. 音を鳴らすか（**鳴らす出力は1つだけ**にする。全部鳴らすと二重に鳴る）
 *  3. 言葉（日本語 / 英語）
 *  4. 背景（既定は透過。透明度を許可できないときだけ背景あり）
 */
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Copy, Check, ExternalLink, Volume2, Link2 } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { NoPermissionPanel } from '@gmo-onair/shared/src/client/states';

interface UrlResult { url: string; label: string; parts: string[]; hint: string }
interface Format {
  output_uses: Array<{ key: string; label: string; path: string }>;
}

export default function OutputsPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id!);
  const navigate = useNavigate();

  const [use, setUse] = useState('ranking');
  const [audio, setAudio] = useState(false);
  const [lang, setLang] = useState<'ja' | 'en'>('ja');
  const [opaque, setOpaque] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: fmt } = useQuery<{ data: Format }>({
    queryKey: ['onair-format'],
    queryFn: async () => (await api.get('/awards/onair/format')).data,
  });
  const { data, error } = useQuery<{ data: UrlResult }>({
    queryKey: ['output-url', eventId, use, audio, lang, opaque],
    queryFn: async () => (await api.get(`/awards/events/${eventId}/output-url`, {
      params: { use, audio: audio ? '1' : '0', lang, opaque: opaque ? '1' : '0' },
    })).data,
    retry: (count, e) =>
      (e as { response?: { status?: number } })?.response?.status === 403 ? false : count < 2,
  });

  // 権限が無い人には何の権限が要るかを出す (白紙にしない)
  if ((error as { response?: { status?: number } } | null)?.response?.status === 403) {
    return (
      <div className="p-6">
        <NoPermissionPanel modules={['awards']} level="reader" target="出力URLの配り方" />
      </div>
    );
  }

  const uses = fmt?.data.output_uses ?? [];
  const r = data?.data;
  const full = r ? `${window.location.origin}${r.url}` : '';

  const copy = async () => {
    if (!full) return;
    await navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <button onClick={() => navigate(`/event/${eventId}`)}
        className="mb-3 flex min-h-[44px] items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        イベントへ戻る
      </button>

      <h1 className="text-lg font-bold">出力URLの配り方</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        OBS のブラウザソースに貼る URL を作ります。
        <strong className="text-foreground">手で組み立てないでください</strong> —
        1文字違うと「何も出ない」形で失敗し、本番中に原因が分かりません。
      </p>

      <div className="mt-4 space-y-4">
        {/* 1. 何を出すか */}
        <section className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-bold">1. 何を出すか</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {uses.map((u) => (
              <button key={u.key} onClick={() => setUse(u.key)}
                className={cn(
                  'min-h-[44px] rounded-lg border px-3 text-sm',
                  use === u.key ? 'border-primary bg-primary/10 font-bold text-primary' : 'hover:bg-muted',
                )}>
                {u.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            出すものごとに1つのブラウザソースを作ります（1つの URL に混ぜられません）。
          </p>
        </section>

        {/* 2. 音 */}
        <section className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-bold">2. 音を鳴らすか</h2>
          <label className="mt-2 flex min-h-[44px] cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={audio}
              onChange={(e) => setAudio(e.target.checked)} aria-label="音を鳴らす" />
            <Volume2 className="h-4 w-4" aria-hidden="true" />
            音を鳴らす
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            <strong className="text-foreground">鳴らすのは1つだけにしてください。</strong>
            2つ以上のブラウザソースで音を鳴らすと、同じ音が重なって聞こえます。
          </p>
        </section>

        {/* 3. 言葉 */}
        <section className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-bold">3. 言葉</h2>
          <div className="mt-2 flex gap-2">
            {(['ja', 'en'] as const).map((l) => (
              <button key={l} onClick={() => setLang(l)}
                className={cn(
                  'min-h-[44px] rounded-lg border px-4 text-sm',
                  lang === l ? 'border-primary bg-primary/10 font-bold text-primary' : 'hover:bg-muted',
                )}>
                {l === 'ja' ? '日本語' : '英語'}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            英語にすると、英語名が入っていないノミネートは日本語のまま出ます。
          </p>
        </section>

        {/* 4. 背景 */}
        <section className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-bold">4. 背景</h2>
          <label className="mt-2 flex min-h-[44px] cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={opaque}
              onChange={(e) => setOpaque(e.target.checked)} aria-label="背景を付ける" />
            背景を付ける（透過にしない）
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            既定は透過です。スイッチャーやOBSで透明度を許可できないときだけ背景を付けます。
          </p>
        </section>

        {/* できた URL */}
        <section className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4">
          <h2 className="flex items-center gap-1 text-sm font-bold">
            <Link2 className="h-4 w-4" aria-hidden="true" />
            この URL を貼ります
          </h2>
          {r && (
            <>
              <p className="mt-2 text-xs text-muted-foreground">
                {r.parts.join(' ・ ')}
              </p>
              <code className="mt-2 block break-all rounded-lg bg-background p-3 text-xs">
                {full}
              </code>
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={copy}
                  className="flex min-h-[44px] items-center gap-1 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground hover:opacity-90">
                  {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                  {copied ? 'うつしました' : 'URLをうつす'}
                </button>
                <a href={full} target="_blank" rel="noreferrer"
                  className="flex min-h-[44px] items-center gap-1 rounded-lg border px-4 text-sm hover:bg-muted">
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  出るか見てみる
                </a>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{r.hint}</p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
