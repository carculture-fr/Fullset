import { useState, type FormEvent } from "react"

import { ErrorNote, inputClass } from "@/components/fields"
import { errorMessage, send, type Valuation } from "@/lib/api"
import { euros, frDate, todayIso } from "@/lib/format"

/**
 * Valeur estimée d'un exemplaire ou d'un élément de matériel : la dernière estimation,
 * l'écart au prix payé, et l'historique daté (la plus récente fait foi).
 */
export function ValueBlock({
  valuations,
  priceCents,
  postUrl,
  deleteBase,
  onChanged,
}: {
  valuations: Valuation[]
  priceCents: number | null
  postUrl: string
  deleteBase: string
  onChanged: () => Promise<void> | void
}) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(todayIso)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latest = valuations[0]
  const delta = latest && priceCents !== null ? latest.amount_cents - priceCents : null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await send("POST", postUrl, { amount, valued_on: date, note })
      setAmount("")
      setNote("")
      await onChanged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (valuationId: number) => {
    if (!window.confirm("Supprimer cette estimation ?")) return
    await send("DELETE", `${deleteBase}/${valuationId}`)
    await onChanged()
  }

  return (
    <div className="mt-3 rounded-md bg-muted px-3 py-2.5 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <span className="text-muted-foreground">Valeur estimée </span>
          {latest ? (
            <>
              <span className="font-medium">{euros(latest.amount_cents)}</span>
              <span className="text-xs text-muted-foreground"> le {frDate(latest.valued_on)}</span>
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="shrink-0 text-primary hover:underline">
          {open ? "Fermer" : "Estimer"}
        </button>
      </div>
      {delta !== null && (
        <div className="text-xs text-muted-foreground">
          {delta >= 0 ? "+" : "−"}
          {euros(Math.abs(delta))} par rapport au prix payé
        </div>
      )}
      {open && (
        <form onSubmit={submit} className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} inputMode="decimal" placeholder="Montant (€)" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Montant estimé" />
            <input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date de l'estimation" />
          </div>
          <input className={inputClass} placeholder="Source ou remarque (facultatif)" value={note} onChange={(e) => setNote(e.target.value)} />
          <ErrorNote message={error} />
          <button disabled={busy || !amount.trim()} className="w-full rounded-lg bg-primary py-2 font-medium text-primary-foreground disabled:opacity-50">
            Enregistrer l'estimation
          </button>
          {valuations.length > 0 && (
            <ul className="divide-y divide-border pt-1">
              {valuations.map((v) => (
                <li key={v.id} className="flex items-baseline justify-between gap-2 py-1.5">
                  <span>
                    {frDate(v.valued_on)} · <span className="font-medium">{euros(v.amount_cents)}</span>
                    {v.note && <span className="text-muted-foreground"> · {v.note}</span>}
                  </span>
                  <button type="button" onClick={() => remove(v.id)} aria-label="Supprimer l'estimation" className="px-1 text-muted-foreground hover:text-destructive">
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
      )}
    </div>
  )
}
