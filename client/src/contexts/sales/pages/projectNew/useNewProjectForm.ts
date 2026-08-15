/**
 * 案件作成のフォームの状態（PC とスマホで**共通**）
 *
 * ここが持つのは4つだけです:
 *
 *   ① 入力中の値（`v` / `set` / `replace`）
 *   ② 上のレールで選んでいるもの（`selected` / `selection`）と、その読み取り結果
 *   ③ お客様・社内の担当の候補
 *   ④ 3つの決め方（`decisions`）
 *
 * **PC の1枚ものとスマホの3段組みで同じものを使います。** 写すと、
 * 列が1つ増えたときに片方だけ送らなくなり、しかも気づけません
 * （`useCreateProject.ts` の冒頭）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import api from '@/lib/api';
import {
  EMPTY_NEW_PROJECT, missingOf,
  type CustomerOption, type NewProjectValues, type ProjectFieldsState, type UserOption,
} from './fields';
import { useProjectDecisions, type ProjectDecisions } from './useCreateProject';
import { useIntakeItems } from './IntakeRail';
import { useIntakeSeed, type IntakeSelection } from './useIntakeSeed';
import type { InboxItem } from '../inbox/kinds';

/**
 * 案件作成の状態。**項目の部品が要るぶん（`ProjectFieldsState`）を必ず含みます** —
 * `RequiredFields` / `MoreFields` は直す画面とも共用なので、
 * ここで別の形にすると片方の画面だけ型が合わなくなります。
 */
export interface NewProjectForm extends ProjectFieldsState {
  items: InboxItem[];
  selected: InboxItem | null;
  setSelected: (item: InboxItem | null) => void;
  selection: IntakeSelection | null;
  customer: CustomerOption | null;
  missing: string[];
  decisions: ProjectDecisions;
}

export function useNewProjectForm(): NewProjectForm {
  const [params] = useSearchParams();

  const [v, setV] = useState<NewProjectValues>(() => ({
    ...EMPTY_NEW_PROJECT,
    // ダッシュボードの受付カードから来るとリード経路が付いている
    intake_channel: params.get('intake') ?? '',
  }));
  const set = useCallback(<K extends keyof NewProjectValues>(k: K, value: NewProjectValues[K]) => {
    setV((f) => ({ ...f, [k]: value }));
  }, []);
  const replace = useCallback((next: NewProjectValues) => setV(next), []);

  const [selected, setSelected] = useState<InboxItem | null>(null);
  const { items } = useIntakeItems();
  const selection = useIntakeSeed(selected, replace);

  /**
   * `?inquiry=<id>` で開かれたら、その引き合いを**選んだ状態にする**
   * （レビューでの指摘 #80）。
   *
   * 日常業務の「案件の受付へ送る」からはこの URL で来ますが、これまでは
   * **id を書き戻しに使うだけ**で、フォームは空のままでした ＝ すでに
   * 記録してある会社名・要件・希望日を**もう一度打ち直す**ことになります
   * （送った側は「送れば向こうで案件になる」と思っているので、
   * 打ち直しが起きていること自体が誰にも見えません）。
   *
   * **写す処理は増やしません** — レールで選んだときと**同じ道**（`useIntakeSeed`）を
   * 通します。別に書くと、片方だけ項目が増えたときに写り方が食い違います。
   */
  const seededFrom = useRef<string | null>(null);
  const inquiryParam = params.get('inquiry');
  useEffect(() => {
    if (!inquiryParam || seededFrom.current === inquiryParam) return;
    const hit = items.find((i) => i.key === `inquiry:${inquiryParam}`);
    if (!hit) return;   // まだ読み込んでいない／もう仕分け済みで一覧に無い
    seededFrom.current = inquiryParam;
    setSelected(hit);
  }, [inquiryParam, items]);

  const { data: customersData } = useQuery({
    queryKey: ['customers-for-new-project'],
    queryFn: async () => (await api.get('/customers?limit=500')).data,
  });
  const customers: CustomerOption[] = customersData?.data ?? [];

  const { data: usersData } = useQuery({
    queryKey: ['users-list'],
    queryFn: async () => (await api.get('/users?limit=200')).data,
  });
  const users: UserOption[] = usersData?.data ?? [];

  const customer = customers.find((c) => c.id === v.customer_id) ?? null;
  /**
   * **リード経路の自動確定**（指示書 第3章）。
   * お客様が GMOインターネットグループのグループ会社なら「グループ案件」に固定する。
   * 判定は**取引先マスターのフラグ**（`customers.is_gmo_group`）で行い、
   * プルダウンの文字列一致では見ません（社名は変わるし、GMO を含む社外の会社もある）。
   */
  const isGroup = customer?.is_gmo_group === true;

  const missing = useMemo(() => missingOf(v), [v]);
  const inquiryId = params.get('inquiry');
  const decisions = useProjectDecisions(
    // グループ会社のときは経路とグループ区分を上書きして送る。画面が固定表示に
    // している以上、保存される値も固定でなければ、あとから数えたときに食い違う。
    // **グループ区分はサーバーもお客様から決めます**（migration 192）— ここで
    // 送るのは、送らない形にすると「作るときだけ既定の external が入る」と
    // 読まれるためで、値そのものは同じ規則から出しています
    isGroup ? { ...v, intake_channel: 'group', customer_type: 'internal' as const } : v,
    selection,
    inquiryId,
  );

  return { v, set, items, selected, setSelected, selection, customers, users, customer, isGroup, missing, decisions };
}
