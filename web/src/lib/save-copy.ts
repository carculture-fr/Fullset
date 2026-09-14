import type { CopyFormValues } from "@/components/copy-form"

import { upload } from "./api"
import { shrinkImage } from "./images"

/** Envoie les photos une à une après l'enregistrement : il faut l'identifiant de l'élément pour les rattacher. */
export async function uploadPhotos(url: string, files: File[]) {
  for (const file of files) {
    await upload(url, await shrinkImage(file), "photo.jpg")
  }
}

/** Le formulaire garde des chaînes ; le serveur valide et convertit (prix en centimes, dates). */
export const copyPayload = (v: CopyFormValues) => ({ ...v })
