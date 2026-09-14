import type { NextFunction, Request, Response } from "express"

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // React pose des styles en ligne (largeur des barres, hauteur des colonnes).
  "style-src 'self' 'unsafe-inline'",
  // Jaquettes IGDB affichées directement (recherche, souhaits), vignettes Commons proposées pour
  // l'image par défaut du matériel, photos réduites en blob: avant envoi.
  "img-src 'self' data: blob: https://images.igdb.com https://upload.wikimedia.org https://thumb.wikimedia.org",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ")

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("Content-Security-Policy", CSP)
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("X-Frame-Options", "DENY")
  res.setHeader("Referrer-Policy", "same-origin")
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=()")
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin")
  // Toujours posé : un navigateur l'ignore sur HTTP et ne le retient que reçu en HTTPS
  // (le conditionner à req.secure le perd derrière un proxy).
  res.setHeader("Strict-Transport-Security", "max-age=31536000")
  next()
}

const parse = (url: string) => {
  try {
    return new URL(url)
  } catch {
    return undefined
  }
}

/**
 * Contrôle d'origine sur les écritures (CSRF), quel que soit le chemin. Avec une liste
 * (`ALLOWED_ORIGINS`), l'en-tête Origin (ou Referer) doit y figurer. Sans liste, il doit désigner
 * le site lui-même : son hôte égale l'en-tête Host ou, derrière un proxy, X-Forwarded-Host (une
 * page d'un autre site ne peut pas poser ces en-têtes depuis un navigateur). `disabled` : tests.
 */
export function originCheck(allowed: string[], { disabled = false }: { disabled?: boolean } = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (disabled || ["GET", "HEAD", "OPTIONS"].includes(req.method)) return next()
    const source = parse(req.headers.origin ?? req.headers.referer ?? "")
    const ok = source && (allowed.length ? allowed.includes(source.origin) : sameSite(req, source.host.toLowerCase()))
    if (ok) return next()
    res.status(403).json({ error: "Origine refusée." })
  }
}

function sameSite(req: Request, host: string) {
  const hosts = [req.get("host"), ...(req.get("x-forwarded-host")?.split(",") ?? [])].map((h) => h?.trim().toLowerCase()).filter(Boolean)
  return hosts.includes(host)
}

export const allowedOriginsFromEnv = () =>
  (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean)
