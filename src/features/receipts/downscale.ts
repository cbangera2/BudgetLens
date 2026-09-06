// Client-side downscale for receipt captures.
//
// Phone photos are several megabytes; the stored thumbnail keeps the longest
// edge at RECEIPT_MAX_DIMENSION and re-encodes to JPEG at
// RECEIPT_JPEG_QUALITY. Re-encoding also strips EXIF metadata (including GPS)
// before anything is persisted. Capture uses a plain file input
// (accept="image/*"), which summons the native camera roll picker inside
// WKWebView with no native bridge required.

export const RECEIPT_MAX_DIMENSION = 1024
export const RECEIPT_JPEG_QUALITY = 0.7
export const RECEIPT_MIME_TYPE = "image/jpeg"

export interface DownscaledSize {
  width: number
  height: number
}

/**
 * Fit a source rectangle inside maxDimension on its longest edge, preserving
 * aspect ratio. Sources that already fit are returned unchanged (no upscale).
 */
export function computeDownscaledSize(
  sourceWidth: number,
  sourceHeight: number,
  maxDimension: number = RECEIPT_MAX_DIMENSION,
): DownscaledSize {
  const width = Math.max(1, Math.floor(sourceWidth))
  const height = Math.max(1, Math.floor(sourceHeight))
  const longest = Math.max(width, height)
  if (longest <= maxDimension) return { width, height }
  const scale = maxDimension / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export interface DownscaleResult {
  blob: Blob
  width: number
  height: number
  mimeType: string
  /** False when no canvas pipeline was available and the source is kept as-is. */
  downscaled: boolean
}

interface DecodedSource {
  image: CanvasImageSource
  width: number
  height: number
  close: () => void
}

function decodeWithBitmap(bitmap: ImageBitmap): DecodedSource {
  return {
    image: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    close: () => {
      try {
        bitmap.close()
      } catch {
        // Decoding already succeeded; closing is best-effort.
      }
    },
  }
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const element = new Image()
    // jsdom and other non-visual runtimes never fire load/error for object
    // URLs, so time out instead of hanging the attach pipeline forever.
    const timer = setTimeout(
      () => reject(new Error("The receipt image timed out while decoding.")),
      5000,
    )
    element.addEventListener(
      "load",
      () => {
        clearTimeout(timer)
        resolve(element)
      },
      { once: true },
    )
    element.addEventListener(
      "error",
      () => {
        clearTimeout(timer)
        reject(new Error("The receipt image could not be decoded."))
      },
      { once: true },
    )
    element.src = url
  })
}

/**
 * Decode an image Blob to something canvas can draw. Prefers
 * createImageBitmap and falls back to an <img> element; resolves null when
 * neither decoder is available (for example jsdom unit tests).
 */
async function decodeSource(source: Blob): Promise<DecodedSource | null> {
  if (typeof createImageBitmap === "function") {
    try {
      return decodeWithBitmap(await createImageBitmap(source))
    } catch {
      return null
    }
  }
  if (typeof document === "undefined" || typeof Image === "undefined") return null
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null
  const url = URL.createObjectURL(source)
  try {
    const element = await loadImageElement(url)
    const width = element.naturalWidth || element.width
    const height = element.naturalHeight || element.height
    if (!width || !height) return null
    return { image: element, width, height, close: () => undefined }
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Downscale an image Blob to a JPEG thumbnail. Never rejects: when the canvas
 * pipeline is unavailable or decoding fails, the source Blob is returned
 * untouched so captures still work (flagged via downscaled: false).
 */
export async function downscaleToThumbnail(
  source: Blob,
  maxDimension: number = RECEIPT_MAX_DIMENSION,
  quality: number = RECEIPT_JPEG_QUALITY,
): Promise<DownscaleResult> {
  const fallback = (): DownscaleResult => ({
    blob: source,
    width: 0,
    height: 0,
    mimeType: source.type || RECEIPT_MIME_TYPE,
    downscaled: false,
  })
  try {
    // The canvas context is acquired before decoding so runtimes without one
    // (for example jsdom unit tests) fall back immediately instead of hanging
    // in an image decoder that can never settle.
    if (typeof document === "undefined") return fallback()
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d")
    if (!context) return fallback()
    const decoded = await decodeSource(source)
    if (!decoded) return fallback()
    const { width, height } = computeDownscaledSize(decoded.width, decoded.height, maxDimension)
    canvas.width = width
    canvas.height = height
    context.drawImage(decoded.image, 0, 0, width, height)
    decoded.close()
    const thumbnail = await new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob((result) => resolve(result), RECEIPT_MIME_TYPE, quality)
      } catch {
        resolve(null)
      }
    })
    if (!thumbnail) return fallback()
    return { blob: thumbnail, width, height, mimeType: RECEIPT_MIME_TYPE, downscaled: true }
  } catch {
    return fallback()
  }
}
