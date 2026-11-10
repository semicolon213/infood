import { Badge } from "@/components/ui/badge";
import type { IngredientCardData } from "./view-model";

const expiryStyles = {
  expired: "bg-status-expired text-status-expired-foreground",
  urgent: "border-destructive bg-background text-destructive",
  soon: "bg-status-soon text-status-soon-foreground",
  ok: "bg-muted text-muted-foreground",
};

export function IngredientExpiryBadge({ label, tone }: {
  label: string;
  tone: NonNullable<IngredientCardData["expiry"]>["tone"];
}) {
  return <Badge variant="outline" className={expiryStyles[tone]}>{label}</Badge>;
}
