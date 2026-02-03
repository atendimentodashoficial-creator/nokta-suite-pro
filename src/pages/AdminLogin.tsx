import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShaderBackground } from "@/components/ui/shader-background";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Lock, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Login para o painel admin completo
  const handleAdminPanelLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('admin-login', {
        body: { email, password }
      });

      if (error) throw error;

      if (data.success) {
        localStorage.setItem('admin_token', data.token);
        localStorage.setItem('admin_user', JSON.stringify(data.admin));
        
        toast.success('Login realizado com sucesso!');
        navigate('/admin/dashboard');
      } else {
        throw new Error(data.error || 'Erro ao fazer login');
      }
    } catch (error: any) {
      console.error('Erro no login:', error);
      toast.error(error.message || 'Credenciais inválidas');
    } finally {
      setIsLoading(false);
    }
  };

  // Login direto como cliente mas com switcher de admin
  const handleDirectClientLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // 1. Verificar credenciais admin via edge function
      const { data: adminData, error: adminError } = await supabase.functions.invoke('admin-login', {
        body: { email, password }
      });

      if (adminError || !adminData?.success) {
        throw new Error(adminData?.error || 'Credenciais inválidas');
      }

      // 2. Buscar lista de usuários para o switcher
      const { data: usersData, error: usersError } = await supabase.functions.invoke('admin-manage-users', {
        body: { action: 'list' },
        headers: { Authorization: `Bearer ${adminData.token}` }
      });

      if (usersError) throw usersError;

      const users = usersData?.users || [];
      
      if (users.length === 0) {
        toast.error('Nenhum cliente cadastrado para acessar');
        setIsLoading(false);
        return;
      }

      // 3. Salvar token admin e lista de usuários
      localStorage.setItem('admin_token', adminData.token);
      localStorage.setItem('admin_users_list', JSON.stringify(users));

      // 4. Gerar link de acesso para o primeiro cliente
      const firstUser = users[0];
      const { data: linkData, error: linkError } = await supabase.functions.invoke('admin-manage-users', {
        body: { action: 'generate_link', email: firstUser.email, redirectTo: '/' },
        headers: { Authorization: `Bearer ${adminData.token}` }
      });

      if (linkError || !linkData?.link) {
        throw new Error('Não foi possível acessar o cliente');
      }

      toast.success(`Acessando como ${firstUser.user_metadata?.full_name || firstUser.email}...`);
      window.location.href = linkData.link;

    } catch (error: any) {
      console.error('Erro no login direto:', error);
      toast.error(error.message || 'Credenciais inválidas');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <ShaderBackground />
      <Card className="w-full max-w-md relative z-10">
        <CardHeader className="space-y-1 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Painel Administrativo</CardTitle>
          <CardDescription>
            Acesse o painel de controle da plataforma
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="panel" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="panel">Painel Admin</TabsTrigger>
              <TabsTrigger value="direct">Acesso Direto</TabsTrigger>
            </TabsList>

            <TabsContent value="panel">
              <form onSubmit={handleAdminPanelLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-panel">Email</Label>
                  <Input
                    id="email-panel"
                    type="email"
                    placeholder="admin@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-panel">Senha</Label>
                  <Input
                    id="password-panel"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Entrando..." : "Entrar no Painel"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="direct">
              <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <Users className="h-4 w-4" />
                  <span className="text-sm font-medium">Acesso Direto aos Clientes</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Faça login e acesse diretamente o sistema como cliente, com opção de alternar entre contas.
                </p>
              </div>
              <form onSubmit={handleDirectClientLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-direct">Email Admin</Label>
                  <Input
                    id="email-direct"
                    type="email"
                    placeholder="admin@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-direct">Senha</Label>
                  <Input
                    id="password-direct"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700" disabled={isLoading}>
                  {isLoading ? "Acessando..." : "Acessar como Cliente"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
