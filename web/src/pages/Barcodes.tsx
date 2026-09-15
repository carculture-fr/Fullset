import { Barcode, Download, Search, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { Cover } from "@/components/cover"
import { ErrorNote, inputClass } from "@/components/fields"
import { api, errorMessage, send, type BarcodeRow } from "@/lib/api"
import { formatDate } from "@/lib/format"
import { useLibrary } from "@/lib/library-data"
import { filterOptions } from "@/lib/platform-search"

const ICON = { strokeWidth: 2.75 } as const

/** Tous les codes-barres connus : appris au scan ou saisis sur un exemplaire. */
export default function Barcodes() {
  const { t } = useTranslation()
  const { games } = useLibrary()
  const [rows, setRows] = useState<BarcodeRow[] | null>(null)
  const [q, setQ] = useState("")
  const [error, setError] = useState<string | null>(null)

  const load = () => api<{ rows: BarcodeRow[] }>("/api/barcodes?details=1").then((r) => setRows(r.rows), (err) => setError(errorMessage(err)))
  useEffect(() => {
    load()
  }, [])

  // La jaquette vient de la bibliothèque déjà en mémoire : la liste des codes ne la porte pas.
  const covers = useMemo(() => new Map((games ?? []).map((g) => [g.id, g.cover])), [games])

  const shown = useMemo(() => {
    if (!rows) return []
    if (!q.trim()) return rows
    const keys = rows.map((r) => `${r.title} ${r.platform} ${r.edition ?? ""} ${r.ean}`)
    const hits = new Set(filterOptions(keys, q))
    return rows.filter((_, i) => hits.has(keys[i]))
  }, [rows, q])

  const forget = async (r: BarcodeRow) => {
    if (!window.confirm(t(r.on_copy ? "barcodes.forgetConfirmCopy" : "barcodes.forgetConfirm", { ean: r.ean, title: r.title }))) return
    try {
      await send("DELETE", `/api/barcodes/${r.ean}`)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[29px]">{t("barcodes.title")}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{t("barcodes.summary", { what: rows ? t("barcodes.count", { count: rows.length }) : t("common.loading") })}</p>
        </div>
        <a href="/api/export-codes.csv" className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-card px-3.5 text-[13px] font-semibold">
          <Download size={16} {...ICON} aria-hidden="true" />
          {t("barcodes.export")}
        </a>
      </div>

      <Link
        to="/brocante?enchainer=1"
        className="flex min-h-[46px] items-center justify-center gap-2.5 rounded-full bg-ink px-5 font-heading text-[15px] text-ink-foreground shadow-md transition-transform duration-150 active:scale-[.98]"
      >
        <Barcode size={20} {...ICON} aria-hidden="true" />
        {t("barcodes.scanChain")}
      </Link>
      <ErrorNote message={error} />

      {rows && rows.length > 0 && (
        <div className="relative">
          <Search size={18} {...ICON} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground" />
          <input className={`${inputClass} pl-11`} aria-label={t("barcodes.search")} placeholder={t("barcodes.search")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      {rows && rows.length === 0 && <p className="rounded-card bg-card p-4 text-[13px] text-muted-foreground">{t("barcodes.empty")}</p>}

      <ul>
        {shown.map((r) => (
          <li key={r.ean} className="grid grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 border-t border-border py-2 first:border-t-0">
            <Link to={`/jeux/${r.game_id}`} tabIndex={-1} aria-hidden="true">
              <Cover src={covers.get(r.game_id) ?? null} title={r.title} platform={r.platform} size="thumb" />
            </Link>
            <div className="min-w-0">
              <Link to={`/jeux/${r.game_id}`} className="block truncate text-[14px] font-semibold hover:underline">
                {r.title}
              </Link>
              <div className="truncate text-[12px] text-muted-foreground">
                {[r.platform, r.edition, r.created_at && t("barcodes.learnedOn", { date: formatDate(r.created_at.slice(0, 10)) }), r.on_copy && t("barcodes.onCopy")].filter(Boolean).join(" · ")}
              </div>
              <code className="num block truncate font-mono text-[11px] tracking-[0.04em] text-subtle-foreground">{r.ean}</code>
            </div>
            <button
              onClick={() => forget(r)}
              aria-label={t("barcodes.forget", { ean: r.ean })}
              title={t("barcodes.forget", { ean: r.ean })}
              className="grid size-10 place-items-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-card hover:text-destructive"
            >
              <X size={18} {...ICON} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
