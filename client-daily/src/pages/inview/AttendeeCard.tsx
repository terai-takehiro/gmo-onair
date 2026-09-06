/**
 * 内覧会 来場予約 — 来場者1組のカード (v4)
 *
 * 当日の受付で押す面。**代表と同行者を1人ずつ受付できる**のが要点で、
 * 「代表だけ先に来て同行者は後から」が普通に起きるため、まとめて1つの状態に
 * すると誰が来ているのか分からなくなる。
 *
 * ── v4 で変えたところ ────────────────────────────────────────
 *
 * ・**`confirm()` / `alert()` をやめた** (4か所)。ブラウザ標準のダイアログは
 *   デザインの外に出るうえ、押すまで他の操作ができない。当日の受付中に
 *   名簿を見返せなくなるのが困る。`confirmAction` と お知らせ帯 に置き換えた
 * ・**案件化が失敗しても何も出なかった**のを `notifyApiError` にした
 *   (以前は `alert` に技術的なメッセージが出るか、何も出なかった)
 * ・受付ボタンを **44px** にした。指で押す面なので `min-h-tap`
 * ・**スマホは左スワイプでも受付/取消できる**（v4 ネイティブUI監査・不足点②）。
 *   ボタンは消していない — マウス操作の PC と、スワイプに気づかない人のために残す
 */
import { useRef, useState } from 'react';
import {
  Briefcase, Building2, CheckCircle2, Circle, Clock, ExternalLink, Loader2, Mail, MapPin,
  Pencil, Phone, Smartphone, Sparkles, Trash2, User, UserPlus, Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import type { InviewRegistration } from '@/lib/types';
import {
  useCheckInInview, useCheckInInviewCompanion, useDeleteInview, usePromoteInview,
} from '@/lib/inviewApi';
import { companionsOf, headOf } from './logic';

const SWIPE_MAX = 96;
const SWIPE_THRESHOLD = 72;

/**
 * カードを**左スワイプ**すると受付/取消をトリガーする（片方向だけ）。
 * ①最初の8pxで横/縦どちらの操作か決める（縦ならそのままスクロールに譲る＝
 * `preventDefault` しない）②左だけ・最大 `SWIPE_MAX` まで追随させる
 * ③離した位置が `SWIPE_THRESHOLD` を超えていれば実行、そうでなければ 0 へ戻す。
 * **マウスでは動かさない**（`pointerType==='mouse'` を弾く）— PC はボタンで足りる。
 */
function useSwipeToggle(onTrigger: () => void, disabled: boolean) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<'x' | 'y' | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || e.pointerType === 'mouse') return;
    start.current = { x: e.clientX, y: e.clientY };
    axis.current = null;
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dxRaw = e.clientX - start.current.x;
    const dyRaw = e.clientY - start.current.y;
    if (!axis.current) {
      if (Math.abs(dxRaw) < 8 && Math.abs(dyRaw) < 8) return;
      axis.current = Math.abs(dxRaw) > Math.abs(dyRaw) ? 'x' : 'y';
    }
    if (axis.current !== 'x') return;
    setDx(Math.max(-SWIPE_MAX, Math.min(0, dxRaw)));
  };
  const end = () => {
    if (axis.current === 'x' && dx <= -SWIPE_THRESHOLD) onTrigger();
    setDx(0);
    setDragging(false);
    start.current = null;
    axis.current = null;
  };

  return {
    dx,
    dragging,
    handlers: { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end },
  };
}

