import { createContext, useContext, useLayoutEffect, useState, ReactNode } from "react";

interface PageTitleContextValue {
  title?: string;
  setTitle: (title?: string) => void;
}

const PageTitleContext = createContext<PageTitleContextValue>({
  title: undefined,
  setTitle: () => {},
});

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | undefined>(undefined);
  return (
    <PageTitleContext.Provider value={{ title, setTitle }}>
      {children}
    </PageTitleContext.Provider>
  );
}

export function usePageTitle() {
  return useContext(PageTitleContext);
}

/**
 * Registra o título da página atual no layout persistente.
 * useLayoutEffect garante que o breadcrumb atualize ANTES do paint,
 * evitando flash de título antigo na troca de tela.
 */
export function useSetPageTitle(title?: string) {
  const { setTitle } = useContext(PageTitleContext);
  useLayoutEffect(() => {
    setTitle(title);
  }, [title, setTitle]);
}
