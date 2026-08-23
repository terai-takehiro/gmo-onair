/**
 * GMO ONAiR v2.0 — Shared UI components
 *
 * Based on shadcn/ui (Radix primitives) with DADS v2.13 tokens and styling.
 * Accessibility: WCAG 2.2 AA (focus rings, aria-*, keyboard, contrast).
 *
 * ── このバレルに全部が載っているわけではない ────────────────────
 * `data-table` / `filter-bar` / `pagination` / `table` / `searchable-select` /
 * `currency-input` / `scroll-area` は **わざとここから export していない**。
 * (Radix を要求するものだけ。要求しないものはバレルに載せてある)
 * 深いパスで名指しして import する:
 *     import { Table, TableRow } from '@gmo-onair/shared/src/client/ui/table';
 * 理由: バレルに載せると **使わないアプリまで Radix を巻き込む**
 * (`scroll-area` は @radix-ui/react-scroll-area を要求するが、入っているのは
 * いまのところ案件管理だけ)。v2.4.0 の `data-table` 昇格からこの形。
 *
 * ── まだ案件管理に残っている部品 ──────────────────────────────
 * `motion` / `animated-number` は `client/src/components/ui/` に置いたまま。
 * `framer-motion` が案件管理にしか入っていないうえ、v4 は hover を色・罫線だけに
 * 絞り画面遷移も CSS の animation で行う (`docs/design/v4/_tokens.md`) ので、
 * **v4 が離れていく方向の部品**を他アプリに背負わせない。Phase 2 で整理する。
 */
export * from "./button";
export * from "./input";
export * from "./label";
export * from "./card";
export * from "./badge";
export * from "./dialog";
export * from "./select";
export * from "./checkbox";
export * from "./enhanced-checkbox";
export * from "./switch";
export * from "./tabs";
export * from "./textarea";
export * from "./crud-form-dialog";
export * from "./toggle-button-group";
export * from "./tax-aware-amount-input";

/* ── v4 の共通部品 (P1)。Radix を要求しないのでバレルに載せてよい ── */
export * from "./money";      // <Money> <MoneyCell>
export * from "./numbers";    // <StatValue> <Num> <ManYen> <PageTitle> manYen() compactYen()
export * from "./dateRange";  // <DateRange>

/* ── 行の骨格 (P2)。列幅の7段 (SlotWidth) はここが正 ── */
export * from "./row";        // <Row> <RowHeader> <RowMain> <RowTitle> <RowSub> <RowSlot>
export * from "./tableBadge"; // <TableBadge>

/*
 * ── 知らせる・訊く (P3) ──────────────────────────────────────
 *
 * 知らせる → `notifySuccess` / `notifyApiError` (`shared/src/client/notify.ts`)
 * 訊く    → `confirmAction`     (`shared/src/client/ui/confirm.tsx`)
 * 出す場所 → `<NoticeBar />` (`ui/notice.tsx`) と `<ConfirmHost />` を
 *            アプリのシェルに1つずつ。`check-shared-wiring.mjs` が数を検査する
 * 中身が無いとき → `shared/src/client/states/`
 *
 * **どれもこのバレルには載せない** (`table` などと同じ扱い)。深いパスで名指しする:
 *     import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
 * 載せると**凍結4アプリのバンドルにも入る** (帯も確認も描かないので純粋に無駄)。
 *
 * **トースト (`toast` / `useToast` / `Toaster`) も同じくバレルから外した。**
 * v4 は「流れて消えない帯」で知らせる決まりなので、同じ入口に2つ並べると
 * 必ず混ざる。ただし**消してはいない** — 凍結アプリの Qシートが 13 か所で
 * 使っており、そこには**放送中の「放送同期が切断されました」も含まれる**。
 * 消すと凍結アプリの挙動が変わるので、深いパスでの名指しだけ残した:
 *     import { toast } from '@gmo-onair/shared/src/client/ui/use-toast';
 * Qシートを v4 に載せ替えるとき (v4.1 以降) に帯へ寄せて、そこで消す。
 */
