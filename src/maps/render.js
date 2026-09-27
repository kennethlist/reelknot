// Print Maps renderer: USGS US Topo sheets at true print scale on Letter/A4,
// with cartographic marginalia (lat/lon graticule, UTM grid, scale bars in km
// and miles, magnetic declination diagram, title block, adjoining-sheets key)
// plus an optional index page. Ported from reelcompass web/print_maps.py to
// pdf-lib; everything runs in the browser.
//
// pdf-lib's origin is bottom-left (y up) where PyMuPDF's was top-left, so the
// map rect is {x0, y0 (bottom), x1, y1 (top)} and the marginalia below the map
// hang off y0.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import {
  MARGIN, INCH_M, PT_PER_IN, MIN_ZOOM, MAX_ZOOM, MERC_MAX,
  pageSizePt, lonLatToMerc, chooseZoom, latLonToUtm, utmToLatLon,
  fmtDms, gratStepDeg, niceBelow, clipSegment,
} from './geo.js'
import { renderBoxImage, planTileCount, resolveTileSource, TileCache } from './tiles.js'
import { declination, quadInfo } from './online.js'

// --- Limits -----------------------------------------------------------------
// Pages render sequentially with a progress callback; peak memory stays roughly
// per-page (the tile cache is cleared between pages). Keep MAX_PAGES in
// lock-step with grid.js.
export const MAX_PAGES = 100
export const TILE_BUDGET = 6000 // total tiles across all pages (network guard)

export const SCALES = [10000, 24000, 25000]
export const DPIS = [150, 200, 300]
export const PAPERS = ['letter', 'a4']
export const ORIENTATIONS = ['portrait', 'landscape']
// color = faithful USGS colour; gray = luminance; bw = high-contrast grayscale.
export const COLOR_MODES = ['color', 'gray', 'bw']

const BLACK = rgb(0, 0, 0)
const WHITE = rgb(1, 1, 1)
const GRAT_BLUE = rgb(0, 0, 0.55)
const UTM_INK = rgb(0.15, 0.15, 0.15)
const MAG_RED = rgb(0.7, 0, 0)
const GRAY = rgb(0.4, 0.4, 0.4)
const ACCENT = rgb(0.39, 0.4, 0.95) // indigo, matches the on-screen grid

/** Map rect for the paper: page size plus the marginalia frame, in pdf points. */
function mapRectFor(paper, orientation) {
  const [W, H] = pageSizePt(paper, orientation)
  const x0 = MARGIN.left
  const x1 = W - MARGIN.right
  const y0 = MARGIN.bottom
  const y1 = H - MARGIN.top
  return { W, H, x0, x1, y0, y1, width: x1 - x0, height: y1 - y0 }
}

/** lonlat -> page point for a bbox filling the (Mercator) map rect. */
function makeProjector(bbox, r) {
  const [minLon, minLat, maxLon, maxLat] = bbox
  const nw = lonLatToMerc(minLon, maxLat)
  const se = lonLatToMerc(maxLon, minLat)
  return (lon, lat) => {
    const p = lonLatToMerc(lon, lat)
    const fx = (p.x - nw.x) / (se.x - nw.x)
    const fy = (nw.y - p.y) / (nw.y - se.y)
    return { x: r.x0 + fx * r.width, y: r.y1 - fy * r.height }
  }
}

// Standard-14 fonts use WinAnsi; drop anything it can't encode so a stray
// emoji in a custom title doesn't abort the whole job.
function safeText(s) {
  return String(s).replace(/[^\x20-\x7E -ÿ–—‘’“”•…]/g, '')
}

function text(page, str, x, y, size, font, color = BLACK) {
  page.drawText(safeText(str), { x, y, size, font, color })
}

function textWidth(str, font, size) {
  return font.widthOfTextAtSize(safeText(str), size)
}

function centeredText(page, str, cx, y, size, font, color = BLACK) {
  text(page, str, cx - textWidth(str, font, size) / 2, y, size, font, color)
}

function line(page, a, b, thickness, color, dashArray, opacity = 1) {
  page.drawLine({ start: a, end: b, thickness, color, dashArray, opacity })
}

