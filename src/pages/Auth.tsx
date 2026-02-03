import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ShaderBackground } from "@/components/ui/shader-background";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import noktaLogo from "@/assets/nokta-logo.png";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres")
});

export default function Auth() {
  const {
    signIn,
    user,
    loading
  } = useAuth();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (!loading && user) {
      navigate("/");
    }
  }, [user, loading, navigate]);
  
  const [loginForm, setLoginForm] = useState({
    email: "",
    password: ""
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);
    try {
      loginSchema.parse(loginForm);
      await signIn(loginForm.email, loginForm.password);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach(err => {
          if (err.path[0]) {
            newErrors[err.path[0].toString()] = err.message;
          }
        });
        setErrors(newErrors);
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <ShaderBackground />
      <div className="w-full max-w-md relative z-10">
        {/* Auth Card - Glassmorphism */}
        <Card className="p-6 shadow-elegant bg-card/80 backdrop-blur-md border border-white/20">
          {/* Logo inside card */}
          <div className="flex flex-col items-center mb-6">
            <img 
              src={noktaLogo} 
              alt="Nokta Clinic" 
              className="h-16 w-auto mb-3 animate-scale-in"
              style={{
                filter: "brightness(0) saturate(100%) invert(12%) sepia(30%) saturate(1200%) hue-rotate(180deg) brightness(95%) contrast(95%)",
                animationDuration: '0.5s',
                animationFillMode: 'both'
              }}
            />
            <p 
              className="text-muted-foreground text-center animate-scale-in"
              style={{ 
                animationDelay: '0.15s', 
                animationDuration: '0.5s',
                animationFillMode: 'both',
                fontSize: '1.0625rem'
              }}
            >
              Sistema de gestão para clínicas odontológicas
            </p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <Input 
                id="login-email" 
                type="email" 
                placeholder="seu@email.com" 
                value={loginForm.email} 
                onChange={e => setLoginForm({
                  ...loginForm,
                  email: e.target.value
                })} 
                required 
              />
              {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="login-password">Senha</Label>
              <Input 
                id="login-password" 
                type="password" 
                placeholder="••••••••" 
                value={loginForm.password} 
                onChange={e => setLoginForm({
                  ...loginForm,
                  password: e.target.value
                })} 
                required 
              />
              {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
            </div>

            <Button type="submit" className="w-full bg-gradient-primary shadow-glow" disabled={isSubmitting}>
              {isSubmitting ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}