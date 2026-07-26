/**
 * confirmAction — 「本当にやりますか」を画面の中で訊く。
 *
 * ── なぜ `window.confirm()` をやめるか ────────────────────────────
 *
 * v2.9.289 時点で `alert()` / `confirm()` が **129 か所**残っていた。
 * ブラウザ標準のダイアログには、業務システムとして困る性質が4つある:
 *
 *  1. **画面のデザインの外側に出る。** 色も字も配置も揃わないので、
 *     「システムが出した確認」なのか「ブラウザが出した警告」なのか区別が付かない。
 *  2. **押すまで他の操作が一切できない。** JS が止まるので、確認の裏で
 *     金額や日付を見返すことができない。本番中・締め作業中に効く。
 *  3. **何が起きるかを1行しか書けない。** 「削除しますか？」だけでは、
 *     一緒に消えるもの (見積の明細・貸出の履歴) を伝えられない。
 *  4. **危ない操作と普通の操作が同じ見た目になる。** 取り消せない操作を
 *     強調できないので、勢いで OK を押せてしまう。
 *
 * ── 使い方 ────────────────────────────────────────────────────
 *
 * `window.confirm()` と同じ形 (await して true / false) で書けるようにしてある。
 * 呼ぶ側は `if (!(await confirmAction({...}))) return;` の1行を置き換えるだけ。
 *
 *   if (!(await confirmAction({
 *     title: 'この売上を削除しますか？',
 *     description: '明細と按分もいっしょに消えます。',
 *     confirmLabel: '削除する',
 *     tone: 'danger',   // 取り消せない操作は danger にする
 *   }))) return;
 *
 * 置き場所は各アプリのレイアウトに `<ConfirmHost />` を 1 つだけ。
 * (お知らせ帯 `<NoticeBar />` と同じ考え方 — 出る場所を 1 か所に決める)
 */
import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { cn } from '../utils';
import { Button } from './button';

export interface ConfirmRequest {
  /** 何をするのかを 1 行で (「〜しますか？」) */
  title: string;
  /** いっしょに何が起きるか。**取り消せないなら必ず書く** */
  description?: string;
  /** 実行するボタンの文字。既定は「実行する」 */
  confirmLabel?: string;
  /** やめるボタンの文字。既定は「やめる」 */
  cancelLabel?: string;
  /** `danger` = 取り消せない操作 (赤で強調する)。既定は `default` */
  tone?: 'default' | 'danger';
}

interface Pending extends ConfirmRequest {
  resolve: (ok: boolean) => void;
}

let pending: Pending | null = null;
const listeners = new Set<(p: Pending | null) => void>();

const publish = (p: Pending | null) => {
  pending = p;
  listeners.forEach((l) => l(pending));
};

/**
 * 確認を訊いて、押された答えを返す。`window.confirm()` の置き換え。
 *
 * `<ConfirmHost />` が画面に無い場合は **false を返す** (勝手に実行しない)。
 * 「置き忘れたら黙って実行される」形にすると、置き忘れが一番危ない事故になる。
 */
export function confirmAction(req: ConfirmRequest): Promise<boolean> {
  if (listeners.size === 0) {
    console.error(
      '[confirmAction] <ConfirmHost /> が画面にありません。確認を出せないので実行しませんでした。',
      req.title,
    );
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    // 既に別の確認が出ているときは、そちらを「やめる」扱いで閉じる
    if (pending) pending.resolve(false);
    publish({ ...req, resolve });
  });
}

// 二重に置いても1つしか出ないようにする (お知らせ帯と同じ理由)
let hostMounted = 0;

/** アプリのルート直下に置く。訊くことが無ければ何も描かない */
export function ConfirmHost(): ReactNode {
  const [req, setReq] = useState<Pending | null>(pending);
  const [primary, setPrimary] = useState(false);

  useEffect(() => {
    hostMounted += 1;
    setPrimary(hostMounted === 1);
    return () => { hostMounted -= 1; };
  }, []);

  useEffect(() => {
    listeners.add(setReq);
    return () => { listeners.delete(setReq); };
  }, []);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      // Esc は「やめる」。Enter で実行はしない (取り消せない操作を勢いで通さない)
      if (e.key === 'Escape') { e.preventDefault(); req.resolve(false); publish(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req]);

  if (!primary || !req) return null;

  const danger = req.tone === 'danger';
  const answer = (ok: boolean) => { req.resolve(ok); publish(null); };
  const Icon = danger ? AlertTriangle : HelpCircle;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      // 外側を押しても閉じない (取り消せない操作を誤って消さない)。やめるボタンで閉じる
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={req.description ? 'confirm-desc' : undefined}
        className="w-full max-w-md rounded-xl border bg-card p-5 shadow-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start gap-3">
          <Icon
            className={cn('mt-0.5 h-5 w-5 shrink-0', danger ? 'text-destructive' : 'text-primary')}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <h2 id="confirm-title" className="text-base font-bold text-foreground">{req.title}</h2>
            {req.description && (
              <p id="confirm-desc" className="mt-1.5 text-sm text-muted-foreground whitespace-pre-line">
                {req.description}
              </p>
            )}
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {/*
            取り消せない操作 (danger) では**最初から「やめる」に当たっている**。
            開いた瞬間に Enter を押しても実行されないようにするため
            (勢いで通してしまうのを防ぐ)。普通の確認は実行側に当てる。
          */}
          <Button
            variant="outline"
            className="min-h-11"
            autoFocus={danger}
            onClick={() => answer(false)}
          >
            {req.cancelLabel ?? 'やめる'}
          </Button>
          <Button
            variant={danger ? 'destructive' : 'default'}
            className="min-h-11"
            autoFocus={!danger}
            onClick={() => answer(true)}
          >
            {req.confirmLabel ?? '実行する'}
          </Button>
        </div>
      </div>
    </div>
  );
}
