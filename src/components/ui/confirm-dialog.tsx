import { useState, useCallback, createContext, useContext, ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error("useConfirm must be used within ConfirmDialogProvider");
  return fn;
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({ title: "" });
  const [resolve, setResolve] = useState<((v: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((res) => {
      setResolve(() => res);
    });
  }, []);

  const handleConfirm = () => {
    setOpen(false);
    resolve?.(true);
  };

  const handleCancel = () => {
    setOpen(false);
    resolve?.(false);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={(v) => { if (!v) handleCancel(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options.title}</AlertDialogTitle>
            {options.description && (
              <AlertDialogDescription>{options.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              {options.cancelLabel || "Voltar"}
            </Button>
            <Button
              variant={options.variant === "destructive" ? "destructive" : "default"}
              onClick={handleConfirm}
            >
              {options.confirmLabel || "Confirmar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}
