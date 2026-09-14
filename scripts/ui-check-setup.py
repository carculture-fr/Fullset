"""Premier lancement, connexion et déconnexion, au format téléphone. Crée un compte :
à lancer sur une installation vide (npm run dev avec un DATA_DIR vide).
    python3 scripts/ui-check-setup.py http://localhost:5176 <dossier-captures>
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
    page.fill("input[autocomplete='new-password'] >> nth=1", "autre-chose-encore")
    print("assistant, mots de passe différents :", page.locator("p.text-destructive").inner_text())
    page.screenshot(path=f"{OUT}/s1-assistant.png")
    page.fill("input[autocomplete='new-password'] >> nth=1", PASSWORD)
    page.click("button:has-text('Créer mon compte')")
    page.wait_for_selector("text=La collection est vide")
    print("après la création :", page.locator("body").inner_text()[:80].replace("\n", " | "))

    page.goto(f"{BASE}/reglages", wait_until="domcontentloaded")
    page.wait_for_selector("h2:has-text('Sécurité')")
    page.locator("section", has=page.locator("h2:has-text('Sécurité')")).screenshot(path=f"{OUT}/s2-securite.png")
    page.click("button:has-text('Se déconnecter')")
    page.wait_for_selector("button:has-text('Se connecter')")
    page.fill("input[placeholder='Identifiant']", "alice")
    page.fill("input[placeholder='Mot de passe']", "pas-le-bon-mot")
    page.click("button:has-text('Se connecter')")
    page.wait_for_selector("p.text-destructive")
    print("mauvais mot de passe :", page.locator("p.text-destructive").inner_text())
    page.screenshot(path=f"{OUT}/s3-connexion.png")
    page.fill("input[placeholder='Mot de passe']", PASSWORD)
    page.click("button:has-text('Se connecter')")
    # La déconnexion s'est faite depuis les réglages : on y revient après la connexion.
    page.wait_for_selector("h1:has-text('Réglages')")
    print("reconnecté : oui")

print("erreurs console:", errors or "aucune")