// --- Grid line styling (user-adjustable) --------------------------------------
// Each grid (lat/lon graticule, UTM) has on/off, a dash style, an opacity and a
// line weight so map detail can stay legible under the overlay.
export const GRID_STYLES = ['solid', 'dashed', 'dotted']
export const GRID_WEIGHTS = { hairline: 0.2, thin: 0.35, normal: 0.5, bold: 0.8 }
export const GRID_OPACITIES = [1, 0.75, 0.5, 0.25]
export const GRID_DEFAULTS = {
  grat: { on: true, style: 'dotted', opacity: 0.75, weight: 'thin' },
  utm: { on: true, style: 'dashed', opacity: 0.5, weight: 'thin' },
}
const DASHES = { solid: undefined, dashed: [4, 3], dotted: [1, 3] }

function gridLine(page, a, b, color, g) {
  line(page, a, b, GRID_WEIGHTS[g.weight], color, DASHES[g.style], g.opacity)
}

function normalizeGrid(input) {
  const out = {}
  for (const key of ['grat', 'utm']) {
    const d = GRID_DEFAULTS[key]
    const g = input?.[key] ?? {}
    const opacity = Number(g.opacity ?? d.opacity)
    out[key] = {
      on: g.on == null ? d.on : Boolean(g.on),
      style: GRID_STYLES.includes(g.style) ? g.style : d.style,
      opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0.05, opacity)) : d.opacity,
      weight: g.weight in GRID_WEIGHTS ? g.weight : d.weight,
    }
  }
  return out
}

// --- Marginalia -------------------------------------------------------------

function drawGraticule(page, r, bbox, proj, fonts, mono, g) {
  const [minLon, minLat, maxLon, maxLat] = bbox
  const lonStep = gratStepDeg(maxLon - minLon)
  const latStep = gratStepDeg(maxLat - minLat)
  const color = mono ? BLACK : GRAT_BLUE

  // Meridians: thin dotted line + DMS label above the map.
  for (let k = Math.ceil(minLon / lonStep - 1e-9); k * lonStep <= maxLon + 1e-9; k++) {
    const lon = k * lonStep
    const clip = clipSegment(proj(lon, maxLat), proj(lon, minLat), r)
    if (!clip) continue
    gridLine(page, clip[0], clip[1], color, g)
    centeredText(page, fmtDms(lon, false), clip[0].x, r.y1 + 3, 5.5, fonts.regular, color)
  }
  // Parallels: label at the left, right-justified against the neatline.
  for (let k = Math.ceil(minLat / latStep - 1e-9); k * latStep <= maxLat + 1e-9; k++) {
    const lat = k * latStep
    const clip = clipSegment(proj(minLon, lat), proj(maxLon, lat), r)
    if (!clip) continue
    gridLine(page, clip[0], clip[1], color, g)
    const label = fmtDms(lat, true)
    const tw = textWidth(label, fonts.regular, 5.5)
    text(page, label, r.x0 - 3 - tw, clip[0].y - 2, 5.5, fonts.regular, color)
  }
}

