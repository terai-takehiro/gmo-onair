import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import api from "@/lib/api";
import { FormDialog, FormDialogFooter } from "@gmo-onair/shared/src/client-v4/formDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface CustomerForm {
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
}

interface Customer {
  id: string;
  name: string;
  short_name?: string;
  contact_name?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (customer: Customer) => void;
}

export default function CustomerDialog({ open, onOpenChange, onCreated }: Props) {
  const qc = useQueryClient();
  const form = useForm<CustomerForm>({
    defaultValues: { name: "", contact_name: "", email: "", phone: "", address: "" },
  });

  const mutation = useMutation({
    mutationFn: async (values: CustomerForm) => (await api.post("/customers", values)).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customers-select"] });
      form.reset();
      onOpenChange(false);
      onCreated(data.data);
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => { if (!v) form.reset(); onOpenChange(v); }}
      title="新規顧客登録"
      onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            登録
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="space-y-3">
        <div>
          <Label>顧客名 *</Label>
          <Input {...form.register("name", { required: true })} placeholder="株式会社〇〇" />
          {form.formState.errors.name && (
            <p className="text-xs text-destructive mt-1">必須です</p>
          )}
        </div>
        <div>
          <Label>担当者名</Label>
          <Input {...form.register("contact_name")} placeholder="山田 太郎" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>メール</Label>
            <Input type="email" {...form.register("email")} />
          </div>
          <div>
            <Label>電話</Label>
            <Input {...form.register("phone")} />
          </div>
        </div>
        <div>
          <Label>住所</Label>
          <Input {...form.register("address")} />
        </div>
      </div>
    </FormDialog>
  );
}
