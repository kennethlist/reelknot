import { generateBooklet, PAPER_SIZES } from './booklet.js'
import { TEMPLATES, GROUPS } from './templates.js'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Presets fill all eight page slots (and the sheet toggles) in one go; the
// pages can still be changed one at a time afterwards.
const PRESETS = {
  planner: {
    label: 'Planner',
    pages: ['weekSplit', 'address', 'fourWeeksWide', 'ledger', 'ledger', 'lined', 'weekSplit', 'lined'],
    // Page 1 leads with next week; pages 3 and 7 anchor to the current week.
    weeks: ['1', 'auto', '0', 'auto', 'auto', 'auto', '0', 'auto'],
  },
  reference: {
    label: 'Reference',
    pages: ['conversions', 'shopTable', 'tempTable', 'weights', 'speedTable', 'areaSheet', 'kitchenSheet', 'mathSheet'],
    showRuler: true,
  },
  workout: {
    label: 'Workout',
    pages: ['sevenMinB', 'legs', 'stretches', 'taisoA', 'taisoB', 'dumbbellFullA', 'dumbbellFullB', 'sevenMinA'],
  },
  hamRadio: {
    label: 'Ham radio',
    pages: ['radioFreqs', 'phoneticsSheet', 'electronicsSheet', 'lined', 'lined', 'qcodeSheet', 'morseTree', 'electrical'],
  },
  hamLog: {
    label: 'Ham radio log book',
    pages: ['radiolog', 'radiolog', 'radiolog', 'bandPlan', 'phoneticsSheet', 'radiolog', 'radiolog', 'radiolog'],
  },
  knots: {
    label: 'Knots',
    pages: ['ropeKnots', 'ropeKnots2', 'cloveHitch', 'truckersHitch', 'tautLine', 'prusik', 'fishingKnots', 'fishingKnots2'],
    showRuler: true,
  },
}
const DEFAULT_PRESET = 'planner'

const WEEK_CHOICES = [
  ['auto', 'Auto'],
  ['0', 'This week'],
  ['1', 'Next week'],
  ['2', '+2 weeks'],
  ['3', '+3 weeks'],
]

const els = {
  preset: document.getElementById('preset'),
  paper: document.getElementById('paper'),
  title: document.getElementById('title'),
  subtitle: document.getElementById('subtitle'),
  month: document.getElementById('month'),
  year: document.getElementById('year'),
  showGuides: document.getElementById('showGuides'),
  showPageNumbers: document.getElementById('showPageNumbers'),
  showRuler: document.getElementById('showRuler'),
  highContrast: document.getElementById('highContrast'),
  pages: document.getElementById('pages'),
  preview: document.getElementById('preview'),
  download: document.getElementById('download'),
}

for (const [key, { label }] of Object.entries(PAPER_SIZES)) {
  els.paper.add(new Option(label, key))
}
for (const [key, { label }] of Object.entries(PRESETS)) {
  els.preset.add(new Option(label, key))
}
els.preset.add(new Option('Custom', 'custom'))

MONTHS.forEach((name, i) => els.month.add(new Option(name, i)))
const now = new Date()
els.month.value = now.getMonth()
els.year.value = now.getFullYear()

const pageRows = Array.from({ length: 8 }, (_, i) => {
  const row = document.createElement('div')
  row.className = 'field-row'
  const label = document.createElement('label')
  label.textContent = `Page ${i + 1}`
  const select = document.createElement('select')
  for (const group of GROUPS) {
    const optgroup = document.createElement('optgroup')
    optgroup.label = group
    for (const [key, tpl] of Object.entries(TEMPLATES)) {
      if (tpl.group === group) optgroup.append(new Option(tpl.label, key))
    }
    select.append(optgroup)
  }
  // Month picker, shown only for month-calendar templates. 'Auto' continues
  // from the previous calendar page on the sheet.
  const monthSelect = document.createElement('select')
  monthSelect.className = 'page-month'
  monthSelect.add(new Option('Auto', 'auto'))
  MONTHS.forEach((name, m) => monthSelect.add(new Option(name.slice(0, 3), m)))
  monthSelect.value = 'auto'
  monthSelect.addEventListener('input', scheduleUpdate)
  // Week picker for week-based templates ('Auto' continues from the
  // previous week page; explicit choices are offsets from the current week).
  const weekSelect = document.createElement('select')
  weekSelect.className = 'page-month'
  for (const [value, text] of WEEK_CHOICES) {
    weekSelect.add(new Option(text, value))
  }
  weekSelect.addEventListener('input', scheduleUpdate)
  const syncPickerVisibility = () => {
    monthSelect.style.display = TEMPLATES[select.value]?.usesMonth ? '' : 'none'
    weekSelect.style.display = TEMPLATES[select.value]?.usesWeek ? '' : 'none'
  }
  select.addEventListener('input', () => {
    syncPickerVisibility()
    els.preset.value = 'custom'
    scheduleUpdate()
  })
  row.append(label, select, monthSelect, weekSelect)
  els.pages.append(row)
  return { select, monthSelect, weekSelect, syncPickerVisibility }
})

function applyPreset(key) {
  const preset = PRESETS[key]
  if (!preset) return
  pageRows.forEach((r, i) => {
    r.select.value = preset.pages[i]
    r.monthSelect.value = preset.months?.[i] ?? 'auto'
    r.weekSelect.value = preset.weeks?.[i] ?? 'auto'
    r.syncPickerVisibility()
  })
  els.showRuler.checked = Boolean(preset.showRuler)
}

els.preset.value = DEFAULT_PRESET
applyPreset(DEFAULT_PRESET)
els.preset.addEventListener('input', () => {
  applyPreset(els.preset.value)
  scheduleUpdate()
})

function readSettings() {
  // Sunday of the current week; week pages advance from here.
  const today = new Date()
  const sunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay())
  return {
    weekStart: sunday.getTime(),
    paper: els.paper.value,
    title: els.title.value,
    subtitle: els.subtitle.value,
    month: Number(els.month.value),
    year: Number(els.year.value) || now.getFullYear(),
    showGuides: els.showGuides.checked,
    showPageNumbers: els.showPageNumbers.checked,
    showRuler: els.showRuler.checked,
    highContrast: els.highContrast.checked,
    pages: pageRows.map((r) => r.select.value),
    pageMonths: pageRows.map((r) => r.monthSelect.value),
    pageWeeks: pageRows.map((r) => r.weekSelect.value),
  }
}

let currentUrl = null
let currentBytes = null

async function update() {
  currentBytes = await generateBooklet(readSettings())
  const blob = new Blob([currentBytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  els.preview.src = `${url}#view=Fit`
  if (currentUrl) URL.revokeObjectURL(currentUrl)
  currentUrl = url
}

let timer = null
function scheduleUpdate() {
  clearTimeout(timer)
  timer = setTimeout(() => update().catch(console.error), 150)
}

for (const el of [els.paper, els.title, els.subtitle, els.month, els.year, els.showGuides, els.showPageNumbers, els.showRuler, els.highContrast]) {
  el.addEventListener('input', scheduleUpdate)
}

els.download.addEventListener('click', () => {
  if (!currentBytes) return
  const blob = new Blob([currentBytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'booklet.pdf'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
})

update().catch(console.error)
