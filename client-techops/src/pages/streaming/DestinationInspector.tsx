/**
 * 配信設定: 右 372px のインスペクタ。**プロトコルで出す欄を変える**（#279 §3-2 / モック Stream.dc.html:104-147）。
 * ⚠️ 素の <input> で構わない（useState のローカル状態。impl doc §5-2）。
 *
 * ⚠️ 直したこと（監査 2026-08-22）:
 *   ① キー欄に伏せ字（`****abcd`）を**値として**入れていた。触ると伏せ字が
 *      新しい鍵として保存されかけ、しかも名前を直すと保存済みの鍵が消えていた。
 *      → 値は常に空。伏せ字は placeholder に出すだけにする。
 *   ② プロトコル未選択のとき「キー不要」と出しながら、同じ欄の下に「新規は必須」、
 *      選択肢には「未選択（新規は RTMP 扱い）」。**同じ画面が3つの違うことを言っていた。**
 *      → 判定は共有の `keyStatus()` に一本化し、「未選択」という選択肢自体をやめた。
 *   ③ 規則違反・不足の理由がその場に出ず、Excel の書き出しダイアログを開くまで
 *      気づけなかった（しかもそれは保存済みの内容しか見ない）。
 *      → `destIssues()` の結果を各欄の下に赤字で出す。
 */
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DestIssue } from '@/lib/deviceSettingsShared';
import type { Destination } from '@/lib/deviceSettingsApi';
import { PROTOCOLS, keyState, keyToneClass } from './destinationHelpers';
import {
  CUSTOM_PRESET, RTMP_PRESETS, YOUTUBE_BITRATES, YOUTUBE_ENCODER_NOTES, YOUTUBE_STUDIO_ITEMS,
  isYouTubeUrl, presetOf, urlForPreset,
} from './streamPresets';

const fieldCls =
  'h-11 w-full min-w-0 rounded-control-lg border border-input bg-background px-3 text-sub ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const badFieldCls = 'border-destructive-border bg-destructive-surface';

/** 欄の下の注記（理由があれば赤字で出す） */
function Note({ children, bad }: { children: React.ReactNode; bad?: boolean }) {
  return (
    <p className={cn('mt-1 text-note', bad ? 'text-destructive' : 'text-muted-foreground')}>
      {children}
    </p>
  );
}

