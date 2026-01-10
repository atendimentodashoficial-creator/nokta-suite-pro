import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface Country {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
}

export const countries: Country[] = [
  { code: "BR", name: "Brasil", dialCode: "55", flag: "🇧🇷" },
  { code: "US", name: "Estados Unidos", dialCode: "1", flag: "🇺🇸" },
  { code: "PT", name: "Portugal", dialCode: "351", flag: "🇵🇹" },
  { code: "ES", name: "Espanha", dialCode: "34", flag: "🇪🇸" },
  { code: "AR", name: "Argentina", dialCode: "54", flag: "🇦🇷" },
  { code: "CL", name: "Chile", dialCode: "56", flag: "🇨🇱" },
  { code: "CO", name: "Colômbia", dialCode: "57", flag: "🇨🇴" },
  { code: "MX", name: "México", dialCode: "52", flag: "🇲🇽" },
  { code: "PE", name: "Peru", dialCode: "51", flag: "🇵🇪" },
  { code: "UY", name: "Uruguai", dialCode: "598", flag: "🇺🇾" },
  { code: "PY", name: "Paraguai", dialCode: "595", flag: "🇵🇾" },
  { code: "BO", name: "Bolívia", dialCode: "591", flag: "🇧🇴" },
  { code: "EC", name: "Equador", dialCode: "593", flag: "🇪🇨" },
  { code: "VE", name: "Venezuela", dialCode: "58", flag: "🇻🇪" },
  { code: "CR", name: "Costa Rica", dialCode: "506", flag: "🇨🇷" },
  { code: "PA", name: "Panamá", dialCode: "507", flag: "🇵🇦" },
  { code: "DO", name: "República Dominicana", dialCode: "1809", flag: "🇩🇴" },
  { code: "CU", name: "Cuba", dialCode: "53", flag: "🇨🇺" },
  { code: "GT", name: "Guatemala", dialCode: "502", flag: "🇬🇹" },
  { code: "HN", name: "Honduras", dialCode: "504", flag: "🇭🇳" },
  { code: "NI", name: "Nicarágua", dialCode: "505", flag: "🇳🇮" },
  { code: "SV", name: "El Salvador", dialCode: "503", flag: "🇸🇻" },
  { code: "GB", name: "Reino Unido", dialCode: "44", flag: "🇬🇧" },
  { code: "DE", name: "Alemanha", dialCode: "49", flag: "🇩🇪" },
  { code: "FR", name: "França", dialCode: "33", flag: "🇫🇷" },
  { code: "IT", name: "Itália", dialCode: "39", flag: "🇮🇹" },
  { code: "NL", name: "Holanda", dialCode: "31", flag: "🇳🇱" },
  { code: "BE", name: "Bélgica", dialCode: "32", flag: "🇧🇪" },
  { code: "CH", name: "Suíça", dialCode: "41", flag: "🇨🇭" },
  { code: "AT", name: "Áustria", dialCode: "43", flag: "🇦🇹" },
  { code: "PL", name: "Polônia", dialCode: "48", flag: "🇵🇱" },
  { code: "SE", name: "Suécia", dialCode: "46", flag: "🇸🇪" },
  { code: "NO", name: "Noruega", dialCode: "47", flag: "🇳🇴" },
  { code: "DK", name: "Dinamarca", dialCode: "45", flag: "🇩🇰" },
  { code: "FI", name: "Finlândia", dialCode: "358", flag: "🇫🇮" },
  { code: "IE", name: "Irlanda", dialCode: "353", flag: "🇮🇪" },
  { code: "GR", name: "Grécia", dialCode: "30", flag: "🇬🇷" },
  { code: "RU", name: "Rússia", dialCode: "7", flag: "🇷🇺" },
  { code: "UA", name: "Ucrânia", dialCode: "380", flag: "🇺🇦" },
  { code: "TR", name: "Turquia", dialCode: "90", flag: "🇹🇷" },
  { code: "IL", name: "Israel", dialCode: "972", flag: "🇮🇱" },
  { code: "AE", name: "Emirados Árabes", dialCode: "971", flag: "🇦🇪" },
  { code: "SA", name: "Arábia Saudita", dialCode: "966", flag: "🇸🇦" },
  { code: "IN", name: "Índia", dialCode: "91", flag: "🇮🇳" },
  { code: "CN", name: "China", dialCode: "86", flag: "🇨🇳" },
  { code: "JP", name: "Japão", dialCode: "81", flag: "🇯🇵" },
  { code: "KR", name: "Coreia do Sul", dialCode: "82", flag: "🇰🇷" },
  { code: "TH", name: "Tailândia", dialCode: "66", flag: "🇹🇭" },
  { code: "VN", name: "Vietnã", dialCode: "84", flag: "🇻🇳" },
  { code: "ID", name: "Indonésia", dialCode: "62", flag: "🇮🇩" },
  { code: "MY", name: "Malásia", dialCode: "60", flag: "🇲🇾" },
  { code: "SG", name: "Singapura", dialCode: "65", flag: "🇸🇬" },
  { code: "PH", name: "Filipinas", dialCode: "63", flag: "🇵🇭" },
  { code: "AU", name: "Austrália", dialCode: "61", flag: "🇦🇺" },
  { code: "NZ", name: "Nova Zelândia", dialCode: "64", flag: "🇳🇿" },
  { code: "ZA", name: "África do Sul", dialCode: "27", flag: "🇿🇦" },
  { code: "EG", name: "Egito", dialCode: "20", flag: "🇪🇬" },
  { code: "NG", name: "Nigéria", dialCode: "234", flag: "🇳🇬" },
  { code: "KE", name: "Quênia", dialCode: "254", flag: "🇰🇪" },
  { code: "MA", name: "Marrocos", dialCode: "212", flag: "🇲🇦" },
  { code: "CA", name: "Canadá", dialCode: "1", flag: "🇨🇦" },
];

