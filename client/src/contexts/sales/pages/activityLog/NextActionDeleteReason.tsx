/**
 * 次のアクションを削除するときの理由（**任意**） (v4)
 *
 * ── なぜ任意にするか ────────────────────────────────────────
 *
 * 削除そのものは「AI が立てたやることは不要だった」という、この製品で回収できる
 * いちばん強い否定の信号です。ただし**なぜ不要になったか**までは削除だけでは分かりません
 * （拾いすぎたのか、案件が止まっただけなのか）。そこで1行だけ選べるようにします。
 *
 * **必須にはしません。** 人に差分の入力を強いると運用が続かず、
 * 結局「削除ごと使われなくなる」ほうが損です（`.claude/skills/ai-feedback-loop/`）。
 *
 * ── 3択の意味 ──────────────────────────────────────────────
 *
 *   対応済み        … 正常な業務の終わり（AI は間違っていない）
 *   案件が停止      … 正常な業務の終わり（AI は間違っていない）
 *   AI の見当違い   … **ここだけ**がプロンプト改善の対象
 *
 * サーバー（`buildAdvice`）が「AI の見当違い」だけを分母に残せるように、
 * 文字列は**この定数のまま**送ります（画面で書き換えないこと）。
 */
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** サーバーと突き合わせる固定文字列。**変えるときはサーバーと同時に** */
export const DELETE_REASONS = ['対応済み', '案件が停止', 'AI の見当違い'] as const;

export function NextActionDeleteReason({
  value, onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const picked = (DELETE_REASONS as readonly string[]).includes(value) ? value : '';
  return (
    <div className="mt-2 rounded-card border border-border-faint bg-surface-subtle p-3">
      <p className="text-sub font-bold">次のアクションを削除します</p>
      <p className="text-sub-sm text-muted-foreground">
        理由は任意です。選ぶと、AI が立てたやることの精度改善に使われます。
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {DELETE_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={picked === r}
            onClick={() => onChange(picked === r ? '' : r)}
            className={`min-h-tap rounded-control border px-3 text-sub lg:min-h-[32px] ${
              picked === r
                ? 'border-primary bg-primary-surface font-bold text-primary'
                : 'border-border text-muted-foreground'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="mt-2">
        <Label>そのほかの理由（任意）</Label>
        <Input
          value={picked ? '' : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="例: 先方の都合で延期になった"
        />
      </div>
    </div>
  );
}
