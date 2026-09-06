/**
 * ⑦ 受付（貼って送るだけ）— スマホ・モックの端末枠 7枚目
 *
 * ── 何のための画面か ────────────────────────────────────────
 *
 * 外で聞いた話を**その場で受付に入れる**ための画面です。
 * モックの但し書きがこの画面の範囲を決めています:
 *
 *   > **読み取った内容の細かい修正はPCで行います。ここでは送るところまで。**
 *
 * だから項目を増やしません。出どころ・いつ・誰から・本文の4つだけです。
 * 案件にするか・見送るかは PC の**案件作成**（`/sales/projects/new`）で決めます
 * （旧「受付」はそこに畳みました）。
 *
 * ── スマホには受付の入口が無かった ──────────────────────────
 *
 * PC の受付は「入れる→確かめる→案件にする」の3段の作業台で、
 * 375px では扱えません。**その結果、外で聞いた話を入れる手段が無く、
 * 会社に戻るまで口頭のまま**でした。この画面はその1段目だけを取り出したものです。
 *
 * ── モックから外したもの（作り話をしない）────────────────────
 *
 * | モック | どうしたか |
 * | --- | --- |
 * | ボタン「**AIで取り込む**」 | **「受付に送る」にした。** 貼った文章を読み取る AI はまだありません。無いものを AI と書くと、以後この画面の表示が信用されなくなります |
 * | **名刺を撮る** | **出していません。** 名刺を読む口（OCR）が無く、画像を貼り付ける先も `misc_inquiries` にありません。押せないボタンを置くより、無いことを書きます |
 * | **録音から** | **出していません。** スマホの録音画面（モックの ⑤）はこれから作ります |
 *
 * ── 受け側 ──────────────────────────────────────────────────
 *
 * `POST /dailyops/inquiries`。**新しい口は作っていません**（PC の受付・
 * メール取込・MCP と同じ入口）。行き先は `unsorted`（未仕分け）で入り、
 * PC の受付にそのまま並びます。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Send, Info, Phone, Mail, MessageSquare, Users } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { useAuth } from '@/contexts/platform/AuthContext';

/** 出どころ。**サーバーが知っている値だけ**（`INQUIRY_SOURCES`）。`manual` は既存行用なので出さない */
const SOURCES = [
  { key: 'phone', label: '電話', icon: Phone },
  { key: 'talk', label: '対面・打合せ', icon: Users },
  { key: 'mail', label: 'メール', icon: Mail },
  { key: 'slack', label: 'Slack', icon: MessageSquare },
] as const;

/** `YYYY-MM-DDTHH:mm`（端末のピッカーが読む形）。**UTC に倒さない** */
function nowLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function InquiryQuickPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentUser } = useAuth();

  const [source, setSource] = useState<string>('phone');
  const [at, setAt] = useState(nowLocal);
  const [sender, setSender] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const body = text.trim();
  // **要約はサーバーの必須項目。** 打たせず1行目から作る（打つ項目を増やさない）
  const summary = body.split('\n').find((l) => l.trim())?.trim().slice(0, 80) ?? '';

  const send = async () => {
    setBusy(true);
    try {
      await api.post('/dailyops/inquiries', {
        summary,
        body_text: body,
        source,
        sender: sender.trim() || null,
        received_at: at || null,
        requested_by: currentUser?.name ?? null,
      });
      qc.invalidateQueries({ queryKey: ['dashboard', 'inbox'] });
      qc.invalidateQueries({ queryKey: ['inquiries'] });
      notifySuccess('受付に送りました', { description: '中身の整理は PC の受付から行えます。' });
      // **続けて入れられるようにする。** 現場では立て続けに2件3件と入る
      setText(''); setSender(''); setAt(nowLocal());
    } catch (e) {
      notifyApiError('送れませんでした', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="電話・その他を貼る"
        sub="聞いた話をそのまま貼って送るだけの画面です。整理は PC の受付で行います"
        // **主ボタンはシェルが下端に置く**（決めごと「主操作は下半分に置く」）
        primaryAction={
          <Button className="w-full sm:w-auto" disabled={busy || !body} onClick={send}>
            <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />受付に送る
          </Button>
        }
      />

      {/*
        **この画面の目的そのもの（聞いた話の貼り付け）を先頭に置く。**
        送れるかどうかは本文だけで決まる（`!body`）のに、
        元は既定値が入っている出どころ・いつ・任意の「誰から」を3つ越えてから
        本文に着く形でした。電話を切った直後にその場で開く画面なので、
        **開いたらすぐ貼れる**のが正しい（`docs/design/v4/_form-order.md`）。
        `autoFocus` はこの画面だけの例外です — ダイアログではないので
        共通シェル（`client-v4/sheet.tsx`）の初期フォーカスが効きません。
      */}
      <div>
        <Label htmlFor="iq-body">聞いた話・メモを貼る</Label>
        <Textarea
          id="iq-body"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={'10月に配信の相談。カメラ3台くらい。\n予算は500万前後、日程は10/3の土曜が第一希望。\n宮田様（宣伝部）から折り返し希望。'}
          className="min-h-[168px]"
        />
        <p className="text-note mt-1 text-muted-foreground">
          1行目が受付の見出しになります。長さは気にせず、聞いたままで大丈夫です。
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sub mb-1 font-bold">どこから来た話ですか</legend>
        <div className="grid grid-cols-2 gap-2">
          {SOURCES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSource(s.key)}
              aria-pressed={source === s.key}
              className={cn(
                'rounded-control-lg min-h-tap flex items-center gap-2 border px-3.5 text-left',
                source === s.key
                  ? 'border-primary bg-primary-surface font-bold text-primary'
                  : 'border-border bg-card text-secondary-foreground',
              )}
            >
              <s.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="text-sub min-w-0 truncate">{s.label}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="iq-at">いつの話か</Label>
          {/* **端末のピッカーに任せる**（決めごと「入力は端末に任せる」） */}
          <Input id="iq-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="iq-from">誰から（分かれば）</Label>
          <Input
            id="iq-from"
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            placeholder="ミナトデジタル 宮田様"
          />
        </div>
      </div>

      <p className="rounded-note flex items-start gap-2 border border-info-border bg-info-surface px-3.5 py-3 text-note text-secondary-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
        <span>
          送ったものは<strong className="font-bold">受付の「未仕分け」</strong>に入ります。
          案件にするか見送るかは PC の受付で決めます。
          <strong className="font-bold">貼った文章を AI が読み取る機能はまだありません</strong>
          （そのまま保存されます）。名刺の読み取りと録音からの取り込みもこれからです。
        </span>
      </p>

      <button
        type="button"
        onClick={() => navigate('/sales/projects/new')}
        className="min-h-tap text-sub self-start text-primary underline lg:min-h-0"
      >
        案件作成を開く
      </button>
    </div>
  );
}