function drawUtmGrid(page, r, bbox, scale, proj, fonts, g) {
  const [minLon, minLat, maxLon, maxLat] = bbox
  const step = scale <= 12000 ? 500 : 1000

  const corners = [
    [minLat, minLon], [minLat, maxLon], [maxLat, minLon], [maxLat, maxLon],
  ].map(([lat, lon]) => latLonToUtm(lat, lon))
  const zone = corners[0].zone
  const northern = (minLat + maxLat) / 2 >= 0
  const eMin = Math.min(...corners.map((c) => c.easting))
  const eMax = Math.max(...corners.map((c) => c.easting))
  const nMin = Math.min(...corners.map((c) => c.northing))
  const nMax = Math.max(...corners.map((c) => c.northing))

  // A gridline of constant easting (varyN) or northing, walked in 8 segments
  // (UTM lines curve slightly on a Mercator page) and clipped to the map.
  const utmLine = (fixedE, fixedN, varyN) => {
    const pts = []
    const steps = 8
    for (let i = 0; i <= steps; i++) {
      const ll = varyN
        ? utmToLatLon(zone, northern, fixedE, nMin + ((nMax - nMin) * i) / steps)
        : utmToLatLon(zone, northern, eMin + ((eMax - eMin) * i) / steps, fixedN)
      pts.push(proj(ll.lon, ll.lat))
    }
    for (let j = 0; j < pts.length - 1; j++) {
      const clip = clipSegment(pts[j], pts[j + 1], r)
      if (clip) gridLine(page, clip[0], clip[1], UTM_INK, g)
    }
  }
  const km = (v) => String(v / 1000)

  // Constant easting (roughly vertical): value labels below the map.
  for (let e = Math.ceil(eMin / step) * step; e <= eMax; e += step) {
    utmLine(e, null, true)
    const ll = utmToLatLon(zone, northern, e, nMin)
    const p = proj(ll.lon, ll.lat)
    if (p.x >= r.x0 - 5 && p.x <= r.x1 + 5) {
      text(page, km(e), p.x - 8, r.y0 - 9, 5.5, fonts.regular, UTM_INK)
    }
  }
  // Constant northing (roughly horizontal): labels to the right.
  for (let n = Math.ceil(nMin / step) * step; n <= nMax; n += step) {
    utmLine(null, n, false)
    const ll = utmToLatLon(zone, northern, eMax, n)
    const p = proj(ll.lon, ll.lat)
    if (p.y >= r.y0 - 5 && p.y <= r.y1 + 5) {
      text(page, km(n), r.x1 + 3, p.y - 2, 5.5, fonts.regular, UTM_INK)
    }
  }
}

/** A fixed-paper-length divided bar for a round ground distance; `top` is the
 *  bar's top edge in page points. */
function drawOneBar(page, x0, top, totalM, unitM, unitLabel, scale, fonts) {
  const lengthPt = (totalM / scale / INCH_M) * PT_PER_IN
  const nseg = 4
  const seg = lengthPt / nseg
  const h = 4
  for (let i = 0; i < nseg; i++) {
    page.drawRectangle({
      x: x0 + i * seg, y: top - h, width: seg, height: h,
      color: i % 2 === 0 ? BLACK : WHITE, borderColor: BLACK, borderWidth: 0.4,
    })
  }
  text(page, '0', x0 - 2, top + 2, 5, fonts.regular)
  text(page, String(totalM / unitM), x0 + lengthPt - 5, top + 2, 5, fonts.regular)
  text(page, unitLabel, x0 + lengthPt + 4, top - h, 6, fonts.regular)
}

/** Scale RF + km/mi bars, left-justified at the left neatline below the UTM
 *  value labels. */
function drawScaleBars(page, r, scale, fonts) {
  text(page, `SCALE  1:${scale.toLocaleString('en-US')}`, r.x0, r.y0 - 22, 8, fonts.regular)
  // Target ~150 pt of paper so each bar's ground distance is a round number.
  const ideal = (150 / PT_PER_IN) * INCH_M * scale
  const km = niceBelow(ideal / 1000) * 1000
  const mi = niceBelow(ideal / 1609.344) * 1609.344
  drawOneBar(page, r.x0, r.y0 - 33, km, 1000, 'km', scale, fonts)
  drawOneBar(page, r.x0, r.y0 - 47, mi, 1609.344, 'mi', scale, fonts)
}

function drawFooterTitle(page, r, title, fonts) {
  centeredText(page, title, (r.x0 + r.x1) / 2, r.y0 - 22, 9, fonts.bold)
}