export function AttendeeCard({
  r, canEdit, onEdit, matchedIn,
}: {
  r: InviewRegistration;
  canEdit: boolean;
  onEdit: () => void;
  /** 検索でどこに当たったか (氏名以外で当たったとき、理由を出す) */
  matchedIn?: string[];
}) {
  const checkIn = useCheckInInview();
  const checkInCompanion = useCheckInInviewCompanion();
  const del = useDeleteInview();
  const promote = usePromoteInview();
  const isPromoted = !!r.promoted_project_id;
  const companions = companionsOf(r);
  const head = headOf(r);
  // 氏名が登録されていない同行者 (人数 - 代表1 - 同行者名の数)
  const unnamed = Math.max(head - 1 - companions.length, 0);
  // 氏名で当たったときは自明なので出さない (受付の画面を余計な字で埋めない)
  const reasons = (matchedIn ?? []).filter((f) => f !== '氏名' && f !== 'ふりがな');

  // ボタンとスワイプの両方から呼ぶ (書き写すと片方だけ直る)
  const onToggleCheckIn = () => {
    checkIn.mutate({ id: r.id, checkedIn: !r.checked_in_at }, {
      onError: (e) => notifyApiError('受付を変えられませんでした', e),
    });
  };
  const swipe = useSwipeToggle(onToggleCheckIn, !canEdit || checkIn.isPending);

  const onPromote = async () => {
    const ok = await confirmAction({
      title: `${r.company || r.name} を案件化しますか`,
      description: '顧客・ヨミ案件・来場の活動記録をまとめて作ります。案件管理アプリから見えるようになります。',
      confirmLabel: '案件化する',
    });
    if (!ok) return;
    promote.mutate({ id: r.id }, {
      onSuccess: (res) => notifySuccess('案件化しました', {
        description: res.customer_created
          ? '新しい顧客も作りました。案件管理アプリでヨミ案件を確かめてください。'
          : '案件管理アプリでヨミ案件を確かめてください。',
      }),
      onError: (e) => notifyApiError('案件化できませんでした', e),
    });
  };

  const onDelete = async () => {
    const ok = await confirmAction({
      title: `${r.name} さんの来場予約を削除しますか`,
      description: '同行者の受付記録もいっしょに消えます。元に戻せません。',
      confirmLabel: '削除',
      tone: 'danger',
    });
    if (!ok) return;
    del.mutate(r.id, {
      onSuccess: () => notifySuccess('来場予約を削除しました'),
      onError: (e) => notifyApiError('来場予約を削除できませんでした', e),
    });
  };

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/*
        左スワイプで受付/取消の下敷き。ボタンは消していないので、これは追加の
        操作手段（PC のマウスでは動かない・`useSwipeToggle` 参照）。
      */}
      {canEdit && (
        <div
          className={`absolute inset-y-0 right-0 flex items-center justify-end gap-1.5 pr-4 text-sub font-bold ${
            r.checked_in_at ? 'bg-muted text-muted-foreground' : 'bg-success-surface text-success'
          }`}
          style={{ width: SWIPE_MAX }}
          aria-hidden="true"
        >
          {r.checked_in_at
            ? <><Circle className="h-4 w-4 shrink-0" aria-hidden="true" />取消</>
            : <><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />受付</>}
        </div>
      )}
      <Card
        // `relative` が要る。下敷き (受付/取消の色) は `absolute` なので、
        // このカードが `position: static` のままだと DOM の順番に関わらず
        // **下敷きの方が常に上に**描かれる (positioned 要素は static 要素より
        // 必ず後で描かれるという CSS のスタッキングの決めごと)。実ブラウザで
        // 「下敷きの緑/灰色の角がカードの右端からはみ出て見える」形で踏んだ。
        className={`relative ${r.checked_in_at ? 'border-success-border bg-success-surface' : ''}`}
        style={{
          transform: swipe.dx ? `translateX(${swipe.dx}px)` : undefined,
          transition: swipe.dragging ? 'none' : 'transform 180ms ease-out',
          touchAction: 'pan-y',
        }}
        {...(canEdit ? swipe.handlers : {})}
      >
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-cardtitle">{r.name}</span>
                {r.furigana ? <span className="text-sub-sm text-muted-foreground">{r.furigana}</span> : null}
                <Badge variant="outline" className="text-badge">
                  <Users className="mr-0.5 h-3 w-3" aria-hidden="true" />{head}名
                </Badge>
                {r.source === 'kairos3' ? (
                  <Badge
                    variant="outline"
                    className="text-badge border-ai-border bg-ai-surface text-ai"
                    title="AI がメールから取り込んだ登録です"
                  >
                    <Sparkles className="mr-0.5 h-3 w-3" aria-hidden="true" />AI作成
                  </Badge>
                ) : null}
                {r.checked_in_at ? (
                  <Badge variant="outline" className="text-badge border-success-border text-success">
                    <CheckCircle2 className="mr-0.5 h-3 w-3" aria-hidden="true" />来場済み
                  </Badge>
                ) : null}
                {isPromoted ? (
                  <a
                    href={`/sales/projects/${r.promoted_project_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-badge inline-flex items-center gap-1 rounded-badge border border-info-border bg-info-surface px-1.5 py-0.5 text-info hover:underline"
                    title="この来場予約から作った案件を開く"
                  >
                    <Briefcase className="h-3 w-3" aria-hidden="true" />案件化済み
                    <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                  </a>
                ) : null}
              </div>

              {reasons.length > 0 && (
                <p className="text-note mt-1 text-muted-foreground">検索が当たった項目: {reasons.join(' / ')}</p>
              )}

              {(r.company || r.role) && (
                <p className="text-sub mt-1 flex items-center gap-1.5 text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{[r.company, r.role].filter(Boolean).join(' / ')}</span>
                </p>
              )}

              <div className="text-sub-sm mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                {r.email ? <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" aria-hidden="true" />{r.email}</span> : null}
                {r.phone ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" aria-hidden="true" />{r.phone}</span> : null}
                {r.mobile ? <span className="inline-flex items-center gap-1"><Smartphone className="h-3 w-3" aria-hidden="true" />{r.mobile}</span> : null}
                {r.address ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" />{r.postal_code ? `〒${r.postal_code} ` : ''}{r.address}</span> : null}
                {r.visit_time ? <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden="true" />来場予定 {r.visit_time}</span> : null}
              </div>

              {(companions.length > 0 || head > 1) && (
                <Participants
                  r={r}
                  head={head}
                  unnamed={unnamed}
                  companions={companions}
                  canEdit={canEdit}
                  pending={checkInCompanion.isPending}
                  onToggle={(companionId, checkedIn) =>
                    checkInCompanion.mutate({ id: r.id, companionId, checkedIn }, {
                      onError: (e) => notifyApiError('受付を変えられませんでした', e),
                    })}
                />
              )}

              {r.interests ? <p className="text-sub-sm mt-1 whitespace-pre-line text-foreground">💬 {r.interests}</p> : null}
              {r.notes ? <p className="text-sub-sm mt-1 whitespace-pre-line text-muted-foreground">📝 {r.notes}</p> : null}
            </div>

            {canEdit && (
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Button
                  variant={r.checked_in_at ? 'outline' : 'default'}
                  className="min-h-tap gap-1"
                  disabled={checkIn.isPending}
                  onClick={onToggleCheckIn}
                >
                  {r.checked_in_at
                    ? <><Circle className="h-4 w-4" aria-hidden="true" />受付取消</>
                    : <><CheckCircle2 className="h-4 w-4" aria-hidden="true" />受付する</>}
                </Button>
                {!isPromoted && (
                  <Button variant="outline" className="min-h-tap gap-1" disabled={promote.isPending} onClick={onPromote}>
                    {promote.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      : <Briefcase className="h-4 w-4" aria-hidden="true" />}
                    案件化
                  </Button>
                )}
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="min-h-tap" onClick={onEdit} aria-label="編集">
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button variant="ghost" size="icon" className="min-h-tap text-destructive" aria-label="削除" onClick={onDelete}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** 参加者 (代表 + 同行者)。**同行者は代表とは独立に1人ずつ受付する** */
function Participants({
  r, head, unnamed, companions, canEdit, pending, onToggle,
}: {
  r: InviewRegistration;
  head: number;
  unnamed: number;
  companions: ReturnType<typeof companionsOf>;
  canEdit: boolean;
  pending: boolean;
  onToggle: (companionId: string, checkedIn: boolean) => void;
}) {
  return (
    <div className="mt-2 rounded-note border border-border-subtle bg-muted p-2">
      <p className="text-note mb-1.5 flex items-center gap-1 text-muted-foreground">
        <Users className="h-3 w-3" aria-hidden="true" /> 参加者 {head}名
      </p>
      <div className="flex flex-wrap gap-1.5">
        <span className="text-sub-sm inline-flex items-center gap-1 rounded-badge border border-primary-surface bg-primary-surface-weak px-2 py-0.5">
          <User className="h-3 w-3 text-primary" aria-hidden="true" />
          {r.name}
          <span className="text-badge rounded-badge-xs bg-primary-surface px-1 text-primary">代表</span>
        </span>
        {unnamed > 0 && (
          <span className="text-sub-sm inline-flex items-center gap-1 rounded-badge border border-dashed border-border px-2 py-0.5 text-muted-foreground">
            ほか {unnamed}名（氏名が登録されていません）
          </span>
        )}
      </div>
      {companions.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1">
          {companions.map((c, i) => (
            <div
              key={c.id ?? `${c.name}-${i}`}
              className={`text-sub-sm flex items-center justify-between gap-2 rounded-note border px-2 py-1 ${
                c.checked_in_at ? 'border-success-border bg-success-surface' : 'border-border bg-background'
              }`}
            >
              <span className="flex min-w-0 items-center gap-1">
                <UserPlus className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{c.name}</span>
                <span className="text-badge shrink-0 rounded-badge-xs bg-muted px-1 text-muted-foreground">同行</span>
              </span>
              {canEdit && c.id ? (
                <Button
                  variant={c.checked_in_at ? 'outline' : 'default'}
                  size="sm"
                  className="min-h-tap shrink-0 gap-1 lg:min-h-[36px]"
                  disabled={pending}
                  onClick={() => onToggle(c.id!, !c.checked_in_at)}
                >
                  {c.checked_in_at
                    ? <><Circle className="h-3.5 w-3.5" aria-hidden="true" />取消</>
                    : <><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />受付</>}
                </Button>
              ) : c.checked_in_at ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-success">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />来場済み
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
