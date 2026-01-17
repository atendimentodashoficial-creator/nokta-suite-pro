import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { MediaItem, FormularioEtapa } from "@/hooks/useFormularios";
import { Checkbox } from "@/components/ui/checkbox";

type SectionType = "titulo" | "cta" | "imagens" | "videos";

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
    paginaObrigadoCtaLink?: string;
    imagens: MediaItem[];
    videos: MediaItem[];
    imagensLayout?: "horizontal" | "vertical";
    sectionOrder?: SectionType[];
    etapas: FormularioEtapa[];
    // New title fields
    titulo?: string;
    subtitulo?: string;
    tituloCor?: string;
    subtituloCor?: string;
    fonteTamanhoTitulo?: string;
    fonteTamanhoSubtitulo?: string;
    fonteTamanhoPerguntas?: string;
    fonteTamanhoCampos?: string;
    fonteTamanhoRespostas?: string;
    fonteTamanhoBotoes?: string;
    fonteTamanhoObrigadoTitulo?: string;
    fonteTamanhoObrigadoTexto?: string;
    fonteTamanhoObrigadoBotao?: string;
    // Media styling
    fonteTamanhoMidiaTitulo?: string;
    fonteTamanhoMidiaSubtitulo?: string;
    fonteMidia?: string;
    // Independent colors
    corTituloPrincipal?: string;
    corMensagem?: string;
    corTituloMidia?: string;
    corSubtituloMidia?: string;
    // Step description styling
    fonteTamanhoDescricaoEtapa?: string;
    fonteTamanhoIndicadorEtapa?: string;
    fonteTamanhoPaginacao?: string;
    corDescricaoEtapa?: string;
    corIndicadorEtapa?: string;
    corPaginacao?: string;
    barraProgressoVisivel?: boolean;
    // Independent thank you page styling
    obrigadoBackgroundColor?: string;
    obrigadoCardColor?: string;
    obrigadoCorPrimaria?: string;
    obrigadoButtonTextColor?: string;
    obrigadoCardBorderColor?: string;
    obrigadoBorderRadius?: string;
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
    paginaObrigadoCtaLink,
    imagens,
    videos,
    imagensLayout = "vertical",
    sectionOrder = ["titulo", "cta", "imagens", "videos"],
    etapas,
    // New title fields with defaults
    titulo = "",
    subtitulo = "",
    tituloCor = "#1f2937",
    subtituloCor = "#6b7280",
    fonteTamanhoTitulo = "24px",
    fonteTamanhoSubtitulo = "16px",
    fonteTamanhoPerguntas = "16px",
    fonteTamanhoCampos = "14px",
    fonteTamanhoRespostas = "14px",
    fonteTamanhoBotoes = "16px",
    fonteTamanhoObrigadoTitulo = "28px",
    fonteTamanhoObrigadoTexto = "16px",
    fonteTamanhoObrigadoBotao = "16px",
    // Media styling
    fonteTamanhoMidiaTitulo = "18px",
    fonteTamanhoMidiaSubtitulo = "14px",
    fonteMidia = "Inter",
    // Independent colors
    corTituloPrincipal = "#1f2937",
    corMensagem = "#6b7280",
    corTituloMidia = "#1f2937",
    corSubtituloMidia = "#6b7280",
    // Step description styling
    fonteTamanhoDescricaoEtapa = "14px",
    fonteTamanhoIndicadorEtapa = "14px",
    fonteTamanhoPaginacao = "14px",
    corDescricaoEtapa = "#6b7280",
    corIndicadorEtapa = "#6b7280",
    corPaginacao = "#6b7280",
    barraProgressoVisivel = true,
    // Independent thank you page styling (use fallbacks to general settings)
    obrigadoBackgroundColor = backgroundColor,
    obrigadoCardColor = cardColor,
    obrigadoCorPrimaria = corPrimaria,
    obrigadoButtonTextColor = buttonTextColor,
    obrigadoCardBorderColor = cardBorderColor,
    obrigadoBorderRadius = borderRadius,
  } = config;

  const validImagens = imagens.filter(i => i.url);
  const validVideos = videos.filter(v => v.url && getVideoEmbedUrl(v.url));
  
  const [currentEtapaIndex, setCurrentEtapaIndex] = useState(0);

  // Sections render functions for thank you page
  const TituloSection = ({ obrigadoTituloSize, obrigadoTextoSize }: { obrigadoTituloSize: number, obrigadoTextoSize: number }) => (
    <>
      <div className="flex items-center justify-center gap-2">
        <div 
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: obrigadoCorPrimaria + "20" }}
        >
          <CheckCircle2 className="h-4 w-4" style={{ color: obrigadoCorPrimaria }} />
        </div>
        <h2 className="font-bold" style={{ color: corTituloPrincipal, fontSize: `${Math.round(obrigadoTituloSize * 0.5)}px` }}>
          {paginaObrigadoTitulo || "Obrigado!"}
        </h2>
      </div>
      <p className="text-center" style={{ color: corMensagem, fontSize: `${Math.round(obrigadoTextoSize * 0.5)}px` }}>
        {paginaObrigadoMensagem || "Recebemos suas informações."}
      </p>
    </>
  );

  const obrigadoBotaoSize = parseInt(fonteTamanhoObrigadoBotao) || 16;

  const CtaSection = () => (
    paginaObrigadoCtaTexto ? (
      <Button
        size="sm"
        className="mt-2"
        style={{ 
          backgroundColor: obrigadoCorPrimaria, 
          color: obrigadoButtonTextColor,
          borderRadius: `${parseInt(obrigadoBorderRadius) / 2}px`,
          fontSize: `${Math.round(obrigadoBotaoSize * 0.5)}px`,
        }}
      >
        {paginaObrigadoCtaTexto}
      </Button>
    ) : null
  );

  const mediaTitleSize = parseInt(fonteTamanhoMidiaTitulo) || 18;
  const mediaSubtitleSize = parseInt(fonteTamanhoMidiaSubtitulo) || 14;

  const ImagensSection = () => (
    validImagens.length > 0 ? (
      <div className="w-full space-y-3">
        {validImagens.map((img, idx) => {
          // sideImages are displayed horizontally with the main image
          const sideImages = img.sideImages?.filter(si => si.url) || [];
          const hasSideImages = sideImages.length > 0;
          const totalImages = 1 + sideImages.length;

          return (
            <div key={`img-${idx}`} className="w-full">
              {/* Title for this image */}
              {img.titulo && (
                <span 
                  className="font-medium text-center block" 
                  style={{ 
                    color: corTituloMidia, 
                    fontFamily: fonteMidia,
                    fontSize: `${mediaTitleSize}px` 
                  }}
                >
                  {img.titulo}
                </span>
              )}
              {/* Subtitle for this image */}
              {img.subtitulo && (
                <span 
                  className="text-center block mt-1 mb-4"
                  style={{ 
                    color: corSubtituloMidia, 
                    fontFamily: fonteMidia,
                    fontSize: `${mediaSubtitleSize}px` 
                  }}
                >
                  {img.subtitulo}
                </span>
              )}
              {/* Image(s) */}
              <div className={`w-full rounded overflow-hidden ${hasSideImages ? 'flex gap-1' : ''}`}>
                <img 
                  src={img.url} 
                  alt={img.titulo || `Imagem ${idx + 1}`} 
                  className="h-auto object-contain" 
                  style={hasSideImages ? { width: `${100 / totalImages}%` } : { width: '100%' }}
                />
                {sideImages.map((sideImg, sideIdx) => (
                  <img 
                    key={`${idx}-side-${sideIdx}`}
                    src={sideImg.url} 
                    alt={`Imagem lateral ${sideIdx + 1}`} 
                    className="h-auto object-contain" 
                    style={{ width: `${100 / totalImages}%` }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    ) : null
  );

  const VideosSection = () => (
    validVideos.length > 0 ? (
      <div className="w-full space-y-3">
        {validVideos.map((vid, idx) => (
          <div key={`vid-${idx}`}>
            {vid.titulo && (
              <h3 
                className="font-semibold text-center" 
                style={{ 
                  color: corTituloMidia, 
                  fontFamily: fonteMidia,
                  fontSize: `${mediaTitleSize}px` 
                }}
              >
                {vid.titulo}
              </h3>
            )}
            {vid.subtitulo && (
              <p 
                className="text-center mt-1 mb-4"
                style={{ 
                  color: corSubtituloMidia, 
                  fontFamily: fonteMidia,
                  fontSize: `${mediaSubtitleSize}px` 
                }}
              >
                {vid.subtitulo}
              </p>
            )}
            <div className={`grid gap-2 ${vid.sideVideos?.filter(s => s.url && getVideoEmbedUrl(s.url)).length ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div className="w-full aspect-video rounded overflow-hidden">
                <iframe
                  src={getVideoEmbedUrl(vid.url)!}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={vid.titulo || `Video ${idx + 1}`}
                />
              </div>
              {vid.sideVideos?.filter(s => s.url && getVideoEmbedUrl(s.url)).map((sideVid, sideIdx) => (
                <div key={`side-vid-${idx}-${sideIdx}`} className="w-full aspect-video rounded overflow-hidden">
                  <iframe
                    src={getVideoEmbedUrl(sideVid.url)!}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title={`Video ${idx + 1}.${sideIdx + 1}`}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    ) : null
  );

  const MediaSection = () => (
    <div className="w-full space-y-3">
      {/* Images displayed - each image with its sideImages inline */}
      {validImagens.length > 0 && (
        <div className="space-y-3">
          {validImagens.map((img, idx) => (
            <div key={`img-${idx}`} className="flex flex-col items-center space-y-1 w-full">
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
              {/* Main image and side images displayed horizontally */}
              <div className="flex flex-wrap justify-center gap-2">
                <img 
                  src={img.url} 
                  alt={img.titulo || `Imagem ${idx + 1}`} 
                  className="h-16 w-auto max-w-[80px] object-contain rounded" 
                />
                {/* Side images (horizontal companions) */}
                {img.sideImages?.filter(s => s.url).map((sideImg, sideIdx) => (
                  <img 
                    key={`side-${idx}-${sideIdx}`}
                    src={sideImg.url} 
                    alt={`Imagem ${idx + 1}.${sideIdx + 1}`} 
                    className="h-16 w-auto max-w-[80px] object-contain rounded" 
                  />
                ))}
              </div>
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
          {/* Main video and side videos displayed in a grid */}
          <div className={`grid gap-2 ${vid.sideVideos?.filter(s => s.url && getVideoEmbedUrl(s.url)).length ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div className="w-full aspect-video rounded overflow-hidden">
              <iframe
                src={getVideoEmbedUrl(vid.url)!}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={vid.titulo || `Video ${idx + 1}`}
              />
            </div>
            {/* Side videos */}
            {vid.sideVideos?.filter(s => s.url && getVideoEmbedUrl(s.url)).map((sideVid, sideIdx) => (
              <div key={`side-vid-${idx}-${sideIdx}`} className="w-full aspect-video rounded overflow-hidden">
                <iframe
                  src={getVideoEmbedUrl(sideVid.url)!}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={`Video ${idx + 1}.${sideIdx + 1}`}
                />
              </div>
            ))}
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
    const respostaSize = parseInt(fonteTamanhoRespostas) || 14;
    return (
      <div 
        className="w-full h-8 rounded-md border px-2 flex items-center"
        style={{ 
          backgroundColor: "#ffffff",
          borderColor: cardBorderColor !== "transparent" ? cardBorderColor : "#e5e7eb",
          borderRadius: `${parseInt(borderRadius) / 2}px`,
        }}
      >
        <span style={{ 
          color: answerTextColor, 
          opacity: 0.5,
          fontSize: `${Math.min(respostaSize * 0.75, 12)}px`,
        }}>{placeholder}</span>
      </div>
    );
  };

  // Thank you page preview
  if (showThankYou) {
    const obrigadoTituloSize = parseInt(fonteTamanhoObrigadoTitulo) || 28;
    const obrigadoTextoSize = parseInt(fonteTamanhoObrigadoTexto) || 16;
    
    const renderSection = (sectionType: SectionType) => {
      switch (sectionType) {
        case "titulo":
          return <TituloSection key="titulo" obrigadoTituloSize={obrigadoTituloSize} obrigadoTextoSize={obrigadoTextoSize} />;
        case "cta":
          return <CtaSection key="cta" />;
        case "imagens":
          return <ImagensSection key="imagens" />;
        case "videos":
          return <VideosSection key="videos" />;
        default:
          return null;
      }
    };
    
    return (
      <div 
        className="h-full flex items-center justify-center p-4 rounded-lg"
        style={{ 
          backgroundColor: obrigadoBackgroundColor,
          fontFamily: `${fontFamily}, sans-serif`,
        }}
      >
        <Card 
          className="w-full max-w-[280px]"
          style={{ 
            backgroundColor: obrigadoCardColor,
            borderRadius: `${obrigadoBorderRadius}px`,
            color: textColor,
            border: obrigadoCardBorderColor && obrigadoCardBorderColor !== "transparent" ? `1px solid ${obrigadoCardBorderColor}` : undefined,
          }}
        >
          <CardContent className="flex flex-col items-center justify-center py-6 px-4 space-y-3">
            {sectionOrder.map(renderSection)}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Determine which fields to show
  const hasEtapas = etapas.length > 0;
  const currentEtapa = hasEtapas ? etapas[Math.min(currentEtapaIndex, etapas.length - 1)] : null;
  
  // For single page, show all. For multi-step, show current etapa
  const fieldsToShow = hasEtapas 
    ? (layoutTipo === "single_page" ? etapas : (currentEtapa ? [currentEtapa] : []))
    : [];

  const handlePrevEtapa = () => {
    if (currentEtapaIndex > 0) {
      setCurrentEtapaIndex(currentEtapaIndex - 1);
    }
  };

  const handleNextEtapa = () => {
    if (currentEtapaIndex < etapas.length - 1) {
      setCurrentEtapaIndex(currentEtapaIndex + 1);
    }
  };

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
          {layoutTipo === "multi_step" && hasEtapas && barraProgressoVisivel && (
            <div className="space-y-1">
              {/* Step indicator and percentage */}
              <div className="flex items-center justify-between">
                <span
                  style={{
                    color: corIndicadorEtapa,
                    fontSize: fonteTamanhoIndicadorEtapa,
                  }}
                >
                  Etapa {currentEtapaIndex + 1} de {etapas.length}
                </span>
                <span
                  style={{
                    color: corIndicadorEtapa,
                    fontSize: fonteTamanhoIndicadorEtapa,
                  }}
                >
                  {Math.round(((currentEtapaIndex + 1) / etapas.length) * 100)}%
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full rounded-full h-2 overflow-hidden" style={{ backgroundColor: progressBackgroundColor }}>
                <div 
                  className="h-full rounded-full transition-all"
                  style={{ 
                    width: `${Math.round(((currentEtapaIndex + 1) / etapas.length) * 100)}%`,
                    backgroundColor: corPrimaria 
                  }}
                />
              </div>
            </div>
          )}
          
          {/* Title and Subtitle - only show if filled */}
          {(titulo || subtitulo) && (
            <div className="space-y-1 text-center">
              {titulo && (
                <h2 className="font-bold" style={{ 
                  color: tituloCor, 
                  fontSize: `${Math.round((parseInt(fonteTamanhoTitulo) || 24) * 0.5)}px` 
                }}>
                  {titulo}
                </h2>
              )}
              {subtitulo && (
                <p style={{ 
                  color: subtituloCor, 
                  fontSize: `${Math.round((parseInt(fonteTamanhoSubtitulo) || 16) * 0.5)}px` 
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
                  <label style={{ 
                    color: textColor, 
                    fontSize: `${Math.min((parseInt(fonteTamanhoPerguntas) || 16) * 0.75, 14)}px`,
                    fontWeight: 500,
                  }}>
                    {etapa.titulo} {etapa.obrigatorio && <span style={{ color: "#ef4444" }}>*</span>}
                  </label>
                  {/* Descrição da etapa */}
                  {etapa.descricao && (
                    <p style={{ 
                      color: corDescricaoEtapa,
                      fontSize: `${Math.min((parseInt(fonteTamanhoDescricaoEtapa) || 14) * 0.7, 11)}px`,
                    }}>
                      {etapa.descricao}
                    </p>
                  )}
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
          
          {/* Navigation for multi-step */}
          {layoutTipo === "multi_step" && hasEtapas && (
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePrevEtapa}
                disabled={currentEtapaIndex === 0}
                className="flex-1"
                style={{ 
                  borderRadius: `${parseInt(borderRadius) / 2}px`,
                  opacity: currentEtapaIndex === 0 ? 0.5 : 1,
                }}
              >
                <ChevronLeft className="h-3 w-3 mr-1" />
                Voltar
              </Button>
              {!barraProgressoVisivel && (
                <span
                  style={{
                    color: corPaginacao,
                    fontSize: `${Math.min((parseInt(fonteTamanhoPaginacao) || 14) * 0.85, 18)}px`,
                  }}
                >
                  {currentEtapaIndex + 1}/{etapas.length}
                </span>
              )}
              <Button
                type="button"
                size="sm"
                onClick={handleNextEtapa}
                disabled={currentEtapaIndex === etapas.length - 1}
                className="flex-1"
                style={{ 
                  backgroundColor: corPrimaria, 
                  color: buttonTextColor,
                  borderRadius: `${parseInt(borderRadius) / 2}px`,
                  fontSize: `${Math.min((parseInt(fonteTamanhoBotoes) || 16) * 0.75, 14)}px`,
                  opacity: currentEtapaIndex === etapas.length - 1 ? 0.5 : 1,
                }}
              >
                Próximo
                <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          )}
          
          {/* Button for single page */}
          {layoutTipo === "single_page" && hasEtapas && (
            <Button
              type="button"
              className="w-full"
              size="sm"
              style={{ 
                backgroundColor: corPrimaria, 
                color: buttonTextColor,
                borderRadius: `${parseInt(borderRadius) / 2}px`,
                fontSize: `${Math.min((parseInt(fonteTamanhoBotoes) || 16) * 0.75, 14)}px`,
              }}
            >
              Enviar
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
