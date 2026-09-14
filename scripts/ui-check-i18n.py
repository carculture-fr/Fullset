"""Français et anglais, au format téléphone : installation dans un navigateur anglais (ou connexion
si le compte existe déjà), collection de test importée, bibliothèque, filtres, fiche, puis passage
au français dans les réglages. Écrit dans la base : à lancer sur une installation de test.
    python3 scripts/ui-check-i18n.py http://localhost:5176 <dossier-captures>
"""
import json
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1].rstrip("/")
OUT = sys.argv[2]
USER = "alice"
PASSWORD = "mot-de-passe-de-test"
COLLECTION = json.loads((pathlib.Path(__file__).parent.parent / "server/test/fixtures/collection.json").read_text())
errors = []
FRENCH = re.compile(r"\b(Bibliothèque|Réglages|Rechercher|Filtres|Ajouter|Terminer|Non configuré|exemplaires?)\b")

with sync_playwright() as p:
    ctx = p.chromium.launch().new_context(viewport={"width": 400, "height": 860}, device_scale_factor=2, locale="en-US")
    page = ctx.new_page()
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("h1")
    if page.locator("input[autocomplete='new-password']").count():
        print("installation (navigateur anglais) :", page.locator("h1").inner_text())
        page.screenshot(path=f"{OUT}/i1-setup-en.png")
        page.fill("input[autocomplete='username']", USER)
        page.fill("input[autocomplete='new-password'] >> nth=0", PASSWORD)
        page.fill("input[autocomplete='new-password'] >> nth=1", PASSWORD)
        page.locator("form button").last.click()
        page.wait_for_timeout(1000)
        print("étape services :", page.locator("h1").inner_text())
        page.screenshot(path=f"{OUT}/i2-services-en.png", full_page=True)
        page.locator("button").last.click()
    else:
        print("connexion (navigateur anglais) :", page.locator("body").inner_text()[:120].replace("\n", " | "))
        page.screenshot(path=f"{OUT}/i1-login-en.png")
        page.fill("input[autocomplete='username']", USER)
        page.fill("input[autocomplete='current-password']", PASSWORD)
        page.locator("form button").last.click()
    page.wait_for_timeout(1500)

    # L'import attend un fichier (multipart), comme le bouton « Restaurer » des statistiques.
    status = page.evaluate(
        """async (col) => {
          const games = await (await fetch('/api/library')).json()
          if (games.games.length) return 'déjà importée'
          const form = new FormData()
          form.append('file', new Blob([JSON.stringify(col)], { type: 'application/json' }), 'collection.json')
          const res = await fetch('/api/import', { method: 'POST', body: form })
          return res.status + ' ' + (await res.text()).slice(0, 80)
        }""",
        COLLECTION,
    )
    print("import de la collection de test :", status)

    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("input[type=search]")
    page.wait_for_timeout(800)
    body = page.locator("body").inner_text()
    print("bibliothèque (anglais) :", body[:160].replace("\n", " | "))
    print("mots français restants :", sorted(set(FRENCH.findall(body))) or "aucun")
    page.screenshot(path=f"{OUT}/i3-library-en.png")

    page.locator("button", has_text=re.compile("Filter", re.I)).first.click()
    dialog = page.locator("[role=dialog]")
    dialog.locator("button[aria-haspopup=listbox]").nth(2).click()
    print("un filtre (anglais) :", " | ".join(t.replace("\n", " ") for t in dialog.get_by_role("option").all_inner_texts()[:5]))
    page.screenshot(path=f"{OUT}/i4-filters-en.png")

    page.goto(BASE, wait_until="domcontentloaded")
    page.locator("a[href^='/jeux/']").first.click()
    page.wait_for_selector("h1")
    page.wait_for_timeout(800)
    body = page.locator("body").inner_text()
    print("fiche (anglais) :", body[:260].replace("\n", " | "))
    print("mots français restants :", sorted(set(FRENCH.findall(body))) or "aucun")
    page.screenshot(path=f"{OUT}/i5-game-en.png", full_page=True)

    page.goto(f"{BASE}/reglages", wait_until="domcontentloaded")
    page.wait_for_selector("h1")
    page.get_by_role("button", name=re.compile("language", re.I)).first.click()
    page.get_by_role("option", name="Français").click()
    page.wait_for_timeout(2500)
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("input[type=search]")
    page.wait_for_timeout(800)
    print("bibliothèque (après passage au français) :", page.locator("body").inner_text()[:120].replace("\n", " | "))
    page.screenshot(path=f"{OUT}/i6-library-fr.png")

print("erreurs console:", errors or "aucune")
