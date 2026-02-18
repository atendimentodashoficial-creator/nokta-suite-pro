import { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  gradient?: boolean;
  extraInfo?: string;
  extraInfoType?: "positive" | "negative" | "neutral";
}

export const StatsCard = ({ 
  title, 
  value, 
  change, 
  changeType = "neutral", 
  icon: Icon,
  gradient = false,
  extraInfo,
  extraInfoType = "neutral"
}: StatsCardProps) => {
  return (
    <Card className={cn(
      "p-6 shadow-card transition-all hover:shadow-elegant animate-fade-in",
      gradient && "bg-gradient-card"
    )}>
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold text-foreground">{value}</p>
          {change && (
            <p className={cn(
              "text-sm font-medium",
              changeType === "positive" && "text-green-600",
              changeType === "negative" && "text-destructive",
              changeType === "neutral" && "text-muted-foreground"
            )}>
              {change}
            </p>
          )}
          {extraInfo && (
            <p className={cn(
              "text-xs font-medium",
              extraInfoType === "positive" && "text-green-600",
              extraInfoType === "negative" && "text-destructive",
              extraInfoType === "neutral" && "text-muted-foreground"
            )}>
              {extraInfo}
            </p>
          )}
        </div>
        <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-gradient-primary">
          <Icon className="h-6 w-6 text-primary-foreground" />
        </div>
      </div>
    </Card>
  );
};
