// テロップCG — コーナー見出しでページを束ねる純粋関数（段C・graphics-redesign.md §9）。
//
// ①一覧（`TelopListSection.tsx`）と②送出コンソールの出す順一覧（`ConsolePageList.tsx`）の
// どちらも「渡された順序のまま、直前の行と section が変わるところにだけ見出しを挟む」という
// 同じ束ね方をする。どちらのファイルにも属さない小さな純粋関数として独立させた
// （担当3の作業指示どおり・ファイルサイズ規律で新規ファイルを選んだ — pageFields.ts は
// 担当外のため触らない）。
import type { GraphicsPageRow } from '@/lib/graphicsApi';

export interface PageSectionGroup {
  /** コーナー見出し。null＝見出し無し（呼び出し側はこの束に見出し行を描かない） */
  section: string | null;
  /** この束に属するページ（pages の元の順序を保ったまま） */
  pages: GraphicsPageRow[];
}

/**
 * pages を渡された順序のまま section ごとに束ねる（並べ替えはしない — 呼び出し側が
 * 既に出す順に並べ済みである前提）。直前の行と `section` の値が変わるところで新しい
 * 束を始める——`section: null` の行どうしが連続しているだけなら1つの束にまとまるが、
 * 呼び出し側は `section == null` の束に見出しを描かないので、結果として
 * 「コーナー未設定のページは見出しを挟まず連続して出る」という見た目になる。
 * 逆に、コーナー付きの行の間に無所属の行が割り込んだ場合は束が分かれるため、
 * 同じコーナー名の見出しが離れた位置に2回出ることもある（意図どおり——
 * 「直前の行と変わるところにだけ見出しを挿入する」というルールをそのまま反映している）。
 */
export function groupPagesBySection(pages: GraphicsPageRow[]): PageSectionGroup[] {
  const groups: PageSectionGroup[] = [];
  for (const page of pages) {
    const prev = groups[groups.length - 1];
    if (prev && prev.section === page.section) {
      prev.pages.push(page);
    } else {
      groups.push({ section: page.section, pages: [page] });
    }
  }
  return groups;
}