function drawDeclination(page, r, decl, fonts, mono) {
  const magColor = mono ? BLACK : MAG_RED
  // Left of the adjoining-sheets key, kept high in the bottom margin so the
  // labels stay clear of a printer's non-printable bottom edge.
  const bx = r.x1 - 78
  const by = r.y0 - 42
  const L = 20
  line(page, { x: bx, y: by }, { x: bx, y: by + L }, 0.8, BLACK)
  text(page, 'TN', bx - 4, by + L + 3, 6, fonts.regular)
  if (decl == null) {
    text(page, 'declination n/a', bx - 18, by - 8, 5.5, fonts.regular, GRAY)
    return
  }
  const a = (decl * Math.PI) / 180 // + = east of true north
  const tip = { x: bx + L * Math.sin(a), y: by + L * Math.cos(a) }
  line(page, { x: bx, y: by }, tip, 0.8, magColor)
  const east = decl >= 0
  text(page, 'MN', east ? tip.x + 3 : tip.x - 14, tip.y + 3, 6, fonts.regular, magColor)
  text(page, `DECL ${Math.abs(decl).toFixed(1)}° ${east ? 'E' : 'W'}`, bx - 18, by - 8, 6, fonts.regular)
}

/** 'Boulder, Colorado — US Topo 2022  ·  Sheet A'. A custom title replaces the
 *  place/source text; the sheet suffix is still appended for multi-sheet jobs. */
function formatTitle(quad, label, override) {
  let title
  if (override) {
    title = override
  } else if (quad?.name) {
    const place = quad.state ? `${quad.name}, ${quad.state}` : quad.name
    title = quad.year ? `${place} — US Topo ${quad.year}` : `${place} — US Topo`
  } else {
    title = quad?.year ? `US Topo ${quad.year}` : 'US Topo'
  }
  if (label) title += `  ·  Sheet ${label}`
  return title
}

/** USGS-style adjoining-sheets 3x3 key, right-justified in the bottom margin.
 *  Centre cell is this sheet; the ring shows the selected sheet in each direction. */
function drawAdjoining(page, r, label, adj, fonts) {
  const cell = 11
  const gw = cell * 3
  const gx0 = r.x1 - gw
  const gyTop = r.y0 - 20
  const dirAt = [['nw', 'n', 'ne'], ['w', null, 'e'], ['sw', 's', 'se']]
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const x = gx0 + col * cell
      const top = gyTop - row * cell
      const center = row === 1 && col === 1
      page.drawRectangle({
        x, y: top - cell, width: cell, height: cell,
        color: center ? rgb(0.88, 0.88, 0.88) : undefined,
        borderColor: center ? GRAY : rgb(0.6, 0.6, 0.6),
        borderWidth: center ? 0.4 : 0.3,
      })
      const code = center ? label : adj[dirAt[row][col]]
      if (code) {
        const font = center ? fonts.bold : fonts.regular
        const size = center ? 6 : 5.5
        centeredText(page, code, x + cell / 2, top - cell / 2 - 2.2, size, font)
      }
    }
  }
  centeredText(page, 'ADJOINING SHEETS', gx0 + gw / 2, gyTop + 3, 4.5, fonts.regular, GRAY)
}

// --- Pages ------------------------------------------------------------------

/** Embed a rendered page image of either format pdf-lib supports. */
function embedImage(doc, img) {
  return img.type === 'png' ? doc.embedPng(img.bytes) : doc.embedJpg(img.bytes)
}

function placeImage(page, img, r) {
  page.drawImage(img, { x: r.x0, y: r.y0, width: r.width, height: r.height })
  page.drawRectangle({
    x: r.x0, y: r.y0, width: r.width, height: r.height, borderColor: BLACK, borderWidth: 0.9,
  })
}

async function renderSheet(doc, box, s, fonts, cache, ctx) {
  const bbox = [box.min_lon, box.min_lat, box.max_lon, box.max_lat]
  const clat = (bbox[1] + bbox[3]) / 2
  const clon = (bbox[0] + bbox[2]) / 2
  const mono = s.color_mode !== 'color'
  const r = mapRectFor(s.paper, s.orientation)
  const outW = Math.max(1, Math.round((r.width / 72) * s.dpi))
  const outH = Math.max(1, Math.round((r.height / 72) * s.dpi))
  const z = chooseZoom(s.scale, s.dpi, clat)

  // Metadata lookups run alongside the tile fetch. A custom title replaces the
  // quad name entirely, so skip that lookup.
  const meta = Promise.all([
    declination(clat, clon, ctx.signal),
    s.title ? null : quadInfo(bbox, ctx.signal),
  ])
  const img = await renderBoxImage(bbox, z, outW, outH, cache, s.color_mode, ctx.signal, ctx.onTile)
  const [decl, quad] = await meta

  const page = doc.addPage([r.W, r.H])
  placeImage(page, await embedImage(doc, img), r)

  const proj = makeProjector(bbox, r)
  const title = formatTitle(quad, box.label, s.title)
  if (s.grid.grat.on) drawGraticule(page, r, bbox, proj, fonts, mono, s.grid.grat)
  if (s.grid.utm.on) drawUtmGrid(page, r, bbox, s.scale, proj, fonts, s.grid.utm)
  drawScaleBars(page, r, s.scale, fonts)
  drawFooterTitle(page, r, title, fonts)
  drawDeclination(page, r, decl, fonts, mono)
  if (box.label) drawAdjoining(page, r, box.label, box.adj ?? {}, fonts)
}

