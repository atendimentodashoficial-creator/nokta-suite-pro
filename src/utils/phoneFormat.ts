// Country phone format configurations
export interface CountryPhoneFormat {
  dialCode: string;
  pattern: RegExp;
  format: (digits: string) => string;
  maxDigits: number; // Max digits AFTER country code
  placeholder: string;
}

export const countryPhoneFormats: Record<string, CountryPhoneFormat> = {
  // Brazil: (XX) XXXXX-XXXX or (XX) XXXX-XXXX
  "55": {
    dialCode: "55",
    pattern: /^(\d{2})(\d{4,5})(\d{4})$/,
    maxDigits: 11,
    placeholder: "(11) 91234-5678",
    format: (digits: string) => {
      if (digits.length <= 2) return `(${digits}`;
      if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
      if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}`;
      const isCell = digits.length === 11;
      if (isCell) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
      }
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
    }
  },
  // USA/Canada: (XXX) XXX-XXXX
  "1": {
    dialCode: "1",
    pattern: /^(\d{3})(\d{3})(\d{4})$/,
    maxDigits: 10,
    placeholder: "(555) 123-4567",
    format: (digits: string) => {
      if (digits.length <= 3) return `(${digits}`;
      if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    }
  },
  // Portugal: XXX XXX XXX
  "351": {
    dialCode: "351",
    pattern: /^(\d{3})(\d{3})(\d{3})$/,
    maxDigits: 9,
    placeholder: "912 345 678",
    format: (digits: string) => {
      if (digits.length <= 3) return digits;
      if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
      return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
    }
  },
  // Spain: XXX XX XX XX
  "34": {
    dialCode: "34",
    pattern: /^(\d{3})(\d{2})(\d{2})(\d{2})$/,
    maxDigits: 9,
    placeholder: "612 34 56 78",
    format: (digits: string) => {
      if (digits.length <= 3) return digits;
      if (digits.length <= 5) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
      if (digits.length <= 7) return `${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5)}`;
      return `${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
    }
  },
  // Argentina: XX XXXX-XXXX
  "54": {
    dialCode: "54",
    pattern: /^(\d{2})(\d{4})(\d{4})$/,
    maxDigits: 10,
    placeholder: "11 1234-5678",
    format: (digits: string) => {
      if (digits.length <= 2) return digits;
      if (digits.length <= 6) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
      return `${digits.slice(0, 2)} ${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
    }
  },
  // Mexico: XX XXXX XXXX
  "52": {
    dialCode: "52",
    pattern: /^(\d{2})(\d{4})(\d{4})$/,
    maxDigits: 10,
    placeholder: "55 1234 5678",
    format: (digits: string) => {
      if (digits.length <= 2) return digits;
      if (digits.length <= 6) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
      return `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6, 10)}`;
    }
  },
  // UK: XXXX XXX XXXX
  "44": {
    dialCode: "44",
    pattern: /^(\d{4})(\d{3})(\d{4})$/,
    maxDigits: 11,
    placeholder: "7911 123 4567",
    format: (digits: string) => {
      if (digits.length <= 4) return digits;
      if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
      return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 11)}`;
    }
  },
  // Germany: XXX XXXXXXXX
  "49": {
    dialCode: "49",
    pattern: /^(\d{3})(\d+)$/,
    maxDigits: 11,
    placeholder: "151 12345678",
    format: (digits: string) => {
      if (digits.length <= 3) return digits;
      return `${digits.slice(0, 3)} ${digits.slice(3, 11)}`;
    }
  },
  // France: X XX XX XX XX
  "33": {
    dialCode: "33",
    pattern: /^(\d{1})(\d{2})(\d{2})(\d{2})(\d{2})$/,
    maxDigits: 9,
    placeholder: "6 12 34 56 78",
    format: (digits: string) => {
      if (digits.length <= 1) return digits;
      if (digits.length <= 3) return `${digits.slice(0, 1)} ${digits.slice(1)}`;
      if (digits.length <= 5) return `${digits.slice(0, 1)} ${digits.slice(1, 3)} ${digits.slice(3)}`;
      if (digits.length <= 7) return `${digits.slice(0, 1)} ${digits.slice(1, 3)} ${digits.slice(3, 5)} ${digits.slice(5)}`;
      return `${digits.slice(0, 1)} ${digits.slice(1, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
    }
  },
  // Italy: XXX XXX XXXX
  "39": {
    dialCode: "39",
    pattern: /^(\d{3})(\d{3})(\d{4})$/,
    maxDigits: 10,
    placeholder: "312 345 6789",
    format: (digits: string) => {
      if (digits.length <= 3) return digits;
      if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
      return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`;
    }
  },
};

