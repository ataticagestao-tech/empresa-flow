import { Component, ReactNode } from "react";

/**
 * Captura erros de render de qualquer tela e mostra um aviso amigável
 * com botão "Recarregar" — em vez de apagar o sistema inteiro (tela branca).
 *
 * - Erro de chunk (deploy novo invalidou o .js que o navegador tinha em cache):
 *   recarrega a página automaticamente UMA vez para buscar o arquivo novo.
 * - `resetKey` (ex.: pathname): ao mudar, limpa o erro e tenta renderizar de
 *   novo — assim o usuário sai da tela quebrada navegando para outra.
 */
function isChunkError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message || err || "");
  return /Loading chunk|dynamically imported module|Importing a module script failed|ChunkLoadError|Failed to fetch/i.test(
    msg,
  );
}

const RELOAD_KEY = "eb_chunk_reload_once";

interface Props {
  children: ReactNode;
  /** Quando muda (ex.: rota), o boundary reseta e tenta renderizar de novo. */
  resetKey?: string;
}
interface State {
  hasError: boolean;
  err?: unknown;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, err };
  }

  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", err);
    if (isChunkError(err) && !sessionStorage.getItem(RELOAD_KEY)) {
      sessionStorage.setItem(RELOAD_KEY, "1");
      window.location.reload();
    }
  }

  componentDidUpdate(prev: Props) {
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, err: undefined });
    }
  }

  private handleReload = () => {
    sessionStorage.removeItem(RELOAD_KEY);
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const chunk = isChunkError(this.state.err);
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
        <div className="text-3xl mb-3">⚠️</div>
        <h2 className="text-[15px] font-semibold text-[#1D2939] mb-1">
          {chunk ? "O sistema foi atualizado" : "Algo deu errado nesta tela"}
        </h2>
        <p className="text-[13px] text-[#667085] max-w-md mb-5">
          {chunk
            ? "Saiu uma versão nova enquanto você usava. Recarregue para carregar a versão atualizada."
            : "Esta página encontrou um erro e não pôde ser exibida. O resto do sistema continua funcionando — você pode trocar de tela pelo menu ou recarregar."}
        </p>
        <button
          onClick={this.handleReload}
          className="px-4 py-2 rounded-md bg-[#1D2939] text-white text-[13px] font-semibold hover:bg-[#101828] transition-colors"
        >
          Recarregar
        </button>
      </div>
    );
  }
}
