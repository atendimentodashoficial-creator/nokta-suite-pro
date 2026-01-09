import { Check, CheckCheck, Image, Video, FileAudio, File } from "lucide-react";
import { formatWhatsAppText } from "@/utils/whatsapp";
import { format } from "date-fns";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

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
  };
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
  
  // Check if content looks like JSON metadata (starts with { and contains typical metadata keys)
  if (trimmed.startsWith('{') && (
    trimmed.includes('"JPEGThumbnail"') ||
    trimmed.includes('"URL"') ||
    trimmed.includes('"mediaKey"') ||
    trimmed.includes('"mimetype"') ||
    trimmed.includes('"fileSHA256"') ||
    trimmed.includes('"fileLength"')
  )) {
    return true;
  }
  
  return false;
};

export const MessageBubble = ({ message }: MessageBubbleProps) => {
  const isAgent = message.sender_type === 'agent';
  const isMedia = message.media_type && message.media_type !== 'text';
  const isDeleted = message.deleted || false;
  const [mediaData, setMediaData] = useState<{ fileURL: string; mimetype: string } | null>(null);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [mediaRequested, setMediaRequested] = useState(false);

  const loadMedia = async () => {
    setMediaRequested(true);
    setIsLoadingMedia(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('Session expired when loading media');
        setIsLoadingMedia(false);
        return;
      }

      const response = await supabase.functions.invoke('uazapi-download-media', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: { messageId: message.message_id }
      });

      if (response.error) throw response.error;
      
      setMediaData(response.data);
    } catch (error) {
      console.error('Error loading media:', error);
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
        className="flex items-center gap-2 p-3 h-auto w-full justify-start bg-black/10 hover:bg-black/20 rounded mb-2"
        onClick={loadMedia}
      >
        {getMediaIcon()}
        <span className="text-sm">Clique para carregar {getMediaLabel().toLowerCase()}</span>
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
        <div className="flex items-center gap-2 p-3 bg-black/10 rounded mb-2">
          {getMediaIcon()}
          <span className="text-xs opacity-70">Carregando {getMediaLabel().toLowerCase()}...</span>
        </div>
      );
    }

    if (!mediaData) {
      return (
        <div className="flex items-center gap-2 p-3 bg-black/10 rounded mb-2">
          {getMediaIcon()}
          <span className="text-xs opacity-70">Erro ao carregar mídia</span>
        </div>
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
      {/* Media content - hide if deleted */}
      {!isDeleted && isMedia && message.media_url && renderMedia()}

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
