import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

export default function InstagramFormulariosAbandonos() {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">Recurso não disponível</h3>
        <p className="text-muted-foreground">
          O rastreamento de abandonos não está disponível para formulários do Instagram.
          <br />
          Utilize os formulários da aba principal para ter acesso a esse recurso.
        </p>
      </CardContent>
    </Card>
  );
}
