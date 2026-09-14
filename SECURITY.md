# Security policy

Please **do not open a public issue** for a vulnerability. Report it privately through GitHub: *Security* tab → *Report a vulnerability* on this repository. You will get an answer within a few days.

Useful to include: the version (footer of the app or `/api/health`), what an attacker needs (network access, an account…), the steps to reproduce, and what they obtain.

Only the latest release is maintained.

## Security model, in short

- One account per installation. Until it exists, the API is closed and only the first-run setup answers.
- Password hashed with scrypt; sessions are random tokens stored hashed in the database, closed after 14 days without activity or on logout.
- Login attempts limited per client IP (set `TRUST_PROXY` behind a reverse proxy so the real IP is seen).
- Every write checks the `Origin` (or `Referer`) header against the site itself or `ALLOWED_ORIGINS`.
- Content Security Policy without inline scripts, `X-Frame-Options: DENY`, `nosniff`, HSTS.
- Covers are only downloaded from `images.igdb.com`, without following redirects; uploaded photos must be JPEG, PNG or WebP and are served behind the session.

---

**En français :** pour signaler une faille, n'ouvre pas de ticket public ; passe par l'onglet *Security* → *Report a vulnerability* du dépôt.
