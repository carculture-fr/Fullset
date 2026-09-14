// Cellules des exports CSV (Excel français : point-virgule, guillemets doublés).
// Une valeur qui commence par = + - @ ou une tabulation serait lue par Excel comme une formule :
// un titre venu d'IGDB, de Steam ou d'un fichier importé pourrait alors exécuter quelque chose à
// l'ouverture. On la préfixe d'une apostrophe, qu'Excel n'affiche pas et que l'import retire.

const FORMULA = /^[=+\-@\t\r]/

export function csvCell(v: unknown) {
  let s = v === null || v === undefined ? "" : String(v)
  if (FORMULA.test(s)) s = `'${s}`
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Inverse de la protection ci-dessus, pour relire nos propres exports à l'identique. */
export const uncsvCell = (s: string) => (s.startsWith("'") && FORMULA.test(s.slice(1)) ? s.slice(1) : s)
