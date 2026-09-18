/**
 * Écriture et lecture d'archives ZIP, sans dépendance : Fullset s'installe en une image, on
 * n'ajoute pas une bibliothèque pour faire une sauvegarde. Les entrées sont stockées telles
 * quelles (méthode 0, « store ») : jaquettes et photos sont déjà des JPEG, les compresser une
 * seconde fois ne gagnerait rien, et le lecteur reste une centaine de lignes.
 */

const TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

export function crc32(data: Buffer) {
  let c = 0xffffffff
  for (const byte of data) c = TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export type ZipEntry = { name: string; data: Buffer }

/** Date MS-DOS : les archives n'ont pas besoin d'être à la seconde, mais un zéro déplaît aux outils. */
function dosTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, day }
}

export function zipStore(entries: ZipEntry[]): Buffer {
  const { time, day } = dosTime()
  const locals: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8")
    const crc = crc32(entry.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version minimale
    local.writeUInt16LE(0x0800, 6) // nom de fichier en UTF-8
    local.writeUInt16LE(0, 8) // méthode : stocké
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(day, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(entry.data.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, entry.data)

    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0)
    dir.writeUInt16LE(20, 4)
    dir.writeUInt16LE(20, 6)
    dir.writeUInt16LE(0x0800, 8)
    dir.writeUInt16LE(0, 10)
    dir.writeUInt16LE(time, 12)
    dir.writeUInt16LE(day, 14)
    dir.writeUInt32LE(crc, 16)
    dir.writeUInt32LE(entry.data.length, 20)
    dir.writeUInt32LE(entry.data.length, 24)
    dir.writeUInt16LE(name.length, 28)
    dir.writeUInt32LE(offset, 42)
    central.push(dir, name)
    offset += 30 + name.length + entry.data.length
  }

  const centralBuffer = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuffer.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralBuffer, end])
}

export class ZipError extends Error {}

/** Lit une archive écrite par `zipStore` (ou tout ZIP dont les entrées sont stockées). */
export function unzipStore(buffer: Buffer): Map<string, Buffer> {
  // Fin du central directory : on la cherche depuis la fin, commentaire compris.
  let end = -1
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 22 - 65_536; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new ZipError("archive illisible (fin de l'index introuvable)")

  const count = buffer.readUInt16LE(end + 10)
  let pointer = buffer.readUInt32LE(end + 16)
  const files = new Map<string, Buffer>()

  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(pointer) !== 0x02014b50) throw new ZipError("archive illisible (index abîmé)")
    const method = buffer.readUInt16LE(pointer + 10)
    const size = buffer.readUInt32LE(pointer + 24)
    const nameLength = buffer.readUInt16LE(pointer + 28)
    const extraLength = buffer.readUInt16LE(pointer + 30)
    const commentLength = buffer.readUInt16LE(pointer + 32)
    const localOffset = buffer.readUInt32LE(pointer + 42)
    const name = buffer.toString("utf8", pointer + 46, pointer + 46 + nameLength)
    if (method !== 0) throw new ZipError(`entrée compressée non gérée : ${name}`)

    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const start = localOffset + 30 + localNameLength + localExtraLength
    const data = buffer.subarray(start, start + size)
    if (crc32(data) !== buffer.readUInt32LE(pointer + 16)) throw new ZipError(`entrée abîmée : ${name}`)
    if (!name.endsWith("/")) files.set(name, Buffer.from(data))
    pointer += 46 + nameLength + extraLength + commentLength
  }
  return files
}
