import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, RotateCcw, Save, Palette, Image as ImageIcon } from "lucide-react";
import { usePersonalizacao } from "@/hooks/usePersonalizacao";
import { usePersonalizacaoContext } from "@/contexts/PersonalizacaoContext";
import { toast } from "sonner";
import noktaLogoDefault from "@/assets/nokta-logo.png";

// Convert HSL string to hex for color picker
function hslToHex(hsl: string): string {
  const match = hsl.match(/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
  if (!match) return "#000000";
  
  const h = parseFloat(match[1]);
  const s = parseFloat(match[2]) / 100;
  const l = parseFloat(match[3]) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;

  if (0 <= h && h < 60) { r = c; g = x; b = 0; }
  else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
  else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
  else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
  else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
  else if (300 <= h && h < 360) { r = c; g = 0; b = x; }

  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Convert hex to HSL string
function hexToHsl(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return "0 0% 0%";

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// Default colors from the design system
const DEFAULT_COLORS = {
  primary: "199 89% 48%",
  secondary: "210 40% 96.1%",
  background: "210 20% 98%",
  sidebar: "210 30% 15%",
};

export default function Personalizacao() {
  const { config, upsertConfig, uploadLogo } = usePersonalizacao();
  const { logoUrl, resetColors } = usePersonalizacaoContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [colors, setColors] = useState({
    primary: config?.cor_primaria || DEFAULT_COLORS.primary,
    secondary: config?.cor_secundaria || DEFAULT_COLORS.secondary,
    background: config?.cor_background || DEFAULT_COLORS.background,
    sidebar: config?.cor_sidebar || DEFAULT_COLORS.sidebar,
  });
  
  const [previewLogo, setPreviewLogo] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Update colors state when config loads
  useState(() => {
    if (config) {
      setColors({
        primary: config.cor_primaria || DEFAULT_COLORS.primary,
        secondary: config.cor_secundaria || DEFAULT_COLORS.secondary,
        background: config.cor_background || DEFAULT_COLORS.background,
        sidebar: config.cor_sidebar || DEFAULT_COLORS.sidebar,
      });
    }
  });

  const handleColorChange = (colorKey: keyof typeof colors, hexValue: string) => {
    const hslValue = hexToHsl(hexValue);
    setColors(prev => ({ ...prev, [colorKey]: hslValue }));
    
    // Apply preview immediately
    const root = document.documentElement;
    const cssVar = colorKey === "sidebar" ? "--sidebar-background" : `--${colorKey}`;
    root.style.setProperty(cssVar, hslValue);
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast.error("Por favor, selecione um arquivo de imagem");
        return;
      }
      
      setLogoFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewLogo(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let newLogoUrl = config?.logo_url || null;
      
      if (logoFile) {
        const uploadedUrl = await uploadLogo(logoFile);
        if (uploadedUrl) {
          newLogoUrl = uploadedUrl;
        }
      }

      await upsertConfig.mutateAsync({
        cor_primaria: colors.primary,
        cor_secundaria: colors.secondary,
        cor_background: colors.background,
        cor_sidebar: colors.sidebar,
        logo_url: newLogoUrl,
      });

      toast.success("Personalização salva com sucesso!");
      setLogoFile(null);
      setPreviewLogo(null);
    } catch (error) {
      console.error("Error saving:", error);
      toast.error("Erro ao salvar personalização");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setColors(DEFAULT_COLORS);
    resetColors();
    setPreviewLogo(null);
    setLogoFile(null);
    
    await upsertConfig.mutateAsync({
      cor_primaria: null,
      cor_secundaria: null,
      cor_background: null,
      cor_sidebar: null,
      logo_url: null,
    });
    
    toast.success("Personalização restaurada para o padrão");
  };

  const displayLogo = previewLogo || logoUrl;
  const isCustomLogo = previewLogo || (config?.logo_url && config.logo_url !== noktaLogoDefault);

  return (
    <div className="space-y-6">
      {/* Logo Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Logo do Sistema
          </CardTitle>
          <CardDescription>
            Altere a logo que aparece na sidebar e no cabeçalho do sistema
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-6">
            {/* Logo Preview */}
            <div className="w-32 h-16 bg-sidebar rounded-lg flex items-center justify-center p-2">
              <img 
                src={displayLogo} 
                alt="Logo Preview" 
                className={`max-h-full max-w-full object-contain ${!isCustomLogo ? 'brightness-0 invert' : ''}`}
              />
            </div>
            
            <div className="flex-1 space-y-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleLogoChange}
                accept="image/*"
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Selecionar Logo
              </Button>
              <p className="text-sm text-muted-foreground">
                Formatos aceitos: PNG, JPG, SVG. A logo será redimensionada automaticamente.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Colors Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Cores do Sistema
          </CardTitle>
          <CardDescription>
            Personalize as cores principais do sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Primary Color */}
            <div className="space-y-2">
              <Label htmlFor="primary">Cor Primária</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="color"
                  id="primary"
                  value={hslToHex(colors.primary)}
                  onChange={(e) => handleColorChange("primary", e.target.value)}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <div 
                  className="flex-1 h-10 rounded-md border"
                  style={{ backgroundColor: `hsl(${colors.primary})` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Usada em botões, links e elementos de destaque
              </p>
            </div>

            {/* Secondary Color */}
            <div className="space-y-2">
              <Label htmlFor="secondary">Cor Secundária</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="color"
                  id="secondary"
                  value={hslToHex(colors.secondary)}
                  onChange={(e) => handleColorChange("secondary", e.target.value)}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <div 
                  className="flex-1 h-10 rounded-md border"
                  style={{ backgroundColor: `hsl(${colors.secondary})` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Usada em elementos secundários e fundos de cards
              </p>
            </div>

            {/* Background Color */}
            <div className="space-y-2">
              <Label htmlFor="background">Cor de Fundo</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="color"
                  id="background"
                  value={hslToHex(colors.background)}
                  onChange={(e) => handleColorChange("background", e.target.value)}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <div 
                  className="flex-1 h-10 rounded-md border"
                  style={{ backgroundColor: `hsl(${colors.background})` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Cor de fundo principal do sistema
              </p>
            </div>

            {/* Sidebar Color */}
            <div className="space-y-2">
              <Label htmlFor="sidebar">Cor da Sidebar</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="color"
                  id="sidebar"
                  value={hslToHex(colors.sidebar)}
                  onChange={(e) => handleColorChange("sidebar", e.target.value)}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <div 
                  className="flex-1 h-10 rounded-md border"
                  style={{ backgroundColor: `hsl(${colors.sidebar})` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Cor de fundo do menu lateral
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end">
        <Button
          variant="outline"
          onClick={handleReset}
          className="gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          Restaurar Padrão
        </Button>
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          {isSaving ? "Salvando..." : "Salvar Alterações"}
        </Button>
      </div>
    </div>
  );
}
