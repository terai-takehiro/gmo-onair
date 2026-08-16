/**
 * 名前で直すための候補（社内の担当・お客様）— 案件台帳
 *
 * ── なぜ画面から切り出したか ────────────────────────────────
 *
 * 引き方に**決めごとが3つ**あり、画面の本文に混ぜると次に触る人が踏みます。
 *
 *  ① **ページを最後までたどる**（`fetchAllNamed`）。`?limit=500` と書いても
 *    サーバーが 100 に丸めるので、101 番目以降の担当・取引先は
 *    **実在するのに「いません」**と断られます（レビューでの指摘 #127・#135）
 *  ② ⚠️ **鍵を他の画面と分ける。** `['users-list']` /
 *    `['customers-for-new-project']` は案件作成（`useNewProjectForm`）と
 *    販管費（`SgaListPage`）が使っており、**入れている中身の形が違います**
 *    （あちらは応答そのもの・こちらは行の配列）。同じ鍵に別の形を入れると、
 *    **先に開いた画面の中身で、あとの画面が壊れます**
 *  ③ **引き終わったかを返す。** 引き終わる前に名前で照合すると空の一覧に
 *    当たるので**必ず「いません」**になります。画面はそれまで
 *    名前の列を直せなくします（`useLedgerGrid` の `lookupsReady`）
 */
import { useQuery } from '@tanstack/react-query';
import { fetchAllNamed } from './fetchAllNamed';
import type { NamedRow } from './editable';

export interface LedgerLookups {
  users: NamedRow[];
  customers: NamedRow[];
  /**
   * **列ごとに**引けたか（レビューでの指摘 #146）。
   *
   * ⚠️ **2つをまとめて1つの真偽にしないこと。** 片方が落ちただけで
   * **両方の列が永久に直せなくなります**（引けたほうまで巻き添えになる）。
   */
  ready: { users: boolean; customers: boolean };
  /**
   * **引けなかったか**（403・5xx・通信断で、やり直しても駄目だったとき）。
   *
   * ⚠️ `ready` が false の理由が「まだ引いている」なのか
   * 「引けなかった」なのかで、**人がやることが違います**（待つ／やり直す）。
   * 分けないと、**永久に「読み込んでいます」と出たまま**になります。
   */
  failed: { users: boolean; customers: boolean };
  /** 引き直す（画面の「やり直す」から呼ぶ） */
  retry: () => void;
  /** 多すぎて打ち切ったか。**打ち切ったら画面に出す** */
  truncated: boolean;
}

/**
 * `enabled` は「まとめて直すダイアログを開いた／編集モードに入った」とき。
 * **読むだけの人には引きません**（この画面は 20 列を読むのが主な用途）。
 */
export function useLedgerLookups(enabled: boolean): LedgerLookups {
  const usersQ = useQuery({
    queryKey: ['ledger-users-all'],
    queryFn: () => fetchAllNamed('/users'),
    enabled,
    staleTime: 5 * 60_000,
  });
  const customersQ = useQuery({
    queryKey: ['ledger-customers-all'],
    queryFn: () => fetchAllNamed('/customers'),
    enabled,
    staleTime: 5 * 60_000,
  });

  return {
    users: usersQ.data?.rows ?? [],
    customers: customersQ.data?.rows ?? [],
    // **引く前（`enabled` が false）は `true`。** 引く気が無いのに
    // 「読み込んでいます」と出すと、読むだけの人に永久に帯が出ます
    ready: {
      users: !enabled || usersQ.isSuccess,
      customers: !enabled || customersQ.isSuccess,
    },
    failed: {
      users: enabled && usersQ.isError,
      customers: enabled && customersQ.isError,
    },
    retry: () => { void usersQ.refetch(); void customersQ.refetch(); },
    truncated: Boolean(usersQ.data?.truncated || customersQ.data?.truncated),
  };
}
