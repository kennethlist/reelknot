// Best-effort online lookups for the marginalia. Both services send
// Access-Control-Allow-Origin: * so the browser can call them directly.
// Each returns null on any failure; a sheet still renders without them.

const NOAA_URL = 'https://www.ngdc.noaa.gov/geomag-web/calculators/calculateDeclination'
// US Topo quad index (layer 2 = "Index of Available Maps"): cell name + year.
const TOPO_INDEX_URL =
  'https://index.nationalmap.gov/arcgis/rest/services/USTopoAvailability/MapServer/2/query'

/** A signal that aborts after `ms` or when `parent` aborts, whichever first. */
export function timeoutSignal(ms, parent) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(new DOMException('timeout', 'TimeoutError')), ms)
  const onParent = () => {
    clearTimeout(timer)
    ctl.abort(parent.reason)
  }
  if (parent) {
    if (parent.aborted) onParent()
    else parent.addEventListener('abort', onParent, { once: true })
  }
  ctl.signal.addEventListener('abort', () => {
    clearTimeout(timer)
    parent?.removeEventListener('abort', onParent)
  })
  return ctl.signal
}

/** Magnetic declination in degrees (+ = east) from NOAA's WMM calculator. */
export async function declination(lat, lon, signal) {
  try {
    const q = new URLSearchParams({
      lat1: String(lat), lon1: String(lon), key: 'zNEw7', resultFormat: 'json',
    })
    const res = await fetch(`${NOAA_URL}?${q}`, { signal: timeoutSignal(6000, signal) })
    if (!res.ok) return null
    const data = await res.json()
    const d = Number(data?.result?.[0]?.declination)
    return Number.isFinite(d) ? d : null
  } catch {
    return null
  }
}

/** { name, state, year } for the US Topo quad at the box centre, or null. */
export async function quadInfo(bbox, signal) {
  const clon = (bbox[0] + bbox[2]) / 2
  const clat = (bbox[1] + bbox[3]) / 2
  try {
    const q = new URLSearchParams({
      geometry: `${clon},${clat}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'cell_name,primary_state,pub_yr,file_name_date',
      returnGeometry: 'false',
      f: 'json',
    })
    const res = await fetch(`${TOPO_INDEX_URL}?${q}`, { signal: timeoutSignal(12000, signal) })
    if (!res.ok) return null
    const data = await res.json()
    const feats = data?.features ?? []
    if (!feats.length) return null
    // Several maps for one cell: prefer the most recent year.
    feats.sort((a, b) =>
      String(b.attributes?.pub_yr ?? '').localeCompare(String(a.attributes?.pub_yr ?? '')),
    )
    const a = feats[0].attributes ?? {}
    let year = a.pub_yr ? String(a.pub_yr) : null
    if (!year && a.file_name_date) {
      const y = new Date(Number(a.file_name_date)).getUTCFullYear()
      if (Number.isFinite(y)) year = String(y)
    }
    return { name: a.cell_name ?? null, state: a.primary_state ?? null, year }
  } catch {
    return null
  }
}
