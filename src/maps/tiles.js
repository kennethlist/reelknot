// Tile fetch + stitch for one map box, on a canvas. Replaces the PIL pipeline in
// reelcompass web/print_maps.py: fetch USGS US Topo tiles (with retry), mosaic
// the crop region, resample to the exact page pixel size, apply the colour
// mode and encode as JPEG for pdf-lib.
//
// NOTE the ArcGIS tile URL order is {z}/{y}/{x} (y before x).
import { lonLatToMerc, mercToGlobalPx, chooseZoom } from './geo.js'
import { timeoutSignal } from './online.js'

export const TILE_URL_TEMPLATE =
  'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}'
// Same-origin fallback: nginx (container) and the Vite dev server proxy this
// path to USGS, for browsers/networks where the direct cross-origin fetch is
// blocked (CORS-stripping proxies, filtering extensions...).
export const PROXY_URL_TEMPLATE = '/tiles/{z}/{y}/{x}'

let activeTemplate = TILE_URL_TEMPLATE
const fill = (t, z, x, y) => t.replace('{z}', z).replace('{y}', y).replace('{x}', x)
const tileUrl = (z, x, y) => fill(activeTemplate, z, x, y)

/** The tile URL template currently in use ('direct' USGS or same-origin 'proxy'). */
export function tileSource() {
  return activeTemplate === TILE_URL_TEMPLATE ? 'direct' : 'proxy'
}

const CONCURRENCY = 6
const JPEG_QUALITY = 0.85
// A stalled connection must not hang the whole job: each attempt gets this long.
const TILE_TIMEOUT_MS = 25000

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(signal.reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })

// Consecutive fetch failures with no success yet before we give up on a page:
// this reads as "tiles are blocked", not as a few missing tiles.
const FAIL_FAST_STREAK = 6

export class TileServiceError extends Error {}

async function probe(template, signal) {
  const res = await fetch(fill(template, 0, 0, 0), {
    signal: timeoutSignal(10000, signal), cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const type = res.headers.get('content-type') || ''
  if (!type.startsWith('image/')) throw new Error(`unexpected content-type ${type || '(none)'}`)
}

let resolved = null

/**
 * Pick a working tile source before a job: the direct USGS URL first, then the
 * same-origin proxy. Cached for the page's lifetime once something works.
 * Throws a TileServiceError with a diagnosis when neither is reachable.
 */
export async function resolveTileSource(signal) {
  if (resolved) return resolved
  let directErr
  try {
    await probe(TILE_URL_TEMPLATE, signal)
    activeTemplate = TILE_URL_TEMPLATE
    return (resolved = 'direct')
  } catch (e) {
    if (signal?.aborted) throw e
    directErr = e
  }
  try {
    await probe(PROXY_URL_TEMPLATE, signal)
    activeTemplate = PROXY_URL_TEMPLATE
    console.warn(`Print Maps: direct USGS tile fetch failed (${directErr?.message}); using the /tiles/ proxy.`)
    return (resolved = 'proxy')
  } catch (e) {
    if (signal?.aborted) throw e
    throw new TileServiceError(
      'The browser could not fetch USGS map tiles from basemap.nationalmap.gov ' +
        `(${directErr?.message ?? directErr}), and the site's /tiles/ proxy is not available ` +
        `either (${e?.message ?? e}). A direct failure is usually a CORS or network block: check ` +
        'the browser console, and try disabling ad/privacy blockers or a filtering proxy.',
    )
  }
}

/** Per-job tile cache of decoded ImageBitmaps; cleared between pages. */
export class TileCache {
  constructor() {
    this.map = new Map()
  }
  get(key) {
    return this.map.get(key)
  }
  set(key, bmp) {
    this.map.set(key, bmp)
  }
  clear() {
    for (const bmp of this.map.values()) bmp.close?.()
    this.map.clear()
  }
}

/** Fetch one tile as an ImageBitmap. Retries transient failures and 429s. */
async function fetchTile(z, x, y, signal) {
  let backoff = 1000
  let last = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw signal.reason
    try {
      const res = await fetch(tileUrl(z, x, y), { signal: timeoutSignal(TILE_TIMEOUT_MS, signal) })
      if (res.status === 429 && attempt < 2) {
        await sleep(backoff, signal)
        backoff *= 2
        continue
      }
      if (!res.ok) throw new Error(`tile ${z}/${y}/${x}: HTTP ${res.status}`)
      const blob = await res.blob()
      return await createImageBitmap(blob)
    } catch (e) {
      if (signal?.aborted) throw signal.reason
      last = e
      // Retry timeouts and 429s; a plain network/CORS failure gets one retry.
      const isHttp = e instanceof Error && /HTTP \d+/.test(e.message)
      const isTimeout = e?.name === 'TimeoutError'
      if (!isHttp && (isTimeout ? attempt < 2 : attempt < 1)) {
        await sleep(backoff, signal)
        backoff *= 2
        continue
      }
      throw e
    }
  }
  throw last ?? new Error('tile fetch failed')
}

async function runPool(items, limit, fn) {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      await fn(item)
    }
  })
  await Promise.all(workers)
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

