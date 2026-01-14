import despesasIcon from "@/assets/despesas-icon.png";
import { cn } from "@/lib/utils";

interface DespesasIconProps {
  className?: string;
}

const DespesasIcon = ({ className }: DespesasIconProps) => {
  return (
    <img 
      src={despesasIcon} 
      alt="Despesas" 
      className={cn("h-5 w-5 object-contain", className)}
    />
  );
};

export default DespesasIcon;