/** Index page: a small-scale map of the whole selection with every sheet
 *  outlined and labelled, so you can see how the printouts tile together. */
async function renderOverview(doc, s, fonts, cache, ctx) {
  const boxes = s.boxes
  const mono = s.color_mode !== 'color'
  const minLon = Math.min(...boxes.map((b) => b.min_lon))
  const minLat = Math.min(...boxes.map((b) => b.min_lat))
  const maxLon = Math.max(...boxes.map((b) => b.max_lon))
  const maxLat = Math.max(...boxes.map((b) => b.max_lat))
  // Pad the union so edge sheets aren't flush against the neatline.
  const padLon = (maxLon - minLon) * 0.04 || 0.01
  const padLat = (maxLat - minLat) * 0.04 || 0.01
  const bbox = [minLon - padLon, minLat - padLat, maxLon + padLon, maxLat + padLat]

  const avail = mapRectFor(s.paper, s.orientation)
  // Fit the union's Mercator extent into the available area, keeping aspect.
  const nw = lonLatToMerc(bbox[0], bbox[3])
  const se = lonLatToMerc(bbox[2], bbox[1])
  const mw = se.x - nw.x
  const mh = nw.y - se.y
  const fit = Math.min(avail.width / mw, avail.height / mh)
  const mapW = mw * fit
  const mapH = mh * fit
  const cx = (avail.x0 + avail.x1) / 2
  const cy = (avail.y0 + avail.y1) / 2
  const r = {
    W: avail.W, H: avail.H,
    x0: cx - mapW / 2, x1: cx + mapW / 2, y0: cy - mapH / 2, y1: cy + mapH / 2,
    width: mapW, height: mapH,
  }

  const outW = Math.max(1, Math.round((r.width / 72) * s.dpi))
  const outH = Math.max(1, Math.round((r.height / 72) * s.dpi))
  const resTarget = mw / outW // mercator metres per output pixel
  const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(Math.log2((2 * MERC_MAX) / (256 * resTarget)))))

  const img = await renderBoxImage(bbox, z, outW, outH, cache, s.color_mode, ctx.signal, ctx.onTile)
  const page = doc.addPage([r.W, r.H])
  placeImage(page, await embedImage(doc, img), r)

  const proj = makeProjector(bbox, r)
  const accent = mono ? BLACK : ACCENT
  for (const b of boxes) {
    const p0 = proj(b.min_lon, b.max_lat)
    const p1 = proj(b.max_lon, b.min_lat)
    const w = p1.x - p0.x
    const h = p0.y - p1.y
    page.drawRectangle({ x: p0.x, y: p1.y, width: w, height: h, borderColor: accent, borderWidth: 1 })
    if (b.label) {
      const fs = Math.min(12, Math.max(5.5, h * 0.45))
      centeredText(page, b.label, p0.x + w / 2, p1.y + h / 2 - fs * 0.35, fs, fonts.bold, accent)
    }
  }
  const cap = `${s.title || 'Sheet Index'}  ·  ${boxes.length} sheets`
  centeredText(page, cap, (r.x0 + r.x1) / 2, r.y0 - 22, 10, fonts.bold)
}

// --- Public entry points ----------------------------------------------------

