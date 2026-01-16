import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { MediaItem, FormularioEtapa } from "@/hooks/useFormularios";
import { Checkbox } from "@/components/ui/checkbox";

interface FormPreviewPanelProps {
  config: {
    nome: string;
    logoUrl: string | null;
    corPrimaria: string;
    backgroundColor: string;
    cardColor: string;
    fontFamily: string;
    textColor: string;
    buttonTextColor: string;
    borderRadius: string;
    progressBackgroundColor: string;
    cardBorderColor: string;
    answerTextColor: string;
    layoutTipo: "multi_step" | "single_page";
    paginaObrigadoTitulo: string;
    paginaObrigadoMensagem: string;
    paginaObrigadoCtaTexto: string;
    paginaObrigadoVideoPosicao: "acima" | "abaixo";
    imagens: MediaItem[];
    videos: MediaItem[];
    imagensLayout?: "horizontal" | "vertical";
    etapas: FormularioEtapa[];
    // New title fields
    titulo?: string;
    subtitulo?: string;
    tituloCor?: string;
    fonteTamanhoTitulo?: string;
    fonteTamanhoSubtitulo?: string;
    fonteTamanhoCampos?: string;
    fonteTamanhoObrigadoTitulo?: string;
    fonteTamanhoObrigadoTexto?: string;
  };
  showThankYou?: boolean;
}

function getVideoEmbedUrl(url: string): string | null {
  if (!url) return null;
  
  // YouTube
  const youtubeMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (youtubeMatch) {
    return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
  }
  
  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }
  
  return null;
}

// Helper to get placeholder based on field type
function getPlaceholderForType(tipo: string, configuracao?: Record<string, unknown>): string {
  switch (tipo) {
    case "nome":
      return "Digite seu nome...";
    case "email":
      return "seu@email.com";
    case "telefone":
      return "(00) 00000-0000";
    case "texto":
      return (configuracao?.placeholder as string) || "Digite aqui...";
    case "multipla_escolha":
    case "selecao_unica":
      return "";
    default:
      return "Digite aqui...";
  }
}

