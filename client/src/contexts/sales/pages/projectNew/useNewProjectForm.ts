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
import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import api from '@/lib/api';
import { EMPTY_NEW_PROJECT, missingOf, type NewProjectValues } from './fields';
import { useProjectDecisions, type ProjectDecisions } from './useCreateProject';
import { useIntakeItems } from './IntakeRail';
import { useIntakeSeed, type IntakeSelection } from './useIntakeSeed';
import type { InboxItem } from '../inbox/kinds';

export interface CustomerOption {
  id: string;
  name: string;
  short_name?: string | null;
  /** GMOインターネットグループのグループ会社か（migration 181） */
  is_gmo_group?: boolean | null;
}

export interface UserOption { id: string; name: string }

export interface NewProjectForm {
  v: NewProjectValues;
  set: <K extends keyof NewProjectValues>(k: K, value: NewProjectValues[K]) => void;
  items: InboxItem[];
  selected: InboxItem | null;
  setSelected: (item: InboxItem | null) => void;
  selection: IntakeSelection | null;
  customers: CustomerOption[];
  users: UserOption[];
  customer: CustomerOption | null;
  /** お客様がグループ会社か。リード経路を「グループ案件」に固定する */
  isGroup: boolean;
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
    // グループ会社のときは経路を上書きして送る。画面が固定表示にしている以上、
    // 保存される値も固定でなければ、あとから数えたときに食い違う
    isGroup ? { ...v, intake_channel: 'group' } : v,
    selection,
    inquiryId,
  );

  return { v, set, items, selected, setSelected, selection, customers, users, customer, isGroup, missing, decisions };
}
