import { useMemo, useState, useEffect, useCallback } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { z } from "zod";
import logoTatica from "@/assets/logo-tatica.png";
import { Eye, EyeOff } from "lucide-react";

const loginSchema = z.object({
  email: z.string().trim().email("Email invalido").max(255),
  password: z.string().min(6, "Senha deve ter no minimo 6 caracteres"),
});
const signupSchema = z.object({
  email: z.string().trim().email("Email invalido").max(255),
  password: z.string().min(6, "Senha deve ter no minimo 6 caracteres"),
  fullName: z.string().trim().min(3, "Nome deve ter no minimo 3 caracteres").max(100),
});
const resetSchema = z.object({
  password: z.string().min(6, "Senha deve ter no minimo 6 caracteres"),
});

const toPtBrAuthError = (message: string) => {
  const msg = (message || "").toLowerCase();
  if (msg.includes("invalid login credentials")) return "Email ou senha incorretos.";
  if (msg.includes("email not confirmed")) return "Email nao confirmado. Verifique sua caixa.";
  if (msg.includes("user not found")) return "Usuario nao encontrado";
  if (msg.includes("too many requests")) return "Muitas tentativas. Aguarde.";
  if (msg.includes("token has expired") || msg.includes("invalid or expired")) return "Link invalido ou expirado.";
  if (msg.includes("weak password")) return "Senha fraca.";
  if (msg.includes("already registered") || msg.includes("duplicate") || msg.includes("already exists")) return "Este email ja esta cadastrado";
  if (msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("network request failed")) return "Erro de conexao. Verifique sua internet e tente novamente.";
  return message;
};