export default function FormPreviewPanel({ config, showThankYou = false }: FormPreviewPanelProps) {
  const {
    nome,
    logoUrl,
    corPrimaria,
    backgroundColor,
    cardColor,
    fontFamily,
    textColor,
    buttonTextColor,
    borderRadius,
    progressBackgroundColor,
    cardBorderColor,
    answerTextColor,
    layoutTipo,
    paginaObrigadoTitulo,
    paginaObrigadoMensagem,
    paginaObrigadoCtaTexto,
    paginaObrigadoVideoPosicao,
    imagens,
    videos,
    imagensLayout = "horizontal",
    etapas,
    // New title fields with defaults
    titulo = "",
    subtitulo = "",
    tituloCor = "#1f2937",
    fonteTamanhoTitulo = "24px",
    fonteTamanhoSubtitulo = "16px",
    fonteTamanhoCampos = "14px",
    fonteTamanhoObrigadoTitulo = "28px",
    fonteTamanhoObrigadoTexto = "16px",
  } = config;

  const validImagens = imagens.filter(i => i.url);
  const validVideos = videos.filter(v => v.url && getVideoEmbedUrl(v.url));
  const hasMedia = validImagens.length > 0 || validVideos.length > 0;
  const mediaAcima = paginaObrigadoVideoPosicao === "acima";

  const MediaSection = () => (
    <div className="w-full space-y-3">
      {/* Images displayed based on layout setting */}
      {validImagens.length > 0 && (
        <div className={imagensLayout === "horizontal" ? "flex flex-wrap justify-center gap-2" : "space-y-3"}>
          {validImagens.map((img, idx) => (
            <div key={`img-${idx}`} className={`flex flex-col items-center space-y-1 ${imagensLayout === "horizontal" ? "" : "w-full"}`}>
              <img 
                src={img.url} 
                alt={img.titulo || `Imagem ${idx + 1}`} 
                className={imagensLayout === "horizontal" 
                  ? "h-16 w-auto max-w-[80px] object-contain rounded" 
                  : "max-w-full h-auto max-h-20 object-contain rounded mx-auto"
                } 
              />
              {img.titulo && (
                <span className="text-[10px] font-medium text-center" style={{ color: textColor }}>
                  {img.titulo}
                </span>
              )}
              {img.subtitulo && (
                <span className="text-[8px] text-center" style={{ color: textColor, opacity: 0.7 }}>
                  {img.subtitulo}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      
      {validVideos.map((vid, idx) => (
        <div key={`vid-${idx}`} className="space-y-1">
          {vid.titulo && (
            <h3 className="text-sm font-semibold text-center" style={{ color: textColor }}>
              {vid.titulo}
            </h3>
          )}
          {vid.subtitulo && (
            <p className="text-xs text-center" style={{ color: textColor, opacity: 0.7 }}>
              {vid.subtitulo}
            </p>
          )}
          <div className="w-full aspect-video rounded overflow-hidden">
            <iframe
              src={getVideoEmbedUrl(vid.url)!}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={vid.titulo || `Video ${idx + 1}`}
            />
          </div>
        </div>
      ))}
    </div>
  );

  // Render a single field based on its type
  const renderField = (etapa: FormularioEtapa) => {
    const opcoes = (etapa.configuracao?.opcoes as string[]) || [];
    const campos = (etapa.configuracao?.campos as Array<{ label: string; placeholder?: string }>) || [];
    const placeholder = getPlaceholderForType(etapa.tipo, etapa.configuracao);
    const fieldFontSize = parseInt(fonteTamanhoCampos) || 14;

    // For checkbox/radio types (multipla_escolha, selecao_unica, opcoes)
    if (etapa.tipo === "multipla_escolha" || etapa.tipo === "selecao_unica" || etapa.tipo === "opcoes") {
      return (
        <div className="space-y-1.5">
          {opcoes.slice(0, 3).map((opcao, idx) => (
            <div 
              key={idx}
              className="flex items-center gap-2 p-2 rounded-md border"
              style={{ 
                borderColor: cardBorderColor !== "transparent" ? cardBorderColor : "#e5e7eb",
                backgroundColor: "#ffffff",
                borderRadius: `${parseInt(borderRadius) / 2}px`,
              }}
            >
              <Checkbox 
                disabled 
                className="h-3 w-3"
                style={{ borderColor: corPrimaria }}
              />
              <span style={{ color: answerTextColor, fontSize: `${fieldFontSize}px` }}>{opcao}</span>
            </div>
          ))}
          {opcoes.length > 3 && (
            <p className="text-xs opacity-50" style={{ color: textColor }}>
              +{opcoes.length - 3} opções...
            </p>
          )}
        </div>
      );
    }

    // For multiplos_campos type (multiple sub-fields)
    if (etapa.tipo === "multiplos_campos" && campos.length > 0) {
      return (
        <div className="space-y-1.5">
          {campos.slice(0, 4).map((campo, idx) => (
            <div key={idx} className="space-y-0.5">
              <label className="text-[10px] font-medium" style={{ color: textColor }}>
                {campo.label} <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <div 
                className="w-full h-7 rounded-md border px-2 flex items-center text-xs"
                style={{ 
                  backgroundColor: "#ffffff",
                  borderColor: cardBorderColor !== "transparent" ? cardBorderColor : "#e5e7eb",
                  borderRadius: `${parseInt(borderRadius) / 2}px`,
                }}
              >
                <span style={{ color: answerTextColor, opacity: 0.5 }}>
                  {campo.placeholder || "Digite aqui..."}
                </span>
              </div>
            </div>
          ))}
          {campos.length > 4 && (
            <p className="text-xs opacity-50" style={{ color: textColor }}>
              +{campos.length - 4} campos...
            </p>
          )}
        </div>
      );
    }

    // For text/email/phone types
    return (
      <div 
        className="w-full h-8 rounded-md border px-2 flex items-center text-xs"
        style={{ 
          backgroundColor: "#ffffff",
          borderColor: cardBorderColor !== "transparent" ? cardBorderColor : "#e5e7eb",
          borderRadius: `${parseInt(borderRadius) / 2}px`,
        }}
      >
        <span style={{ color: answerTextColor, opacity: 0.5 }}>{placeholder}</span>
      </div>
    );
  };

  // Thank you page preview
  if (showThankYou) {
    const obrigadoTituloSize = parseInt(fonteTamanhoObrigadoTitulo) || 28;
    const obrigadoTextoSize = parseInt(fonteTamanhoObrigadoTexto) || 16;
    
    return (
      <div 
        className="h-full flex items-center justify-center p-4 rounded-lg"
        style={{ 
          backgroundColor,
          fontFamily: `${fontFamily}, sans-serif`,
        }}
      >
        <Card 
          className="w-full max-w-[280px]"
          style={{ 
            backgroundColor: cardColor,
            borderRadius: `${borderRadius}px`,
            color: textColor,
            border: cardBorderColor && cardBorderColor !== "transparent" ? `1px solid ${cardBorderColor}` : undefined,
          }}
        >
          <CardContent className="flex flex-col items-center justify-center py-6 px-4 space-y-3">
            {mediaAcima && hasMedia && <MediaSection />}
            
            <div className="flex items-center justify-center gap-2">
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: corPrimaria + "20" }}
              >
                <CheckCircle2 className="h-4 w-4" style={{ color: corPrimaria }} />
              </div>
              <h2 className="font-bold" style={{ color: textColor, fontSize: `${Math.min(obrigadoTituloSize * 0.6, 20)}px` }}>
                {paginaObrigadoTitulo || "Obrigado!"}
              </h2>
            </div>
            
            <p className="text-center" style={{ color: textColor, opacity: 0.7, fontSize: `${Math.min(obrigadoTextoSize * 0.7, 12)}px` }}>
              {paginaObrigadoMensagem || "Recebemos suas informações."}
            </p>

            {!mediaAcima && hasMedia && <MediaSection />}

            {paginaObrigadoCtaTexto && (
              <Button
                size="sm"
                className="mt-2"
                style={{ 
                  backgroundColor: corPrimaria, 
                  color: buttonTextColor,
                  borderRadius: `${parseInt(borderRadius) / 2}px`,
                }}
              >
                {paginaObrigadoCtaTexto}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Determine which fields to show
  const fieldsToShow = etapas.length > 0 
    ? (layoutTipo === "single_page" ? etapas : etapas.slice(0, 1))
    : []; // No fallback - only show real etapas

  const hasEtapas = fieldsToShow.length > 0;

  return (
    <div 
      className="h-full flex items-start justify-center p-4 rounded-lg overflow-auto"
      style={{ 
        backgroundColor,
        fontFamily: `${fontFamily}, sans-serif`,
      }}
    >
      <Card 
        className="w-full max-w-[280px]"
        style={{ 
          backgroundColor: cardColor,
          borderRadius: `${borderRadius}px`,
          color: textColor,
          border: cardBorderColor && cardBorderColor !== "transparent" ? `1px solid ${cardBorderColor}` : undefined,
        }}
      >
        <CardContent className="py-4 px-4 space-y-3">
          {/* Logo */}
          {logoUrl && (
            <div className="flex justify-center">
              <img 
                src={logoUrl} 
                alt="Logo" 
                className="h-10 w-auto max-w-32 object-contain"
              />
            </div>
          )}
          
          {/* Progress bar (multi-step only) */}
          {layoutTipo === "multi_step" && hasEtapas && (
            <div className="w-full rounded-full h-2 overflow-hidden" style={{ backgroundColor: progressBackgroundColor }}>
              <div 
                className="h-full rounded-full transition-all"
                style={{ 
                  width: `${Math.round(100 / etapas.length)}%`,
                  backgroundColor: corPrimaria 
                }}
              />
            </div>
          )}
          
          {/* Title and Subtitle - only show if filled */}
          {(titulo || subtitulo) && (
            <div className="space-y-1 text-center">
              {titulo && (
                <h2 className="font-bold" style={{ 
                  color: tituloCor, 
                  fontSize: `${Math.min((parseInt(fonteTamanhoTitulo) || 24) * 0.5, 16)}px` 
                }}>
                  {titulo}
                </h2>
              )}
              {subtitulo && (
                <p style={{ 
                  color: textColor, 
                  opacity: 0.7,
                  fontSize: `${Math.min((parseInt(fonteTamanhoSubtitulo) || 16) * 0.6, 12)}px` 
                }}>
                  {subtitulo}
                </p>
              )}
            </div>
          )}
          
          {/* Real fields from etapas */}
          {hasEtapas ? (
            <div className="space-y-3">
              {fieldsToShow.map((etapa) => (
                <div key={etapa.id} className="space-y-1">
                  <label style={{ color: textColor, fontSize: `${Math.min((parseInt(fonteTamanhoCampos) || 14) * 0.75, 12)}px`, fontWeight: 500 }}>
                    {etapa.titulo} {etapa.obrigatorio && <span style={{ color: "#ef4444" }}>*</span>}
                  </label>
                  {renderField(etapa)}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-xs opacity-50" style={{ color: textColor }}>
                Nenhuma etapa cadastrada ainda.
                <br />
                Adicione etapas para visualizar a preview.
              </p>
            </div>
          )}
          
          {/* Button */}
          {hasEtapas && (
            <Button
              className="w-full"
              size="sm"
              style={{ 
                backgroundColor: corPrimaria, 
                color: buttonTextColor,
                borderRadius: `${parseInt(borderRadius) / 2}px`,
              }}
            >
              {layoutTipo === "multi_step" ? "Próximo" : "Enviar"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
