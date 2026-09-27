import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { computeCells, assignCodes, buildLabelledBoxes, MAX_PAGES } from './grid.js'
import { renderPdf } from './render.js'
import { TILE_URL_TEMPLATE, PROXY_URL_TEMPLATE, resolveTileSource } from './tiles.js'

const VIEW_KEY = 'reelknot.maps.view'
const DEFAULT_VIEW = { center: [39.8, -98.6], zoom: 5 }

// Every user setting in the sidebar; persisted and disabled while rendering.
const CONTROL_IDS = [
  'scale', 'paper', 'orientation', 'dpi', 'colorMode', 'title', 'overview',
  'gratOn', 'gratStyle', 'gratOpacity', 'gratWeight',
  'utmOn', 'utmStyle', 'utmOpacity', 'utmWeight',
]

const els = Object.fromEntries(
  [
    ...CONTROL_IDS, 'bwHint', 'scaleHint', 'count', 'generate', 'clear', 'progress',
    'progressLabel', 'progressCount', 'progressBar', 'cancel', 'status', 'tooMany', 'result',
    'resultInfo', 'resultDownload', 'resultClose', 'resultFrame',
  ].map((id) => [id, document.getElementById(id)]),
)

// --- Settings persistence ---------------------------------------------------

const SETTINGS_KEY = 'reelknot.maps.settings'

function controlValue(el) {
  return el.type === 'checkbox' ? el.checked : el.value
}

function saveSettings() {
  try {
    const data = Object.fromEntries(CONTROL_IDS.map((id) => [id, controlValue(els[id])]))
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(data))
  } catch { /* ignore */ }
}

function restoreSettings() {
  let data
  try {
    data = JSON.parse(localStorage.getItem(SETTINGS_KEY))
  } catch { /* ignore */ }
  if (!data) return
  for (const id of CONTROL_IDS) {
    const el = els[id]
    if (!(id in data)) continue
    if (el.type === 'checkbox') el.checked = Boolean(data[id])
    else if (el.tagName === 'SELECT') {
      if ([...el.options].some((o) => o.value === String(data[id]))) el.value = String(data[id])
    } else el.value = String(data[id])
  }
}

restoreSettings()

function gridSettings() {
  const read = (k) => ({
    on: els[`${k}On`].checked,
    style: els[`${k}Style`].value,
    opacity: Number(els[`${k}Opacity`].value),
    weight: els[`${k}Weight`].value,
  })
  return { grat: read('grat'), utm: read('utm') }
}

// Grey out a grid's style controls while that grid is off.
function syncGridRows() {
  for (const row of document.querySelectorAll('.subrow[data-for]')) {
    const on = els[row.dataset.for].checked
    for (const sel of row.querySelectorAll('select')) sel.disabled = busy || !on
  }
}

// --- Map --------------------------------------------------------------------

function loadView() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY))
    if (v && Array.isArray(v.center) && Number.isFinite(v.zoom)) return v
  } catch { /* ignore */ }
  return DEFAULT_VIEW
}

const view = loadView()
const map = L.map('map').setView(view.center, view.zoom)
// Live USGS US Topo so the preview matches the PDF output.
const topoLayer = L.tileLayer(TILE_URL_TEMPLATE, {
  maxNativeZoom: 16,
  maxZoom: 17,
  attribution: 'USGS The National Map',
}).addTo(map)
// If the browser can't reach USGS directly, route the preview through the
// same-origin proxy too (the PDF renderer makes the same choice).
resolveTileSource()
  .then((source) => {
    if (source === 'proxy') topoLayer.setUrl(PROXY_URL_TEMPLATE)
  })
  .catch((e) => setStatus(e.message, 'error'))

map.on('moveend', () => {
  try {
    const c = map.getCenter()
    localStorage.setItem(VIEW_KEY, JSON.stringify({ center: [c.lat, c.lng], zoom: map.getZoom() }))
  } catch { /* ignore */ }
})

// --- Selection grid ---------------------------------------------------------

const CELL_STYLE = { color: '#6366f1', weight: 0.5, opacity: 0.35, fillOpacity: 0.03 }
const SEL_STYLE = { color: '#6366f1', weight: 1.2, fillColor: '#6366f1', fillOpacity: 0.35 }

const gridLayer = L.layerGroup().addTo(map)
const selected = new Map() // cell key -> box
let codes = new Map() // cell key -> sheet code

function footprintSettings() {
  return {
    scale: Number(els.scale.value),
    paper: els.paper.value,
    orientation: els.orientation.value,
  }
}