export default function DestinationInspector({
  dest,
  issues,
  onChange,
  onDelete,
}: {
  dest: Destination;
  /** その場の点検結果（`destIssues()`）。欄の下に出す */
  issues: DestIssue[];
  onChange: (next: Destination) => void;
  onDelete: () => void;
}) {
  const set = <K extends keyof Destination>(key: K, value: Destination[K]) => onChange({ ...dest, [key]: value });
  const num = (v: string) => (v ? Number(v) : undefined);
  const issueOf = (field: string) => issues.find((i) => i.field === field)?.message ?? null;

  const protocol = dest.protocol ?? 'RTMP';
  const isSrt = protocol !== 'RTMP';
  const nameErr = issueOf('name');
  const ks = keyState(dest);
  const clearing = dest.streamKey === '' && !!dest.hasStreamKey;

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center gap-2 border-b pb-2">
        {/* ⚠️ 以前は「ENC1 の設定」だけで、どの配信先を直しているのか分からなかった */}
        <span className="shrink-0 text-th tabular-nums text-primary">{dest.encoderId}</span>
        <span className="min-w-0 flex-1 truncate text-cardtitle">
          {dest.name || '（名前がありません）'}
        </span>
        <Button size="sm" variant="ghost" className="h-11 shrink-0 text-destructive" onClick={onDelete}>
          <Trash2 className="mr-1 h-3.5 w-3.5" /> 削除
        </Button>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="dest-name">セッション名</Label>
          {/* 32文字の上限は現地の機器の都合。打ちながら残りが分かるようにする */}
          <span className={cn('text-sub-sm tabular-nums', (dest.name?.length ?? 0) > 32 ? 'text-destructive' : 'text-muted-foreground')}>
            {dest.name?.length ?? 0}/32
          </span>
        </div>
        <input
          id="dest-name"
          className={cn(fieldCls, nameErr && badFieldCls)}
          value={dest.name}
          onChange={(e) => set('name', e.target.value)}
          aria-invalid={!!nameErr}
        />
        {/* 注記は消さない。違反したときだけ出すと「なぜ弾かれたか」が後から分からない */}
        <Note>半角の英数と <span className="whitespace-nowrap tabular-nums">._-+&apos;[]()</span> と空白のみ・32文字以内。この名前で現地の設定と突き合わせます</Note>
        {nameErr && <Note bad>{nameErr}</Note>}
      </div>

      <div>
        <Label>プロトコル</Label>
        {/* 横並び3つのセグメント（モック Stream.dc.html:122-127）。
            ⚠️ 「未選択」という選択肢は作らない（新規は RTMP 扱いなので、
            未選択のままだと画面の説明と食い違う） */}
        <div className="flex gap-1.5" role="radiogroup" aria-label="プロトコル">
          {PROTOCOLS.map((p) => {
            const on = p === protocol;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set('protocol', p)}
                className={cn(
                  'min-h-tap flex-1 whitespace-nowrap rounded-control-lg border text-badge transition-colors',
                  // 選択中はウェイト 800（_rules.md「選択状態」）。型スケールの 700 を上書きする
                  on ? 'border-primary bg-primary-surface font-extrabold text-primary' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>

      {protocol === 'RTMP' && (
        <div>
          <Label htmlFor="dest-preset">配信先プリセット</Label>
          {/* Assistant（現地アプリ）と同じ2択＋カスタム。URL の打ち間違いを無くす。
              選んだ値は覚えず、URL から逆引きする（手で書き換えたら「カスタム入力」に戻る） */}
          <select
            id="dest-preset"
            className={fieldCls}
            value={presetOf(dest.url)}
            onChange={(e) => {
              const url = urlForPreset(e.target.value);
              // 「カスタム入力」は何もしない（入っていた URL を消さない — Assistant と同じ判断）
              if (url !== null) set('url', url);
            }}
          >
            {RTMP_PRESETS.map((p) => (
              <option key={p.label} value={p.label}>{p.label}</option>
            ))}
            <option value={CUSTOM_PRESET}>{CUSTOM_PRESET}</option>
          </select>
        </div>
      )}

      {protocol !== 'SRT Listener' && (
        <div>
          <Label htmlFor="dest-url">{protocol === 'RTMP' ? '宛先 URL (rtmp://host/app)' : '宛先ホスト'}</Label>
          <input
            id="dest-url"
            className={cn(fieldCls, issueOf('url') && badFieldCls)}
            value={dest.url ?? ''}
            onChange={(e) => set('url', e.target.value)}
          />
          {issueOf('url') && <Note bad>{issueOf('url')}</Note>}
        </div>
      )}

      {protocol === 'RTMP' && isYouTubeUrl(dest.url) && (
        /* YouTube の決めごと。ラベルは YouTube Studio の日本語表記と同じにする
           （現場が YouTube Studio と往復しながら確かめるので、言葉がずれると照合できない）。
           欄にはしない — 機器から変えられない設定を欄として置くと
           「打てるのに反映されない欄」になる（#279 の判断） */
        <details className="rounded-note bg-muted px-3 py-2">
          <summary className="cursor-pointer text-list">YouTube 配信の推奨設定（Studio 側の項目）</summary>
          <div className="mt-2 space-y-2 text-note text-muted-foreground">
            <div>
              <p className="font-bold text-foreground">エンコーダの推奨設定（公式の推奨値）</p>
              <ul className="ml-4 list-disc">
                {YOUTUBE_ENCODER_NOTES.map((n) => <li key={n}>{n}</li>)}
              </ul>
              <table className="mt-1 w-full">
                <caption className="sr-only">解像度ごとの推奨ビットレート</caption>
                <thead>
                  <tr className="text-left">
                    <th className="pr-2 font-bold">解像度</th>
                    <th className="font-bold">推奨ビットレート (Kbps)</th>
                  </tr>
                </thead>
                <tbody>
                  {YOUTUBE_BITRATES.map((b) => (
                    <tr key={b.quality}>
                      <td className="pr-2">{b.quality}</td>
                      <td className="tabular-nums">{b.kbps}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <p className="font-bold text-foreground">YouTube Studio 側で設定する項目（機器からは変えられません）</p>
              <ul className="ml-4 list-disc">
                {YOUTUBE_STUDIO_ITEMS.map((i) => (
                  <li key={i.label}><span className="font-bold">{i.label}</span>: {i.values}</li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      )}

      {isSrt && (
        <div>
          <Label htmlFor="dest-port">{protocol === 'SRT Listener' ? '待受ポート' : 'ポート'}</Label>
          <input
            id="dest-port"
            type="number"
            inputMode="numeric"
            className={cn(fieldCls, issueOf('port') && badFieldCls)}
            value={dest.port ?? ''}
            onChange={(e) => set('port', num(e.target.value))}
          />
          {issueOf('port') && <Note bad>{issueOf('port')}</Note>}
        </div>
      )}

      {protocol === 'RTMP' && (
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="dest-key">ストリームキー</Label>
            <span className={cn('text-badge', keyToneClass(ks.tone))}>{ks.label}</span>
          </div>
          <input
            id="dest-key"
            type="password"
            autoComplete="off"
            className={cn(fieldCls, issueOf('streamKey') && badFieldCls)}
            /* ⚠️ 保存済みの鍵は**絶対にここへ入れない**（伏せ字も含む）。
               入れると「触っただけ」で伏せ字が新しい鍵として保存される */
            value={dest.streamKey ?? ''}
            /* ⚠️ 打った字を全部消したときは「消す」ではなく**未設定**に戻す。
               `''` は「鍵を消す」の意味なので、打ち間違いを直そうとして
               空にしただけで鍵が消えてしまう。消すのは下のボタンからだけ */
            onChange={(e) => set('streamKey', e.target.value === '' ? undefined : e.target.value)}
            placeholder={dest.hasStreamKey ? (dest.streamKeyMasked || '設定済み') : '新しい鍵を入れる'}
          />
          <Note>空欄のまま保存すると、いまの鍵をそのまま残します。</Note>
          {(dest.hasStreamKey || dest.streamKey) && <Note>書き出す Excel には平文で入ります。</Note>}
          {issueOf('streamKey') && <Note bad>{issueOf('streamKey')}</Note>}
          {dest.hasStreamKey && (
            clearing ? (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-list text-destructive">保存すると、いまの鍵を消します。</span>
                {/* 消す指定を戻す（undefined ＝ いまの鍵をそのまま残す） */}
                <Button size="sm" variant="outline" className="h-11" onClick={() => set('streamKey', undefined)}>
                  取り消す
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="mt-1 h-11 text-destructive" onClick={() => set('streamKey', '')}>
                キーを削除
              </Button>
            )
          )}
        </div>
      )}

      {isSrt ? (
        <>
          <div>
            <Label htmlFor="dest-aes">暗号化</Label>
            <select
              id="dest-aes"
              className={fieldCls}
              value={dest.aes ?? 'なし'}
              onChange={(e) => set('aes', e.target.value as Destination['aes'])}
            >
              <option value="なし">なし</option>
              <option value="AES-128">AES-128</option>
              <option value="AES-192">AES-192</option>
              <option value="AES-256">AES-256</option>
            </select>
          </div>
          <div>
            <Label htmlFor="dest-pass">パスフレーズ</Label>
            <input
              id="dest-pass"
              className={cn(fieldCls, issueOf('passphrase') && badFieldCls)}
              value={dest.passphrase ?? ''}
              onChange={(e) => set('passphrase', e.target.value)}
              disabled={!dest.aes || dest.aes === 'なし'}
            />
            {issueOf('passphrase')
              ? <Note bad>{issueOf('passphrase')}</Note>
              : <Note>{!dest.aes || dest.aes === 'なし' ? '暗号化が「なし」なので不要です。' : '暗号化ありのときは必須です。'}</Note>}
          </div>
          {protocol === 'SRT Caller' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="dest-lat">Latency (ms)</Label>
                <input id="dest-lat" type="number" inputMode="numeric" className={fieldCls} value={dest.latencyMs ?? ''} onChange={(e) => set('latencyMs', num(e.target.value))} />
              </div>
              <div>
                <Label htmlFor="dest-bw">Bandwidth (%)</Label>
                <input id="dest-bw" type="number" inputMode="numeric" className={fieldCls} value={dest.bandwidthPct ?? ''} onChange={(e) => set('bandwidthPct', num(e.target.value))} />
              </div>
              <div>
                <Label htmlFor="dest-mtu">MTU</Label>
                <input id="dest-mtu" type="number" inputMode="numeric" className={fieldCls} value={dest.mtu ?? ''} onChange={(e) => set('mtu', num(e.target.value))} />
              </div>
              <p className="col-span-2 text-note text-muted-foreground">範囲は機器が答えます。ONAiR 側では縛りません。</p>
            </div>
          )}
        </>
      ) : (
        <p className="rounded-note bg-muted px-3 py-2 text-note text-muted-foreground">
          プロトコルを SRT に変えると、ポート・パスフレーズ・Latency・Bandwidth・MTU・暗号化が出てきます。
        </p>
      )}

      {protocol === 'SRT Listener' && (
        <p className="rounded-note bg-muted px-3 py-2 text-note text-muted-foreground">
          SRT Listener は待ち受け側なので、宛先 URL は要りません。
        </p>
      )}
    </div>
  );
}
