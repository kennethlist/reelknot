// Geodesy for Print Maps: Web-Mercator, UTM, tile zoom choice and the printed
// page footprint. Ported from reelcompass web/print_maps.py and
// frontend/src/lib/coordinates.ts so sheets come out identical.

export const R = 6378137.0 // WGS84 / Web-Mercator sphere radius (m)
export const MERC_MAX = Math.PI * R // 20037508.342789244
export const EARTH_CIRC = 2.0 * Math.PI * R
export const INCH_M = 0.0254
export const PT_PER_IN = 72.0

// US Topo raster content caps around zoom 16; finer scales get upsampled.
export const MAX_ZOOM = 16
export const MIN_ZOOM = 10

// Paper full-sheet size in PDF points, portrait.
export const PAPER_PT = {
  letter: [612.0, 792.0], // 8.5 x 11 in
  a4: [595.28, 841.89], // 210 x 297 mm
}

// Marginalia frame (points). Top is slim (graticule labels only); bottom holds
// scale bars, title, declination and the adjoining-sheets key; sides hold
// graticule and UTM labels.
export const MARGIN = { top: 22.0, bottom: 72.0, left: 43.2, right: 43.2 }

const rad = (d) => (d * Math.PI) / 180
const deg = (r) => (r * 180) / Math.PI

/** Page size in points for the paper/orientation, as [width, height]. */
export function pageSizePt(paper, orientation) {
  let [w, h] = PAPER_PT[paper] ?? PAPER_PT.letter
  if (orientation === 'landscape') [w, h] = [h, w]
  return [w, h]
}

/** Lon/lat (deg) -> Web-Mercator meters (EPSG:3857). */
export function lonLatToMerc(lon, lat) {
  const clamped = Math.max(Math.min(lat, 89.9), -89.9)
  return {
    x: rad(lon) * R,
    y: R * Math.log(Math.tan(Math.PI / 4 + rad(clamped) / 2)),
  }
}

/** Web-Mercator meters -> lon/lat (deg). */
export function mercToLonLat(x, y) {
  return {
    lon: deg(x / R),
    lat: deg(2 * Math.atan(Math.exp(y / R)) - Math.PI / 2),
  }
}

/** Web-Mercator meters -> global pixel coords at tile zoom z (256 px tiles). */
export function mercToGlobalPx(x, y, z) {
  const world = 256.0 * 2 ** z
  return {
    px: ((x + MERC_MAX) / (2 * MERC_MAX)) * world,
    py: ((MERC_MAX - y) / (2 * MERC_MAX)) * world,
  }
}

/**
 * Tile zoom whose ground resolution best matches the print target. The required
 * output resolution is INCH_M * scale / dpi metres per output pixel; a tile pixel
 * at zoom z and latitude lat covers EARTH_CIRC * cos(lat) / (256 * 2^z) metres.
 * Rounded in log space, then clamped to the source's useful range.
 */
export function chooseZoom(scale, dpi, lat) {
  const resTarget = (INCH_M * scale) / dpi
  const cosLat = Math.max(Math.cos(rad(lat)), 1e-6)
  const z = Math.round(Math.log2((EARTH_CIRC * cosLat) / (256.0 * resTarget)))
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))
}

/**
 * Mercator span (metres) of one printed page's map area at the given
 * scale/paper/orientation, at latitude lat (mercator scale factor 1/cos lat).
 * Independent of DPI. Defines the on-screen selection cells.
 */
export function pageFootprintMerc(scale, paper, orientation, lat) {
  const [w, h] = pageSizePt(paper, orientation)
  const contentW = (w - MARGIN.left - MARGIN.right) / PT_PER_IN
  const contentH = (h - MARGIN.top - MARGIN.bottom) / PT_PER_IN
  const cos = Math.max(Math.cos(rad(lat)), 1e-6)
  return {
    mercW: (contentW * INCH_M * scale) / cos,
    mercH: (contentH * INCH_M * scale) / cos,
  }
}

// --- UTM (WGS84 transverse Mercator) ---------------------------------------
const A = 6378137.0
const F = 1 / 298.257223563
const K0 = 0.9996
const E2 = 2 * F - F * F
const EP2 = E2 / (1 - E2)

