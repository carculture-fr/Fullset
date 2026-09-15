import { useTranslation } from "react-i18next"

import { valueLabel } from "@/lib/i18n"

/** Couleur d'un état (jeu, boîte, notice, fonctionnement). La couleur n'est jamais seule : le libellé suit toujours. */
export const CONDITION_TONE: Record<string, string> = {
  Neuf: "var(--cond-good)",
  "Très bon": "var(--cond-good)",
  Bon: "var(--cond-ok)",
  Moyen: "var(--cond-fair)",
  Mauvais: "var(--cond-bad)",
  "Très mauvais": "var(--cond-bad)",
  Fonctionnel: "var(--cond-good)",
  "Fonctionne avec défauts": "var(--cond-ok)",
  "À réparer": "var(--cond-fair)",
  "Hors service": "var(--cond-bad)",
}
export const toneOf = (value: string | null | undefined) => (value && CONDITION_TONE[value]) || "var(--cond-none)"

const labelOf = (value: string | null | undefined) => (value ? (CONDITION_TONE[value] && !valueLabel("condition", value) ? valueLabel("hwWorking", value) : valueLabel("condition", value)) : null)

/** Pastille + libellé, en ligne (liste, tags, brocante). */
export function ConditionDot({ value, size = 8 }: { value: string | null | undefined; size?: number }) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 rounded-full" style={{ width: size, height: size, background: toneOf(value) }} />
      <span className="truncate">{labelOf(value) ?? t("condition.none")}</span>
    </span>
  )
}

/** Une case du bloc des trois états (fiche) : label 11 px, valeur 13 px en 600 avec pastille. */
export function Condition({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0 rounded-[16px] bg-muted px-3 py-2.5">
      <div className="truncate text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[13px] font-semibold">
        <ConditionDot value={value} />
      </div>
    </div>
  )
}

/** Le bloc des trois états : trois cases en grille. */
export function ConditionBlock({ items }: { items: Array<{ label: string; value: string | null }> }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((i) => (
        <Condition key={i.label} label={i.label} value={i.value} />
      ))}
    </div>
  )
}
