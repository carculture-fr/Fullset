/** Même contrôle que le serveur (normalizeEan) : 8, 12, 13 ou 14 chiffres, clé GS1 juste. */
export function cleanEan(raw: string): string | null {
  const digits = raw.replace(/\D/g, "")
  if (![8, 12, 13, 14].includes(digits.length)) return null
  const sum = [...digits.slice(0, -1)].reverse().reduce((n, d, i) => n + Number(d) * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1)) ? digits : null
}
