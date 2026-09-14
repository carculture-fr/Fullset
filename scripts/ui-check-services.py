"""Assistant jusqu'à l'étape des services, puis Réglages → Services, au format téléphone.
Crée un compte : à lancer sur une installation vide (npm run dev avec un DATA_DIR vide).
    python3 scripts/ui-check-services.py http://localhost:5176 <dossier-captures>
"""
import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1].rstrip("/")
OUT = sys.argv[2]
PASSWORD = "mot-de-passe-de-test"
errors = []

with sync_playwright() as p:
    page = p.chromium.launch().new_page(viewport={"width": 400, "height": 860}, device_scale_factor=2)
    page.on("console", lambda m: m.type == "error" and "401" not in m.text and errors.append(m.text))
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("h1:has-text('Bienvenue')")
    page.fill("input[placeholder='Identifiant']", "alice")
    page.fill("input[autocomplete='new-password'] >> nth=0", PASSWORD)
    page.fill("input[autocomplete='new-password'] >> nth=1", PASSWORD)
    page.click("button:has-text('Créer mon compte')")
    page.wait_for_selector("h1:has-text('Les services')")
    page.wait_for_selector("text=IGDB")
    print("étape services :", " | ".join(page.locator("span.font-medium").all_inner_texts()))
    page.screenshot(path=f"{OUT}/v1-assistant-services.png", full_page=True)

    card = page.locator("div.rounded-lg.border", has=page.locator("span.font-medium:text-is('Steam')"))
    card.get_by_role("button", name="Configurer").click()
    card.locator("input").nth(0).fill("0123456789ABCDEF0123456789ABCDEF")
    card.locator("input").nth(1).fill("123")
    card.get_by_role("button", name="Enregistrer et tester").click()
    page.wait_for_timeout(800)
    print("SteamID faux :", card.locator("p.bg-destructive\\/15").inner_text())
    page.screenshot(path=f"{OUT}/v2-steam-erreur.png", full_page=True)

    page.click("button:has-text('Terminer')")
    page.wait_for_selector("text=La collection est vide")
    page.goto(f"{BASE}/reglages", wait_until="domcontentloaded")
    section = page.locator("section", has=page.locator("h2:text-is('Services')"))
    section.wait_for()
    section.screenshot(path=f"{OUT}/v3-reglages-services.png")
    print("réglages, services :", section.inner_text().replace("\n", " | ")[:220])

print("erreurs console:", errors or "aucune")
