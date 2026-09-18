import { LogOut, Trash2 } from "lucide-react"
import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"

import { Chips, ErrorNote, Field, inputClass } from "@/components/fields"
import { ICON } from "@/components/page-bits"
import { errorMessage, send, type CopyEvent } from "@/lib/api"
import { euros, formatDate } from "@/lib/format"
import { valueLabel } from "@/lib/i18n"
import { EVENT_KINDS } from "@domain"

/**
 * La vie d'un exemplaire de jeu ou d'un élément de matériel : ce qui lui est arrivé, et de quoi
 * noter une sortie (vendu, donné, prêté, en panne…). Une sortie le retire de la bibliothèque
 * sans rien effacer ; « Retour » le fait revenir.
 */
export function ItemLife({
  events,
  postUrl,
  deleteBase,
  onChanged,
}: {
  events: CopyEvent[]
  /** Où poster un événement : /api/copies/:id/events ou /api/hardware/:id/events. */
  postUrl: string
  /** Base de suppression : /api/events ou /api/hardware-events. */
  deleteBase: string
  onChanged: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<string | null>(null)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState("")
  const [person, setPerson] = useState("")
  const [comment, setComment] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!kind) return
    setBusy(true)
    setError(null)
    try {
      await send("POST", postUrl, { kind, happened_on: date, amount, person, comment })
      setOpen(false)
      setKind(null)
      setAmount("")
      setPerson("")
      setComment("")
      await onChanged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: number) => {
    if (!window.confirm(t("events.deleteConfirm"))) return
    try {
      await send("DELETE", `${deleteBase}/${id}`)
      await onChanged()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="border-t border-border pt-3">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-[13px] font-semibold text-muted-foreground">{t("events.title")}</h3>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-9 items-center gap-1.5 rounded-full bg-background px-3 text-[12px] font-semibold transition-colors duration-150 hover:bg-foreground/7"
          >
            <LogOut size={14} {...ICON} aria-hidden="true" />
            {t("events.add")}
          </button>
        )}
      </div>

      {events.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-2 text-[12px]">
              <span className="num shrink-0 text-muted-foreground">{formatDate(e.happened_on)}</span>
              <span className="min-w-0 flex-1 break-words">
                <strong className="font-semibold">{valueLabel("eventKind", e.kind)}</strong>
                {e.amount_cents !== null && <span className="num"> · {euros(e.amount_cents)}</span>}
                {e.person && <> · {e.person}</>}
                {e.comment && <span className="text-muted-foreground"> · {e.comment}</span>}
              </span>
              <button
                type="button"
                onClick={() => remove(e.id)}
                aria-label={t("events.delete")}
                title={t("events.delete")}
                className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
              >
                <Trash2 size={13} {...ICON} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {events.length === 0 && !open && <p className="mt-1 text-[12px] text-muted-foreground">{t("events.empty")}</p>}

      {open && (
        <form onSubmit={save} className="mt-3 space-y-2.5">
          <Field label={t("events.kind")}>
            <Chips options={EVENT_KINDS} value={kind} onChange={setKind} valueGroup="eventKind" label={t("events.kind")} />
          </Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label={t("events.date")}>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </Field>
            <Field label={t("events.amount")}>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" className={inputClass} />
            </Field>
          </div>
          <Field label={t("events.person")} hint={t("events.personHint")}>
            <input value={person} onChange={(e) => setPerson(e.target.value)} className={inputClass} />
          </Field>
          <Field label={t("events.comment")}>
            <input value={comment} onChange={(e) => setComment(e.target.value)} className={inputClass} />
          </Field>
          {error && <ErrorNote message={error} />}
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !kind} className="h-11 rounded-full bg-primary px-5 font-heading text-[14px] text-primary-foreground disabled:opacity-45">
              {t("events.save")}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-full px-4 text-[13px] font-semibold text-muted-foreground hover:bg-background">
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
