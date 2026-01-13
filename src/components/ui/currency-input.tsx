import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  showPrefix?: boolean;
}

const formatCurrencyInput = (value: string): string => {
  // Remove tudo que não é número
  const numericOnly = value.replace(/\D/g, '');
  
  if (!numericOnly) return '';
  
  // Converte para número e divide por 100 para ter os centavos
  const numericValue = parseInt(numericOnly, 10) / 100;
  
  // Formata com duas casas decimais
  return numericValue.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
      const formatted = formatCurrencyInput(e.target.value);
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
