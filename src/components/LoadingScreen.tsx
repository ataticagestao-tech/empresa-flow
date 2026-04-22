export function LoadingScreen({ label = "Carregando" }: { label?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-sidebar">
      <div className="flex flex-col items-center gap-5">
        <img
          src="/favicon.svg"
          alt="Gestap System"
          className="h-16 w-16 object-contain animate-logo-pulse"
        />
        <span className="text-sm text-sidebar-foreground/70 tracking-wide">{label}</span>
      </div>
    </div>
  );
}
