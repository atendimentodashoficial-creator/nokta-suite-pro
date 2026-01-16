import { Check, CheckCheck, Image, Video, FileAudio, File, Megaphone } from "lucide-react";
import { formatWhatsAppText } from "@/utils/whatsapp";
import { format } from "date-fns";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface MessageBubbleProps {
  message: {
    message_id: string;
    content: string;
    sender_type: 'customer' | 'agent';
    media_type?: string;
    media_url?: string | null;
    timestamp: string;
    status?: string | null;
    deleted?: boolean;
    // Campaign attribution fields
    utm_source?: string | null;
    utm_campaign?: string | null;
    utm_medium?: string | null;
    utm_content?: string | null;
    utm_term?: string | null;
    fbclid?: string | null;
    ad_thumbnail_url?: string | null;
    // Real Facebook campaign names
    fb_ad_id?: string | null;
    fb_campaign_name?: string | null;
    fb_adset_name?: string | null;
    fb_ad_name?: string | null;
    // Quoted message fields
    quoted_message_id?: string | null;
    quoted_content?: string | null;
    quoted_sender_type?: string | null;
  };
  // Fallback attribution (ex.: do lead do contato) para quando a mensagem vem da API sem campos UTM
  fallbackAttribution?: {
    utm_source?: string | null;
    utm_campaign?: string | null;
    utm_medium?: string | null;
    utm_content?: string | null;
    utm_term?: string | null;
    fbclid?: string | null;
    ad_thumbnail_url?: string | null;
    fb_ad_id?: string | null;
    fb_campaign_name?: string | null;
    fb_adset_name?: string | null;
    fb_ad_name?: string | null;
  };
  // Optional instanciaId for Disparos chats (uses disparos_instancias instead of uazapi_config)
  instanciaId?: string | null;
}

// Helper function to detect if content is media metadata that should be hidden
const isMediaMetadata = (content: string, isMediaMessage: boolean): boolean => {
  if (!isMediaMessage) return false;
  if (!content) return false;

  const trimmed = content.trim();

  // Check for placeholder text like [audio], [image], [video], [document]
  if (/^\[(audio|image|video|document|imagem|áudio|vídeo|documento)\]$/i.test(trimmed)) {
    return true;
  }

  // Common emoji placeholders used by the webhook for media-only messages
  if (
    /^(🎵\s*áudio|📷\s*imagem|🎥\s*vídeo|📄\s*documento|🏷️\s*figurinha|📍\s*localização|👤\s*contato)$/i.test(
      trimmed
    )
  ) {
    return true;
  }

  // Check if content looks like JSON metadata (starts with { and contains typical metadata keys)
  if (
    trimmed.startsWith('{') &&
    (trimmed.includes('"JPEGThumbnail"') ||
      trimmed.includes('"URL"') ||
      trimmed.includes('"mediaKey"') ||
      trimmed.includes('"mimetype"') ||
      trimmed.includes('"fileSHA256"') ||
      trimmed.includes('"fileLength"'))
  ) {
    return true;
  }

  return false;
};