/** Validate and clamp a request spec; throws Error with a user-facing message. */
export function normalizeSpec(spec) {
  const boxes = Array.isArray(spec.boxes) ? spec.boxes : []
  if (!boxes.length) throw new Error('no map areas selected')
  if (boxes.length > MAX_PAGES) {
    throw new Error(`too many pages selected (${boxes.length}); max is ${MAX_PAGES}`)
  }
  const DIRS = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']
  const clean = boxes.map((b) => {
    const box = {
      min_lon: Number(b.min_lon), min_lat: Number(b.min_lat),
      max_lon: Number(b.max_lon), max_lat: Number(b.max_lat),
    }
    if (
      !Object.values(box).every(Number.isFinite) ||
      box.min_lon >= box.max_lon || box.min_lat >= box.max_lat
    ) {
      throw new Error('malformed box geometry')
    }
    if (b.label) box.label = String(b.label).slice(0, 4)
    if (b.adj && typeof b.adj === 'object') {
      box.adj = {}
      for (const d of DIRS) if (b.adj[d]) box.adj[d] = String(b.adj[d]).slice(0, 4)
    }
    return box
  })

  const scale = Number(spec.scale ?? 24000)
  if (!SCALES.includes(scale)) throw new Error(`scale must be one of ${SCALES.join(', ')}`)
  const dpi = Number(spec.dpi ?? 200)
  if (!DPIS.includes(dpi)) throw new Error(`dpi must be one of ${DPIS.join(', ')}`)
  const paper = String(spec.paper ?? 'letter').toLowerCase()
  if (!PAPERS.includes(paper)) throw new Error("paper must be 'letter' or 'a4'")
  const orientation = String(spec.orientation ?? 'portrait').toLowerCase()
  if (!ORIENTATIONS.includes(orientation)) throw new Error("orientation must be 'portrait' or 'landscape'")
  const color_mode = String(spec.color_mode ?? 'color').toLowerCase()
  if (!COLOR_MODES.includes(color_mode)) throw new Error("color_mode must be 'color', 'gray' or 'bw'")
  const title = spec.title == null ? null : String(spec.title).trim().slice(0, 80) || null
  // The index page only makes sense for multi-sheet jobs.
  const overview = (spec.overview ?? true) && clean.length > 1
  const grid = normalizeGrid(spec.grid)

  const tiles = planTileCount(clean, scale, dpi)
  if (tiles > TILE_BUDGET) {
    throw new Error(
      `this selection needs ~${tiles} map tiles (limit ${TILE_BUDGET}). ` +
        'Select fewer pages or lower the DPI/scale.',
    )
  }
  return { boxes: clean, scale, dpi, paper, orientation, color_mode, title, overview, grid, tiles }
}

/** Number of PDF pages a normalized spec produces. */
export function pageCount(s) {
  return s.boxes.length + (s.overview ? 1 : 0)
}

/**
 * Render the spec to PDF bytes. `onProgress(done, total)` fires after each page
 * (and `onTile()` after each tile, for finer progress); `signal` aborts the job.
 * The tile cache is cleared between pages so peak memory stays per-page.
 */
export async function renderPdf(spec, { onProgress, onTile, signal } = {}) {
  const s = normalizeSpec(spec)
  const total = pageCount(s)
  const ctx = { signal, onTile }
  const throwIfAborted = () => {
    if (signal?.aborted) throw signal.reason
  }

  const doc = await PDFDocument.create()
  doc.setTitle(s.title || 'US Topo maps')
  doc.setProducer('ReelKnot Print Maps')
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  }

  const cache = new TileCache()
  let done = 0
  onProgress?.(0, total)
  // Fail in seconds, not minutes, when the browser can't reach the tile service.
  await resolveTileSource(signal)
  try {
    if (s.overview) {
      throwIfAborted()
      await renderOverview(doc, s, fonts, cache, ctx)
      cache.clear()
      onProgress?.(++done, total)
    }
    for (const box of s.boxes) {
      throwIfAborted()
      await renderSheet(doc, box, s, fonts, cache, ctx)
      cache.clear()
      onProgress?.(++done, total)
    }
    return await doc.save()
  } finally {
    cache.clear()
  }
}
