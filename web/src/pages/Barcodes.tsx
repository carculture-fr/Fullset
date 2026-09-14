import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { BarcodeIcon } from "@/components/copy-form"
import { ErrorNote, inputClass } from "@/components/fields"
import { api, errorMessage, send, type BarcodeRow } from "@/lib/api"
import { formatDate } from "@/lib/format"
import { filterOptions } from "@/lib/platform-search"

/** Tous les codes-barres connus : appris au scan ou saisis sur un exemplaire. */
export default function Barcodes() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<BarcodeRow[] | null>(null)
  const [q, setQ] = useState("")
  const [error, setError] = useState<string | null>(null)

  const load = () => api<{ rows: BarcodeRow[] }>("/api/barcodes?details=1").then((r) => setRows(r.rows), (err) => setError(errorMessage(err)))
  useEffect(() => {
    load()
  }, [])

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
    <div className="mx-auto max-w-2xl space-y-4 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("barcodes.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("barcodes.summary", { what: rows ? t("barcodes.count", { count: rows.length }) : t("common.loading") })}</p>
        </div>
        <a href="/api/export-codes.csv" className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm">
          {t("barcodes.export")}
        </a>
      </div>

      <Link to="/brocante?enchainer=1" className="flex items-center justify-center gap-2 rounded-lg bg-primary py-3 font-medium text-primary-foreground">
        <BarcodeIcon />
        {t("barcodes.scanChain")}
      </Link>
      <ErrorNote message={error} />

      {rows && rows.length > 0 && <input className={inputClass} placeholder={t("barcodes.search")} value={q} onChange={(e) => setQ(e.target.value)} />}
      {rows && rows.length === 0 && (
        <p className="rounded-lg bg-card p-4 text-sm text-muted-foreground">
          {t("barcodes.empty")}
        </p>
      )}

      <ul className="divide-y divide-border rounded-lg bg-card">
        {shown.map((r) => (
          <li key={r.ean} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <Link to={`/jeux/${r.game_id}`} className="block truncate font-medium hover:underline">
                {r.title}
              </Link>
              <div className="truncate text-xs text-muted-foreground">
                {[r.platform, r.edition, r.created_at && t("barcodes.learnedOn", { date: formatDate(r.created_at.slice(0, 10)) }), r.on_copy && t("barcodes.onCopy")].filter(Boolean).join(" · ")}
              </div>
            </div>
            <code className="shrink-0 text-xs tabular-nums text-muted-foreground">{r.ean}</code>
            <button onClick={() => forget(r)} aria-label={t("barcodes.forget", { ean: r.ean })} className="shrink-0 px-1 text-muted-foreground hover:text-destructive">
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
