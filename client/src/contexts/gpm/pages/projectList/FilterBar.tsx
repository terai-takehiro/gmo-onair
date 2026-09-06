/**
 * ② プロジェクト一覧の絞り込み帯（v4・GPM 一覧フォーマット統一 PR②・delta 1）
 *
 * ── 案件一覧の `FilterBar.tsx` と同じ作法・別ファイル ──────────
 *
 * 案件一覧（`sales/pages/projectList/FilterBar.tsx`）は**段数と幅を固定**
 * している——旧実装は `flex-wrap` に任せていたため、絞り込みを押すたびに
 * 帯が1行 ↔ 2行で動き、下の一覧が上下にずれた。GPM のこの帯も同じ理由で
 * **1段目 40px・2段目 36px の固定高さ**にし、各枠の幅も決め打ちにする。
 *
 * 中身（検索・区分・並び順・用語）は案件一覧と種類が違うため**部品は共有せず
 * 専用ファイルに切り出す**（指示書どおり）。将来、両方の帯が同じ形に
 * 収束するなら `contexts/shared/components/` へ寄せられる余地はあるが、
 * いまは持っている絞り込みの種類が違う（案件一覧は期間・AI作成のみ・要整理を
 * 持つが GPM には無い）ため、無理に1つの部品にすると使わない props が
 * 両側に増える。**PC・スマホで同じ props を渡す**のは案件一覧と同じ作法
 * （`GpmProjectListPage.tsx` の `filterProps`）。
 */
import { Search, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { KIND_LABEL, KIND_NOTE, type GpmKind } from '../../types';
import { SORT_OPTIONS, type SortKey } from './sort';

/** 区分の切り替え。**各72pxの等幅**（「すべて」「自社」「受託」のどれも1行で収まる幅） */
const KIND_W = 'w-[72px]';
/** 並び順。3つの選択肢がどれも1行で収まる幅 */
const SORT_W = 'h-9 w-[190px]'; // ui-tokens-ok: 並び順。3つの選択肢がどれも1行で収まる幅

export interface FilterBarProps {
  search: string;
  onSearch: (v: string) => void;
  kind: GpmKind | '';
  onKind: (v: GpmKind | '') => void;
  sort: SortKey;
  onSort: (v: SortKey) => void;
  /** 「用語」の説明を開いているか */
  termOpen: boolean;
  onTermOpen: (v: boolean) => void;
}

const KIND_CHOICES: { value: GpmKind | ''; label: string }[] = [
  { value: '', label: 'すべて' },
  { value: 'self_build', label: KIND_LABEL.self_build },
  { value: 'group_order', label: KIND_LABEL.group_order },
];

export function FilterBar(p: FilterBarProps) {
  return (
    <div className="rounded-card flex flex-col gap-2 border border-border bg-card px-3 py-2.5">
      {/* ── 1段目（40px 固定）─────────────────────────────── */}
      <div className="flex h-10 items-stretch gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="プロジェクト名・依頼元・担当で探す"
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
            className="h-10 pl-9"
            aria-label="プロジェクトを検索"
          />
        </div>

        {/* 区分（自社構築／グループ受託）。**罫線はボタン自身に置く**
            （枠に置くと中のボタンが 40 − 1 − 1 = 38px になり、ボタンの高さの段から外れる） */}
        <div className="inline-flex shrink-0" role="group" aria-label="区分で絞り込む">
          {KIND_CHOICES.map(({ value, label }, i) => (
            <button
              key={value || 'all'}
              type="button"
              onClick={() => p.onKind(value)}
              aria-pressed={p.kind === value}
              className={`text-sub h-10 ${KIND_W} shrink-0 border border-border ${
                i > 0 ? '-ml-px' : 'rounded-l-control'
              } ${i === KIND_CHOICES.length - 1 ? 'rounded-r-control' : ''} ${
                p.kind === value ? 'bg-primary-surface font-bold text-primary' : 'bg-card text-muted-foreground hover:bg-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 2段目（36px 固定）─────────────────────────────── */}
      <div className="flex h-9 items-stretch gap-2">
        <Select value={p.sort} onValueChange={(v) => p.onSort(v as SortKey)}>
          <SelectTrigger className={`${SORT_W} shrink-0`} aria-label="並び順"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <button
          type="button"
          onClick={() => p.onTermOpen(!p.termOpen)}
          aria-pressed={p.termOpen}
          title="区分・状態・並び順の意味"
          style={{ width: 86 }}
          className={`text-sub inline-flex shrink-0 items-center justify-center gap-1.5 rounded-control border px-2 ${
            p.termOpen
              ? 'border-primary-border-strong bg-primary-surface font-bold text-primary'
              : 'border-border bg-card text-muted-foreground hover:bg-muted'
          }`}
        >
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />用語
        </button>

        <span className="flex-1" />
      </div>
    </div>
  );
}

/** 「用語」を押したときに出る説明（案件一覧 `FilterBar.tsx` の `TermHint` と同じ形） */
export function TermHint({ onClose }: { onClose: () => void }) {
  return (
    <div className="rounded-note border border-primary-border bg-primary-surface-weak px-3.5 py-3 text-note text-muted-foreground">
      <p>
        <span className="font-bold text-foreground">プロジェクト管理</span> …
        発注が確定してから工程を管理する画面です。売れるかどうかを追う段階の案件は<b>案件管理</b>で扱います。
      </p>
      <p><span className="font-bold text-foreground">{KIND_LABEL.self_build}</span> … {KIND_NOTE.self_build}</p>
      <p><span className="font-bold text-foreground">{KIND_LABEL.group_order}</span> … {KIND_NOTE.group_order}</p>
      <p><span className="font-bold text-foreground">おすすめ順</span> … 停滞しているプロジェクトが先。その中は次のアクションの期限が近い順です。</p>
      <p><span className="font-bold text-foreground">未確認</span> … 止まっている持ち帰り（未確認事項）の件数です。0件のときも「0」を出します。</p>
      <Button variant="outline" size="sm" className="mt-2" onClick={onClose}>閉じる</Button>
    </div>
  );
}
