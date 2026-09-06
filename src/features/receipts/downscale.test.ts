import {
  computeDownscaledSize,
  downscaleToThumbnail,
  RECEIPT_JPEG_QUALITY,
  RECEIPT_MAX_DIMENSION,
  RECEIPT_MIME_TYPE,
} from "@/features/receipts/downscale"

describe("computeDownscaledSize", () => {
  it("fits the longest edge to the thumbnail limit", () => {
    expect(computeDownscaledSize(2000, 1000)).toEqual({ width: 1024, height: 512 })
    expect(computeDownscaledSize(1000, 2000)).toEqual({ width: 512, height: 1024 })
    expect(computeDownscaledSize(3000, 3000)).toEqual({ width: 1024, height: 1024 })
  })

  it("never upscales sources that already fit", () => {
    expect(computeDownscaledSize(100, 80)).toEqual({ width: 100, height: 80 })
    expect(computeDownscaledSize(1024, 768)).toEqual({ width: 1024, height: 768 })
  })
})

/** Stub the canvas 2d pipeline on a real canvas element (no type assertions). */
function stubCanvas(toBlob: (callback: (blob: Blob | null) => void) => void) {
  const drawings: Array<{ width: number; height: number }> = []
  const toBlobCalls: Array<{ type: string | undefined; quality: unknown }> = []
  const canvas = document.createElement("canvas")
  const context = {
    drawImage: (_image: unknown, _dx: number, _dy: number, width: number, height: number) => {
      drawings.push({ width, height })
    },
  }
  Object.defineProperty(canvas, "getContext", { configurable: true, value: () => context })
  Object.defineProperty(canvas, "toBlob", {
    configurable: true,
    value: (callback: (blob: Blob | null) => void, type?: string, quality?: unknown) => {
      toBlobCalls.push({ type, quality })
      toBlob(callback)
    },
  })
  vi.spyOn(document, "createElement").mockImplementation(() => canvas)
  return { canvas, drawings, toBlobCalls }
}

function stubBitmap(width: number, height: number) {
  vi.stubGlobal("createImageBitmap", async () => ({
    width,
    height,
    close: () => undefined,
  }))
}

describe("downscaleToThumbnail", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("returns the source untouched when no decoder exists", async () => {
    // jsdom has neither createImageBitmap nor URL.createObjectURL.
    const source = new Blob(["raw-bytes"], { type: "image/png" })
    const result = await downscaleToThumbnail(source)
    expect(result.downscaled).toBe(false)
    expect(result.blob).toBe(source)
    expect(result.mimeType).toBe("image/png")
  })

  it("draws a max-1024px JPEG at quality 0.7 through canvas", async () => {
    stubBitmap(2000, 1000)
    const { canvas, drawings, toBlobCalls } = stubCanvas((callback) => {
      callback(new Blob(["thumbnail"], { type: RECEIPT_MIME_TYPE }))
    })

    const result = await downscaleToThumbnail(new Blob(["source"], { type: "image/png" }))

    expect(result.downscaled).toBe(true)
    expect(result.mimeType).toBe(RECEIPT_MIME_TYPE)
    expect(result.blob.type).toBe(RECEIPT_MIME_TYPE)
    expect({ width: result.width, height: result.height }).toEqual({ width: 1024, height: 512 })
    expect({ width: canvas.width, height: canvas.height }).toEqual({
      width: RECEIPT_MAX_DIMENSION,
      height: 512,
    })
    expect(drawings).toEqual([{ width: 1024, height: 512 }])
    expect(toBlobCalls).toEqual([{ type: "image/jpeg", quality: RECEIPT_JPEG_QUALITY }])
  })

  it("falls back to the source when canvas encoding fails", async () => {
    stubBitmap(4000, 3000)
    stubCanvas((callback) => {
      callback(null)
    })

    const source = new Blob(["source"], { type: "image/png" })
    const result = await downscaleToThumbnail(source)

    expect(result.downscaled).toBe(false)
    expect(result.blob).toBe(source)
  })
})
