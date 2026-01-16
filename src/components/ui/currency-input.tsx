import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  showPrefix?: boolean;
}

const formatCurrencyInput = (value: string, previousValue: string = ''): string => {
  // Remove tudo que não é número e vírgula
  let cleaned = value.replace(/[^\d,]/g, '');
  
  if (!cleaned) return '';
  
  // Garante apenas uma vírgula
  const parts = cleaned.split(',');
  if (parts.length > 2) {
    cleaned = parts[0] + ',' + parts.slice(1).join('');
  }
  
  // Limita casas decimais a 2
  if (parts.length === 2 && parts[1].length > 2) {
    cleaned = parts[0] + ',' + parts[1].slice(0, 2);
  }
  
  // Formata a parte inteira com pontos de milhar
  if (parts[0]) {
    const integerPart = parts[0].replace(/\D/g, '');
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    cleaned = formattedInteger + (parts.length > 1 ? ',' + parts[1].replace(/\D/g, '') : '');
  }
  
  return cleaned;
};

const parseCurrencyToNumber = (value: string): number => {
  if (!value) return 0;
  // Remove pontos de milhar e substitui vírgula por ponto
  const normalized = value.replace(/\./g, '').replace(',', '.');
  return parseFloat(normalized) || 0;
};

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, value, onChange, showPrefix = true, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const formatted = formatCurrencyInput(e.target.value, value);
      onChange(formatted);
    };

    return (
      <div className="relative">
        {showPrefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
            R$
          </span>
        )}
        <Input
          ref={ref}
          type="text"
          inputMode="numeric"
          value={value}
          onChange={handleChange}
          className={cn(showPrefix && "pl-9", className)}
          placeholder="0,00"
          {...props}
        />
      </div>
    );
  }
);

CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput, formatCurrencyInput, parseCurrencyToNumber };