interface CountryCodeSelectProps {
  value: string;
  onChange: (dialCode: string) => void;
  phoneValue?: string;
  onPhoneChange?: (value: string) => void;
  onPhoneBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export function CountryCodeSelect({ 
  value, 
  onChange, 
  phoneValue = "", 
  onPhoneChange,
  onPhoneBlur,
  placeholder = "11999999999",
  disabled = false
}: CountryCodeSelectProps) {
  const [open, setOpen] = useState(false);
  
  const selectedCountry = countries.find((c) => c.dialCode === value) || countries[0];

  // If no phone handlers provided, just render the selector (legacy mode)
  if (!onPhoneChange) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-[110px] justify-between px-2"
            disabled={disabled}
          >
            <span className="flex items-center gap-1.5 truncate">
              <span className="text-base">{selectedCountry.flag}</span>
              <span className="text-sm">+{selectedCountry.dialCode}</span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[250px] p-0 z-50 bg-popover" align="start">
          <Command>
            <CommandInput placeholder="Buscar país..." />
            <CommandList>
              <CommandEmpty>Nenhum país encontrado.</CommandEmpty>
              <CommandGroup className="max-h-[300px] overflow-y-auto">
                {countries.map((country) => (
                  <CommandItem
                    key={country.code}
                    value={`${country.name} ${country.dialCode}`}
                    onSelect={() => {
                      onChange(country.dialCode);
                      setOpen(false);
                    }}
                    className="cursor-pointer"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === country.dialCode ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="text-base mr-2">{country.flag}</span>
                    <span className="flex-1">{country.name}</span>
                    <span className="text-muted-foreground text-sm">+{country.dialCode}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  }

  // Integrated mode with phone input
  return (
    <div className="flex items-center h-10 border rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 bg-background overflow-hidden">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            className="flex items-center gap-1 h-full px-2.5 bg-muted/40 hover:bg-muted/60 transition-colors shrink-0 border-r"
            disabled={disabled}
          >
            <span className="text-base leading-none">{selectedCountry.flag}</span>
            <span className="text-xs text-muted-foreground font-medium">+{selectedCountry.dialCode}</span>
            <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[250px] p-0 z-50 bg-popover" align="start">
          <Command>
            <CommandInput placeholder="Buscar país..." />
            <CommandList>
              <CommandEmpty>Nenhum país encontrado.</CommandEmpty>
              <CommandGroup className="max-h-[300px] overflow-y-auto">
                {countries.map((country) => (
                  <CommandItem
                    key={country.code}
                    value={`${country.name} ${country.dialCode}`}
                    onSelect={() => {
                      onChange(country.dialCode);
                      setOpen(false);
                    }}
                    className="cursor-pointer"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === country.dialCode ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="text-base mr-2">{country.flag}</span>
                    <span className="flex-1">{country.name}</span>
                    <span className="text-muted-foreground text-sm">+{country.dialCode}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <input
        type="tel"
        name="phone"
        inputMode="tel"
        autoComplete="tel"
        value={phoneValue}
        onChange={(e) => onPhoneChange(e.target.value)}
        onBlur={onPhoneBlur}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 h-full px-3 bg-transparent border-0 outline-none text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}
