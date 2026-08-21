// 配信設定: 右 372px のインスペクタ。**プロトコルで出す欄を変える**（08 §6・#279 §3-2）。
// ⚠️ 素の <input> で構わない（useState のローカル状態。impl doc §5-2）。
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { Destination } from '@/lib/deviceSettingsApi';

const fieldCls =
  'h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** キーの状態は文字で出す（色だけで伝えない・#279 §3-2） */
function keyStatusLabel(d: Destination): string {
  if (d.protocol !== 'RTMP') return 'キー不要';
  if (d.streamKey && d.streamKey.startsWith('****')) return '設定済み';
  return d.streamKey ? '入力中' : '未入力';
}

export default function DestinationInspector({
  dest,
  onChange,
  onDelete,
}: {
  dest: Destination;
  onChange: (next: Destination) => void;
  onDelete: () => void;
}) {
  const set = <K extends keyof Destination>(key: K, value: Destination[K]) => onChange({ ...dest, [key]: value });
  const isSrt = dest.protocol === 'SRT Caller' || dest.protocol === 'SRT Listener';

  return (
    <div className="w-full space-y-4 sm:w-[372px]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{dest.encoderId} の設定</h3>
        <Button size="sm" variant="ghost" className="h-9 text-destructive" onClick={onDelete}>
          <Trash2 className="mr-1 h-3.5 w-3.5" /> この配信先を削除
        </Button>
      </div>

      <div>
        <Label>セッション名</Label>
        <input className={fieldCls} value={dest.name} onChange={(e) => set('name', e.target.value)} maxLength={32} placeholder="半角英数 1〜32文字" />
      </div>

      <div>
        <Label>プロトコル</Label>
        <select className={fieldCls} value={dest.protocol ?? ''} onChange={(e) => set('protocol', (e.target.value || undefined) as Destination['protocol'])}>
          <option value="">未選択（新規は RTMP 扱い）</option>
          <option value="RTMP">RTMP</option>
          <option value="SRT Caller">SRT Caller</option>
          <option value="SRT Listener">SRT Listener</option>
        </select>
      </div>

      {dest.protocol !== 'SRT Listener' && (
        <div>
          <Label>{dest.protocol === 'RTMP' ? '宛先 (rtmp://host/app)' : '宛先ホスト'}</Label>
          <input className={fieldCls} value={dest.url ?? ''} onChange={(e) => set('url', e.target.value)} />
        </div>
      )}

      {isSrt && (
        <div>
          <Label>ポート</Label>
          <input type="number" className={fieldCls} value={dest.port ?? ''} onChange={(e) => set('port', e.target.value ? Number(e.target.value) : undefined)} />
        </div>
      )}

      {(dest.protocol === 'RTMP' || !dest.protocol) && (
        <div>
          <Label>ストリームキー <span className="text-xs font-normal text-muted-foreground">（{keyStatusLabel(dest)}）</span></Label>
          <input
            type="password"
            className={fieldCls}
            value={dest.streamKey ?? ''}
            onChange={(e) => set('streamKey', e.target.value)}
            placeholder={dest.streamKey?.startsWith('****') ? dest.streamKey : '新規は必須。空欄で現地のキーを残す'}
          />
        </div>
      )}

      {isSrt ? (
        <>
          <div>
            <Label>Latency (ms)</Label>
            <input type="number" className={fieldCls} value={dest.latencyMs ?? ''} onChange={(e) => set('latencyMs', e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div>
            <Label>Bandwidth (%)</Label>
            <input type="number" className={fieldCls} value={dest.bandwidthPct ?? ''} onChange={(e) => set('bandwidthPct', e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div>
            <Label>MTU</Label>
            <input type="number" className={fieldCls} value={dest.mtu ?? ''} onChange={(e) => set('mtu', e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div>
            <Label>暗号化</Label>
            <select className={fieldCls} value={dest.aes ?? 'なし'} onChange={(e) => set('aes', e.target.value as Destination['aes'])}>
              <option value="なし">なし</option>
              <option value="AES-128">AES-128</option>
              <option value="AES-192">AES-192</option>
              <option value="AES-256">AES-256</option>
            </select>
          </div>
          {dest.aes && dest.aes !== 'なし' && (
            <div>
              <Label>パスフレーズ</Label>
              <input className={fieldCls} value={dest.passphrase ?? ''} onChange={(e) => set('passphrase', e.target.value)} />
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">プロトコルを SRT に変えると、Latency・Bandwidth・MTU・暗号化の詳細が出てきます。</p>
      )}
    </div>
  );
}