export const MessageBubble = ({ message, fallbackAttribution, instanciaId }: MessageBubbleProps) => {
  const isAgent = message.sender_type === 'agent';
  const isMedia = message.media_type && message.media_type !== 'text';
  const isDeleted = message.deleted || false;
  const hasQuotedMessage = Boolean(message.quoted_content);
  const [mediaData, setMediaData] = useState<{ fileURL: string; mimetype: string } | null>(null);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [mediaRequested, setMediaRequested] = useState(false);

  // Merge attribution without letting null/undefined fields from the message overwrite the fallback
  const mergeAttribution = (base: any, incoming: any) => {
    const merged = { ...incoming };
    const keys = [
      'utm_source',
      'utm_campaign',
      'utm_medium',
      'utm_content',
      'utm_term',
      'fbclid',
      'ad_thumbnail_url',
      'fb_ad_id',
      'fb_campaign_name',
      'fb_adset_name',
      'fb_ad_name',
    ];

    for (const k of keys) {
      if (merged[k] == null && base?.[k] != null) merged[k] = base[k];
    }

    return merged;
  };

  const merged = mergeAttribution(fallbackAttribution, message);

  // Check if this message has campaign attribution
  const hasAttribution = Boolean(
    merged.utm_source || merged.utm_campaign || merged.fbclid || merged.fb_campaign_name || merged.fb_ad_id
  );

  // Render quoted message block
  const renderQuotedMessage = () => {
    if (!hasQuotedMessage || isDeleted) return null;
    
    const isQuotedFromAgent = message.quoted_sender_type === 'agent';
    const quotedContent = message.quoted_content || '';
    
    // Truncate long quoted messages
    const maxLength = 150;
    const displayContent = quotedContent.length > maxLength 
      ? quotedContent.substring(0, maxLength) + '...' 
      : quotedContent;
    
    return (
      <div 
        className={`border-l-4 pl-2 py-1 mb-2 rounded-r text-xs ${
          isQuotedFromAgent 
            ? 'border-primary bg-primary/10 text-primary-foreground/80' 
            : 'border-muted-foreground/50 bg-muted-foreground/10'
        }`}
      >
        <div className={`font-medium text-[10px] mb-0.5 ${isQuotedFromAgent ? 'text-primary' : 'text-muted-foreground'}`}>
          {isQuotedFromAgent ? 'Você' : 'Cliente'}
        </div>
        <div className="text-muted-foreground line-clamp-2 whitespace-pre-wrap break-words">
          {displayContent}
        </div>
      </div>
    );
  };

  const loadMedia = async () => {
    setMediaRequested(true);
    setIsLoadingMedia(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        console.error("Session expired when loading media");
        setIsLoadingMedia(false);
        return;
      }

      const response = await supabase.functions.invoke("uazapi-download-media", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: {
          messageId: message.message_id,
          instanciaId,
          mediaType: message.media_type,
        },
      });

      if (response.error) throw response.error;
      if (!response.data?.fileURL || !response.data?.mimetype) {
        throw new Error("Resposta de mídia inválida");
      }

      setMediaData(response.data);
    } catch (error) {
      console.error("Error loading media:", error);
      setMediaData(null);
    } finally {
      setIsLoadingMedia(false);
    }
  };

  const getMediaIcon = () => {
    const type = message.media_type?.toLowerCase() || '';
    if (type === 'image' || type.startsWith('image')) {
      return <Image className="w-6 h-6" />;
    }
    if (type === 'video' || type.startsWith('video')) {
      return <Video className="w-6 h-6" />;
    }
    if (type === 'audio' || type === 'ptt' || type.startsWith('audio')) {
      return <FileAudio className="w-6 h-6" />;
    }
    return <File className="w-6 h-6" />;
  };

  const getMediaLabel = () => {
    const type = message.media_type?.toLowerCase() || '';
    if (type === 'image' || type.startsWith('image')) return 'Imagem';
    if (type === 'video' || type.startsWith('video')) return 'Vídeo';
    if (type === 'audio' || type === 'ptt' || type.startsWith('audio')) return 'Áudio';
    return 'Arquivo';
  };

  const renderMediaPlaceholder = () => {
    return (
      <Button
        variant="ghost"
        className="flex items-center gap-2 p-3 h-auto w-full max-w-full justify-start bg-black/10 hover:bg-black/20 rounded mb-2 overflow-hidden"
        onClick={loadMedia}
      >
        <span className="flex-shrink-0">{getMediaIcon()}</span>
        <span className="text-sm truncate">Clique para carregar {getMediaLabel().toLowerCase()}</span>
      </Button>
    );
  };

  const renderMedia = () => {
    // Show placeholder if media not requested yet
    if (!mediaRequested) {
      return renderMediaPlaceholder();
    }

    if (isLoadingMedia) {
      return (
        <div className="flex items-center gap-2 p-3 bg-black/10 rounded mb-2 overflow-hidden max-w-full">
          <span className="flex-shrink-0">{getMediaIcon()}</span>
          <span className="text-xs opacity-70 truncate">Carregando {getMediaLabel().toLowerCase()}...</span>
        </div>
      );
    }

    if (!mediaData) {
      return (
        <Button
          variant="ghost"
          className="flex items-center gap-2 p-3 h-auto w-full max-w-full justify-start bg-black/10 hover:bg-black/20 rounded mb-2 overflow-hidden"
          onClick={loadMedia}
        >
          <span className="flex-shrink-0">{getMediaIcon()}</span>
          <span className="text-xs opacity-70 truncate">Falha ao carregar. Toque para tentar novamente</span>
        </Button>
      );
    }

    const { fileURL, mimetype } = mediaData;

    // Render based on mimetype
    if (mimetype.startsWith('image/')) {
      return (
        <div className="mb-2">
          <img
            src={fileURL}
            alt="Image"
            className="max-w-full rounded"
          />
        </div>
      );
    }

    if (mimetype.startsWith('video/')) {
      return (
        <div className="mb-2">
          <video controls className="max-w-full rounded">
            <source src={fileURL} type={mimetype} />
          </video>
        </div>
      );
    }

    if (mimetype.startsWith('audio/')) {
      return (
        <div className="mb-2">
          <audio controls className="max-w-full">
            <source src={fileURL} type={mimetype} />
          </audio>
        </div>
      );
    }

    // For other types, show download link
    return (
      <div className="mb-2">
        <a
          href={fileURL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-sm"
        >
          Download arquivo ({mimetype})
        </a>
      </div>
    );
  };

  // Check if detected by AI
  const isDetectedByAI = merged.utm_campaign === "Detectado por I.A" || merged.utm_campaign === "Detectado por IA";

  // Get source info for badge
  const getSourceInfo = () => {
    if (isDetectedByAI) {
      return { label: 'Anúncios (I.A)', color: 'bg-purple-500', textColor: 'text-purple-700', bgLight: 'bg-purple-100' };
    }
    if (merged.utm_source === 'facebook' || merged.fbclid) {
      return { label: 'Meta Ads', color: 'bg-blue-500', textColor: 'text-blue-700', bgLight: 'bg-blue-100' };
    }
    if (merged.utm_source) {
      return { label: merged.utm_source, color: 'bg-purple-500', textColor: 'text-purple-700', bgLight: 'bg-purple-100' };
    }
    return { label: 'Campanha', color: 'bg-gray-500', textColor: 'text-gray-700', bgLight: 'bg-gray-100' };
  };

  const renderCampaignBadge = () => {
    if (!hasAttribution || isDeleted) return null;

    const sourceInfo = getSourceInfo();

    return (
      <Dialog>
        <DialogTrigger asChild>
          <button 
            className={`inline-flex items-center gap-1 text-xs ${sourceInfo.bgLight} ${sourceInfo.textColor} px-2 py-0.5 rounded-full mb-2 hover:opacity-80 transition-colors cursor-pointer`}
            onClick={(e) => e.stopPropagation()}
          >
            <Megaphone className="w-3 h-3" />
            <span>Via {sourceInfo.label}</span>
          </button>
        </DialogTrigger>

        <DialogContent className="w-[calc(100vw-24px)] sm:max-w-md p-0">
          <div className="flex flex-col max-h-[80vh] min-h-0">
            <DialogHeader className="p-4 pb-3 border-b">
              <DialogTitle className="flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-blue-500" />
                Origem do Anúncio
              </DialogTitle>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                {/* Ad thumbnail preview */}
                {merged.ad_thumbnail_url && (
                  <div className="rounded-lg overflow-hidden border">
                    <img 
                      src={merged.ad_thumbnail_url} 
                      alt="Preview do anúncio" 
                      className="w-full h-auto max-h-48 object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}

                {/* Source badge */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Fonte:</span>
                  <Badge variant="secondary" className={`text-white ${sourceInfo.color}`}>
                    {sourceInfo.label}
                  </Badge>
                </div>

                {/* Real Campaign Name from Facebook API */}
                {merged.fb_campaign_name && (
                  <div className="space-y-1">
                    <span className="text-sm text-muted-foreground">Campanha (Gerenciador):</span>
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                      <span className="text-sm font-semibold text-green-800">{merged.fb_campaign_name}</span>
                    </div>
                  </div>
                )}

                {/* Adset Name from Facebook API */}
                {merged.fb_adset_name && (
                  <div className="space-y-1">
                    <span className="text-sm text-muted-foreground">Conjunto de Anúncios:</span>
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <span className="text-sm font-medium text-blue-800">{merged.fb_adset_name}</span>
                    </div>
                  </div>
                )}

                {/* Ad Name from Facebook API */}
                {merged.fb_ad_name && (
                  <div className="space-y-1">
                    <span className="text-sm text-muted-foreground">Nome do Anúncio:</span>
                    <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                      <span className="text-sm font-medium text-purple-800">{merged.fb_ad_name}</span>
                    </div>
                  </div>
                )}

                {/* Fallback: CTA/Title from webhook (if no real campaign name) */}
                {!merged.fb_campaign_name && merged.utm_campaign && (
                  <div className="space-y-1">
                    <span className="text-sm text-muted-foreground">Título do Anúncio (CTA):</span>
                    <div className="p-3 bg-muted rounded-lg">
                      <span className="text-sm font-medium">{merged.utm_campaign}</span>
                    </div>
                  </div>
                )}

                {/* Ad body text */}
                {merged.utm_term && (
                  <div className="space-y-1">
                    <span className="text-sm text-muted-foreground">Texto do Anúncio:</span>
                    <div className="p-3 bg-muted rounded-lg max-h-40 overflow-y-auto">
                      <span className="text-sm whitespace-pre-wrap">{merged.utm_term}</span>
                    </div>
                  </div>
                )}

                {/* Technical IDs */}
                {(merged.utm_content || merged.fbclid || merged.fb_ad_id) && (
                  <div className="pt-3 border-t space-y-2">
                    <span className="text-xs text-muted-foreground">Dados Técnicos:</span>
                    {merged.fb_ad_id && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">ID do Anúncio:</span>
                        <span className="font-mono truncate max-w-[180px]" title={merged.fb_ad_id}>
                          {merged.fb_ad_id}
                        </span>
                      </div>
                    )}
                    {!merged.fb_ad_id && merged.utm_content && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Source ID:</span>
                        <span className="font-mono truncate max-w-[180px]" title={merged.utm_content}>
                          {merged.utm_content}
                        </span>
                      </div>
                    )}
                    {merged.fbclid && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">FBCLID:</span>
                        <span className="font-mono truncate max-w-[180px]" title={merged.fbclid}>
                          {merged.fbclid.slice(0, 20)}...
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  // Render the campaign badge above the message bubble for customer messages
  if (!isAgent && hasAttribution && !isDeleted) {
    return (
      <div className="flex flex-col items-start gap-1">
        {/* Campaign badge above the bubble */}
        {renderCampaignBadge()}
        
        {/* Message bubble */}
        <div
          className={`rounded-lg px-4 py-2 ${
            isDeleted
              ? 'bg-red-50 text-red-600'
              : 'bg-muted text-foreground'
          }`}
        >
          {/* Quoted message */}
          {renderQuotedMessage()}

          {/* Media content - hide if deleted */}
          {!isDeleted && isMedia && renderMedia()}

          {/* Text content - hide metadata for media messages */}
          {message.content && !isMediaMetadata(message.content, isMedia) && (
            <div
              className={`text-sm whitespace-pre-wrap break-words ${isDeleted ? 'italic' : ''}`}
              dangerouslySetInnerHTML={{ 
                __html: isDeleted ? 'Mensagem apagada' : formatWhatsAppText(message.content) 
              }}
            />
          )}

          {/* Timestamp and status */}
          <div className="flex items-center gap-1 mt-1 justify-end">
            <span className="text-xs opacity-70">
              {format(new Date(message.timestamp), 'HH:mm')}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Default render for agent messages or messages without attribution
  return (
    <div
      className={`rounded-lg px-4 py-2 ${
        isDeleted
          ? 'bg-red-50 text-red-600'
          : isAgent
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-foreground'
      }`}
    >
      {/* Quoted message */}
      {renderQuotedMessage()}

      {/* Media content - hide if deleted */}
      {!isDeleted && isMedia && renderMedia()}

      {/* Text content - hide metadata for media messages */}
      {message.content && !isMediaMetadata(message.content, isMedia) && (
        <div
          className={`text-sm whitespace-pre-wrap break-words ${isDeleted ? 'italic' : ''}`}
          dangerouslySetInnerHTML={{ 
            __html: isDeleted ? 'Mensagem apagada' : formatWhatsAppText(message.content) 
          }}
        />
      )}

      {/* Timestamp and status */}
      <div className="flex items-center gap-1 mt-1 justify-end">
        <span className="text-xs opacity-70">
          {format(new Date(message.timestamp), 'HH:mm')}
        </span>
        {isAgent && message.status && !isDeleted && (
          <span className="opacity-70">
            {message.status === 'read' && <CheckCheck className="w-3 h-3 text-blue-400" />}
            {message.status === 'delivered' && <CheckCheck className="w-3 h-3" />}
            {message.status === 'sent' && <Check className="w-3 h-3" />}
          </span>
        )}
      </div>
    </div>
  );
};