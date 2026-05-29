import { ReactNode } from "react";
import { useSetPageTitle } from "@/contexts/PageTitleContext";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
}

/**
 * NÃO renderiza mais a moldura (sidebar/header) — isso agora vive na
 * PersistentLayout, que monta uma única vez e sobrevive às navegações.
 *
 * Aqui só registramos o título da página (para o breadcrumb) e
 * renderizamos o conteúdo. Mantido como componente para preservar a API
 * `<AppLayout title="...">...</AppLayout>` usada em todas as páginas.
 */
export function AppLayout({ children, title }: AppLayoutProps) {
  useSetPageTitle(title);
  return <>{children}</>;
}
