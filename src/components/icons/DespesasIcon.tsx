import despesasIcon from "@/assets/despesas-icon.png";
import { cn } from "@/lib/utils";

interface DespesasIconProps {
  className?: string;
  inverted?: boolean;
}

const DespesasIcon = ({ className, inverted = true }: DespesasIconProps) => {
  return (
    <img 
      src={despesasIcon} 
      alt="Despesas" 
      className={cn(
        "h-5 w-5 object-contain",
        inverted && "brightness-0 invert",
        className
      )}
    />
  );
};

export default DespesasIcon;
