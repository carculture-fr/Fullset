import { Fragment, useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useParams } from "react-router-dom"

import { Condition } from "@/components/condition"
import { HardwareImage } from "@/components/hardware-image"
import { ValueBlock } from "@/components/value-block"
import { api, errorMessage, type HardwareDetail as Detail } from "@/lib/api"
import { euros, formatDate } from "@/lib/format"
import { valueLabel } from "@/lib/i18n"
import { hardwareTitle } from "@/pages/Hardware"

export default function HardwareDetail() {
  const { t } = useTranslation()
  const { id } = useParams()
  const [item, setItem] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => api<Detail>(`/api/hardware/${id}`).then(setItem, (err) => setError(errorMessage(err))), [id])
  useEffect(() => {
    load()
  }, [load])

  if (error) return <p className="py-16 text-center text-destructive">{error}</p>
  if (!item) return <p className="py-16 text-center text-muted-foreground">{t("library.loading")}</p>

  const rows: Array<[string, string | null]> = [
    [t("hardwareDetail.edition"), item.edition],
    [t("hardwareDetail.color"), item.color],
    [t("hardwareDetail.region"), valueLabel("region", item.region)],
    [t("hardwareDetail.content"), valueLabel("hwContent", item.content)],
    [t("hardwareDetail.working"), valueLabel("hwWorking", item.working)],
    [t("hardwareDetail.price"), item.price_cents === null ? null : euros(item.price_cents)],
    [t("hardwareDetail.boughtOn"), formatDate(item.purchase_date)],
    [t("hardwareDetail.place"), item.purchase_place],
    [t("hardwareDetail.serial"), item.serial_number],
  ]

  return (
    <article className="mx-auto max-w-2xl pb-10">
      <Link to="/consoles" className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground">
        {t("hardwareDetail.back")}
      </Link>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl leading-tight font-semibold">{hardwareTitle(item)}</h1>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-muted px-2.5 py-1">{valueLabel("hwKind", item.kind)}</span>
            <span className="rounded-full bg-muted px-2.5 py-1">{item.platform}</span>
          </div>
        </div>
        <Link to={`/consoles/${item.id}/modifier`} className="shrink-0 text-sm text-muted-foreground hover:text-foreground">
          {t("common.edit")}
        </Link>
      </div>

      <HardwareImage item={item} onChanged={load} />

      {item.photos.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {item.photos.map((p) => (
            <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
              <img src={p.url} alt="" loading="lazy" className="aspect-square w-full rounded-md object-cover" />
            </a>
          ))}
        </div>
      )}

      <section className="mt-4 rounded-lg bg-card p-4">
        <div className="grid grid-cols-3 gap-2">
          <Condition label={item.kind === "Console" ? t("hardwareDetail.console") : t("hardwareDetail.item")} value={item.condition_item} />
          <Condition label={t("hardwareDetail.box")} value={item.condition_box} />
          <Condition label={t("hardwareDetail.manual")} value={item.condition_manual} />
        </div>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <Fragment key={k}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="min-w-0 break-words">{v}</dd>
              </Fragment>
            ))}
        </dl>
        <ValueBlock valuations={item.valuations} priceCents={item.price_cents} postUrl={`/api/hardware/${item.id}/valuations`} deleteBase="/api/hardware-valuations" onChanged={load} />
        {item.comment && <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">{item.comment}</p>}
      </section>
    </article>
  )
}
