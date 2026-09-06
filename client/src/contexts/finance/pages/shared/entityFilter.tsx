/**
 * 会社（計上会社）タブ — 財務管理5画面共通（2026年10月の事業再編 P2 Round 1）
 *
 * 対象: ①財務ダッシュボード ②請求・入金（締め） ③④⑤ 売上・仕入・販管費。
 * 設計は `docs/reorg-2026-10-plan.md` §4.6「財務管理の2社タブ」。
 *
 * ── フック・部品・ヘルパーを1ファイルに束ねている理由 ─────────────
 *
 * `BudgetDashboardPage.tsx`/`SgaListPage.tsx` 等は `1ファイル400行` の上限に
 * ほぼ達している（`client/CLAUDE.md`・`scripts/check-file-size.mjs`）。
 * hook・見た目・`LedgerFilterGroup` 変換をファイルごとに分けると呼び出し側の
 * import が3〜4行に増えて上限を割ってしまうため、ここに集約して import 1行で済ませる。
 *
 * ── 決めごと ──────────────────────────────────────────────────
 * - 選択肢は `GET /legal-entities` から取る（コード決め打ちにしない。GMO も
 *   含めて出す — コストセンターで売上が無いのは自然に0件で表現されるので
 *   特別扱いしない）
 * - **正は URL の `?entity=`**（`financeDashboard/useProjectFilter.ts` の
 *   `?project_id=` と同じ考え方——「戻る」で元に戻り、リンクも共有できる）
 * - **省略時（`entity` が空文字）は絞らない＝今までどおり全社合算。**
 *   この機能を入れても「何も選ばない」状態の挙動を変えないことが最重要
 *   （サーバー側 `finance/index.ts` の `/monthly-summary` も同じ約束で実装済み）
 * - 部品は `FilterChips`（§4.6「部品は `FilterChips` 系の1本のセグメント」）。
 *   **`ForecastModeToggle.tsx` の教訓**（カードの中に置くと、そのカードの
 *   一設定に見えて画面全体の切替に読めない）に合わせ、他のカードの中には
 *   入れ子にせず、専用の1行として置く
 */
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import api from '@/lib/api';
import { FilterChips, type FilterChipItem } from '@gmo-onair/shared/src/client/ui/filterChips';
import type { LedgerFilterGroup } from '../ledger/LedgerFilterBar';

/** `GET /legal-entities` の1行。ここで読むぶんだけ（発行者情報などは使わない） */
export interface LegalEntityOption {
  code: string;
  shortName: string;
}

/** 「全社」を表す URL 値。空文字＝絞らない（今までどおり全社合算） */
export const ALL_ENTITIES = '';

export interface EntityFilter {
  /** いま選んでいる計上会社コード。`''` は「全社」 */
  entity: string;
  /** 変更する。履歴を積まない（`replace`・プルダウン系の絞り込みと同じ扱い） */
  setEntity: (code: string) => void;
  /** `FilterChips`/`LedgerFilterGroup` にそのまま渡せる選択肢（先頭に「全社」）。
   *  読み込み中・失敗時は「全社」だけを返す（絞り込み自体を壊さない） */
  options: FilterChipItem[];
}

export function useEntityFilter(): EntityFilter {
  const [searchParams, setSearchParams] = useSearchParams();
  const entity = searchParams.get('entity') ?? ALL_ENTITIES;

  const entitiesQuery = useQuery<LegalEntityOption[]>({
    // ⚠️ **`ReorgPage.tsx` と同じ鍵にする。** 会社マスターはどちらから開いても
    // 同じ内容なので、片方が読んだキャッシュをもう片方も使い回せる
    queryKey: ['legal-entities'],
    queryFn: async () => (await api.get('/legal-entities')).data.data,
    // ほぼ変わらないマスターデータ。`sga-account-titles` と同じ考え方で長めに持つ
    staleTime: 5 * 60_000,
  });

  const setEntity = (code: string) => {
    const next = new URLSearchParams(searchParams);
    if (code) next.set('entity', code); else next.delete('entity');
    setSearchParams(next, { replace: true });
  };

  const options: FilterChipItem[] = [
    { key: ALL_ENTITIES, label: '全社', count: null },
    ...(entitiesQuery.data ?? []).map((e) => ({ key: e.code, label: e.shortName, count: null })),
  ];

  return { entity, setEntity, options };
}

/** 画面全体の切替として単独で置く1行（`ForecastModeToggle` と同じ役割分担・見た目だけ） */
export function EntityTabs({ entity, setEntity, options }: EntityFilter) {
  // 会社マスターが「全社」しか無い（読み込み中・失敗・まだ1社も無い）ときは
  // 選ぶものが無いので帯ごと出さない（1社しかない場所タブを出さない `LocationTabs` と同じ考え方）
  if (options.length <= 1) return null;
  return (
    <div className="rounded-card flex flex-wrap items-center gap-2 border border-border bg-card p-3 lg:px-4">
      <span className="text-sub shrink-0 text-muted-foreground">会社</span>
      <FilterChips items={options} value={entity} onChange={setEntity} label="計上会社で絞り込む" />
    </div>
  );
}

/** 台帳3画面（売上・仕入・販管費）の絞り込み帯 (`LedgerFilterBar`) に足す1項目に変換する */
export function entityFilterGroup({ entity, setEntity, options }: EntityFilter): LedgerFilterGroup {
  return {
    key: 'entity', label: '会社で絞り込む', sheetLabel: '会社',
    items: options, value: entity, defaultValue: ALL_ENTITIES, onChange: setEntity,
  };
}
