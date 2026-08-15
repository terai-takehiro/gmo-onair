/**
 * 取引先マスターの入力欄（新規登録・編集で共通）
 *
 * `CompanyListPage.tsx` から切り出したもの。**枠（`CrudFormDialog`）は呼ぶ側**が
 * 持ちます — 一覧の再読み込みや保存の呼び出しは一覧の仕事なので、ここには置きません。
 *
 * ── グループ会社の印（migration 192・ご指示）──────────────────
 *
 * ここが**案件のグループ内 / グループ外を決めます**。案件ごとにプルダウンで
 * 選ぶのをやめて、この1か所から引くようにしました（見積の単価が定価か
 * グループ内価格かも、これで決まります）。
 *
 * 社名に GMO が入っていると**新しく登録するときだけ自動で入り**、外せます。
 * **外した印は、社名を打ち直しても保存し直しても戻りません** — 戻ると、
 * 外した人には「直しても直らない」としか見えません。
 */
import { useEffect, useRef, type MutableRefObject } from "react";
import type { UseFormReturn } from "react-hook-form";
import { looksLikeGmoGroup } from "@gmo-onair/shared/src/utils/gmoGroup";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleButtonGroup } from "@gmo-onair/shared/src/client/ui/toggle-button-group";
import type { CompanyForm } from "./types";

/**
 * 社名から印を入れる見立てを繋ぐ。**印を人が触ったら、以後は触りません。**
 * 見立ての規則はサーバーと**同じ関数**です（`shared/tests/gmoGroup.test.ts` が
 * 2つの写しを突き合わせています）— ここで違うと、**チェックが入って見えるのに
 * 保存すると外れます**。
 *
 * `editing` のときは何もしません（すでに人が決めた印がある行なので、
 * 開いただけで書き換わると気づけません）。
 */
function useGmoGroupGuess(
  form: UseFormReturn<CompanyForm>,
  editing: boolean,
  open: boolean,
): MutableRefObject<boolean> {
  const touched = useRef(false);
  const name = form.watch("name");
  useEffect(() => {
    if (editing || touched.current) return;
    if (looksLikeGmoGroup(name) && !form.getValues("is_gmo_group")) {
      form.setValue("is_gmo_group", true);
    }
  }, [name, editing, form]);
  /**
   * **開くたびに見立てを効かせ直す**（PR #129 のレビュー・P2）。
   *
   * ⚠️ **`editing` を見るだけでは効きません** — 続けて2件登録するとき、
   * `editing` は2回とも `false` のままだからです。1件目で印を外した人が
   * 2件目に GMO の社名を打っても**チェックが入らず**、しかも `false` を送るので
   * サーバーは「人が外した」と受け取ります（社名からの既定が当たらない）。
   *
   * いまは枠が閉じるとこの部品ごと消えるので**それでも直りますが、
   * 消えることに頼りません** — `forceMount` を足した日に黙って戻ります。
   */
  useEffect(() => { if (open) touched.current = false; }, [open]);
  return touched;
}

export function CompanyFormFields({ form, editing, open }: {
  form: UseFormReturn<CompanyForm>;
  /** 編集で開いているか。新規登録のときだけ社名から印を見立てる */
  editing: boolean;
  /** 枠が開いているか。**開くたびに見立てを効かせ直す**（下の理由） */
  open: boolean;
}) {
  const touched = useGmoGroupGuess(form, editing, open);
  const isVendor = form.watch("is_vendor");
  const isGroup = form.watch("is_gmo_group");
  const name = form.watch("name");

  return (
    <>
      <div className="space-y-2">
        <Label>役割（複数選択可 / すべて未選択の場合は「その他」扱い）</Label>
        <ToggleButtonGroup
          options={[
            { value: 'customer',  label: '顧客',         description: '売上管理で選択可能' },
            { value: 'vendor',    label: '仕入先',       description: '仕入管理で選択可能' },
            { value: 'sga_payee', label: '販管費支払先', description: '販管費管理で選択可能' },
          ]}
          value={[
            ...(form.watch("is_customer")  ? ['customer'] : []),
            ...(isVendor                   ? ['vendor'] : []),
            ...(form.watch("is_sga_payee") ? ['sga_payee'] : []),
          ]}
          onChange={(next) => {
            form.setValue("is_customer",  next.includes('customer'));
            form.setValue("is_vendor",    next.includes('vendor'));
            form.setValue("is_sga_payee", next.includes('sga_payee'));
          }}
          multi
          cols={{ base: 1, sm: 3 }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <Label htmlFor="name">取引先名 *</Label>
          <Input id="name" {...form.register("name", { required: true })} placeholder="株式会社〇〇" />
        </div>
        <div>
          <Label htmlFor="short_name">略称</Label>
          <Input id="short_name" {...form.register("short_name")} placeholder="〇〇" />
        </div>
        <div>
          <Label htmlFor="contact_name">担当者名</Label>
          <Input id="contact_name" {...form.register("contact_name")} placeholder="山田 太郎" />
        </div>
        <div>
          <Label htmlFor="email">メールアドレス</Label>
          <Input id="email" type="email" {...form.register("email")} />
        </div>
        <div>
          <Label htmlFor="phone">電話番号</Label>
          <Input id="phone" {...form.register("phone")} />
        </div>
      </div>

      <div>
        <Label htmlFor="address">住所</Label>
        <Input id="address" {...form.register("address")} />
      </div>

      {/* グループ会社の印（冒頭の理由） */}
      <div className="rounded-md border p-3">
        <label className="flex min-h-tap items-center gap-2.5">
          <input
            type="checkbox"
            {...form.register("is_gmo_group", {
              // 人が触ったら、以後この登録では社名から入れ直さない
              onChange: () => { touched.current = true; },
            })}
            className="v4-tap h-5 w-5 shrink-0 accent-primary"
          />
          <span>
            <span className="block">GMOインターネットグループのグループ会社</span>
            <span className="text-note block text-muted-foreground">
              この取引先の案件は<strong className="font-bold">グループ内</strong>になり、
              見積の単価がグループ内価格になります（リード経路も「グループ案件」に固定）
            </span>
          </span>
        </label>
        {!editing && isGroup && looksLikeGmoGroup(name) && (
          <p className="text-note mt-1.5 pl-[30px] text-muted-foreground">
            社名に GMO が入っているので自動で付けました（違うときは外してください）
          </p>
        )}
      </div>

      {isVendor && (
        <div className="space-y-3 rounded-md border p-3 bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">仕入先設定</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="vendor_type">種別</Label>
              <Input id="vendor_type" {...form.register("vendor_type")} placeholder="制作会社・フリーランス等" />
            </div>
            <div>
              <Label htmlFor="invoice_registration_number">インボイス登録番号</Label>
              <Input id="invoice_registration_number" {...form.register("invoice_registration_number")} placeholder="T1234567890123" />
            </div>
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="notes">備考</Label>
        <Textarea id="notes" {...form.register("notes")} rows={2} />
      </div>
    </>
  );
}
