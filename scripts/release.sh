#!/usr/bin/env bash
# Publie une version : tests, numéro de version, étiquette, envoi. La CI construit et publie
# l'image à l'arrivée de l'étiquette (.github/workflows/release.yml).
#
#   ./scripts/release.sh 1.2.0
set -euo pipefail

version="${1:-}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Usage : $0 <x.y.z>" >&2
  exit 2
fi

racine="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$racine"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "L'arbre de travail n'est pas propre : commite ou range tes changements d'abord." >&2
  exit 1
fi
if git rev-parse "v$version" >/dev/null 2>&1; then
  echo "L'étiquette v$version existe déjà." >&2
  exit 1
fi

echo "== Tests et types"
npm test
npm run typecheck

echo "== Version $version"
npm version "$version" --no-git-tag-version --workspaces-update=false >/dev/null
git add package.json package-lock.json
git commit -m "chore: version $version"
git tag "v$version"

echo "== Envoi"
git push origin HEAD
git push origin "v$version"

echo
echo "Version v$version envoyée. La CI construit et publie l'image sur ghcr.io."