function redrawGrid() {
  const b = map.getBounds()
  const { scale, paper, orientation } = footprintSettings()
  const { cells, tooMany } = computeCells(
    { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
    scale, paper, orientation,
  )
  gridLayer.clearLayers()
  for (const cell of cells) {
    const isSel = selected.has(cell.key)
    const rect = L.rectangle(cell.bounds, isSel ? SEL_STYLE : CELL_STYLE)
    rect.on('click', () => toggle(cell))
    const code = codes.get(cell.key)
    if (code) {
      rect.bindTooltip(code, { permanent: true, direction: 'center', className: 'print-sheet-code' })
    }
    rect.addTo(gridLayer)
  }
  els.tooMany.hidden = !tooMany
}

function syncSelectionUi() {
  codes = assignCodes(Array.from(selected.keys()))
  const n = selected.size
  els.count.textContent = `${n} / ${MAX_PAGES}`
  els.count.classList.toggle('over', n > MAX_PAGES)
  els.generate.disabled = busy || n === 0
  els.clear.disabled = busy || n === 0
  els.overview.disabled = n < 2
  redrawGrid()
}

function toggle(cell) {
  if (busy) return
  if (selected.has(cell.key)) {
    selected.delete(cell.key)
  } else {
    if (selected.size >= MAX_PAGES) {
      setStatus(`Maximum ${MAX_PAGES} pages per PDF`, 'warn')
      return
    }
    selected.set(cell.key, cell.box)
  }
  syncSelectionUi()
}

function clearSelection() {
  selected.clear()
  syncSelectionUi()
}

map.on('moveend zoomend', redrawGrid)

// Changing the footprint invalidates existing cell geometry: clear the selection.
for (const el of [els.scale, els.paper, els.orientation]) {
  el.addEventListener('input', () => {
    clearSelection()
    els.scaleHint.hidden = els.scale.value !== '10000'
  })
}
els.colorMode.addEventListener('input', () => {
  els.bwHint.hidden = els.colorMode.value !== 'bw'
})
els.clear.addEventListener('click', clearSelection)
for (const id of ['gratOn', 'utmOn']) els[id].addEventListener('input', syncGridRows)
document.getElementById('sidebar').addEventListener('input', saveSettings)

// --- Status + progress ------------------------------------------------------

let busy = false
let controller = null

function setStatus(msg, kind = '') {
  els.status.textContent = msg ?? ''
  els.status.className = `status ${kind}`
  els.status.hidden = !msg
}

function setBusy(v) {
  busy = v
  els.progress.hidden = !v
  els.generate.textContent = v ? 'Generating…' : 'Generate PDF'
  for (const id of CONTROL_IDS) els[id].disabled = v
  syncGridRows()
  syncSelectionUi()
}

function setProgress(done, total, tilesDone) {
  els.progressCount.textContent = `${done} / ${total}`
  els.progressBar.style.width = `${total ? (done / total) * 100 : 0}%`
  els.progressLabel.textContent = tilesDone ? `Rendering sheets… (${tilesDone} tiles)` : 'Rendering sheets…'
}

// Anything that escapes the generate flow still lands in the status line, so a
// failure never looks like a silent hang.
window.addEventListener('error', (e) => setStatus(`Error: ${e.message}`, 'error'))
window.addEventListener('unhandledrejection', (e) => {
  setStatus(`Error: ${e.reason?.message ?? e.reason}`, 'error')
})

// --- Result preview ---------------------------------------------------------

let resultUrl = null
let resultBytes = null

function showResult(bytes, pages, ms) {
  if (resultUrl) URL.revokeObjectURL(resultUrl)
  resultBytes = bytes
  resultUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  els.resultFrame.src = `${resultUrl}#view=Fit`
  const mb = (bytes.length / 1048576).toFixed(1)
  els.resultInfo.textContent = `topo_maps.pdf — ${pages} page${pages === 1 ? '' : 's'}, ${mb} MB, ${(ms / 1000).toFixed(0)} s`
  els.result.hidden = false
}

function download() {
  if (!resultUrl) return
  const a = document.createElement('a')
  a.href = resultUrl
  a.download = 'topo_maps.pdf'
  a.click()
}

els.resultDownload.addEventListener('click', download)
els.resultClose.addEventListener('click', () => {
  els.result.hidden = true
  map.invalidateSize()
})

// --- Generate ---------------------------------------------------------------

els.generate.addEventListener('click', async () => {
  if (busy) return
  if (selected.size === 0) {
    setStatus('Select at least one area on the map', 'warn')
    return
  }
  const spec = {
    boxes: buildLabelledBoxes(selected),
    ...footprintSettings(),
    dpi: Number(els.dpi.value),
    color_mode: els.colorMode.value,
    title: els.title.value.trim() || undefined,
    overview: els.overview.checked,
    grid: gridSettings(),
  }
  controller = new AbortController()
  els.result.hidden = true
  setStatus('')
  setBusy(true)
  setProgress(0, spec.boxes.length, 0)
  let tiles = 0
  let pages = [0, spec.boxes.length]
  const t0 = Date.now()
  try {
    const bytes = await renderPdf(spec, {
      signal: controller.signal,
      onProgress: (done, total) => {
        pages = [done, total]
        setProgress(done, total, tiles)
      },
      onTile: () => setProgress(pages[0], pages[1], ++tiles),
    })
    showResult(bytes, pages[1], Date.now() - t0)
    download()
    setStatus('Map PDF generated', 'ok')
  } catch (e) {
    if (controller.signal.aborted) setStatus('Cancelled', 'warn')
    else setStatus(`Could not generate the map PDF: ${e?.message ?? e}`, 'error')
  } finally {
    controller = null
    setBusy(false)
  }
})

els.cancel.addEventListener('click', () => controller?.abort(new DOMException('cancelled', 'AbortError')))

// Initial hint/row state after restoring persisted settings.
els.scaleHint.hidden = els.scale.value !== '10000'
els.bwHint.hidden = els.colorMode.value !== 'bw'
syncGridRows()
syncSelectionUi()
