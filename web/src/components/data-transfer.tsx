import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { ErrorNote } from "@/components/fields"
import { errorMessage, upload, uploadWith } from "@/lib/api"
import { useLibrary } from "@/lib/library-data"

/**
 * Tes données : exports, sauvegarde complète, restauration et reprise de l'ancienne application.
 * Sa place est dans les réglages (demande de Tom, 18/09/2026) : on y vient pour agir sur
 * l'installation, pas pour regarder des chiffres.
 */

const pill = "inline-flex min-h-10 items-center rounded-full border border-border-strong px-4 text-[13px] font-semibold transition-colors duration-150 hover:bg-foreground/[.07]"

export function DataTransfer() {
  const { t } = useTranslation()
  const { games, reload } = useLibrary()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const empty = (games ?? []).every((g) => g.copies.length === 0)

  return (
    <div>
      <p className="-mt-1 mb-4 text-[13px] text-muted-foreground">{t("stats.data.note")}</p>
      <div className="flex flex-wrap gap-2">
        <a href="/api/export.csv" download className={pill}>
          {t("stats.data.exportCsv")}
        </a>
        <a href="/api/export.json" download className={pill}>
          {t("stats.data.exportJson")}
        </a>
        <a href="/api/export-materiel.csv" download className={pill}>
          {t("stats.data.exportHardware")}
        </a>
        <a href="/api/export.zip" download className={`${pill} text-primary-text`}>
          {t("stats.data.exportZip")}
        </a>
      </div>
      <p className="mt-3 text-xs text-subtle-foreground">{t("stats.data.photosNote")}</p>

      <div className="mt-5 grid gap-5 border-t border-border pt-5 md:grid-cols-2">
        <div>
          <p className="text-[14px] font-semibold">{t("stats.data.legacyTitle")}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{t("stats.data.legacyNote")}</p>
          <Link to="/importer/ancienne-appli" className={`${pill} mt-3 text-primary-text`}>
            {t("stats.data.legacyLink")}
          </Link>
        </div>

        <div>
          <p className="text-[14px] font-semibold">{t("stats.data.restoreTitle")}</p>
          {empty ? (
            <>
              <p className="mt-1 text-[13px] text-muted-foreground">{t("stats.data.restoreNote")}</p>
              <label className={`${pill} mt-3 cursor-pointer ${busy ? "opacity-45" : ""}`}>
                {busy ? t("stats.data.importing") : t("stats.data.chooseFile")}
                <input
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  className="hidden"
                  disabled={busy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ""
                    if (!file) return
                    setBusy(true)
                    setError(null)
                    try {
                      const r = await upload<{ games: number; copies: number; totalCents: number }>("/api/import", file, file.name)
                      setDone(t("stats.data.imported", { games: t("stats.games", { count: r.games }), copies: t("stats.copies", { count: r.copies }), amount: "" }))
                      await reload()
                    } catch (err) {
                      setError(errorMessage(err))
                    } finally {
                      setBusy(false)
                    }
                  }}
                />
              </label>
            </>
          ) : (
            <p className="mt-1 text-[13px] text-muted-foreground">{t("stats.data.onlyEmpty")}</p>
          )}

          {/* Remise en place d'une sauvegarde complète : elle remplace tout, d'où la confirmation. */}
          <p className="mt-5 text-[14px] font-semibold">{t("stats.data.restoreZipTitle")}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{t("stats.data.restoreZipNote")}</p>
          <label className={`${pill} mt-3 cursor-pointer ${busy ? "opacity-45" : ""}`}>
            {busy ? t("stats.data.importing") : t("stats.data.restoreZipAction")}
            <input
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ""
                if (!file || !window.confirm(t("stats.data.restoreZipConfirm"))) return
                setBusy(true)
                setError(null)
                try {
                  const r = await uploadWith<{ games: number; copies: number; images: number }>("/api/restore", file, { confirm: "remplacer" })
                  setDone(t("stats.data.restored", { games: t("stats.games", { count: r.games }), copies: t("stats.copies", { count: r.copies }), images: r.images }))
                  await reload()
                } catch (err) {
                  setError(errorMessage(err))
                } finally {
                  setBusy(false)
                }
              }}
            />
          </label>

          <div className="mt-3 space-y-2">
            <ErrorNote message={error} />
            {done && <p className="rounded-[16px] bg-primary-tint px-4 py-2.5 text-sm text-primary-tint-foreground">{done}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
