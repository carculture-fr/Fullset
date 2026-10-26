import type { ReactNode } from "react"

/**
 * Aide courte, posée là où la question se pose : un écran encore vide, une fonction qu'on
 * découvre. Deux ou trois phrases, jamais une page d'aide à part — personne ne les ouvre.
 */
export function HelpNote({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[14px] border border-border-strong bg-card p-3.5 text-left ${className}`}>
      {title && <p className="text-[13px] font-semibold">{title}</p>}
      <div className={`text-[13px] leading-[1.5] text-muted-foreground ${title ? "mt-1" : ""}`}>{children}</div>
    </div>
  )
}
