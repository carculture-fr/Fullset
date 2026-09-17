import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { Cover } from "@/components/cover"
import { api, errorMessage, type JournalEntry } from "@/lib/api"
import { euros, formatDate } from "@/lib/format"
import { valueLabel } from "@/lib/i18n"

// Le journal de la collection : ce qui est arrivé aux jeux, du plus récent au plus ancien.

export default function Journal() {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<JournalEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ entries: JournalEntry[] }>("/api/journal").then((r) => setEntries(r.entries), (err) => setError(errorMessage(err)))
  }, [])

  if (error) return <p className="py-16 text-center text-destructive">{error}</p>
  if (!entries) return <p className="py-16 text-center text-muted-foreground">{t("journal.loading")}</p>

  const sold = entries.filter((e) => e.kind === "Vendu")
  const soldCents = sold.reduce((n, e) => n + (e.amount_cents ?? 0), 0)
  const costCents = sold.reduce((n, e) => n + (e.price_cents ?? 0), 0)

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h1 className="text-[29px]">{t("journal.title")}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{t("journal.subtitle")}</p>
      </div>

      {sold.length > 0 && (
        <p className="num rounded-card bg-card p-4 text-[13px]">
          <strong className="font-semibold">{t("journal.sold", { count: sold.length })}</strong> · {t("journal.soldTotal", { amount: euros(soldCents) })} ·{" "}
          <span className={soldCents >= costCents ? "text-primary-text" : "text-destructive"}>{t("journal.result", { amount: euros(soldCents - costCents) })}</span>
        </p>
      )}

      {entries.length === 0 ? (
        <p className="py-14 text-center text-muted-foreground">{t("journal.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li key={e.id}>
              <Link to={`/jeux/${e.game_id}`} className="flex items-center gap-3 rounded-[20px] bg-card p-2.5 transition-colors duration-150 hover:bg-foreground/[.04]">
                <div className="w-[38px] shrink-0">
                  <Cover src={e.cover} title={e.title} platform={e.platform} size="thumb" className="w-full" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px]">{e.title}</div>
                  <div className="truncate text-[12px] text-muted-foreground">
                    {valueLabel("eventKind", e.kind)}
                    {e.person && ` · ${e.person}`}
                    {e.comment && ` · ${e.comment}`}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="num text-[13px] font-semibold">{e.amount_cents === null ? "" : euros(e.amount_cents)}</div>
                  <div className="num text-[11px] text-muted-foreground">{formatDate(e.happened_on)}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
