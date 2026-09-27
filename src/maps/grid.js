// Selection grid: page-footprint cells over the map viewport, sheet codes and
// the labelled box payload the renderer consumes. Ported from reelcompass
// frontend/src/pages/PrintMaps.tsx.
import { MERC_MAX, lonLatToMerc, mercToLonLat, pageFootprintMerc } from './geo.js'

// Keep in lock-step with the limits in render.js.
export const MAX_PAGES = 100
export const MAX_VISIBLE_CELLS = 350

/**
 * Page-footprint cells covering `bounds` ({west,south,east,north} in degrees),
 * snapped to the global Web-Mercator grid at a whole-degree reference latitude
 * so the cells stay put while panning.
 */
export function computeCells(bounds, scale, paper, orientation) {
  const refLat = Math.round((bounds.north + bounds.south) / 2)
  const { mercW, mercH } = pageFootprintMerc(scale, paper, orientation, refLat)
  const sw = lonLatToMerc(bounds.west, bounds.south)
  const ne = lonLatToMerc(bounds.east, bounds.north)

  const iMin = Math.floor((sw.x + MERC_MAX) / mercW)
  const iMax = Math.floor((ne.x + MERC_MAX) / mercW)
  const jMin = Math.floor((MERC_MAX - ne.y) / mercH)
  const jMax = Math.floor((MERC_MAX - sw.y) / mercH)

  const count = (iMax - iMin + 1) * (jMax - jMin + 1)
  if (count <= 0 || count > MAX_VISIBLE_CELLS) {
    return { cells: [], tooMany: count > MAX_VISIBLE_CELLS }
  }

  const cells = []
  for (let i = iMin; i <= iMax; i++) {
    for (let j = jMin; j <= jMax; j++) {
      const xW = -MERC_MAX + i * mercW
      const yN = MERC_MAX - j * mercH
      const nw = mercToLonLat(xW, yN)
      const se = mercToLonLat(xW + mercW, yN - mercH)
      cells.push({
        key: `${refLat}:${i}:${j}`,
        box: { min_lon: nw.lon, min_lat: se.lat, max_lon: se.lon, max_lat: nw.lat },
        // Leaflet bounds: [[south, west], [north, east]]
        bounds: [
          [se.lat, nw.lon],
          [nw.lat, se.lon],
        ],
      })
    }
  }
  return { cells, tooMany: false }
}

/**
 * Sheet code for the idx-th selected cell: A..Z while the selection fits in 26,
 * two letters (AA, AB, ...) beyond that so codes never wrap.
 */
export function sheetCode(idx, count) {
  if (count <= 26) return String.fromCharCode(65 + idx)
  return String.fromCharCode(65 + Math.floor(idx / 26)) + String.fromCharCode(65 + (idx % 26))
}

/**
 * Assign each selected cell a code in reading order (north to south, then west
 * to east). Returns Map key -> code; empty for a single selection.
 */
export function assignCodes(keys) {
  const m = new Map()
  if (keys.length <= 1) return m
  const entries = keys.map((key) => {
    const [r, i, j] = key.split(':').map(Number)
    return { key, r, i, j }
  })
  entries.sort((a, b) => a.r - b.r || a.j - b.j || a.i - b.i)
  entries.forEach((e, idx) => m.set(e.key, sheetCode(idx, entries.length)))
  return m
}

const ADJ_DIRS = {
  nw: [-1, -1], n: [0, -1], ne: [1, -1],
  w: [-1, 0], e: [1, 0],
  sw: [-1, 1], s: [0, 1], se: [1, 1],
}

/**
 * Boxes with sheet code + 8-direction neighbour codes, ordered by code so the
 * PDF pages come out A, B, C...  `selected` is a Map of cell key -> box.
 */
export function buildLabelledBoxes(selected) {
  const codes = assignCodes(Array.from(selected.keys()))
  if (codes.size === 0) return Array.from(selected.values())
  return Array.from(selected.entries())
    .map(([key, box]) => {
      const [r, i, j] = key.split(':').map(Number)
      const adj = {}
      for (const [d, [di, dj]] of Object.entries(ADJ_DIRS)) {
        const code = codes.get(`${r}:${i + di}:${j + dj}`)
        if (code) adj[d] = code
      }
      return { ...box, label: codes.get(key), adj }
    })
    .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
}
