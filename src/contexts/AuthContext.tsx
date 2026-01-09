import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, 'Has session:', !!session);
        
        // Se o evento for TOKEN_REFRESHED, atualizar a sessão
        if (event === 'TOKEN_REFRESHED') {
          console.log('Token refreshed successfully');
        }
        
        // Se o evento for SIGNED_OUT, limpar estados
        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setLoading(false);
          return;
        }
        
        // Verificar se o usuário está expirado
        if (session?.user) {
          const expiryDate = (session.user.user_metadata as any)?.expiry_date;
          if (expiryDate && new Date(expiryDate) < new Date()) {
            // Usuário expirado - fazer logout
            await supabase.auth.signOut();
            toast.error("Sua conta expirou. Entre em contato com o suporte da Nokta.", {
              duration: 5000,
            });
            navigate("/auth");
            return;
          }
        }
        
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      // Verificar se o usuário está expirado
      if (session?.user) {
        const expiryDate = (session.user.user_metadata as any)?.expiry_date;
        if (expiryDate && new Date(expiryDate) < new Date()) {
          // Usuário expirado - fazer logout
          supabase.auth.signOut();
          toast.error("Sua conta expirou. Entre em contato com o suporte da Nokta.", {
            duration: 5000,
          });
          navigate("/auth");
          setLoading(false);
          return;
        }
      }
      
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

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
      // Tenta fazer signOut completo (revoga sessão no backend e limpa storage)
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Error signing out from backend:", error);
      }
    } catch (error: any) {
      console.error("Error calling signOut:", error);
    } finally {
      // Garante que o estado local seja limpo e o usuário vá para a tela de login
      setSession(null);
      setUser(null);
      navigate("/auth", { replace: true });
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, signIn, signUp, signOut, loading }}>
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