/** Lat/lon -> { zone, band, easting, northing }. */
export function latLonToUtm(lat, lon) {
  let zone = Math.floor((lon + 180) / 6) + 1
  if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) zone = 32
  if (lat >= 72 && lat < 84) {
    if (lon >= 0 && lon < 9) zone = 31
    else if (lon >= 9 && lon < 21) zone = 33
    else if (lon >= 21 && lon < 33) zone = 35
    else if (lon >= 33 && lon < 42) zone = 37
  }
  const lonOrigin = (zone - 1) * 6 - 180 + 3
  const latR = rad(lat)
  const lonR = rad(lon - lonOrigin)
  const sinLat = Math.sin(latR)
  const cosLat = Math.cos(latR)
  const tanLat = Math.tan(latR)

  const N = A / Math.sqrt(1 - E2 * sinLat * sinLat)
  const T = tanLat * tanLat
  const C = EP2 * cosLat * cosLat
  const a = cosLat * lonR
  const M =
    A *
    ((1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 * E2 * E2) / 256) * latR -
      ((3 * E2) / 8 + (3 * E2 * E2) / 32 + (45 * E2 * E2 * E2) / 1024) * Math.sin(2 * latR) +
      ((15 * E2 * E2) / 256 + (45 * E2 * E2 * E2) / 1024) * Math.sin(4 * latR) -
      ((35 * E2 * E2 * E2) / 3072) * Math.sin(6 * latR))
  const a2 = a * a
  const a3 = a2 * a
  const a4 = a2 * a2
  const a5 = a4 * a
  const a6 = a4 * a2
  const easting =
    K0 * N * (a + ((1 - T + C) * a3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * a5) / 120) +
    500000
  let northing =
    K0 *
    (M +
      N *
        tanLat *
        (a2 / 2 +
          ((5 - T + 9 * C + 4 * C * C) * a4) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * a6) / 720))
  if (lat < 0) northing += 10000000
  const letters = 'CDEFGHJKLMNPQRSTUVWX'
  const band = letters[Math.min(Math.max(Math.floor((lat + 80) / 8), 0), 19)]
  return { zone, band, easting, northing }
}

/** Inverse UTM -> { lat, lon }. Used to walk UTM gridlines back to lat/lon. */
export function utmToLatLon(zone, northern, easting, northing) {
  const x = easting - 500000
  const y = northern ? northing : northing - 10000000
  const lonOrigin = (zone - 1) * 6 - 180 + 3

  const M = y / K0
  const mu = M / (A * (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 * E2 * E2) / 256))
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2))
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu)
  const sinP = Math.sin(phi1)
  const cosP = Math.cos(phi1)
  const tanP = sinP / cosP
  const N1 = A / Math.sqrt(1 - E2 * sinP * sinP)
  const T1 = tanP * tanP
  const C1 = EP2 * cosP * cosP
  const R1 = (A * (1 - E2)) / (1 - E2 * sinP * sinP) ** 1.5
  const D = x / (N1 * K0)
  const D2 = D * D
  const D3 = D2 * D
  const D4 = D2 * D2
  const D5 = D4 * D
  const D6 = D4 * D2
  const lat =
    phi1 -
    ((N1 * tanP) / R1) *
      (D2 / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D6) / 720)
  const lon =
    lonOrigin +
    deg(
      (D -
        ((1 + 2 * T1 + C1) * D3) / 6 +
        ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D5) / 120) /
        cosP,
    )
  return { lat: deg(lat), lon }
}

// --- Marginalia helpers ----------------------------------------------------

/** Degrees -> DMS label like 40°01'N or 105°15'30"W (seconds only if non-zero). */
export function fmtDms(value, isLat) {
  const hemi = isLat ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W'
  const totalSec = Math.round(Math.abs(value) * 3600) // round first, then carry
  const d = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const mm = String(m).padStart(2, '0')
  if (s === 0) return `${d}°${mm}'${hemi}`
  return `${d}°${mm}'${String(s).padStart(2, '0')}"${hemi}`
}

/** Graticule spacing (degrees) giving at least two lines across `span` degrees. */
export function gratStepDeg(span) {
  for (const minutes of [60, 30, 15, 10, 5, 2, 1, 0.5, 0.25]) {
    if (span / (minutes / 60) >= 2) return minutes / 60
  }
  return 0.25 / 60
}

/** Largest 'nice' value (1 / 2 / 2.5 / 5 x 10^k) that is <= v. */
export function niceBelow(v) {
  if (v <= 0) return 0
  const base = 10 ** Math.floor(Math.log10(v))
  for (const m of [5, 2.5, 2, 1]) {
    if (m * base <= v + 1e-9) return m * base
  }
  return base
}

/** Liang-Barsky clip of segment p0->p1 to rect {x0,y0,x1,y1}; null if outside. */
export function clipSegment(p0, p1, rect) {
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  let t0 = 0
  let t1 = 1
  const checks = [
    [-dx, p0.x - rect.x0],
    [dx, rect.x1 - p0.x],
    [-dy, p0.y - rect.y0],
    [dy, rect.y1 - p0.y],
  ]
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return null
      continue
    }
    const r = q / p
    if (p < 0) {
      if (r > t1) return null
      if (r > t0) t0 = r
    } else {
      if (r < t0) return null
      if (r < t1) t1 = r
    }
  }
  return [
    { x: p0.x + t0 * dx, y: p0.y + t0 * dy },
    { x: p0.x + t1 * dx, y: p0.y + t1 * dy },
  ]
}
