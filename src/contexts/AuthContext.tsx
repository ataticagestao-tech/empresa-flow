import { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";
import { User, Session, SupabaseClient } from "@supabase/supabase-js";
import { supabase, supabaseTatica, HAS_SECONDARY_PROJECT } from "@/integrations/supabase/client";

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  activeClient: SupabaseClient; // Expose the active client so hooks can use it
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  isUsingSecondary: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeClient, setActiveClient] = useState<SupabaseClient>(supabase); // Default to main client
  const [isUsingSecondary, setIsUsingSecondary] = useState(false);
  const preferSecondaryRef = useRef<boolean>(HAS_SECONDARY_PROJECT);
  const isUsingSecondaryRef = useRef<boolean>(false);

  useEffect(() => {
    const withTimeout = async <T,>(promise: PromiseLike<T>, ms: number): Promise<T | null> => {
      let timeoutId: number | undefined;
      const timeoutPromise = new Promise<null>((resolve) => {
        timeoutId = window.setTimeout(() => resolve(null), ms);
      });
      try {
        return await Promise.race([Promise.resolve(promise), timeoutPromise]);
      } finally {
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId);
        }
      }
    };

    const applyAuthState = (params: {
      session: Session | null;
      user: User | null;
      client: SupabaseClient;
      usingSecondary: boolean;
    }) => {
      setSession(params.session);
      setUser(params.user);
      setActiveClient(params.client);
      isUsingSecondaryRef.current = params.usingSecondary;
      setIsUsingSecondary(params.usingSecondary);
      preferSecondaryRef.current = params.usingSecondary;
    };

    // Check sessions for both clients on load
    const initAuth = async () => {
      setLoading(true);

      if (HAS_SECONDARY_PROJECT) {
        const secSessionRes = await withTimeout(supabaseTatica.auth.getSession(), 6000);
        const secSession = (secSessionRes as any)?.data?.session;

        if (secSession) {
          const secUserRes = await withTimeout(supabaseTatica.auth.getUser(), 6000);
          const validUser = (secUserRes as any)?.data?.user as User | undefined;
          const userError = (secUserRes as any)?.error;

          if (validUser && !userError) {
            applyAuthState({
              session: secSession,
              user: validUser,
              client: supabaseTatica,
              usingSecondary: true,
            });
            setLoading(false);
            return;
          } else {
            await supabaseTatica.auth.signOut();
          }
        }
      }

      const mainSessionRes = await withTimeout(supabase.auth.getSession(), 6000);
      const mainSession = (mainSessionRes as any)?.data?.session;

      if (mainSession) {
        const mainUserRes = await withTimeout(supabase.auth.getUser(), 6000);
        const validUser = (mainUserRes as any)?.data?.user as User | undefined;
        const userError = (mainUserRes as any)?.error;

        if (validUser && !userError) {
          applyAuthState({
            session: mainSession,
            user: validUser,
            client: supabase,
            usingSecondary: false,
          });
          setLoading(false);
          return;
        } else {
          await supabase.auth.signOut();
        }
      }
      setLoading(false);
    };

    const timeoutId = window.setTimeout(() => {
      setLoading(false);
    }, 8000);

    initAuth().catch((err) => {
      console.error(err);
      setLoading(false);
    });

    // Listen to Main Client Auth Changes
    const { data: { subscription: mainSub } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (HAS_SECONDARY_PROJECT && preferSecondaryRef.current) {
          return;
        }
        if (session) {
          const mainUserRes = await withTimeout(supabase.auth.getUser(), 6000);
          const validUser = (mainUserRes as any)?.data?.user as User | undefined;
          applyAuthState({
            session,
            user: validUser || session.user,
            client: supabase,
            usingSecondary: false,
          });
        } else if (!session && !isUsingSecondaryRef.current) {
          // Only clear if we are not actively using the secondary
          setSession(null);
          setUser(null);
        }
      }
    );

    // Listen to Secondary Client Auth Changes
    const secSub = HAS_SECONDARY_PROJECT
      ? supabaseTatica.auth.onAuthStateChange(async (_event, session) => {
        if (session) {
          const secUserRes = await withTimeout(supabaseTatica.auth.getUser(), 6000);
          const validUser = (secUserRes as any)?.data?.user as User | undefined;
          applyAuthState({
            session,
            user: validUser || session.user,
            client: supabaseTatica,
            usingSecondary: true,
          });
        }
      }).data.subscription
      : null;

    return () => {
      window.clearTimeout(timeoutId);
      mainSub.unsubscribe();
      secSub?.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    if (HAS_SECONDARY_PROJECT) {
      const { data: secData, error: secError } = await supabaseTatica.auth.signInWithPassword({ email, password });
      if (!secError && secData.session && secData.user) {
        setSession(secData.session);
        setUser(secData.user);
        setActiveClient(supabaseTatica);
        isUsingSecondaryRef.current = true;
        setIsUsingSecondary(true);
        preferSecondaryRef.current = true;
        return { error: null };
      }
    }

    const { data: mainData, error: mainError } = await supabase.auth.signInWithPassword({ email, password });
    if (!mainError && mainData.session && mainData.user) {
      setSession(mainData.session);
      setUser(mainData.user);
      setActiveClient(supabase);
      isUsingSecondaryRef.current = false;
      setIsUsingSecondary(false);
      preferSecondaryRef.current = false;
      return { error: null };
    }

    return { error: mainError as any };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName },
      },
    });

    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (
        msg.includes("already registered") ||
        msg.includes("user already registered") ||
        msg.includes("already been registered") ||
        msg.includes("duplicate") ||
        msg.includes("already exists")
      ) {
        return { error: new Error("Este email já está cadastrado") };
      }
      return { error };
    }

    if (data.session && data.user) {
      setSession(data.session);
      setUser(data.user);
      setActiveClient(supabase);
      isUsingSecondaryRef.current = false;
      setIsUsingSecondary(false);
      preferSecondaryRef.current = false;
    }

    return { error: null };
  };

  const signOut = async () => {
    // Sign out from BOTH to be safe
    await supabase.auth.signOut();
    if (HAS_SECONDARY_PROJECT) {
      await supabaseTatica.auth.signOut();
    }
    setSession(null);
    setUser(null);
    setActiveClient(supabase); // Reset to default
    isUsingSecondaryRef.current = false;
    setIsUsingSecondary(false);
    preferSecondaryRef.current = false;
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut, activeClient, isUsingSecondary }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
