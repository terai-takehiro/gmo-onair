/**
 * 探す（v4・スマホの下タブ 3つ目）
 *
 * ── なぜ画面として作るのか ──────────────────────────────────
 *
 * v4 の決めごとは**下タブ3つ = ホーム / やること / 検索**
 * （`docs/design/v4/_rules.md`「3. スマホ」）。ところが
 * **スマホには検索が1つもありませんでした** — 上辺バーの `GlobalSearch` は
 * `hidden sm:block` で、375px では出ません。
 * そのため3つ目は「メニューを開く」で代用していました。
 *
 * メニューは**上辺バーの ☰ からも開けます**。つまり下タブの1枠を
 * 二重の入口に使っていて、決めごとにある検索がどこにも無い状態でした。
 * この画面を作って、3つ目を本来の「探す」に戻します。
 *
 * ── 上辺バーの検索と同じ口を叩く ────────────────────────────
 *
 * `GET /search`（案件・お客様・仕入先）。**種類ごとに権限を見るのはサーバー側**で、
 * 権限が無い種類は空で返ります（v3.2.2 で塞いだ穴）。
 * 画面は返ってきたものを出すだけで、**件数を自分で数え直しません**。
 *
 * ── 4つの状態を混ぜない ──────────────────────────────────────
 *
 * **まだ打っていない / 探している / 0件 / 失敗した** は別のことです。
 * 打つ前に「該当なし」と出すと探す前から無いと言うことになり、
 * 失敗を「探しています…」のままにすると**永久に回り続けているように見えます**
 * （どちらもレビューで指摘されて直しました）。
 *
 * ── 遅れて届いた結果で上書きしない ──────────────────────────
 *
 * 打ち込みを 300ms 待ってから投げていますが、**待つのは投げるまで**で、
 * 投げたあとの通信は止まりません。「みら」の結果が「みらいてっく」の結果より
 * **後に届く**と、新しい結果が古いもので上書きされます。
 * 投げるたびに番号を振り、**最後に投げたぶんだけを画面に出します**。
 *
 * ── 打ち込む前に出すもの（モックの ⑪） ──────────────────────
 *
 * モックの ⑪ は検索欄の下に **やること4つ・場所6つ・最近見たもの**を並べます。
 * 「探す」を開く理由の半分は**探すことではなく、そこから始めること**なので、
 * 空欄のまま「探す言葉を入れてください」だけ出すのは1画面ぶんの無駄です。
 *
 * 行き先と権限は `search/shortcuts.ts` の表に置いてあります
 * （画面に直接並べると、権限の書き忘れがそのまま「押すと 403」になる）。
 * **最近見たものは端末の中だけ**（`client-v4/recent.ts`）。
 *
 * ── PC / スマホで構成そのものを変えた（v4 ネイティブUI監査 2026-08-20） ──
 *
 * 監査で見つかった不足点は3つ:
 * ①下タブ画面としての専用ナビゲーション演出（キャンセルボタン等）が無い
 * ②「最近見たもの」は読むだけで削除操作が無い
 * ③結果セクション（案件/お客様/仕入先）がカード化されておらず PC と同じ罫線区切りリストのまま
 *
 * → **薄い親で問い合わせ・「最近見たもの」の読み書きを1回だけ持ち**、見た目は
 * `SearchPageDesktop` / `SearchPageMobile` に丸ごと入れ替える
 * （`useIsMobile()` は薄い親で1回だけ呼ぶ — 同じ部品の中で早期 return しない）。
 * 機材管理の `pages/SearchPage.tsx`（同じ監査で先に直した「探す」）と同じやり方に揃えた。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { readRecent, removeRecent, type RecentItem } from '@gmo-onair/shared/src/client-v4/recent';
import { useAuth } from '@/contexts/platform/AuthContext';
import { DO_ITEMS, PLACES, type Shortcut } from './search/shortcuts';
import { SearchPageDesktop } from './search/SearchPageDesktop';
import { SearchPageMobile } from './search/SearchPageMobile';
import type { SearchResults } from './search/types';

export default function SearchPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { hasPermission, currentUser } = useAuth();
  const [sp, setSp] = useSearchParams();
  const initial = sp.get('q') ?? '';
  const [query, setQuery] = useState(initial);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [failed, setFailed] = useState<unknown>(null);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uid = currentUser?.id ?? '';
  // **一度だけ読み、以後は state で持つ。** 削除操作を足したので、
  // 消したあとの見た目はこの state を直接更新する（`readRecent` を毎回叩き直さない）
  const [recent, setRecent] = useState<RecentItem[]>(() => readRecent(uid));
  // **投げた順番。** 遅れて届いた古い結果で新しい結果を上書きしないための番号
  const seq = useRef(0);

  const run = useCallback(async (q: string) => {
    const mine = ++seq.current;
    setSearching(true);
    setFailed(null);
    try {
      const data = (await api.get('/search', { params: { q } })).data.data as SearchResults;
      // **自分より後に投げたものがあるなら捨てる。** 通信の速さは順番を守らない
      if (mine !== seq.current) return;
      setResults(data);
    } catch (e) {
      if (mine !== seq.current) return;
      // **`results` を null に戻さない。** null は「探している最中」の意味なので、
      // 戻すと失敗が永久の読み込み中に化ける
      setFailed(e);
    } finally {
      if (mine === seq.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    // **打ち込んでいる途中で毎回叩かない。** 1文字ごとに投げると通信が積み上がる
    timer.current = setTimeout(() => {
      setSp((prev) => {
        const n = new URLSearchParams(prev);
        if (q) n.set('q', q); else n.delete('q');
        return n;
      }, { replace: true });
      if (!q) {
        // 空にしたら、走っている通信の結果も受け取らない
        seq.current += 1;
        setResults(null); setFailed(null); setSearching(false);
        return;
      }
      run(q);
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, setSp, run]);

  const total = results
    ? results.projects.length + results.customers.length + results.vendors.length
    : 0;

  /** 権限が無いものは**出さない**（押してから 403 で気づかせない） */
  const allowed = (s: Shortcut) => !s.module || hasPermission(s.module, s.minLevel);
  const doItems = DO_ITEMS.filter(allowed);
  const places = PLACES.filter(allowed);
  const onGoShortcut = (s: Shortcut) => {
    // **別のバンドルは `navigate()` では飛べない**（React Router は同じアプリしか知らない）
    if (s.external) window.location.href = s.to;
    else navigate(s.to);
  };

  const onRemoveRecent = (to: string) => {
    removeRecent(to, uid);
    setRecent((prev) => prev.filter((r) => r.to !== to));
  };

  const viewProps = {
    query,
    onType: setQuery,
    searching,
    failed,
    onRetry: () => run(query.trim()),
    results,
    total,
    doItems,
    places,
    onGoShortcut,
    recent,
    onOpenRecent: navigate,
    onRemoveRecent,
    onOpenProject: (id: string) => navigate(`/sales/projects/${id}`),
    onOpenCustomer: (id: string) => navigate(`/sales/customers/${id}`),
    onOpenVendor: () => navigate('/budget/vendors'),
  };

  return isMobile ? <SearchPageMobile {...viewProps} /> : <SearchPageDesktop {...viewProps} />;
}
