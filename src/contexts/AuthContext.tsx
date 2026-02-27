import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export interface AdminUser {
  id: string;
  email: string;
  user_metadata?: {
    full_name?: string;
    [key: string]: any;
  };
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  loading: boolean;
  isAdmin: boolean;
  adminUsers: AdminUser[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const navigate = useNavigate();

  const checkAndStoreAdminStatus = useCallback(async (accessToken: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("check-admin-status", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (error) {
        console.error("Erro ao verificar status admin:", error);
        return;
      }

      if (data?.isAdmin && data?.adminToken && Array.isArray(data?.users)) {
        localStorage.setItem("admin_token", data.adminToken);
        localStorage.setItem("admin_users_list", JSON.stringify(data.users));
        setAdminUsers(data.users);
        setIsAdmin(true);
        console.log("Admin detectado! Funcionalidade de troca de cliente ativada.");
        return;
      }

      // Limpar dados admin se não for admin (mas só se não houver token existente)
      const existingToken = localStorage.getItem("admin_token");
      if (!existingToken) {
        localStorage.removeItem("admin_token");
        localStorage.removeItem("admin_users_list");
        setAdminUsers([]);
        setIsAdmin(false);
      }
    } catch (error) {
      console.error("Erro ao verificar status admin:", error);
    }
  }, []);

  // Carregar estado admin persistido (para evitar race condition no primeiro render)
  useEffect(() => {
    const adminToken = localStorage.getItem("admin_token");
    const adminUsersData = localStorage.getItem("admin_users_list");

    if (adminToken && adminUsersData) {
      try {
        const parsedUsers = JSON.parse(adminUsersData);
        setAdminUsers(Array.isArray(parsedUsers) ? parsedUsers : []);
        setIsAdmin(true);
      } catch {
        setAdminUsers([]);
        setIsAdmin(!!adminToken);
      }
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    // Listener for ONGOING auth changes - never call supabase synchronously here
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;
        console.log('Auth state changed:', event, 'Has session:', !!session);
        
        if (event === 'TOKEN_REFRESHED') {
          console.log('Token refreshed successfully');
        }
        
        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setLoading(false);
          const adminToken = localStorage.getItem('admin_token');
          if (!adminToken) {
            localStorage.removeItem('admin_token');
            localStorage.removeItem('admin_users_list');
          }
          setAdminUsers([]);
          setIsAdmin(false);
          return;
        }
        
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        // Dispatch async work AFTER callback completes to avoid lock deadlock
        if (session?.user) {
          const expiryDate = (session.user.user_metadata as any)?.expiry_date;
          if (expiryDate && new Date(expiryDate) < new Date()) {
            setTimeout(() => {
              supabase.auth.signOut();
              toast.error("Sua conta expirou. Entre em contato com o suporte da Nokta.", { duration: 5000 });
              navigate("/auth");
            }, 0);
            return;
          }
          
          if (event === 'SIGNED_IN' && session.access_token) {
            setTimeout(() => {
              checkAndStoreAdminStatus(session.access_token);
            }, 0);
          }
        }
      }
    );

    // INITIAL load
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (session?.user) {
          const expiryDate = (session.user.user_metadata as any)?.expiry_date;
          if (expiryDate && new Date(expiryDate) < new Date()) {
            supabase.auth.signOut();
            toast.error("Sua conta expirou. Entre em contato com o suporte da Nokta.", { duration: 5000 });
            navigate("/auth");
            return;
          }
          
          if (session.access_token) {
            await checkAndStoreAdminStatus(session.access_token);
          }
        }
        
        setSession(session);
        setUser(session?.user ?? null);
      } catch (err: any) {
        // Ignore Navigator Lock errors - they are transient and the onAuthStateChange
        // listener will recover the session state automatically
        if (err?.name === 'AbortError' || err?.message?.includes('Lock broken')) {
          console.warn('[Auth] Navigator Lock conflict (safe to ignore):', err.message);
        } else {
          console.error('[Auth] Error initializing auth:', err);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [navigate, checkAndStoreAdminStatus]);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Verificar se o usuário está expirado
      if (data.user) {
        const expiryDate = (data.user.user_metadata as any)?.expiry_date;
        if (expiryDate && new Date(expiryDate) < new Date()) {
          // Fazer logout imediatamente
          await supabase.auth.signOut();
          toast.error("Sua conta expirou. Entre em contato com o suporte da Nokta para renovar o acesso.", {
            duration: 6000,
          });
          throw new Error("Conta expirada");
        }
      }

      // Verificar status admin
      if (data.session?.access_token) {
        await checkAndStoreAdminStatus(data.session.access_token);
      }

      toast.success("Login realizado com sucesso!");
      navigate("/");
    } catch (error: any) {
      console.error("Error signing in:", error);
      if (error.message === "Conta expirada") {
        // Já mostrou a mensagem de erro acima
        return;
      }
      if (error.message.includes("Invalid login credentials")) {
        toast.error("Email ou senha incorretos");
      } else {
        toast.error(error.message || "Erro ao fazer login");
      }
      throw error;
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) throw error;

      toast.success("Conta criada com sucesso! Você já pode fazer login.");
      navigate("/");
    } catch (error: any) {
      console.error("Error signing up:", error);
      if (error.message.includes("already registered")) {
        toast.error("Este email já está cadastrado");
      } else {
        toast.error(error.message || "Erro ao criar conta");
      }
      throw error;
    }
  };

  const signOut = async () => {
    try {
      // Logout local (não depende de a sessão ainda existir no backend)
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) {
        console.error("Error signing out (local):", error);
      }
    } catch (error: any) {
      console.error("Error calling signOut:", error);
    } finally {
      // Fallback: garantir que qualquer token do auth no storage seja removido
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith("sb-") && k.endsWith("-auth-token"))
          .forEach((k) => localStorage.removeItem(k));
      } catch {
        // ignore
      }

      // Garante que o estado local seja limpo e o usuário vá para a tela de login
      setSession(null);
      setUser(null);
      // Limpar dados admin
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_users_list');
      setAdminUsers([]);
      setIsAdmin(false);
      navigate("/auth", { replace: true });
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, signIn, signUp, signOut, loading, isAdmin, adminUsers }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
