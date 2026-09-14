import { NavLink } from "react-router-dom"

const tab = ({ isActive }: { isActive: boolean }) =>
  `flex-1 rounded-md px-3 py-1.5 text-center text-sm sm:flex-none ${isActive ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`

/** Bascule entre les jeux et le matériel, en tête de la bibliothèque. */
export function LibraryTabs() {
  return (
    <div className="mb-3 flex gap-1 rounded-lg bg-muted p-1 sm:inline-flex">
      <NavLink to="/" end className={tab}>
        Jeux
      </NavLink>
      <NavLink to="/consoles" className={tab}>
        Consoles et matériel
      </NavLink>
    </div>
  )
}
