// 「前回の設定を写す」ダイアログ。コピー元（案件/番組 × 実施日）を選んで、
// いま開いている画面（ownerKey・date）へ収録設定・配信設定を上書きコピーする。
//
// ⚠️ **作り直した理由**（監査 2026-08-22）
// 最初の実装は「コピー元の案件（GLS番号 または 案件ID）」と「実施日」を**手で入力**させていた。
// つまり利用者に**前回の GLS番号と日付を思い出させる**作りで、モックが
// 「前回（7/22 GMO Yours 定例 #141）の収録設定を写します」と**候補を特定して提示する**
// のとは正反対だった（Main.dc.html:225）。
// いまは同じ案件の別日を候補として並べる。別の案件から引きたいときだけ手入力に落ちる。
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { notifyError, notifySuccess } from '@/lib/notify';
import { apiErrorMessage } from '@/lib/deviceSettingsShared';
import { copyFrom, getServiceDates, type ServiceDateOption } from '@/lib/deviceSettingsApi';

type What = ('recording' | 'streaming')[];

const whatLabel = (what: What) => {
  const r = what.includes('recording');
  const s = what.includes('streaming');
  if (r && s) return '収録設定・配信設定';
  return r ? '収録設定' : '配信設定';
};

export default function CopyFromDialog({
  open, onOpenChange, ownerKey, date, what, onCopied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerKey: string;
  date: string;
  what: What;
  onCopied: () => void;
}) {
  const [candidates, setCandidates] = useState<ServiceDateOption[]>([]);
  const [pickedDate, setPickedDate] = useState('');
  const [otherOwner, setOtherOwner] = useState(false);
  const [fromKey, setFromKey] = useState(ownerKey);
  const [fromDate, setFromDate] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOtherOwner(false); setFromKey(ownerKey); setFromDate(''); setPickedDate('');
    getServiceDates(ownerKey).then((all) => {
      // いま開いている日は候補から外す（自分から自分へは写さない）。
      // その画面が扱う種別の設定が実際にある日だけを出す。
      const kind = what.includes('recording') ? 'hasRecording' : 'hasStreaming';
      const usable = all.filter((o) => o.date !== date && o[kind]);
      setCandidates(usable);
      setPickedDate(usable.length ? usable[usable.length - 1].date : '');
    });
  }, [open, ownerKey, date, what]);

  const srcKey = otherOwner ? fromKey.trim() : ownerKey;
  const srcDate = otherOwner ? fromDate : pickedDate;
  const canRun = !!srcKey && !!srcDate && !busy;

  const run = async () => {
    if (!canRun) return;
    setBusy(true);
    try {
      const res = await copyFrom(ownerKey, date, { ownerKey: srcKey, date: srcDate }, what);
      if (!res.recording && !res.streaming) {
        notifyError('コピー元にその日の設定が見つかりませんでした');
        return;
      }
      notifySuccess('前回の設定を写しました');
      onOpenChange(false);
      onCopied();
    } catch (e) {
      notifyError(apiErrorMessage(e, '写すのに失敗しました'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>前回の設定を写す</DialogTitle></DialogHeader>

        <p className="text-sm text-muted-foreground">
          選んだ日の{whatLabel(what)}を、この画面（<strong>{date}</strong>）に上書きコピーします。
        </p>

        <div className="mt-4 space-y-4">
          {!otherOwner ? (
            <div>
              <Label>この案件の別の日から</Label>
              {candidates.length === 0 ? (
                <p className="mt-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  この案件に、写せる{whatLabel(what)}のある日がまだありません。
                </p>
              ) : (
                <select
                  className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  value={pickedDate}
                  onChange={(e) => setPickedDate(e.target.value)}
                >
                  {candidates.map((o) => <option key={o.date} value={o.date}>{o.date}</option>)}
                </select>
              )}
              <button
                type="button"
                className="mt-2 min-h-[44px] text-sm text-primary underline underline-offset-2"
                onClick={() => setOtherOwner(true)}
              >
                別の案件から写す
              </button>
            </div>
          ) : (
            <>
              <div>
                <Label htmlFor="cf-key">コピー元の案件（GLS番号 または 案件ID）</Label>
                <Input id="cf-key" className="h-11" value={fromKey} onChange={(e) => setFromKey(e.target.value)} placeholder="GLS-A012" />
              </div>
              <div>
                <Label htmlFor="cf-date">コピー元の実施日</Label>
                <Input id="cf-date" type="date" className="h-11" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <button
                type="button"
                className="min-h-[44px] text-sm text-primary underline underline-offset-2"
                onClick={() => setOtherOwner(false)}
              >
                この案件の別の日に戻す
              </button>
            </>
          )}

          <p className="rounded-lg border border-warning-border bg-warning-surface px-3 py-2 text-xs text-muted-foreground">
            <strong className="text-warning">ストリームキーと WEB会議は写しません。</strong>
            鍵は「前回の設定を写す」で付いてくると意図しない配信につながるため、
            会議の URL・パスコードは日ごとに別物のためです。
          </p>
        </div>

        <Button className="mt-6 h-[52px] w-full text-base" onClick={run} disabled={!canRun}>
          {busy ? '写しています…' : '写す'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
