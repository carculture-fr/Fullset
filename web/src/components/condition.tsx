import { useTranslation } from "react-i18next"

import { valueLabel } from "@/lib/i18n"

const CONDITION_TONE: Record<string, string> = {
  Neuf: "bg-emerald-400",
  "Très bon": "bg-emerald-400",
  Bon: "bg-lime-400",
  Moyen: "bg-amber-400",
  Mauvais: "bg-red-400",
  "Très mauvais": "bg-red-500",
}

/** Un état (jeu, boîte, notice…) : libellé, pastille de couleur, valeur. */
export function Condition({ label, value }: { label: string; value: string | null }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-md bg-muted px-2.5 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-sm">
        <span className={`size-2 shrink-0 rounded-full ${(value && CONDITION_TONE[value]) || "bg-muted-foreground/40"}`} />
        {valueLabel("condition", value) ?? t("condition.none")}
      </div>
    </div>
  )
}
