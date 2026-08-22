// 「前回の設定を写す」ダイアログ。コピー元（案件/番組 × 実施日）を指定して、
// いま開いている画面（ownerKey・date）へ収録設定・配信設定を上書きコピーする。
// API（copyFrom）はサーバー・クライアントとも実装済みだが、呼ぶ画面が無く死んでいたので新設する。
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { notifyError, notifySuccess } from '@/lib/notify';
import { copyFrom } from '@/lib/deviceSettingsApi';

type What = ('recording' | 'streaming')[];

const whatLabel = (what: What) => {
  const hasRecording = what.includes('recording');
  const hasStreaming = what.includes('streaming');
  if (hasRecording && hasStreaming) return '収録設定・配信設定';
  if (hasRecording) return '収録設定';
  return '配信設定';
};

export default function CopyFromDialog({
  open,
  onOpenChange,
  ownerKey,
  date,
  what,
  onCopied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerKey: string; // いま開いている画面の owner（コピー先）
  date: string; // いま開いている画面の実施日（コピー先の日付）
  what: What; // このダイアログが上書きする対象（画面ごとに1つだけ渡ってくる想定）
  onCopied: () => void; // 成功したら呼ぶ（呼び出し側が再読み込みする）
}) {
  // コピー元の案件（GLS番号 または 案件ID）。初期値は ownerKey 自身 —
  // 「同じ案件の別日から写す」が最も多いケースのため
  const [fromKey, setFromKey] = useState(ownerKey);
  // コピー元の実施日。初期値はあえて空にする。「前回」を機械的に（例: 直近の登録日）
  // 推測すると、意図しない日から静かに写ってしまう事故につながるため、必ず手入力させる
  const [fromDate, setFromDate] = useState('');
  const [copying, setCopying] = useState(false);

  const doCopy = async () => {
    const from = fromKey.trim();
    if (!from || !fromDate) { notifyError('コピー元の案件と実施日を入力してください'); return; }
    setCopying(true);
    try {
      const result = await copyFrom(ownerKey, date, { ownerKey: from, date: fromDate }, what);
      if (!result.recording && !result.streaming) {
        notifyError('コピー元にその日の設定が見つかりませんでした');
        return;
      }
      notifySuccess('前回の設定を写しました');
      onOpenChange(false);
      onCopied();
    } catch {
      notifyError('写すのに失敗しました');
    } finally {
      setCopying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>前回の設定を写す</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            指定した案件・実施日の{whatLabel(what)}を、この画面（{date}）に上書きコピーします。
            WEB会議とストリームキーは写されません（現地ごとに異なるため、意図的に対象外にしています）。
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="copy-from-key">コピー元の案件（GLS番号 または 案件ID）</Label>
            <Input
              id="copy-from-key"
              className="h-11"
              value={fromKey}
              onChange={(e) => setFromKey(e.target.value)}
              placeholder="GLS002 など"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="copy-from-date">コピー元の実施日</Label>
            <Input
              id="copy-from-date"
              className="h-11"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
        </div>

        <Button className="mt-6 h-11 w-full text-base" onClick={doCopy} disabled={copying}>
          {copying ? '写しています…' : '写す'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
