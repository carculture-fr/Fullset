// Thème posé avant le premier rendu, pour éviter un flash sombre en mode clair.
// Fichier à part et non script en ligne : la CSP n'autorise que les scripts du site.
(function () {
  var t
  try {
    t = localStorage.getItem("fullset-theme")
  } catch (e) {}
  if (t !== "light" && t !== "dark") t = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
  document.documentElement.dataset.theme = t
  if (t === "light") document.querySelector('meta[name="theme-color"]').setAttribute("content", "#f7f3ea")
})()
