import { useEffect, useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"

import { CopyForm, copyToValues, newCopyValues } from "@/components/copy-form"
import { api, errorMessage, send, type GameDetail, type Photo } from "@/lib/api"
import { useLibrary } from "@/lib/library-data"
import { copyPayload, uploadPhotos } from "@/lib/save-copy"

/** Ajout d'un exemplaire à un jeu existant (/jeux/:id/ajouter) ou modification (/jeux/:id/exemplaires/:copyId). */
export default function CopyEditor() {
  const { id, copyId } = useParams()
  // Depuis la page brocante (« j'en prends un autre ») : le code scanné suit dans l'exemplaire.
  const ean = useSearchParams()[0].get("ean") ?? ""
  const navigate = useNavigate()
  const { reload } = useLibrary()
  const [game, setGame] = useState<GameDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])

  useEffect(() => {
    api<GameDetail>(`/api/games/${id}`).then(
      (g) => {
        setGame(g)
        setPhotos(g.copies.find((c) => String(c.id) === copyId)?.photos ?? [])
      },
      (err) => setError(errorMessage(err)),
    )
  }, [id, copyId])

  if (error) return <p className="py-16 text-center text-destructive">{error}</p>
  if (!game) return <p className="py-16 text-center text-muted-foreground">Chargement…</p>

  const copy = copyId ? game.copies.find((c) => String(c.id) === copyId) : undefined
  if (copyId && !copy) return <p className="py-16 text-center text-destructive">Exemplaire introuvable.</p>
  const backToGame = () => navigate(`/jeux/${game.id}`, { replace: true })

  const remove = async () => {
    const last = game.copies.length === 1
    const message = last
      ? "Supprimer ce dernier exemplaire ? Le jeu sera retiré de la bibliothèque, avec sa jaquette."
      : "Supprimer cet exemplaire et ses photos ?"
    if (!window.confirm(message)) return
    try {
      const res = await send<{ gameDeleted: boolean }>("DELETE", `/api/copies/${copy!.id}`)
      await reload()
      if (res.gameDeleted) navigate("/", { replace: true })
      else backToGame()
    } catch (err) {
      window.alert(errorMessage(err))
    }
  }

  const deletePhoto = async (p: Photo) => {
    if (!window.confirm("Supprimer cette photo ?")) return
    await send("DELETE", `/api/photos/${p.id}`)
    setPhotos((list) => list.filter((x) => x.id !== p.id))
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link to={`/jeux/${game.id}`} replace className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground">
        ← {game.title}
      </Link>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{copy ? "Modifier l'exemplaire" : "Nouvel exemplaire"}</h1>
        {copy && (
          <button onClick={remove} className="text-sm text-destructive hover:underline">
            Supprimer
          </button>
        )}
      </div>
      <CopyForm
        initial={copy ? copyToValues(copy) : { ...newCopyValues(game.platform), barcode: ean }}
        submitLabel={copy ? "Enregistrer" : "Ajouter l'exemplaire"}
        existingPhotos={photos}
        onDeletePhoto={copy ? deletePhoto : undefined}
        onSubmit={async (values, newPhotos) => {
          let target = copy?.id
          if (copy) await send("PUT", `/api/copies/${copy.id}`, copyPayload(values))
          else target = (await send<{ copyId: number }>("POST", `/api/games/${game.id}/copies`, copyPayload(values))).copyId
          await uploadPhotos(`/api/copies/${target}/photos`, newPhotos)
          await reload()
          backToGame()
        }}
      />
    </div>
  )
}
