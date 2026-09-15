"""Refonte « Étagère » : captures des écrans clés à 400 px (clair et sombre) et à 1280 px, sur
une installation de test (compte créé, collection de démonstration importée si vide).
    python3 scripts/ui-check-redesign.py http://localhost:5176 <dossier-captures>
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1].rstrip("/")
OUT = sys.argv[2]
USER, PASSWORD = "alice", "mot-de-passe-de-test"
COLLECTION = json.loads((pathlib.Path(__file__).parent.parent / "server/test/fixtures/collection.json").read_text())
errors = []


def sign_in(page):
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("input[autocomplete='username']")
    page.fill("input[autocomplete='username']", USER)
    if page.locator("input[autocomplete='new-password']").count():
        page.fill("input[autocomplete='new-password'] >> nth=0", PASSWORD)
        page.fill("input[autocomplete='new-password'] >> nth=1", PASSWORD)
        page.locator("form button").last.click()
        page.wait_for_timeout(800)
        page.locator("button").last.click()  # étape des services : Terminer
    else:
        page.fill("input[autocomplete='current-password']", PASSWORD)
        page.locator("form button").last.click()
    page.wait_for_timeout(1200)
    page.evaluate(
        """async (col) => {
          const lib = await (await fetch('/api/library')).json()
          if (lib.games.length) return
          const form = new FormData()
          form.append('file', new Blob([JSON.stringify(col)], { type: 'application/json' }), 'collection.json')
          await fetch('/api/import', { method: 'POST', body: form })
        }""",
        COLLECTION,
    )


def shoot(page, path, name, full=False, wait=None):
    page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
    if wait:
        page.wait_for_selector(wait)
    page.wait_for_timeout(1200)
    overflow = page.evaluate("document.documentElement.scrollWidth - innerWidth")
    page.screenshot(path=f"{OUT}/{name}.png", full_page=full)
    print(f"{name} : débordement horizontal {overflow} px")


with sync_playwright() as p:
    browser = p.chromium.launch()
    for theme in ("light", "dark"):
        ctx = browser.new_context(viewport={"width": 400, "height": 860}, device_scale_factor=2, locale="fr-FR", color_scheme=theme)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        sign_in(page)
        page.evaluate("(t) => localStorage.setItem('fullset-theme', t)", theme)
        shoot(page, "/?tri=plateforme", f"m-{theme}-bibliotheque", wait="input[type=search]")
        if theme == "light":
            shoot(page, "/?tri=plateforme", f"m-{theme}-bibliotheque-long", full=True, wait="input[type=search]")
            first = page.locator("a[href^='/jeux/']").first.get_attribute("href")
            shoot(page, first, "m-light-fiche", full=True, wait="h1, h2")
            shoot(page, first + "/ajouter", "m-light-exemplaire", full=True, wait="form, h1, h2")
            shoot(page, "/brocante", "m-light-brocante", wait="[role=dialog], video, input")
            shoot(page, "/stats", "m-light-stats", full=True)
            shoot(page, "/reglages", "m-light-reglages", full=True)
            shoot(page, "/consoles", "m-light-materiel")
        ctx.close()
    ctx = browser.new_context(viewport={"width": 1280, "height": 800}, device_scale_factor=1, locale="fr-FR", color_scheme="light")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    sign_in(page)
    page.evaluate("() => localStorage.setItem('fullset-theme', 'light')")
    shoot(page, "/?tri=plateforme", "d-bibliotheque", wait="input[type=search]")
    first = page.locator("a[href^='/jeux/']").first.get_attribute("href")
    shoot(page, first, "d-fiche", wait="h1, h2")
    shoot(page, "/stats", "d-stats")

print("erreurs de page :", errors or "aucune")
