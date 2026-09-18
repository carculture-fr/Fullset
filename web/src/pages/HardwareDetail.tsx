import { Pencil } from "lucide-react"
import { Fragment, useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useParams } from "react-router-dom"

import { ConditionBlock, toneOf } from "@/components/condition"
import { Cover } from "@/components/cover"
import { HardwareImage } from "@/components/hardware-image"
import { BackBar, ICON, tagClass } from "@/components/page-bits"
import { ItemLife } from "@/components/life"
import { PhotoStrip } from "@/components/photo-field"
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

  const title = hardwareTitle(item)
  // Une photo prise passe devant l'image de référence de Wikimedia Commons.
  const photo = item.photos[0]?.url ?? null
  const edit = `/consoles/${item.id}/modifier`
  const meta: Array<[string, string | null]> = [
    [t("hardwareDetail.edition"), item.edition],
    [t("hardwareDetail.color"), item.color],
    [t("hardwareDetail.region"), valueLabel("region", item.region)],
    [t("hardwareDetail.serial"), item.serial_number],
  ]
  const shortMeta = [item.edition, item.color, item.serial_number && `${t("hardwareDetail.serial")} ${item.serial_number}`].filter(Boolean).join(" · ")
  const bought = [formatDate(item.purchase_date), item.purchase_place].filter(Boolean).join(" · ")

  return (
    <article className="pb-10">
      <BackBar to="/consoles" label={t("libraryTabs.hardware")}>
        <Link to={edit} className={tagClass.surface}>
          {t("common.edit")}
        </Link>
      </BackBar>

      {/* Même charpente que la fiche d'un jeu : deux colonnes au téléphone, trois sur grand écran. */}
      <div className="grid grid-cols-[132px_minmax(0,1fr)] gap-x-4 gap-y-5 lg:grid-cols-[240px_minmax(0,1fr)_380px] lg:items-start lg:gap-8">
        <div className="contents lg:col-start-1 lg:row-start-1 lg:flex lg:flex-col lg:gap-4">
          <Cover src={photo ?? item.image} title={title} platform={item.platform} size="large" fit={photo ? "cover" : "contain"} className="col-start-1 row-start-1 w-full shadow-md" />
          <div className="col-span-2 row-start-2">
            <HardwareImage item={item} onChanged={load} />
          </div>
        </div>

        <header className="col-start-2 row-start-1 min-w-0 self-end lg:col-start-2 lg:self-start">
          <div className="text-[11px] tracking-[0.08em] text-primary-text uppercase">{[valueLabel("hwKind", item.kind), item.platform].join(" · ")}</div>
          <h1 className="mt-1.5 text-[22px] leading-[1.05] break-words lg:text-[32px] lg:leading-[1.02]">{title}</h1>
          {shortMeta && <div className="mt-2 text-[12px] text-muted-foreground lg:hidden">{shortMeta}</div>}
          <dl className="mt-5 hidden grid-cols-[auto_1fr] gap-x-7 gap-y-1.5 text-[13px] lg:grid">
            {meta
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <Fragment key={k}>
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 break-words">{v}</dd>
                </Fragment>
              ))}
          </dl>
        </header>

        <section className="col-span-2 row-start-3 flex flex-col gap-3.5 rounded-card bg-card p-4 lg:col-span-1 lg:col-start-3 lg:row-start-1">
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {item.content && <span className={tagClass.ink}>{valueLabel("hwContent", item.content)}</span>}
              {item.region && <span className={tagClass.neutral}>{valueLabel("region", item.region)}</span>}
              {item.working && (
                <span className={`${tagClass.neutral} inline-flex items-center gap-1.5`}>
                  <span className="size-2 shrink-0 rounded-full" style={{ background: toneOf(item.working) }} aria-hidden="true" />
                  {valueLabel("hwWorking", item.working)}
                </span>
              )}
            </div>
            <Link
              to={edit}
              aria-label={t("common.edit")}
              title={t("common.edit")}
              className="-mt-1.5 -mr-1.5 grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-background/60 hover:text-foreground"
            >
              <Pencil size={16} {...ICON} aria-hidden="true" />
            </Link>
          </div>

          <ConditionBlock
            items={[
              { label: item.kind === "Console" ? t("hardwareDetail.console") : t("hardwareDetail.item"), value: item.condition_item },
              { label: t("hardwareDetail.box"), value: item.condition_box },
              { label: t("hardwareDetail.manual"), value: item.condition_manual },
            ]}
          />

          {(item.price_cents !== null || bought) && (
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-[11px] text-muted-foreground">{t("hardwareDetail.paid")}</dt>
                <dd className="num text-[13px] font-semibold">{item.price_cents === null ? "—" : euros(item.price_cents)}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground">{t("hardwareDetail.boughtOn")}</dt>
                <dd className="num text-[13px] break-words">{bought || "—"}</dd>
              </div>
            </dl>
          )}

          <ValueBlock valuations={item.valuations} priceCents={item.price_cents} postUrl={`/api/hardware/${item.id}/valuations`} deleteBase="/api/hardware-valuations" onChanged={load} />
          {item.comment && <p className="rounded-[16px] bg-muted px-3 py-2.5 text-[13px] whitespace-pre-line">{item.comment}</p>}
          <PhotoStrip photos={item.photos} addTo={edit} />
          <ItemLife events={item.events ?? []} postUrl={`/api/hardware/${item.id}/events`} deleteBase="/api/hardware-events" onChanged={load} />
        </section>
      </div>
    </article>
  )
}