const isJpeg = (b) => b.length > 2 && b[0] === 0xff && b[1] === 0xd8
const isPng = (b) => b.length > 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47

async function encode(canvas, type) {
  let blob
  if (canvas.convertToBlob) {
    blob = await canvas.convertToBlob({ type, quality: JPEG_QUALITY })
  } else {
    blob = await new Promise((resolve) => canvas.toBlob(resolve, type, JPEG_QUALITY))
  }
  if (!blob) throw new Error('canvas encoding failed (canvas readback blocked?)')
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * Encode the rendered page as JPEG, returning { bytes, type }. Some browsers
 * ignore the requested type on an OffscreenCanvas and hand back PNG, so the
 * bytes are sniffed: retry through an ordinary <canvas>, and if that still
 * isn't JPEG, keep the PNG (bigger file, still a valid page).
 */
async function canvasToImage(canvas) {
  let bytes = await encode(canvas, 'image/jpeg')
  if (isJpeg(bytes)) return { bytes, type: 'jpg' }
  if (typeof document !== 'undefined' && canvas.convertToBlob) {
    const el = document.createElement('canvas')
    el.width = canvas.width
    el.height = canvas.height
    el.getContext('2d').drawImage(canvas, 0, 0)
    const retry = await encode(el, 'image/jpeg')
    if (isJpeg(retry)) return { bytes: retry, type: 'jpg' }
    if (isPng(retry)) bytes = retry
  }
  if (isPng(bytes)) {
    console.warn('Print Maps: this browser would not encode JPEG from canvas; embedding PNG instead.')
    return { bytes, type: 'png' }
  }
  throw new Error('canvas produced neither JPEG nor PNG (a canvas-blocking extension?)')
}

/**
 * Colour processing in place on ImageData: 'gray' is plain luminance; 'bw' is
 * luminance + autocontrast (0.5% cutoff each end) + contrast x1.5 so light
 * tints don't print as muddy gray on black-and-white printers.
 */
function applyColorMode(imageData, mode) {
  if (mode !== 'gray' && mode !== 'bw') return
  const d = imageData.data
  const n = d.length / 4
  const lum = new Uint8ClampedArray(n)
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    lum[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]
  }
  if (mode === 'bw') {
    // Autocontrast: find the levels that cut off 0.5% of pixels at each end.
    const hist = new Uint32Array(256)
    for (let i = 0; i < n; i++) hist[lum[i]]++
    const cut = Math.floor(n * 0.005)
    let lo = 0
    for (let acc = 0; lo < 255; lo++) {
      acc += hist[lo]
      if (acc > cut) break
    }
    let hi = 255
    for (let acc = 0; hi > 0; hi--) {
      acc += hist[hi]
      if (acc > cut) break
    }
    if (hi <= lo) {
      lo = 0
      hi = 255
    }
    const stretch = 255 / (hi - lo)
    let sum = 0
    for (let i = 0; i < n; i++) {
      const v = Math.max(0, Math.min(255, (lum[i] - lo) * stretch))
      lum[i] = v
      sum += v
    }
    // Contrast 1.5 about the mean (PIL ImageEnhance.Contrast semantics).
    const mean = sum / n
    for (let i = 0; i < n; i++) lum[i] = mean + (lum[i] - mean) * 1.5
  }
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    d[p] = d[p + 1] = d[p + 2] = lum[i]
  }
}

