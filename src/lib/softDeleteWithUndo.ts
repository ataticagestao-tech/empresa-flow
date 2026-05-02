import { toast } from "sonner";

type SoftDeleteTable = "contas_receber" | "contas_pagar";

interface SoftDeleteWithUndoOptions {
  client: any;
  table: SoftDeleteTable;
  id: string;
  cleanup: () => Promise<void>;
  onChange: () => void;
  successLabel?: string;
  durationMs?: number;
}

export async function softDeleteWithUndo(opts: SoftDeleteWithUndoOptions): Promise<void> {
  const {
    client,
    table,
    id,
    cleanup,
    onChange,
    successLabel = "Excluído",
    durationMs = 5000,
  } = opts;

  const { error } = await client
    .from(table)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  onChange();

  let undone = false;
  const timer = setTimeout(() => {
    if (undone) return;
    cleanup().catch((e) => console.error("[softDeleteWithUndo:cleanup]", e));
  }, durationMs);

  toast.success(successLabel, {
    duration: durationMs,
    action: {
      label: "Desfazer",
      onClick: async () => {
        undone = true;
        clearTimeout(timer);
        try {
          const { error: undoError } = await client
            .from(table)
            .update({ deleted_at: null })
            .eq("id", id);
          if (undoError) throw undoError;
          onChange();
          toast.success("Exclusão desfeita");
        } catch (e: any) {
          toast.error("Erro ao desfazer: " + (e?.message || "desconhecido"));
        }
      },
    },
  });
}