// Default format for countries without specific formatting
const defaultFormat: CountryPhoneFormat = {
  dialCode: "",
  pattern: /^(\d+)$/,
  maxDigits: 15,
  placeholder: "123456789",
  format: (digits: string) => digits
};

// Get format for a country by dial code
export const getCountryFormat = (dialCode: string): CountryPhoneFormat => {
  return countryPhoneFormats[dialCode] || defaultFormat;
};

// Format phone number based on country code
export const formatPhoneByCountry = (value: string, dialCode: string): string => {
  const numbers = value.replace(/\D/g, '');
  const format = getCountryFormat(dialCode);
  
  if (numbers.length === 0) return '';
  
  // Limit to max digits for the country
  const limitedDigits = numbers.slice(0, format.maxDigits);
  
  return format.format(limitedDigits);
};

// Get placeholder for a country
export const getPhonePlaceholder = (dialCode: string): string => {
  const format = getCountryFormat(dialCode);
  return format.placeholder;
};

// Get max digits for a country (excluding country code)
export const getMaxPhoneDigits = (dialCode: string): number => {
  const format = getCountryFormat(dialCode);
  return format.maxDigits;
};

// Remove o código do país do início do telefone (para uso com CountryCodeSelect)
export const stripCountryCode = (phone: string, countryCode: string): string => {
  const digits = phone.replace(/\D/g, '');
  // Se começar com o código do país, remover
  if (digits.startsWith(countryCode)) {
    return digits.slice(countryCode.length);
  }
  return digits;
};

// Legacy function - formats assuming Brazilian number (for backwards compatibility)
export const formatPhone = (value: string): string => {
  // Remove tudo que não é número
  const numbers = value.replace(/\D/g, '');
  
  // Se não tiver números, retornar o prefixo padrão
  if (numbers.length === 0) {
    return '+55 ';
  }
  
  // Se começar com 55, formatar com +55
  if (numbers.startsWith('55')) {
    const ddd = numbers.slice(2, 4);
    const resto = numbers.slice(4);
    
    // Digitação parcial do prefixo +55 / DDD
    if (numbers.length === 2) {
      return `+55 `;
    }

    // 55 + 1 dígito do DDD
    if (numbers.length === 3) {
      return `+55 (${numbers.slice(2)}`;
    }

    // 55 + DDD completo
    if (numbers.length === 4) {
      return `+55 (${ddd}) `;
    }
    
    // DDD completo, resto parcial
    if (numbers.length < 12) {
      if (resto.length <= 4) {
        return `+55 (${ddd}) ${resto}`;
      }
      if (resto.length <= 5) {
        return `+55 (${ddd}) ${resto.slice(0, 5)}`;
      }
      return `+55 (${ddd}) ${resto.slice(0, 5)}-${resto.slice(5)}`;
    }
    
    // Fixo: 12 dígitos (55 + DDD + 8)
    if (numbers.length === 12) {
      return `+55 (${ddd}) ${resto.slice(0, 4)}-${resto.slice(4, 8)}`;
    }
    
    // Celular: 13 dígitos (55 + DDD + 9 + 8)
    if (numbers.length >= 13) {
      return `+55 (${ddd}) ${resto.slice(0, 5)}-${resto.slice(5, 9)}`;
    }
  }
  
  // Formato sem código do país - adicionar +55 automaticamente
  if (!numbers.startsWith('55')) {
    const ddd = numbers.slice(0, 2);
    const resto = numbers.slice(2);
    
    // Só DDD parcial
    if (numbers.length === 1) {
      return `+55 (${numbers}`;
    }
    if (numbers.length === 2) {
      return `+55 (${ddd}) `;
    }
    
    // DDD completo, resto parcial
    if (numbers.length < 10) {
      if (resto.length <= 4) {
        return `+55 (${ddd}) ${resto}`;
      }
      if (resto.length <= 5) {
        return `+55 (${ddd}) ${resto.slice(0, 5)}`;
      }
      return `+55 (${ddd}) ${resto.slice(0, 5)}-${resto.slice(5)}`;
    }
    
    // Fixo: 10 dígitos (DDD + 8)
    if (numbers.length === 10) {
      return `+55 (${ddd}) ${resto.slice(0, 4)}-${resto.slice(4, 8)}`;
    }
    
    // Celular: 11 dígitos (DDD + 9 + 8)
    if (numbers.length >= 11) {
      return `+55 (${ddd}) ${resto.slice(0, 5)}-${resto.slice(5, 9)}`;
    }
  }
  
  // Fallback
  return value;
};

