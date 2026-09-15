import { useState } from "react"

import { spineTone } from "@/lib/platform-tone"

/**
 * Jaquette dans son cadre, ou silhouette de boîtier quand il n'y en a pas (ou qu'elle ne charge
 * pas) : tranche colorée par console, nom de console en haut, titre en Caprasimo en bas.
 * `size` règle la finesse : "grid" (carte), "large" (fiche, bureau), "thumb" (vignette de liste).
 * `fit="contain"` pour les photos de matériel sur fond blanc.
 */
export function Cover({
  src,
  title,
  platform,
  size = "grid",
  fit = "cover",
  className = "",
}: {
  src: string | null
  title: string
  platform?: string | null
  size?: "grid" | "large" | "thumb"
  fit?: "cover" | "contain"
  className?: string
  /** Hérité de l'ancienne jaquette, sans effet. */
  placeholder?: string
}) {
  const [failed, setFailed] = useState(false)
  const radius = size === "thumb" ? "rounded-[6px]" : size === "large" ? "rounded-[14px]" : "rounded-[12px]"
  if (src && !failed) {
    return (
      <div className={`aspect-[3/4] bg-card ${size === "thumb" ? "p-0.5" : "p-1"} ${radius} ${className}`}>
        <img
          src={src}
          alt={title}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className={`h-full w-full bg-card ${fit === "contain" ? "object-contain" : "object-cover"} ${size === "thumb" ? "rounded-[4px]" : "rounded-[9px]"}`}
        />
      </div>
    )
  }
  const spine = size === "thumb" ? "w-[5px]" : size === "large" ? "w-[14px]" : "w-[11px]"
  const titleSize = size === "thumb" ? "text-[7px] leading-[1.1]" : size === "large" ? "text-[16px] leading-[1.15]" : "text-[12px] leading-[1.15]"
  const pad = size === "thumb" ? "p-1" : size === "large" ? "px-2.5 py-3" : "px-[7px] py-2"
  return (
    <div role="img" aria-label={title} className={`flex aspect-[3/4] overflow-hidden border-[1.5px] border-border-strong bg-muted ${radius} ${className}`}>
      <div className={`${spine} shrink-0`} style={{ background: spineTone(platform) }} />
      <div className={`flex min-w-0 flex-1 flex-col justify-between ${pad}`}>
        {size !== "thumb" && platform ? <span className="truncate text-[8px] tracking-[0.08em] text-subtle-foreground uppercase">{platform}</span> : <span />}
        {/* En vignette, le titre est déjà écrit à côté : la tranche suffit, sans mots coupés. */}
        {size !== "thumb" && <span className={`font-heading line-clamp-4 break-words text-foreground/85 ${titleSize}`}>{title}</span>}
      </div>
    </div>
  )
}
