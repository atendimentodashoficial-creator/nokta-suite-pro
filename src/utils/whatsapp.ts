// Normalize phone number (remove all non-digit characters)
export function normalizePhoneNumber(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

// Get last 8 digits of a phone number for matching
export function getLast8Digits(phone: string): string {
  const normalized = normalizePhoneNumber(phone);
  return normalized.slice(-8);
}

// Format phone number for display: +55 (DD) 9XXXX-XXXX or +55 (DD) XXXX-XXXX
// Always normalizes to include the 9th digit for mobile numbers
export function formatPhoneNumber(phone: string): string {
  const raw = normalizePhoneNumber(phone);

  // Se tem 13 dígitos: 55 + DDD(2) + número(9)
  if (raw.length === 13 && raw.startsWith('55')) {
    const ddd = raw.slice(2, 4);
    const numero = raw.slice(4);
    return `+55 (${ddd}) ${numero.slice(0, 5)}-${numero.slice(5)}`;
  }

  // Se tem 12 dígitos: 55 + DDD(2) + número(8) - adiciona o 9 para celular
  if (raw.length === 12 && raw.startsWith('55')) {
    const ddd = raw.slice(2, 4);
    const numero = raw.slice(4);
    // Adiciona o 9 na frente para celular
    return `+55 (${ddd}) 9${numero.slice(0, 4)}-${numero.slice(4)}`;
  }
  
  // Se tem 11 dígitos: DDD(2) + número(9) - celular
  if (raw.length === 11) {
    const ddd = raw.slice(0, 2);
    const numero = raw.slice(2);
    return `+55 (${ddd}) ${numero.slice(0, 5)}-${numero.slice(5)}`;
  }
  
  // Se tem 10 dígitos: DDD(2) + número(8) - adiciona o 9 para celular
  if (raw.length === 10) {
    const ddd = raw.slice(0, 2);
    const numero = raw.slice(2);
    // Adiciona o 9 na frente para celular
    return `+55 (${ddd}) 9${numero.slice(0, 4)}-${numero.slice(4)}`;
  }

  // Fallback: tenta formatar o que tiver
  if (raw.length >= 8) {
    const last8 = raw.slice(-8);
    const ddd = raw.length >= 10 ? raw.slice(-10, -8) : '00';
    return `+55 (${ddd}) 9${last8.slice(0, 4)}-${last8.slice(4)}`;
  }

  return phone;
}

// Format timestamp for chat cards - WhatsApp style
// Same day: show time (HH:mm)
// Same week: show weekday (Segunda, Terça, etc.)
// Older: show date (dd/mm/yyyy)
export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const messageDate = typeof date === 'string' ? new Date(date) : date;
  
  // Check if same day
  const isToday = now.toDateString() === messageDate.toDateString();
  if (isToday) {
    return messageDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  
  // Check if yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = yesterday.toDateString() === messageDate.toDateString();
  if (isYesterday) {
    return 'Ontem';
  }
  
  // Check if same week (within last 7 days)
  const diffDays = Math.floor((now.getTime() - messageDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) {
    const weekdays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    return weekdays[messageDate.getDay()];
  }
  
  // Older than a week: show date
  return messageDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Format WhatsApp text with markdown-like formatting
export function formatWhatsAppText(text: string): string {
  let formatted = text;
  
  // Bold: *texto*
  formatted = formatted.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
  
  // Italic: _texto_
  formatted = formatted.replace(/_([^_]+)_/g, '<em>$1</em>');
  
  // Strikethrough: ~texto~
  formatted = formatted.replace(/~([^~]+)~/g, '<del>$1</del>');
  
  // Code block: ```texto```
  formatted = formatted.replace(/```([^`]+)```/gs, '<pre><code>$1</code></pre>');
  
  // Inline code: `texto`
  formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  
  // Line breaks
  formatted = formatted.replace(/\n/g, '<br/>');
  
  return formatted;
}

// Format last message preview for chat cards
// Detects media types and returns appropriate label
export function formatLastMessagePreview(lastMessage: string | null | undefined): string {
  if (!lastMessage || lastMessage.trim() === '') {
    return 'Sem mensagens';
  }

  const msg = lastMessage.trim().toLowerCase();
  
  // Check for media placeholders
  if (msg === '[audio]' || msg === '[áudio]' || msg.startsWith('🎵') || msg.includes('ptt') || msg.includes('audio') || msg.includes('áudio')) {
    return '🎵 Áudio';
  }
  
  if (msg === '[image]' || msg === '[imagem]' || msg.startsWith('📷') || msg.includes('image')) {
    return '📷 Imagem';
  }
  
  if (msg === '[video]' || msg === '[vídeo]' || msg.startsWith('🎥') || msg.includes('video')) {
    return '🎥 Vídeo';
  }
  
  if (msg === '[document]' || msg === '[documento]' || msg.startsWith('📄') || msg.includes('document')) {
    return '📄 Documento';
  }
  
  if (msg === '[sticker]' || msg === '[figurinha]' || msg.startsWith('🏷️')) {
    return '🏷️ Figurinha';
  }

  // Return original message if not a media placeholder
  return lastMessage;
}

// Truncate text for preview
export function truncateText(text: string, maxLength: number = 50): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

// Get initials from name
export function getInitials(name: string): string {
  const words = name.trim().split(' ').filter(w => w.length > 0);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