function PasswordInput({ id, value, onChange, onBlur, placeholder, autoComplete, className, error }: {
  id: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: () => void; placeholder: string; autoComplete: string; className: string; error?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <div className="relative">
        <Input id={id} type={show ? "text" : "password"} autoComplete={autoComplete} placeholder={placeholder} value={value} onChange={onChange} onBlur={onBlur} required className={`${className} ${error ? "border-destructive" : ""}`} />
        <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <p className="text-[12px] text-destructive mt-1">{error}</p>}
    </div>
  );
}

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="text-[12px] text-destructive mt-1">{error}</p>;
}

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, signIn, signUp, loading, activeClient } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("login");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupFullName, setSignupFullName] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const redirectTo = searchParams.get("redirect") || "/dashboard";

  const isRecoveryFlow = useMemo(() => {
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    return hash.includes("type=recovery") || search.includes("type=recovery");
  }, []);

  useEffect(() => { if (user && !loading) navigate(redirectTo); }, [user, loading, navigate, redirectTo]);

  const validateField = useCallback((field: string, value: string) => {
    let err = "";
    switch (field) {
      case "email":
        if (value && !z.string().email().safeParse(value.trim()).success) err = "Email invalido";
        break;
      case "password":
        if (value && value.length < 6) err = "Min. 6 caracteres";
        break;
      case "fullName":
        if (value && value.trim().length < 3) err = "Min. 3 caracteres";
        break;
    }
    setErrors((prev) => {
      if (err) return { ...prev, [field]: err };
      const { [field]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  if (loading) return (<div className="min-h-screen flex items-center justify-center bg-background"><div className="flex flex-col items-center gap-3"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /><span className="text-sm text-muted-foreground">Carregando...</span></div></div>);
  if (user) return <Navigate to={redirectTo} replace />;

  const handleForgotPassword = async () => {
    if (!loginEmail) { toast.error("Informe seu email."); return; }
    setIsLoading(true);
    try {
      const v = z.string().trim().email("Email invalido").max(255).parse(loginEmail);
      const { error } = await activeClient.auth.resetPasswordForEmail(v, { redirectTo: `${window.location.origin}/auth` });
      if (error) { toast.error(toPtBrAuthError(error.message)); return; }
      toast.success("Email de recuperacao enviado.");
    } catch (e) { if (e instanceof z.ZodError) toast.error(e.errors[0].message); } finally { setIsLoading(false); }
  };
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault(); setIsLoading(true);
    try {
      const v = resetSchema.parse({ password: resetPassword });
      const { error } = await activeClient.auth.updateUser({ password: v.password });
      if (error) { toast.error(toPtBrAuthError(error.message)); return; }
      toast.success("Senha atualizada!"); window.location.hash = ""; navigate("/dashboard");
    } catch (e) { if (e instanceof z.ZodError) toast.error(e.errors[0].message); } finally { setIsLoading(false); }
  };
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setIsLoading(true);
    try {
      const v = loginSchema.parse({ email: loginEmail, password: loginPassword });
      const { error } = await signIn(v.email, v.password);
      if (error) { toast.error(toPtBrAuthError(error.message)); return; }
      toast.success("Login realizado!"); navigate(redirectTo);
    } catch (e) { if (e instanceof z.ZodError) toast.error(e.errors[0].message); } finally { setIsLoading(false); }
  };
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault(); setIsLoading(true);
    try {
      const v = signupSchema.parse({ email: signupEmail, password: signupPassword, fullName: signupFullName });
      const { error } = await signUp(v.email, v.password, v.fullName);
      if (error) { toast.error(toPtBrAuthError(error.message)); return; }
      toast.success("Conta criada!"); navigate(redirectTo);
    } catch (e) { if (e instanceof z.ZodError) toast.error(e.errors[0].message); } finally { setIsLoading(false); }
  };

  const ic = "bg-white border-input focus:border-primary rounded-md h-11 text-foreground placeholder:text-muted-foreground transition-all duration-200";
  const errClass = (field: string) => errors[field] ? "border-destructive" : "";

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left: Form */}
      <div className="flex-1 flex items-center justify-center p-8 md:p-12">
        <div className="w-full max-w-[420px]">
          <div className="flex flex-col mb-8">
            <div className="flex items-center gap-2.5 mb-9">
              <div className="w-[34px] h-[34px] bg-primary rounded-md flex items-center justify-center">
                <img src={logoTatica} alt="Tática" className="w-5 h-5 object-contain brightness-0 invert" />
              </div>
              <span className="font-semibold text-[15px] text-foreground tracking-tight">Tática Gestão</span>
            </div>
            <h1 className="text-[22px] font-semibold text-foreground tracking-tight mb-1.5">{isRecoveryFlow ? "Redefinir senha" : "Bem-vindo de volta"}</h1>
            <p className="text-[13px] text-muted-foreground leading-relaxed">{isRecoveryFlow ? "Defina uma senha segura." : "Faça login para acessar sua plataforma."}</p>
          </div>
          {isRecoveryFlow ? (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="rp" className="text-muted-foreground text-[12px] font-medium uppercase tracking-wide">Nova senha</Label>
                <PasswordInput id="rp" autoComplete="new-password" placeholder="Min. 6 caracteres" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} onBlur={() => validateField("password", resetPassword)} className={ic} error={errors.password} />
              </div>
              <Button type="submit" className="w-full h-11 rounded-lg font-semibold transition-all duration-200 hover:shadow-md active:scale-[0.98]" disabled={isLoading}>{isLoading ? "Atualizando..." : "Atualizar senha"}</Button>
            </form>
          ) : (
            <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setErrors({}); }} className="space-y-6">
              <TabsList className="grid w-full grid-cols-2 p-1 bg-muted rounded-lg h-10">
                <TabsTrigger value="login" className="rounded-md h-full data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-foreground text-muted-foreground font-medium text-[12.5px] transition-all">Entrar</TabsTrigger>
                <TabsTrigger value="signup" className="rounded-md h-full data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-foreground text-muted-foreground font-medium text-[12.5px] transition-all">Criar conta</TabsTrigger>
              </TabsList>
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="le" className="text-muted-foreground text-[12px] font-medium uppercase tracking-wide">Email</Label>
                    <Input id="le" type="email" autoComplete="email" placeholder="seu@empresa.com" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} onBlur={() => validateField("email", loginEmail)} required className={`${ic} ${errClass("email")}`} />
                    <FieldError error={errors.email} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center"><Label htmlFor="lp" className="text-muted-foreground text-[12px] font-medium uppercase tracking-wide">Senha</Label><button type="button" className="text-xs text-primary hover:text-primary/80 transition-colors font-medium" onClick={handleForgotPassword}>Esqueci minha senha</button></div>
                    <PasswordInput id="lp" autoComplete="current-password" placeholder="Min. 6 caracteres" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} onBlur={() => validateField("password", loginPassword)} className={ic} error={errors.password} />
                  </div>
                  <Button type="submit" className="w-full h-11 rounded-lg font-semibold transition-all duration-200 hover:shadow-md active:scale-[0.98] mt-2" disabled={isLoading}>{isLoading ? "Entrando..." : "Entrar"}</Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="sn" className="text-muted-foreground text-[12px] font-medium uppercase tracking-wide">Nome completo</Label>
                    <Input id="sn" type="text" placeholder="Seu nome" value={signupFullName} onChange={(e) => setSignupFullName(e.target.value)} onBlur={() => validateField("fullName", signupFullName)} required className={`${ic} ${errClass("fullName")}`} />
                    <FieldError error={errors.fullName} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="se" className="text-muted-foreground text-[12px] font-medium uppercase tracking-wide">Email</Label>
                    <Input id="se" type="email" autoComplete="email" placeholder="seu@email.com" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} onBlur={() => validateField("email", signupEmail)} required className={`${ic} ${errClass("email")}`} />
                    <FieldError error={errors.email} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sp" className="text-muted-foreground text-[12px] font-medium uppercase tracking-wide">Senha</Label>
                    <PasswordInput id="sp" autoComplete="new-password" placeholder="Min. 6 caracteres" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} onBlur={() => validateField("password", signupPassword)} className={ic} error={errors.password} />
                  </div>
                  <Button type="submit" className="w-full h-11 rounded-lg font-semibold transition-all duration-200 hover:shadow-md active:scale-[0.98] mt-2" disabled={isLoading}>{isLoading ? "Criando conta..." : "Criar conta"}</Button>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>

      {/* Right: Blue Panel */}
      <div className="hidden lg:flex w-[460px] shrink-0 bg-[#1E3A8A] items-center justify-center p-14">
        <div className="w-full">
          <p className="text-[18px] font-medium text-white/90 leading-relaxed tracking-tight mb-8">
            Gerencie seu negócio com inteligência. Plataforma completa para gestão financeira.
          </p>
          <div className="flex gap-8 flex-wrap">
            <div>
              <p className="text-[28px] font-bold text-white tracking-tight">+200</p>
              <p className="text-[12px] text-white/60 mt-0.5">Empresas geridas</p>
            </div>
            <div>
              <p className="text-[28px] font-bold text-white tracking-tight">99.9%</p>
              <p className="text-[12px] text-white/60 mt-0.5">Uptime garantido</p>
            </div>
            <div>
              <p className="text-[28px] font-bold text-white tracking-tight">24/7</p>
              <p className="text-[12px] text-white/60 mt-0.5">Suporte ativo</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
