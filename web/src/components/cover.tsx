import { useState } from "react"

/** Jaquette, ou le titre sur fond neutre quand il n'y en a pas (ou qu'elle ne charge pas). */
export function Cover({ src, title, className = "", placeholder }: { src: string | null; title: string; className?: string; placeholder?: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-muted p-2 text-center text-xs text-muted-foreground ${className}`}>
        {placeholder ?? title}
      </div>
    )
  }
  return (
    <img src={src} alt={title} loading="lazy" decoding="async" onError={() => setFailed(true)} className={`bg-muted object-cover ${className}`} />
  )
}