/** Tile columns/rows a box needs at zoom z, plus the crop in mosaic pixels. */
function tilePlan(bbox, z) {
  const [minLon, minLat, maxLon, maxLat] = bbox
  const nw = lonLatToMerc(minLon, maxLat)
  const se = lonLatToMerc(maxLon, minLat)
  const p0 = mercToGlobalPx(nw.x, nw.y, z)
  const p1 = mercToGlobalPx(se.x, se.y, z)
  const tx0 = Math.floor(p0.px / 256)
  const tx1 = Math.floor(p1.px / 256)
  const ty0 = Math.floor(p0.py / 256)
  const ty1 = Math.floor(p1.py / 256)
  const left = Math.round(p0.px - tx0 * 256)
  const top = Math.round(p0.py - ty0 * 256)
  const right = Math.max(Math.round(p1.px - tx0 * 256), left + 1)
  const bottom = Math.max(Math.round(p1.py - ty0 * 256), top + 1)
  return { tx0, tx1, ty0, ty1, left, top, right, bottom }
}

/** Total tiles a job would fetch, for the budget check. */
export function planTileCount(boxes, scale, dpi) {
  let total = 0
  for (const b of boxes) {
    const z = chooseZoom(scale, dpi, (b.min_lat + b.max_lat) / 2)
    const p = tilePlan([b.min_lon, b.min_lat, b.max_lon, b.max_lat], z)
    total += (p.tx1 - p.tx0 + 1) * (p.ty1 - p.ty0 + 1)
  }
  return total
}

/**
 * Fetch, stitch and crop tiles for one box, resample to exactly outW x outH
 * pixels, apply the colour mode and return { bytes, type } ('jpg' or 'png'). Tolerates a few missing
 * tiles (left white); throws only if most fail, which reads as "could not reach
 * USGS". Aborts propagate as the signal's reason.
 */
export async function renderBoxImage(bbox, z, outW, outH, cache, colorMode, signal, onTile) {
  const { tx0, tx1, ty0, ty1, left, top, right, bottom } = tilePlan(bbox, z)

  const coords = []
  for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) coords.push([tx, ty])

  // Mosaic only the crop region (not the full tile grid) to bound memory.
  const cropW = right - left
  const cropH = bottom - top
  const crop = makeCanvas(cropW, cropH)
  const cctx = crop.getContext('2d')
  cctx.fillStyle = '#fff'
  cctx.fillRect(0, 0, cropW, cropH)

  let failed = 0
  let ok = 0
  let streak = 0
  let lastError = null
  // Internal abort so a fail-fast decision stops the other in-flight fetches.
  const local = new AbortController()
  const onOuterAbort = () => local.abort(signal.reason)
  signal?.addEventListener('abort', onOuterAbort, { once: true })
  try {
    await runPool(coords, CONCURRENCY, async ([tx, ty]) => {
      if (local.signal.aborted) return
      const key = `${z}/${tx}/${ty}`
      let bmp = cache.get(key)
      if (!bmp) {
        try {
          bmp = await fetchTile(z, tx, ty, local.signal)
          cache.set(key, bmp)
        } catch (e) {
          if (signal?.aborted) throw e
          if (local.signal.aborted) return
          failed++
          lastError = e
          if (ok === 0 && ++streak >= FAIL_FAST_STREAK) local.abort()
          return
        }
      }
      ok++
      streak = 0
      cctx.drawImage(bmp, (tx - tx0) * 256 - left, (ty - ty0) * 256 - top)
      onTile?.()
    })
  } finally {
    signal?.removeEventListener('abort', onOuterAbort)
  }
  if (coords.length && (ok === 0 || failed > coords.length / 2)) {
    const why = lastError?.message ? ` Last error: ${lastError.message}.` : ''
    throw new TileServiceError(
      ok === 0
        ? `No USGS map tiles could be fetched (${failed} failed).${why} ` +
          'If the browser console shows CORS errors, something between the browser and ' +
          'basemap.nationalmap.gov is blocking or rewriting the requests.'
        : `Could not reach the USGS tile service (${failed} of ${coords.length} tiles failed).${why}`,
    )
  }

  const out = makeCanvas(outW, outH)
  const octx = out.getContext('2d')
  octx.imageSmoothingEnabled = true
  octx.imageSmoothingQuality = 'high'
  octx.drawImage(crop, 0, 0, cropW, cropH, 0, 0, outW, outH)

  if (colorMode !== 'color') {
    const img = octx.getImageData(0, 0, outW, outH)
    applyColorMode(img, colorMode)
    octx.putImageData(img, 0, 0)
  }
  return canvasToImage(out)
}
