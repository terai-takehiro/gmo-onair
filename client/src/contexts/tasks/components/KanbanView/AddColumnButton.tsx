import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import ColumnDialog from "../ColumnDialog";

interface Props {
  projectId: string;
}

export default function AddColumnButton({ projectId }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 gap-1.5 shrink-0 border-dashed text-muted-foreground hover:text-foreground"
        aria-label="カラムを追加"
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">カラムを追加</span>
      </Button>

      <ColumnDialog
        open={open}
        onClose={() => setOpen(false)}
        projectId={projectId}
      />
    </>
  );
}
