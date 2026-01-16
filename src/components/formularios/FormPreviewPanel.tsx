import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { MediaItem } from "@/hooks/useFormularios";

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
  } = config;

  const validImagens = imagens.filter(i => i.url);
  const validVideos = videos.filter(v => v.url && getVideoEmbedUrl(v.url));
  const hasMedia = validImagens.length > 0 || validVideos.length > 0;
  const mediaAcima = paginaObrigadoVideoPosicao === "acima";

  const MediaSection = () => (
    <div className="w-full space-y-3">
      {validImagens.map((img, idx) => (
        <div key={`img-${idx}`} className="space-y-1">
          {img.titulo && (
            <h3 className="text-sm font-semibold text-center" style={{ color: textColor }}>
              {img.titulo}
            </h3>
          )}
          {img.subtitulo && (
            <p className="text-xs text-center" style={{ color: textColor, opacity: 0.7 }}>
              {img.subtitulo}
            </p>
          )}
          <img 
            src={img.url} 
            alt={img.titulo || `Imagem ${idx + 1}`} 
            className="max-w-full h-auto max-h-20 object-contain rounded mx-auto" 
          />
        </div>
      ))}
      
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

  // Thank you page preview
  if (showThankYou) {
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
              <h2 className="text-lg md:text-xl font-bold" style={{ color: textColor }}>
                {paginaObrigadoTitulo || "Obrigado!"}
              </h2>
            </div>
            
            <p className="text-center text-xs" style={{ color: textColor, opacity: 0.7 }}>
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

  // Form preview
  const sampleFields = layoutTipo === "single_page" 
    ? [
        { label: "Qual seu nome?", placeholder: "Digite seu nome..." },
        { label: "Qual seu e-mail?", placeholder: "Digite seu e-mail..." },
        { label: "Qual seu telefone?", placeholder: "(00) 00000-0000" },
      ]
    : [
        { label: "Qual seu nome?", placeholder: "Digite seu nome..." },
      ];

  return (
    <div 
      className="h-full flex items-center justify-center p-4 rounded-lg overflow-auto"
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
        <CardContent className="py-4 px-4 space-y-4">
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
          {layoutTipo === "multi_step" && (
            <div className="w-full rounded-full h-2 overflow-hidden" style={{ backgroundColor: progressBackgroundColor }}>
              <div 
                className="h-full rounded-full transition-all"
                style={{ 
                  width: "33%",
                  backgroundColor: corPrimaria 
                }}
              />
            </div>
          )}
          
          {/* Title */}
          {nome && (
            <h2 className="text-sm font-semibold text-center" style={{ color: textColor }}>
              {nome}
            </h2>
          )}
          
          {/* Sample fields */}
          <div className="space-y-3">
            {sampleFields.map((field, idx) => (
              <div key={idx} className="space-y-1">
                <label className="text-xs font-medium" style={{ color: textColor }}>
                  {field.label} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <div 
                  className="w-full h-9 rounded-md border px-3 flex items-center text-xs"
                  style={{ 
                    backgroundColor: cardColor,
                    borderColor: cardBorderColor !== "transparent" ? cardBorderColor : "#e5e7eb",
                    color: answerTextColor,
                    borderRadius: `${parseInt(borderRadius) / 2}px`,
                  }}
                >
                  <span style={{ color: answerTextColor, opacity: 0.5 }}>{field.placeholder}</span>
                </div>
              </div>
            ))}
          </div>
          
          {/* Button */}
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
        </CardContent>
      </Card>
    </div>
  );
}
