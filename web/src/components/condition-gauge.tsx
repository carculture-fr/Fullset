import { useTranslation } from "react-i18next"

import { valueLabel } from "@/lib/i18n"

import { toneOf } from "./condition"

/** Les cinq crans, du meilleur au pire. « Très mauvais » = aucun cran rempli, libellé affiché ; null = Non défini. */
const STEPS = ["Neuf", "Très bon", "Bon", "Moyen", "Mauvais"] as const
const filledFor = (value: string | null) => {
  const i = STEPS.indexOf(value as (typeof STEPS)[number])
  return i === -1 ? 0 : STEPS.length - i
}

/**
 * Jauge tactile d'un état dans le formulaire d'exemplaire : label · 5 crans · libellé courant.
 * Toucher un cran choisit l'état ; toucher le cran déjà choisi remet « Non défini ».
 * Le libellé, touché, fait défiler « Très mauvais », puis « Absente » pour la notice (`allowAbsent`).
 */
export function ConditionGauge({
  label,
  value,
  onChange,
  allowAbsent = false,
}: {
  label: string
  value: string | null
  onChange: (v: string | null) => void
  allowAbsent?: boolean
}) {
  const { t } = useTranslation()
  const filled = filledFor(value)
  const tone = toneOf(value)
  const extra = allowAbsent ? ["Très mauvais", "Absente"] : ["Très mauvais"]
  const cycle = () => {
    const i = value ? extra.indexOf(value) : -1
    onChange(i === -1 ? extra[0] : (extra[i + 1] ?? null))
  }
  return (
    <div className="grid grid-cols-[52px_1fr_84px] items-center gap-x-2.5 text-[13px]">
      <span className="truncate text-muted-foreground">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex gap-1">
        {STEPS.map((step, i) => {
          const rank = STEPS.length - i
          const selected = value === step
          return (
            <button
              key={step}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={valueLabel("condition", step) ?? step}
              onClick={() => onChange(selected ? null : step)}
              className="flex-1 py-[7px]"
            >
              <span
                className="block h-[30px] rounded-full border border-border transition-colors duration-150"
                style={{ background: rank <= filled ? tone : "var(--background)" }}
              />
            </button>
          )
        })}
      </div>
      <button type="button" onClick={cycle} className={`min-h-[44px] truncate text-left font-semibold ${filled === 0 && value !== "Très mauvais" ? "text-muted-foreground" : ""}`}>
        {valueLabel("condition", value) ?? t("condition.none")}
      </button>
    </div>
  )
}