export const normalizePhone = (phone: string): string => {
  // Remove tudo que não é número
  return phone.replace(/\D/g, '');
};

// Remove duplicação de código de país (ex: 555534... -> 5534...)
export const removeDuplicateCountryCode = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  
  // Detectar padrões de duplicação comuns
  // Brasil: 5555... -> 55...
  if (digits.startsWith('5555') && digits.length >= 15) {
    return digits.slice(2); // Remove os primeiros 2 dígitos (o "55" duplicado)
  }
  
  // USA/Canada: 11... -> 1...
  if (digits.startsWith('11') && digits.length >= 12) {
    return digits.slice(1);
  }
  
  // Portugal: 351351... -> 351...
  if (digits.startsWith('351351') && digits.length >= 15) {
    return digits.slice(3);
  }
  
  return digits;
};

// Lista de códigos de país ordenados por tamanho (maiores primeiro para evitar match parcial)
const countryCodes = [
  "351", "33", "39", "44", "49", // 3 dígitos ou 2 dígitos
  "55", "54", "52", "34", "1"   // 2 dígitos ou 1 dígito
];

// Extrai o código do país e retorna o número sem ele
// Retorna { countryCode, phoneWithoutCountry }
export const extractCountryCode = (phone: string): { countryCode: string; phoneWithoutCountry: string } => {
  const digits = phone.replace(/\D/g, '');
  
  if (!digits) {
    return { countryCode: "55", phoneWithoutCountry: "" };
  }
  
  // Tentar detectar o código do país
  for (const code of countryCodes) {
    if (digits.startsWith(code)) {
      const phoneWithoutCountry = digits.slice(code.length);
      // Verificar se o número restante parece válido (pelo menos 8 dígitos)
      if (phoneWithoutCountry.length >= 8) {
        return { countryCode: code, phoneWithoutCountry };
      }
    }
  }
  
  // Se não encontrou código de país, assumir que é brasileiro e o número já está sem código
  return { countryCode: "55", phoneWithoutCountry: digits };
};

// Extrai os últimos 8 dígitos do telefone para comparação
export const getLast8Digits = (phone: string): string => {
  const numbers = phone.replace(/\D/g, '');
  return numbers.slice(-8);
};

export const formatPhoneDisplay = (phone: string): string => {
  // Remove tudo que não é número e corrige duplicação de código de país
  const numbers = removeDuplicateCountryCode(phone);
  
  // Se tiver 12 dígitos: 55 + DDD(2) + número(8) - telefone fixo
  if (numbers.length === 12) {
    const ddd = numbers.slice(2, 4);
    const numero = numbers.slice(4);
    return `+55 (${ddd}) ${numero.slice(0, 4)}-${numero.slice(4)}`;
  }
  
  // Se tiver 13 dígitos: 55 + DDD(2) + número(9) - celular
  if (numbers.length === 13) {
    const ddd = numbers.slice(2, 4);
    const numero = numbers.slice(4);
    return `+55 (${ddd}) ${numero.slice(0, 5)}-${numero.slice(5)}`;
  }
  
  // Se tiver 11 dígitos: DDD(2) + número(9) - celular
  if (numbers.length === 11) {
    const ddd = numbers.slice(0, 2);
    const numero = numbers.slice(2);
    return `+55 (${ddd}) ${numero.slice(0, 5)}-${numero.slice(5)}`;
  }
  
  // Se tiver 10 dígitos: DDD(2) + número(8) - telefone fixo
  if (numbers.length === 10) {
    const ddd = numbers.slice(0, 2);
    const numero = numbers.slice(2);
    return `+55 (${ddd}) ${numero.slice(0, 4)}-${numero.slice(4)}`;
  }
  
  // Fallback para outros casos
  return phone;
};
