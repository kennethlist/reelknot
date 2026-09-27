import {
  rgb,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
  LineCapStyle,
} from 'pdf-lib'
import { ropeKnots, ropeKnots2, tautLine, prusik, cloveHitch, twoHalfHitches, truckersHitch, ropeNotes, fishingKnots, fishingKnots2, fishingKnots3 } from './knots.js'

// All draw functions work in local coordinates: (0,0) is the bottom-left of
// the mini-page, (w,h) the top-right. The imposition layer has already applied
// the transform that places (and possibly rotates) the cell on the sheet.

export const LINE = rgb(0.72, 0.76, 0.8)
export const FAINT = rgb(0.85, 0.88, 0.91)
export const INK = rgb(0.15, 0.17, 0.2)
export const BLACK = rgb(0, 0, 0)
export const WHITE = rgb(1, 1, 1)
export const MARGIN = 16
// Height of the strip the optional sheet ruler occupies along a page's bottom.
export const RULER_BAND = 22

// Label bands (day tabs, header rows) are normally dark text on a gray fill;
// high-contrast mode swaps them to white text on black.
function bandColors(settings) {
  return settings?.highContrast ? { bg: BLACK, fg: WHITE } : { bg: FAINT, fg: INK }
}

function blank() {}

function lined({ page, w, h }, spacing = 16) {
  for (let y = MARGIN + 4; y <= h - MARGIN; y += spacing) {
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: w - MARGIN, y },
      thickness: 0.5,
      color: LINE,
    })
  }
}

function dotgrid({ page, w, h }) {
  const spacing = 12
  const cols = Math.floor((w - 2 * MARGIN) / spacing)
  const rows = Math.floor((h - 2 * MARGIN) / spacing)
  const x0 = (w - cols * spacing) / 2
  const y0 = (h - rows * spacing) / 2
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      page.drawCircle({
        x: x0 + c * spacing,
        y: y0 + r * spacing,
        size: 0.7,
        color: LINE,
      })
    }
  }
}

function grid({ page, w, h }) {
  const spacing = 12
  const cols = Math.floor((w - 2 * MARGIN) / spacing)
  const rows = Math.floor((h - 2 * MARGIN) / spacing)
  const x0 = (w - cols * spacing) / 2
  const y0 = (h - rows * spacing) / 2
  for (let r = 0; r <= rows; r++) {
    page.drawLine({
      start: { x: x0, y: y0 + r * spacing },
      end: { x: x0 + cols * spacing, y: y0 + r * spacing },
      thickness: 0.4,
      color: FAINT,
    })
  }
  for (let c = 0; c <= cols; c++) {
    page.drawLine({
      start: { x: x0 + c * spacing, y: y0 },
      end: { x: x0 + c * spacing, y: y0 + rows * spacing },
      thickness: 0.4,
      color: FAINT,
    })
  }
}

function checklist({ page, w, h }) {
  const spacing = 22
  const box = 8
  // Top rule closes off the first row's writing band; starts after the
  // checkbox column like every other row line.
  page.drawLine({
    start: { x: MARGIN + box + 8, y: h - MARGIN },
    end: { x: w - MARGIN, y: h - MARGIN },
    thickness: 0.5,
    color: LINE,
  })
  for (let y = h - MARGIN - spacing; y >= MARGIN; y -= spacing) {
    // Center the box in the writing band between this rule and the one above.
    page.drawRectangle({
      x: MARGIN,
      y: y + spacing / 2 - box / 2,
      width: box,
      height: box,
      borderWidth: 0.8,
      borderColor: LINE,
    })
    page.drawLine({
      start: { x: MARGIN + box + 8, y },
      end: { x: w - MARGIN, y },
      thickness: 0.5,
      color: LINE,
    })
  }
}

function storyboard({ page, w, h }) {
  const frames = 3
  const gap = 10
  const captionSpace = 16
  const fw = w - 2 * MARGIN
  const fh = (h - 2 * MARGIN - (frames - 1) * gap - frames * captionSpace) / frames
  let top = h - MARGIN
  for (let i = 0; i < frames; i++) {
    page.drawRectangle({
      x: MARGIN,
      y: top - fh,
      width: fw,
      height: fh,
      borderWidth: 0.8,
      borderColor: LINE,
    })
    page.drawLine({
      start: { x: MARGIN, y: top - fh - captionSpace + 4 },
      end: { x: w - MARGIN, y: top - fh - captionSpace + 4 },
      thickness: 0.5,
      color: LINE,
    })
    top -= fh + captionSpace + gap
  }
}

function ledger({ page, w, h, font, bold, settings }, rowH = 15) {
  const { bg, fg } = bandColors(settings)
  // Drawn sideways: turn the booklet 90° clockwise to use the register.
  // Landscape drawing space is (h wide, w tall) mapped onto the portrait cell.
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(0, 1, -1, 0, w, 0))
  const lw = h
  const lh = w

  const left = MARGIN
  const right = lw - MARGIN
  const headerSize = 6
  const top = lh - MARGIN

  const cols = [
    { label: 'Date', width: 27 },
    { label: 'Description', width: 0 }, // flex — fills remaining space
    { label: 'Amount', width: 40 },
    { label: 'Balance', width: 40 },
  ]
  const fixed = cols.reduce((sum, c) => sum + c.width, 0)
  cols[1].width = right - left - fixed

  const headerH = 15
  const headerBase = top - headerH
  page.drawRectangle({
    x: left,
    y: headerBase,
    width: right - left,
    height: headerH,
    color: bg,
  })
  let cx = left
  for (const col of cols) {
    page.drawText(col.label, {
      x: cx + 3,
      y: headerBase + (headerH - headerSize) / 2 + 1,
      size: headerSize,
      font: bold,
      color: fg,
    })
    cx += col.width
  }

  const rows = Math.floor((headerBase - MARGIN) / rowH)
  const bottom = headerBase - rows * rowH
  for (let r = 0; r <= rows; r++) {
    const y = headerBase - r * rowH
    page.drawLine({
      start: { x: left, y },
      end: { x: right, y },
      thickness: 0.4,
      color: LINE,
    })
  }
  cx = left
  for (let c = 0; c <= cols.length; c++) {
    page.drawLine({
      start: { x: cx, y: top },
      end: { x: cx, y: bottom },
      thickness: 0.4,
      color: LINE,
    })
    cx += cols[c]?.width ?? 0
  }
  page.drawLine({
    start: { x: left, y: top },
    end: { x: right, y: top },
    thickness: 0.4,
    color: LINE,
  })
  page.pushOperators(popGraphicsState())
}

// Field-and-rule header used by the contact log: a small bold label with a
// fill-in rule running to the end of the field. width 0 means "flex".
function fillFields({ page, bold }, rows, { left, right, top, lineGap, size = 5.5, gap = 8 }) {
  let y = top - lineGap
  for (const row of rows) {
    const flexCount = row.filter((f) => !f.width).length
    const fixed = row.reduce((sum, f) => sum + (f.width ?? 0), 0)
    const flexW = flexCount ? (right - left - fixed - gap * (row.length - 1)) / flexCount : 0
    let x = left
    for (const field of row) {
      const fw = field.width || flexW
      page.drawText(field.label, { x, y: y + 2, size, font: bold, color: INK })
      page.drawLine({
        start: { x: x + bold.widthOfTextAtSize(field.label, size) + 4, y },
        end: { x: x + fw, y },
        thickness: 0.5,
        color: LINE,
      })
      x += fw + gap
    }
    y -= lineGap
  }
  return y + lineGap
}

// Shared grid for the contact-log tables: header band, row rules, column
// rules. cols entries are { label, width }; the one with width 0 flexes.
function logTable({ page, bold }, cols, { left, right, top, bottom, rowH, headerH = 13, size = 6, bg, fg }) {
  const flex = cols.find((c) => !c.width)
  if (flex) flex.width = right - left - cols.reduce((sum, c) => sum + c.width, 0)

  const headerBase = top - headerH
  page.drawRectangle({
    x: left,
    y: headerBase,
    width: right - left,
    height: headerH,
    color: bg,
  })
  let cx = left
  for (const col of cols) {
    page.drawText(col.label, {
      x: cx + 3,
      y: headerBase + (headerH - size) / 2 + 1,
      size,
      font: bold,
      color: fg,
    })
    cx += col.width
  }

  const rows = Math.floor((headerBase - bottom) / rowH)
  const lastRow = headerBase - rows * rowH
  for (let r = 0; r <= rows; r++) {
    const y = headerBase - r * rowH
    page.drawLine({
      start: { x: left, y },
      end: { x: right, y },
      thickness: 0.4,
      color: LINE,
    })
  }
  cx = left
  for (let c = 0; c <= cols.length; c++) {
    page.drawLine({
      start: { x: cx, y: top },
      end: { x: cx, y: lastRow },
      thickness: 0.4,
      color: LINE,
    })
    cx += cols[c]?.width ?? 0
  }
  page.drawLine({
    start: { x: left, y: top },
    end: { x: right, y: top },
    thickness: 0.4,
    color: LINE,
  })
}

function radiolog({ page, w, h, font, bold, settings }, { rowH = 14, bandColumn = true } = {}) {
  const { bg, fg } = bandColors(settings)
  // Drawn sideways like the ledger: turn the booklet 90 degrees clockwise to
  // use the log. Landscape space is (h wide, w tall) mapped onto the cell.
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(0, 1, -1, 0, w, 0))
  const lw = h
  const lh = w

  const left = MARGIN
  const right = lw - MARGIN
  const top = lh - MARGIN

  // Station block: what stays the same for the whole activation. When the
  // table has no band column, band/mode/frequency are recorded once up here,
  // so the block runs a line longer and tightens to keep the row count.
  const fields = [
    [{ label: 'Date', width: 84 }, { label: 'Grid', width: 74 }, { label: 'Park / SOTA' }],
    [{ label: 'Location' }],
    [{ label: 'Radio / Antenna' }],
  ]
  if (!bandColumn) {
    fields.push([{ label: 'Band', width: 78 }, { label: 'Mode', width: 78 }, { label: 'Freq' }])
  }
  const lastRule = fillFields({ page, bold }, fields, {
    left,
    right,
    top,
    lineGap: bandColumn ? 12 : 11,
  })

  const cols = [
    { label: 'Time', width: 34 },
    { label: 'Callsign', width: 0 }, // flex - fills remaining space
    ...(bandColumn ? [{ label: 'Band / Mode', width: 52 }] : []),
    { label: 'RST S', width: 44 },
    { label: 'RST R', width: 44 },
  ]
  logTable({ page, bold }, cols, {
    left,
    right,
    top: lastRule - 5,
    bottom: MARGIN,
    rowH,
    bg,
    fg,
  })
  page.pushOperators(popGraphicsState())
}

// Rate log: same sideways turn, but a two-line station block and two narrow
// tables side by side - fill the left one top to bottom, then the right.
function radiologCompact({ page, w, h, font, bold, settings }, rowH = 12) {
  const { bg, fg } = bandColors(settings)
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(0, 1, -1, 0, w, 0))
  const lw = h
  const lh = w

  const left = MARGIN
  const right = lw - MARGIN
  const top = lh - MARGIN

  const lastRule = fillFields({ page, bold }, [
    [{ label: 'Date', width: 78 }, { label: 'Grid', width: 66 }, { label: 'Park / SOTA' }],
    [{ label: 'Band', width: 56 }, { label: 'Mode', width: 56 }, { label: 'Radio / Antenna' }],
  ], { left, right, top, lineGap: 12 })

  const gutter = 10
  const halfW = (right - left - gutter) / 2
  for (let i = 0; i < 2; i++) {
    const x = left + i * (halfW + gutter)
    logTable({ page, bold }, [
      { label: 'Time', width: 26 },
      { label: 'Call', width: 0 },
      { label: 'Snt', width: 24 },
      { label: 'Rcv', width: 24 },
    ], {
      left: x,
      right: x + halfW,
      top: lastRule - 5,
      bottom: MARGIN,
      rowH,
      headerH: 11,
      size: 5.5,
      bg,
      fg,
    })
  }
  page.pushOperators(popGraphicsState())
}

function address({ page, w, h, font, bold }, lineGap, blockGap) {
  const left = MARGIN
  const right = w - MARGIN
  const labels = ['Name', 'Address', '', 'Phone / Email']
  const blockH = labels.length * lineGap
  const blocks = Math.floor((h - 2 * MARGIN + blockGap) / (blockH + blockGap))
  let top = h - MARGIN
  for (let b = 0; b < blocks; b++) {
    // A thick rule across the top marks where each contact starts; every
    // writing line sits one full lineGap below the previous rule/line.
    page.drawLine({
      start: { x: left, y: top },
      end: { x: right, y: top },
      thickness: 1.4,
      color: INK,
    })
    let y = top - lineGap
    for (const label of labels) {
      const isName = label === 'Name'
      let lineStart = left
      if (label) {
        page.drawText(label, {
          x: left,
          y: y + 2,
          size: 5.5,
          font: isName ? bold : font,
          color: isName ? INK : LINE,
        })
        lineStart = left + (isName ? bold : font).widthOfTextAtSize(label, 5.5) + 5
      }
      page.drawLine({
        start: { x: lineStart, y },
        end: { x: right, y },
        thickness: 0.5,
        color: LINE,
      })
      y -= lineGap
    }
    top -= blockH + blockGap
  }
}

// Reference sheets: a title, then sections of short lines that flow down the
// left half of the page and continue at the top of the right half. An entry
// is a string, or an array of cells that line up in columns within the
// section (a `head` row, if given, is drawn bold above them).
//
// Only WinAnsi characters survive the standard fonts: degree, superscripts
// and fractions are fine; Greek letters and arrows are not.

export function refSheet({ page, w, h, font, bold }, { title, sections, columns = 2, size = 5.5, lineGap = 7.4, top: startY }) {
  const gutter = 8
  const colW = (w - 2 * MARGIN - gutter * (columns - 1)) / columns
  const sectionGap = 4
  let top = startY ?? h - MARGIN - size
  if (title) {
    page.drawText(title, { x: MARGIN, y: h - MARGIN - 8, size: 8, font: bold, color: INK })
    page.drawLine({
      start: { x: MARGIN, y: h - MARGIN - 12 },
      end: { x: w - MARGIN, y: h - MARGIN - 12 },
      thickness: 0.5,
      color: LINE,
    })
    top = h - MARGIN - 12 - lineGap
  }

  let col = 0
  let y = top
  let overflow = false
  const left = () => MARGIN + col * (colW + gutter)
  const nextLine = (needed = 1) => {
    if (y - (needed - 1) * lineGap >= MARGIN) return true
    col += 1
    y = top
    if (col >= columns) {
      overflow = true
      return false
    }
    return true
  }

  for (const { heading, entries, head } of sections) {
    // Column offsets for tabular entries: widest cell in each column plus a gap.
    const rows = entries.filter(Array.isArray).map((cells) => [cells, font])
    if (head) rows.push([head, bold])
    const widths = []
    for (const [cells, f] of rows) {
      cells.forEach((cell, i) => {
        widths[i] = Math.max(widths[i] ?? 0, f.widthOfTextAtSize(String(cell), size))
      })
    }
    const offsets = [0]
    for (let i = 0; i < widths.length - 1; i++) offsets.push(offsets[i] + widths[i] + 6)
    const drawRow = (cells, f) => {
      cells.forEach((cell, i) => {
        page.drawText(String(cell), { x: left() + 6 + offsets[i], y, size, font: f, color: INK })
      })
    }

    // A short section that would straddle the column break moves whole to
    // the next column; a long table just splits.
    const lines = (heading ? 1 : 0) + (head ? 1 : 0) + entries.length
    if (lines <= 8 && y - (lines - 1) * lineGap < MARGIN && col < columns - 1) {
      col += 1
      y = top
    }
    if (heading) {
      if (!nextLine(2)) return overflow
      page.drawText(heading, { x: left(), y, size: size + 1, font: bold, color: INK })
      y -= lineGap + 1
    }
    if (head) {
      if (!nextLine()) return overflow
      drawRow(head, bold)
      y -= lineGap
    }
    for (const entry of entries) {
      if (!nextLine()) return overflow
      if (Array.isArray(entry)) drawRow(entry, font)
      else page.drawText(entry, { x: left() + 6, y, size, font, color: INK })
      y -= lineGap
    }
    y -= sectionGap
  }
  return overflow
}

export const S = (heading, entries, head) => ({ heading, entries, head })

const UNITS = [
  S('Length', [
    '1 in = 2.54 cm', '1 ft = 30.5 cm', '1 yd = 0.914 m', '1 mi = 1.609 km',
    '1 mm = 0.039 in', '1 cm = 0.394 in', '1 m = 3.28 ft', '1 km = 0.621 mi',
    '1 naut mi = 1.15 mi',
  ]),
  S('Weight', [
    '1 oz = 28.3 g', '1 lb = 454 g = 16 oz', '1 stone = 14 lb', '1 US ton = 2,000 lb',
    '1 tonne = 2,205 lb', '1 kg = 2.20 lb',
  ]),
  S('Volume', [
    '1 tsp = 4.9 ml', '1 tbsp = 14.8 ml', '1 fl oz = 29.6 ml', '1 cup = 237 ml',
    '1 pint = 473 ml', '1 qt = 0.946 L', '1 gal = 3.785 L', '1 L = 1.06 qt',
    '1 L = 33.8 fl oz', '1 UK gal = 1.2 US gal',
  ]),
  S('Kitchen', [
    '3 tsp = 1 tbsp', '4 tbsp = 1/4 cup', '16 tbsp = 1 cup', '2 cups = 1 pint',
    '4 cups = 1 quart', '4 quarts = 1 gallon', '1 gal = 128 fl oz',
  ]),
  S('Temperature', [
    'C = (F - 32) x 5/9', 'F = C x 9/5 + 32', '0 C = 32 F', '100 C = 212 F',
    '350 F = 177 C (oven)',
  ]),
  S('Area', [
    '1 sq ft = 144 sq in', '1 sq m = 10.8 sq ft', '1 acre = 43,560 sq ft', '1 ha = 2.47 acres',
  ]),
]

const WEIGHTS = [
  S('Water', [
    '1 gal = 8.34 lb', '1 pint = 1.04 lb', '1 L = 1 kg = 2.2 lb', '1 cu ft = 62.4 lb',
    '1 cu ft = 7.48 gal', '5 gal bucket = 42 lb', '55 gal drum = 460 lb', '1 cu m = 1,000 kg',
    'Seawater 8.56 lb/gal',
  ]),
  S('Per gallon', [
    ['Gasoline', '6.1 lb'], ['Diesel', '7.1 lb'], ['Kerosene', '6.8 lb'], ['Jet A', '6.7 lb'],
    ['Propane', '4.2 lb'], ['Motor oil', '7.4 lb'], ['Antifreeze', '9.4 lb'], ['Milk', '8.6 lb'],
    ['Olive oil', '7.6 lb'], ['Honey', '12 lb'], ['Maple syrup', '11 lb'], ['Beer / wine', '8.3 lb'],
    '20 lb propane = 4.7 gal',
  ]),
  S('Per cubic foot', [
    ['Dry sand', '100 lb'], ['Wet sand', '120 lb'], ['Gravel', '105 lb'], ['Topsoil', '75 - 100 lb'],
    ['Concrete', '150 lb'], ['Brick', '120 lb'], ['Mulch', '20 lb'], ['Fresh snow', '5 - 15 lb'],
    ['Packed snow', '20 - 30 lb'], ['Ice', '57 lb'], ['Pine, dry', '25 lb'], ['Oak, dry', '45 lb'],
    ['Green firewood', '50 lb'], ['Aluminum', '169 lb'], ['Steel', '490 lb'], ['Lead', '708 lb'],
  ]),
  S('Per cubic yard', [
    ['Sand', '2,700 lb'], ['Gravel', '2,800 lb'], ['Topsoil', '2,000 - 2,700'], ['Mulch', '400 - 800 lb'],
    ['Concrete', '4,000 lb'], '(pickup bed holds ~ 1 yd)',
  ]),
]

const F_TO_C = [-40, -20, 0, 10, 20, 32, 40, 50, 60, 70, 80, 90, 100, 110, 120, 150, 200, 212, 250, 300, 350, 400, 450, 500]
const C_TO_F = [-40, -30, -20, -10, 0, 5, 10, 15, 20, 25, 30, 35, 37, 40, 45, 50, 60, 80, 100, 150, 200, 250]
const TEMPS = [
  S('Fahrenheit to Celsius', F_TO_C.map((f) => [`${f} F`, `${Math.round(((f - 32) * 5) / 9)} C`]), ['F', 'C']),
  S('Oven', [
    ['300 F', '150 C', 'gas 2'], ['325 F', '165 C', 'gas 3'], ['350 F', '175 C', 'gas 4'],
    ['375 F', '190 C', 'gas 5'], ['400 F', '200 C', 'gas 6'], ['425 F', '220 C', 'gas 7'],
    ['450 F', '230 C', 'gas 8'],
  ]),
  S('Celsius to Fahrenheit', C_TO_F.map((c) => [`${c} C`, `${Math.round((c * 9) / 5 + 32)} F`]), ['C', 'F']),
  S('Rules of thumb', [
    'C = (F - 32) x 5/9', 'Quick: (F - 30) / 2', 'Body 98.6 F = 37 C',
    'Fever 100.4 F = 38 C', 'Room 68 F = 20 C',
  ]),
]

const paceRow = (mph) => {
  const fmt = (m) => `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')}`
  return [`${mph} mph`, fmt(60 / mph), fmt(60 / mph / 1.609)]
}
const SPEED = [
  S('mph to km/h', [10, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 100].map((m) => [`${m} mph`, `${Math.round(m * 1.609)} km/h`]), ['mph', 'km/h']),
  S('km/h to mph', [30, 50, 60, 80, 100, 110, 120, 130].map((k) => [`${k} km/h`, `${Math.round(k / 1.609)} mph`]), ['km/h', 'mph']),
  S('Other', [
    '1 knot = 1.15 mph', '1 knot = 1.85 km/h', '1 m/s = 2.24 mph',
    'Sound: 5 s per mile', 'Lightning: sec / 5 = mi',
  ]),
  S('Pace', [3, 3.5, 4, 5, 6, 7, 8, 9, 10, 12].map(paceRow), ['Speed', 'min/mi', 'min/km']),
  S('Fuel (L/100 = 235 / mpg)', [15, 20, 25, 30, 35, 40, 50].map((m) => [`${m} mpg`, `${(235.2 / m).toFixed(1)} L/100`, `${Math.round(m * 1.2)} UK`]), ['US', 'L/100', 'UK']),
  S('', ['$/mile = $/gal / mpg', 'Range = gal x mpg']),
]

const AREA = [
  S('Area', [
    '1 sq ft = 144 sq in', '1 sq yd = 9 sq ft', '1 sq m = 10.76 sq ft', '1 acre = 43,560 sq ft',
    '   = 209 ft square', '1 ha = 2.47 acres', '1 sq mi = 640 acres', 'Circle = 3.14 x r x r',
  ]),
  S('Volume', [
    '1 cu ft = 1,728 cu in', '1 cu ft = 7.48 gal', '1 cu yd = 27 cu ft', '1 cu yd = 202 gal',
    '1 cu m = 35.3 cu ft', '1 gal = 231 cu in', 'Box (in): L W H / 231 = gal',
    'Tank (ft): 5.87 d² h = gal', 'Pool (ft): L W depth x 7.48',
  ]),
  S('Coverage', [
    '1 cu yd at 2 in: 162 sq ft', '   at 3 in: 108 sq ft', '   at 4 in: 81 sq ft',
    'Cu yd = sq ft x in / 324', '80 lb concrete = 0.6 cu ft', '   45 bags per yard',
    '60 lb bag = 0.45 cu ft', 'Paint: 350 - 400 sq ft/gal', 'Roof square = 100 sq ft',
    '   = 3 bundles shingles', '4 x 8 sheet = 32 sq ft', '10 x 10 room = 11.1 sq yd',
  ]),
  S('Lumber (actual, in)', [
    ['2x4', '1.5 x 3.5'], ['2x6', '1.5 x 5.5'], ['2x8', '1.5 x 7.25'], ['2x10', '1.5 x 9.25'],
    ['2x12', '1.5 x 11.25'], ['1x', '0.75 thick'], 'Board ft = 144 cu in',
    'Studs 16 in o.c.: 3 per 4 ft',
  ]),
]

const frac = (n) => {
  let d = 32
  while (n % 2 === 0 && d > 1) { n /= 2; d /= 2 }
  return d === 1 ? '1' : `${n}/${d}`
}
const fracRow = (n) => [frac(n), (n / 32).toFixed(3), `${((n / 32) * 25.4).toFixed(2)} mm`]
const SHOP = [
  S('Inch fractions', Array.from({ length: 16 }, (_, i) => fracRow(i + 1)), ['in', 'dec', 'mm']),
  S('', Array.from({ length: 16 }, (_, i) => fracRow(i + 17))),
  S('SAE / metric wrenches', [
    ['7/16', '~ 11 mm'], ['1/2', '~ 13 mm'], ['9/16', '~ 14 mm'], ['5/8', '~ 16 mm'],
    ['11/16', '~ 17 mm'], ['3/4', '~ 19 mm'], ['13/16', '~ 21 mm'], ['7/8', '~ 22 mm'],
    ['15/16', '~ 24 mm'], ['1', '~ 25 mm'],
  ]),
  S('', ['1 in = 25.4 mm', '1 mm = 0.0394 in', '1 mil = 0.001 in']),
]

const ELEC = [
  S("Ohm's law", [
    'V = I x R', 'P = V x I = I² x R', 'Amps = watts / volts',
    'kWh = W x hours / 1000', 'Cost = kWh x rate',
  ]),
  S('House wiring (copper)', [
    ['14 AWG', '15 A', '1,440 W'], ['12 AWG', '20 A', '1,920 W'], ['10 AWG', '30 A', '2,880 W'],
    ['8 AWG', '40 A', ''], ['6 AWG', '55 A', ''], 'W = 80% of amps x 120 V',
  ]),
  S('12 V lead-acid, resting', [
    ['12.7 V', '100%'], ['12.5 V', '75%'], ['12.2 V', '50%'], ['12.0 V', '25%'], ['11.8 V', '0%'],
    'Charging 13.8 - 14.4 V', 'Wh = Ah x V', 'Hours = Ah / amps', 'Use 50% lead-acid, 80% LFP',
  ]),
  S('Antennas', [
    'Wavelength m = 300 / MHz', 'Wavelength ft = 984 / MHz', 'Dipole ft = 468 / MHz',
    '1/4 wave ft = 234 / MHz',
    ['80 m', '130 ft'], ['40 m', '66 ft'], ['30 m', '46 ft'], ['20 m', '33 ft'],
    ['15 m', '22 ft'], ['10 m', '16.5 ft'],
  ]),
  S('Decibels', [
    ['3 dB', '2x'], ['6 dB', '4x'], ['10 dB', '10x'], ['20 dB', '100x'], '1 S-unit = 6 dB',
    ['1 W', '30 dBm'], ['5 W', '37 dBm'], ['10 W', '40 dBm'], ['100 W', '50 dBm'],
    'SWR 1.5 = 4% reflected', 'SWR 2 = 11%, SWR 3 = 25%',
  ]),
]

const ELECTRONICS = [
  S('Series and parallel', [
    'Resistors in series: R1 + R2', 'Parallel: R1 R2 / (R1 + R2)',
    '   or 1/R = 1/R1 + 1/R2 + ...', 'Two equal in parallel = half',
    'Capacitors add in parallel', 'Series: 1/C = 1/C1 + 1/C2',
    'Inductors add like resistors',
  ]),
  S('AC and timing', [
    'Xc = 1 / (2 pi f C)', 'XL = 2 pi f L',
    'Z = sqrt(R² + (XL - Xc)²)', 'f0 = 1 / (2 pi sqrt(LC))',
    'RC time constant = R x C', '   63% at 1 RC, 99% at 5 RC',
    'Vpeak = 1.414 x Vrms', 'Mains 120 Vrms = 170 Vpeak',
  ]),
  S('Dividers and LEDs', [
    'Vout = Vin x R2 / (R1 + R2)', 'LED R = (Vs - Vled) / I',
    '   (5 - 2) / 0.02 A = 150 ohm', 'LED Vf: red 1.8, green 2.2,',
    '   blue and white 3.2 V', 'Typical LED: 10 - 20 mA',
  ]),
  S('Resistor colour code', [
    ['black', '0', 'green', '5'], ['brown', '1', 'blue', '6'], ['red', '2', 'violet', '7'],
    ['orange', '3', 'grey', '8'], ['yellow', '4', 'white', '9'],
    'Bands 1-2 digits, 3 = zeros', 'Band 4: gold 5%, silver 10%',
    'red red brown = 220 ohm', 'brown black orange = 10 k',
  ]),
  S('Capacitor codes', [
    '104 = 10 x 10^4 pF = 100 nF', '1 µF = 1,000 nF = 10^6 pF',
    'Letters: J 5%, K 10%, M 20%',
  ]),
  S('Also', [
    'P = V² / R = I² R', 'E12 values: 10 12 15 18 22',
    '   27 33 39 47 56 68 82', 'Wire ohms per 1000 ft:',
    '   12 AWG 1.6, 18 AWG 6.4,', '   22 AWG 16',
  ]),
]
const electronicsSheet = (ctx) => refSheet(ctx, { title: 'Electronics formulas', sections: ELECTRONICS })

const ENERGY = [
  S('Pressure', [
    '1 psi = 6.9 kPa', '1 psi = 0.069 bar', '1 bar = 14.5 psi', '1 atm = 14.7 psi',
    '1 atm = 29.92 in Hg', '1 atm = 760 mm Hg', '1 kg/cm² = 14.2 psi',
    '1 ft water = 0.433 psi', '1 psi = 2.31 ft water',
    ['30 psi', '2.1 bar', '207 kPa'], ['35 psi', '2.4 bar', '241 kPa'],
    ['40 psi', '2.8 bar', '276 kPa'], ['80 psi', '5.5 bar', '552 kPa'],
  ]),
  S('Power', [
    '1 hp = 746 W', '1 kW = 1.34 hp', '1 ton AC = 12,000 BTU/h', '1 ton AC = 3.5 kW',
    '1 BTU/h = 0.293 W',
  ]),
  S('Energy', [
    '1 BTU = 1,055 J', '1 kWh = 3,412 BTU', '1 kWh = 3.6 MJ', '1 therm = 100,000 BTU',
    '1 therm = 29.3 kWh', '1 kcal = 4,184 J', '1 gal gas = 33.7 kWh', '1 gal gas = 114,000 BTU',
    '1 gal propane = 91,500 BTU', '1 cu ft nat gas = 1,000 BTU', '1 cord wood ~ 20 MBTU',
  ]),
  S('Force and torque', [
    '1 lbf = 4.45 N', '1 kgf = 9.81 N = 2.2 lbf', '1 lb-ft = 1.356 N-m',
    '1 N-m = 0.738 lb-ft', '1 lb-ft = 12 lb-in',
  ]),
]

const KITCHEN = [
  S('One cup weighs', [
    ['Flour', '120 g'], ['Sugar', '200 g'], ['Brown sugar', '220 g'], ['Powdered sugar', '120 g'],
    ['Butter', '227 g'], ['Oats', '90 g'], ['Rice, dry', '185 g'], ['Cocoa', '85 g'],
    ['Honey', '340 g'], ['Oil', '218 g'], ['Milk', '245 g'],
    'Butter stick = 8 tbsp', '   = 1/2 cup = 113 g', '1 large egg = 50 g',
    'Yeast packet = 2 1/4 tsp', '1 lb flour = 3 1/3 cups', '1 lb sugar = 2 1/4 cups',
  ]),
  S('Safe internal temps', [
    ['Poultry', '165 F', '74 C'], ['Ground meat', '160 F', '71 C'], ['Pork, fish', '145 F', '63 C'],
    ['Steak, roast', '145 F', '63 C'], ['Leftovers', '165 F', '74 C'],
    'Steak: rare 125, MR 135', '   med 145, well 160',
  ]),
  S('Ratios and times', [
    'White rice 1:2, 18 min', 'Brown rice 1:2.5, 45 min', 'Quinoa 1:2, 15 min',
    'Beans: 1 cup dry = 3 cooked', 'Pasta: 2 oz dry per person', 'Brine: 1/4 cup salt / qt',
  ]),
  S('Substitutions', [
    '1 cup buttermilk =', '   1 cup milk + 1 tbsp vinegar', '1 tsp baking powder =',
    '   1/4 tsp soda +', '   1/2 tsp cream of tartar', '1 oz chocolate =',
    '   3 tbsp cocoa + 1 tbsp fat',
  ]),
]

const FITNESS = [
  S('Heart rate', [
    'Max HR ~ 220 - age', 'Zone 2 easy: 60 - 70%', 'Zone 3 steady: 70 - 80%', 'Zone 4 hard: 80 - 90%',
  ]),
  S('Walking and running', [
    '1 mile ~ 2,000 steps', '10,000 steps ~ 5 mi', '~ 100 kcal per mile',
    'Walk 3 mph = 20 min/mi', 'Jog 5 mph = 12 min/mi',
  ]),
  S('Barbell math', [
    'Bar = 45 lb (20 kg)', 'Total = bar + 2 x per side',
    ['1 plate', '135 lb'], ['2 plates', '225 lb'], ['3 plates', '315 lb'], ['4 plates', '405 lb'],
    ['25 kg', '55 lb'], ['20 kg', '44 lb'], ['15 kg', '33 lb'], ['10 kg', '22 lb'],
    ['5 kg', '11 lb'], ['2.5 kg', '5.5 lb'], '1RM ~ wt x (1 + reps / 30)',
  ]),
  S('Body', [
    'BMI = 703 x lb / in²', 'BMI = kg / m²', '18.5 - 25 normal', 'Protein 0.7 - 1 g per lb',
    'Water ~ 1/2 oz per lb / day', 'kcal/g: protein 4, carb 4', '   fat 9, alcohol 7',
    '3,500 kcal ~ 1 lb fat',
  ]),
]

const MATH = [
  S('Geometry', [
    'Circle A = pi r²', 'Circumference = pi d', 'Triangle A = b h / 2', 'Sphere V = 4/3 pi r³',
    'Sphere A = 4 pi r²', 'Cylinder V = pi r² h', 'Cone V = pi r² h / 3', 'a² + b² = c²',
    '3-4-5 checks square', 'Diagonal = side x 1.414', 'pi = 3.1416', '1 rad = 57.3°',
  ]),
  S('Slope', [
    ['3/12', '14°', '25%'], ['4/12', '18.4°', '33%'], ['6/12', '26.6°', '50%'],
    ['8/12', '33.7°', '67%'], ['12/12', '45°', '100%'], 'Grade % = rise / run x 100',
  ], ['Pitch', 'Angle', 'Grade']),
  S('Money', [
    'Years to double = 72 / rate', 'Tip 20% = 10% x 2', '% change = diff / old x 100',
  ]),
  S('Prefixes', [
    ['tera T', '10^12'], ['giga G', '10^9'], ['mega M', '10^6'], ['kilo k', '10^3'],
    ['milli m', '10^-3'], ['micro µ', '10^-6'], ['nano n', '10^-9'], ['pico p', '10^-12'],
  ]),
  S('Time and Earth', [
    '1 day = 86,400 s', '1 week = 168 h', '1 year = 8,760 h', 'Minutes to hours: / 60',
    '1° latitude = 69 mi', '   = 111 km', "1' latitude = 1 naut mi",
    'Earth = 24,900 mi around', 'Light = 186,000 mi/s',
  ]),
]

const conversions = (ctx) => refSheet(ctx, { title: 'Unit conversions', sections: UNITS })
const tempTable = (ctx) => refSheet(ctx, { title: 'Temperature', sections: TEMPS })
const weights = (ctx) => refSheet(ctx, { title: 'Weight of things', sections: WEIGHTS })
const speedTable = (ctx) => refSheet(ctx, { title: 'Speed, pace and fuel', sections: SPEED })
const areaSheet = (ctx) => refSheet(ctx, { title: 'Area, volume and coverage', sections: AREA })
const shopTable = (ctx) => refSheet(ctx, { title: 'Fractions and millimetres', sections: SHOP })
const electrical = (ctx) => refSheet(ctx, { title: 'Electrical and radio', sections: ELEC })
const energySheet = (ctx) => refSheet(ctx, { title: 'Pressure, power and energy', sections: ENERGY })
const kitchenSheet = (ctx) => refSheet(ctx, { title: 'Kitchen reference', sections: KITCHEN })
const fitnessSheet = (ctx) => refSheet(ctx, { title: 'Fitness numbers', sections: FITNESS })
const mathSheet = (ctx) => refSheet(ctx, { title: 'Math and formulas', sections: MATH })

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function ordinal(n) {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${n}${suffix}`
}

// "Monday 13th" when the week's date is known, plain "Monday" otherwise.
// offset is the day's distance from the week anchor (the week's Sunday).
function dayTabLabel(name, weekDate, offset) {
  if (!weekDate) return name
  const date = new Date(weekDate.getFullYear(), weekDate.getMonth(), weekDate.getDate() + offset)
  return `${name} ${ordinal(date.getDate())}`
}

function week({ page, w, h, font, bold, settings, weekDate }) {
  const left = MARGIN
  const right = w - MARGIN
  const bottom = MARGIN
  const { bg, fg } = bandColors(settings)

  const top = h - MARGIN
  const rowH = (top - bottom) / 7

  for (let d = 0; d < 7; d++) {
    const rowTop = top - d * rowH
    page.drawLine({
      start: { x: left, y: rowTop },
      end: { x: right, y: rowTop },
      thickness: 0.6,
      color: LINE,
    })
    // Tab behind the day name, only as wide as the text.
    const name = dayTabLabel(DAY_NAMES[d], weekDate, d)
    page.drawRectangle({
      x: left,
      y: rowTop - 12.5,
      width: bold.widthOfTextAtSize(name, 7) + 8,
      height: 12,
      color: bg,
    })
    page.drawText(name, {
      x: left + 4,
      y: rowTop - 9,
      size: 7,
      font: bold,
      color: fg,
    })
  }
  page.drawLine({
    start: { x: left, y: bottom },
    end: { x: right, y: bottom },
    thickness: 0.6,
    color: LINE,
  })
}

function weekSplit({ page, w, h, font, bold, settings, weekDate }) {
  const left = MARGIN
  const right = w - MARGIN
  const bottom = MARGIN
  const { bg, fg } = bandColors(settings)

  const drawDayTab = (name, offset, x, rowTop) => {
    const label = dayTabLabel(name, weekDate, offset)
    page.drawRectangle({
      x,
      y: rowTop - 12.5,
      width: bold.widthOfTextAtSize(label, 7) + 8,
      height: 12,
      color: bg,
    })
    page.drawText(label, {
      x: x + 4,
      y: rowTop - 9,
      size: 7,
      font: bold,
      color: fg,
    })
  }

  // Six equal rows: Monday-Friday full width, then Saturday | Sunday sharing
  // the bottom row, split down the middle.
  const top = h - MARGIN
  const rowH = (top - bottom) / 6

  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  for (let d = 0; d < 6; d++) {
    const rowTop = top - d * rowH
    page.drawLine({
      start: { x: left, y: rowTop },
      end: { x: right, y: rowTop },
      thickness: 0.6,
      color: LINE,
    })
    if (d < 5) {
      drawDayTab(names[d], d + 1, left, rowTop)
    } else {
      const mid = (left + right) / 2
      page.drawLine({
        start: { x: mid, y: rowTop },
        end: { x: mid, y: bottom },
        thickness: 0.6,
        color: LINE,
      })
      drawDayTab('Saturday', 6, left, rowTop)
      drawDayTab('Sunday', 7, mid, rowTop)
    }
  }
  page.drawLine({
    start: { x: left, y: bottom },
    end: { x: right, y: bottom },
    thickness: 0.6,
    color: LINE,
  })
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function calendar(ctx, opts) {
  drawMonthPage(ctx, ctx.w, ctx.h, opts)
}

function calendarWide(ctx, opts) {
  // Sideways month: turn the booklet 90° clockwise to read it.
  ctx.page.pushOperators(pushGraphicsState(), concatTransformationMatrix(0, 1, -1, 0, ctx.w, 0))
  drawMonthPage(ctx, ctx.h, ctx.w, opts)
  ctx.page.pushOperators(popGraphicsState())
}

function drawMonthPage({ page, font, bold, settings, monthTotal }, w, h, { checkboxes = false } = {}) {
  // monthTotal is an absolute month index (year * 12 + month) resolved by the
  // imposition layer from the page's own month setting.
  const total = monthTotal ?? settings.year * 12 + settings.month
  const month = total % 12
  const year = Math.floor(total / 12)
  const title = `${MONTHS[month]} ${year}`
  const titleSize = 11
  page.drawText(title, {
    x: (w - bold.widthOfTextAtSize(title, titleSize)) / 2,
    y: h - MARGIN - titleSize,
    size: titleSize,
    font: bold,
    color: INK,
  })

  const gridTop = h - MARGIN - titleSize - 14
  const gridBottom = MARGIN
  const cellW = (w - 2 * MARGIN) / 7
  const rows = 6
  const headerH = 12
  const cellH = (gridTop - gridBottom - headerH) / rows

  for (let c = 0; c < 7; c++) {
    const label = WEEKDAYS[c]
    page.drawText(label, {
      x: MARGIN + c * cellW + (cellW - font.widthOfTextAtSize(label, 6)) / 2,
      y: gridTop - 8,
      size: 6,
      font,
      color: INK,
    })
  }

  // Sunday-first day-of-week index for the 1st of the month
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  for (let r = 0; r <= rows; r++) {
    const y = gridTop - headerH - r * cellH
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: w - MARGIN, y },
      thickness: 0.4,
      color: LINE,
    })
  }
  for (let c = 0; c <= 7; c++) {
    const x = MARGIN + c * cellW
    page.drawLine({
      start: { x, y: gridTop - headerH },
      end: { x, y: gridTop - headerH - rows * cellH },
      thickness: 0.4,
      color: LINE,
    })
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const idx = firstDay + d - 1
    const r = Math.floor(idx / 7)
    const c = idx % 7
    const cellX = MARGIN + c * cellW
    const cellTop = gridTop - headerH - r * cellH
    if (checkboxes) {
      // Band across the cell top; checkbox left, date beside it.
      const { bg, fg } = bandColors(settings)
      page.drawRectangle({
        x: cellX,
        y: cellTop - 9.5,
        width: cellW,
        height: 9.5,
        color: bg,
      })
      page.drawRectangle({
        x: cellX + 2,
        y: cellTop - 7.5,
        width: 5.5,
        height: 5.5,
        borderWidth: 0.6,
        borderColor: settings?.highContrast ? fg : LINE,
      })
      page.drawText(String(d), {
        x: cellX + 11,
        y: cellTop - 8,
        size: 6,
        font,
        color: fg,
      })
    } else {
      page.drawText(String(d), {
        x: cellX + 2,
        y: cellTop - 8,
        size: 6,
        font,
        color: INK,
      })
    }
  }
}

function fourWeeks(ctx) {
  drawFourWeeks(ctx, ctx.w, ctx.h)
}

function fourWeeksWide(ctx) {
  // Sideways: turn the booklet 90° clockwise to read it.
  ctx.page.pushOperators(pushGraphicsState(), concatTransformationMatrix(0, 1, -1, 0, ctx.w, 0))
  drawFourWeeks(ctx, ctx.h, ctx.w, { wide: true })
  ctx.page.pushOperators(popGraphicsState())
}

function drawFourWeeks({ page, font, bold, settings, weekDate }, w, h, { wide = false } = {}) {
  const start = weekDate ?? (settings.weekStart != null ? new Date(settings.weekStart) : null)
  if (!start) return
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 27)
  const fmt = (d) => `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`
  const title = `${fmt(start)} - ${fmt(end)}`

  const titleSize = 11
  page.drawText(title, {
    x: (w - bold.widthOfTextAtSize(title, titleSize)) / 2,
    y: h - MARGIN - titleSize,
    size: titleSize,
    font: bold,
    color: INK,
  })

  const gridTop = h - MARGIN - titleSize - 14
  const cellW = (w - 2 * MARGIN) / 7
  const rows = 4
  const headerH = 12
  const cellH = (gridTop - MARGIN - headerH) / rows

  // Band behind the day-name header row.
  const { bg, fg } = bandColors(settings)
  page.drawRectangle({
    x: MARGIN,
    y: gridTop - headerH,
    width: w - 2 * MARGIN,
    height: headerH,
    color: bg,
  })

  // The wide layout has room for full "Sun".."Sat" names; the narrow one
  // sticks to single letters.
  const dayFont = wide ? bold : font
  for (let c = 0; c < 7; c++) {
    const label = wide ? WEEKDAYS_SHORT[c] : WEEKDAYS[c]
    page.drawText(label, {
      x: MARGIN + c * cellW + (cellW - dayFont.widthOfTextAtSize(label, 6)) / 2,
      y: gridTop - 8,
      size: 6,
      font: dayFont,
      color: fg,
    })
  }

  for (let r = 0; r <= rows; r++) {
    const y = gridTop - headerH - r * cellH
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: w - MARGIN, y },
      thickness: 0.4,
      color: LINE,
    })
  }
  for (let c = 0; c <= 7; c++) {
    const x = MARGIN + c * cellW
    page.drawLine({
      start: { x, y: gridTop - headerH },
      end: { x, y: gridTop - headerH - rows * cellH },
      thickness: 0.4,
      color: LINE,
    })
  }

  for (let idx = 0; idx < rows * 7; idx++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + idx)
    const r = Math.floor(idx / 7)
    const c = idx % 7
    const cellX = MARGIN + c * cellW
    const cellTop = gridTop - headerH - r * cellH
    page.drawText(String(date.getDate()), {
      x: cellX + 2,
      y: cellTop - 8,
      size: 6,
      font,
      color: INK,
    })
  }
}

function yearCalendar({ page, w, h, font, bold, settings }) {
  const year = settings.year
  const title = String(year)
  const titleSize = 11
  page.drawText(title, {
    x: (w - bold.widthOfTextAtSize(title, titleSize)) / 2,
    y: h - MARGIN - titleSize,
    size: titleSize,
    font: bold,
    color: INK,
  })

  const cols = 3
  const rows = 4
  const gapX = 10
  const gapY = 8
  const gridTop = h - MARGIN - titleSize - 12
  const blockW = (w - 2 * MARGIN - (cols - 1) * gapX) / cols
  const blockH = (gridTop - MARGIN - (rows - 1) * gapY) / rows
  const nameSize = 5.5
  const daySize = 4
  const colW = blockW / 7
  const rowH = (blockH - nameSize - 4) / 6

  for (let m = 0; m < 12; m++) {
    const bx = MARGIN + (m % cols) * (blockW + gapX)
    const bTop = gridTop - Math.floor(m / cols) * (blockH + gapY)
    const name = MONTHS[m].slice(0, 3)
    page.drawText(name, {
      x: bx + (blockW - bold.widthOfTextAtSize(name, nameSize)) / 2,
      y: bTop - nameSize,
      size: nameSize,
      font: bold,
      color: INK,
    })

    const daysTop = bTop - nameSize - 4
    const firstDay = new Date(year, m, 1).getDay()
    const daysInMonth = new Date(year, m + 1, 0).getDate()
    for (let d = 1; d <= daysInMonth; d++) {
      const idx = firstDay + d - 1
      const r = Math.floor(idx / 7)
      const c = idx % 7
      const label = String(d)
      page.drawText(label, {
        x: bx + c * colW + (colW - font.widthOfTextAtSize(label, daySize)) / 2,
        y: daysTop - r * rowH - daySize,
        size: daySize,
        font,
        color: INK,
      })
    }
  }
}

export function wrapText(text, font, size, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
      line = candidate
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

function cover({ page, w, h, font, bold, settings }) {
  const inset = 10
  const bottom = inset
  page.drawRectangle({
    x: inset,
    y: bottom,
    width: w - 2 * inset,
    height: h - inset - bottom,
    borderWidth: 1.2,
    borderColor: INK,
  })
  page.drawRectangle({
    x: inset + 3,
    y: bottom + 3,
    width: w - 2 * (inset + 3),
    height: h - inset - bottom - 6,
    borderWidth: 0.5,
    borderColor: INK,
  })

  const titleSize = 16
  const maxWidth = w - 2 * MARGIN - 12
  const titleLines = wrapText(settings.title || 'Booklet', bold, titleSize, maxWidth)
  let y = h * 0.62
  for (const line of titleLines) {
    page.drawText(line, {
      x: (w - bold.widthOfTextAtSize(line, titleSize)) / 2,
      y,
      size: titleSize,
      font: bold,
      color: INK,
    })
    y -= titleSize + 4
  }

  const ruleY = y + titleSize - 6
  page.drawLine({
    start: { x: w / 2 - 30, y: ruleY },
    end: { x: w / 2 + 30, y: ruleY },
    thickness: 0.8,
    color: INK,
  })

  if (settings.subtitle) {
    const subSize = 9
    const subLines = wrapText(settings.subtitle, font, subSize, maxWidth)
    let sy = ruleY - 16
    for (const line of subLines) {
      page.drawText(line, {
        x: (w - font.widthOfTextAtSize(line, subSize)) / 2,
        y: sy,
        size: subSize,
        font,
        color: INK,
      })
      sy -= subSize + 3
    }
  }
}

// --- Radio taiso ------------------------------------------------------------
//
// Stick figures are posed with joint angles instead of fixed coordinates.
// Every angle is degrees from straight down, swinging away from the body:
// 0 hangs at the side, 90 is horizontal, 180 points straight up. Limbs are
// [upper, lower] pairs, arms and legs listed left side first. The figure is
// built in a unit body 100 tall and scaled into whatever cell it lands in.
const BODY = { headR: 7.5, torso: 31, upper: 16, fore: 15, thigh: 22, shin: 20 }

function chain(page, x, y, side, segs, thickness, color) {
  let last = 0
  for (const [deg, len] of segs) {
    const a = (deg * Math.PI) / 180
    const nx = x + side * Math.sin(a) * len
    const ny = y - Math.cos(a) * len
    page.drawLine({ start: { x, y }, end: { x: nx, y: ny }, thickness, color })
    x = nx
    y = ny
    last = deg
  }
  return { x, y, deg: last, side }
}

// Arc drawn as a short polyline with a two-stroke head at the finish, used for
// the "circle this way" cues on the rotation movements.
function arcArrow(page, cx, cy, r, a0, a1, thickness, color) {
  const steps = 12
  let prev = null
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps
    const pt = { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
    if (prev) page.drawLine({ start: prev, end: pt, thickness, color })
    prev = pt
  }
  const tangent = a1 + (a1 > a0 ? 1 : -1) * (Math.PI / 2)
  const back = tangent + Math.PI
  for (const spread of [0.5, -0.5]) {
    page.drawLine({
      start: prev,
      end: {
        x: prev.x + r * 0.5 * Math.cos(back + spread),
        y: prev.y + r * 0.5 * Math.sin(back + spread),
      },
      thickness,
      color,
    })
  }
}

function upArrow(page, x, y, len, thickness, color) {
  page.drawLine({ start: { x, y }, end: { x, y: y + len }, thickness, color })
  for (const dx of [-1, 1]) {
    page.drawLine({
      start: { x, y: y + len },
      end: { x: x + dx * len * 0.28, y: y + len * 0.72 },
      thickness,
      color,
    })
  }
}

// A dumbbell in the hand: a short bar square to the forearm with a plate on
// each end, sized off the same unit body as the figure so it stays in scale.
function dumbbell(page, hand, k, thickness, color) {
  const a = (hand.deg * Math.PI) / 180
  // The forearm runs along (side * sin a, -cos a); the bar lies square to it.
  const bx = Math.cos(a)
  const by = hand.side * Math.sin(a)
  const half = 4 * k
  page.drawLine({
    start: { x: hand.x - bx * half, y: hand.y - by * half },
    end: { x: hand.x + bx * half, y: hand.y + by * half },
    thickness,
    color,
  })
  for (const s of [-1, 1]) {
    page.drawCircle({
      x: hand.x + s * bx * half,
      y: hand.y + s * by * half,
      size: 2.8 * k,
      color,
    })
  }
}

// A chair, step or wall, drawn from the same unit body as the figure so the
// movements that need furniture stay in scale with it. x is measured from the
// figure's centre line and everything stands on the ground line.
function furniture(page, cx, baseY, k, spec, thickness, color) {
  const { kind, x = 0, w = 26, h = 20 } = spec
  if (kind === 'wall') {
    page.drawLine({
      start: { x: cx + x * k, y: baseY },
      end: { x: cx + x * k, y: baseY + h * k },
      thickness,
      color,
    })
    return
  }
  page.drawRectangle({
    x: cx + x * k,
    y: baseY,
    width: w * k,
    height: h * k,
    borderWidth: thickness,
    borderColor: color,
  })
}

function stickFigure(page, cx, baseY, height, pose, color) {
  const k = height / 100
  const th = Math.max(0.7, height * 0.03)
  // Furniture goes down first, so the figure's limbs draw over the seat edge
  // rather than disappearing behind it.
  if (pose.prop) furniture(page, cx, baseY, k, pose.prop, th * 0.8, color)
  const lean = ((pose.lean ?? 0) * Math.PI) / 180
  const hipY = baseY + (pose.lift ?? 0) * k + (BODY.thigh + BODY.shin) * k
  // A lying pose puts the whole body off to one side of the hips; shift moves
  // the hips so the figure still sits in the middle of its frame.
  const hipX = cx + (pose.shift ?? 0) * k

  // Torso pivots about the hip; shoulders and head ride along with it.
  const shX = hipX + Math.sin(lean) * BODY.torso * k
  const shY = hipY + Math.cos(lean) * BODY.torso * k
  page.drawLine({ start: { x: hipX, y: hipY }, end: { x: shX, y: shY }, thickness: th, color })

  const headGap = (BODY.headR + 3) * k
  page.drawCircle({
    x: shX + Math.sin(lean) * headGap,
    y: shY + Math.cos(lean) * headGap,
    size: BODY.headR * k,
    borderWidth: th,
    borderColor: color,
  })

  // Shoulder and hip bars, square to the torso, so limbs don't sprout from a
  // single point. Perpendicular to (sin, cos) is (cos, -sin).
  const px = Math.cos(lean)
  const py = -Math.sin(lean)
  const shW = 6.5 * k
  const hipW = 5 * k
  const shoulders = [
    { x: shX - px * shW, y: shY - py * shW },
    { x: shX + px * shW, y: shY + py * shW },
  ]
  const hips = [
    { x: hipX - px * hipW, y: hipY - py * hipW },
    { x: hipX + px * hipW, y: hipY + py * hipW },
  ]
  page.drawLine({ start: shoulders[0], end: shoulders[1], thickness: th, color })
  page.drawLine({ start: hips[0], end: hips[1], thickness: th, color })

  const hands = []
  for (const i of [0, 1]) {
    const side = i === 0 ? -1 : 1
    const [upper, fore] = pose.arm[i]
    hands[i] = chain(page, shoulders[i].x, shoulders[i].y, side, [
      [upper, BODY.upper * k],
      [fore, BODY.fore * k],
    ], th, color)
    const [thigh, shin] = pose.leg[i]
    chain(page, hips[i].x, hips[i].y, side, [
      [thigh, BODY.thigh * k],
      [shin, BODY.shin * k],
    ], th, color)
  }

  // hold: true is one weight per hand, 'center' is a single weight gripped in
  // both hands, and a [left, right] pair arms only the side that is working.
  if (pose.hold === 'center') {
    const bar = {
      x: (hands[0].x + hands[1].x) / 2,
      y: (hands[0].y + hands[1].y) / 2,
      deg: 0,
      side: 1,
    }
    dumbbell(page, bar, k, th, color)
  } else if (pose.hold) {
    for (const i of [0, 1]) {
      if (pose.hold === true || pose.hold[i]) dumbbell(page, hands[i], k, th, color)
    }
  }

  switch (pose.mark) {
    case 'up':
      for (const dx of [-1, 1]) {
        upArrow(page, cx + dx * 34 * k, shY - 6 * k, 16 * k, th * 0.8, color)
      }
      break
    case 'rotate':
      arcArrow(page, cx + 30 * k, shY - 6 * k, 8 * k, 1.2, 1.2 - 4.8, th * 0.8, color)
      break
    case 'twist':
      arcArrow(page, cx + 30 * k, hipY + 10 * k, 8 * k, 1.2, 1.2 - 4.8, th * 0.8, color)
      break
  }
}

// Radio taiso no. 1 in order: thirteen movements, roughly three minutes. Each
// movement is a strip of three or four poses read left to right, so the shape
// of the movement is visible without reading the caption.
const TAISO = [
  {
    name: 'Stretch up',
    text: 'Reach both arms overhead, rise on the toes, then lower.',
    frames: [
      { arm: [[6, 6], [6, 6]], leg: [[3, 3], [3, 3]] },
      { arm: [[84, 66], [84, 66]], leg: [[3, 3], [3, 3]] },
      { arm: [[150, 166], [150, 166]], leg: [[3, 3], [3, 3]], mark: 'up' },
    ],
  },
  {
    name: 'Arm swing + knee bend',
    text: 'Swing the arms as the knees bend and straighten.',
    frames: [
      { arm: [[8, 8], [8, 8]], leg: [[4, 4], [4, 4]] },
      { arm: [[50, 60], [50, 60]], leg: [[18, -4], [18, -4]] },
      { arm: [[74, 58], [74, 58]], leg: [[32, -8], [32, -8]] },
    ],
  },
  {
    name: 'Arm circles',
    text: 'Circle both arms forward, then circle them back.',
    frames: [
      { arm: [[25, 30], [25, 30]], leg: [[5, 5], [5, 5]] },
      { arm: [[86, 74], [86, 74]], leg: [[5, 5], [5, 5]] },
      { arm: [[150, 166], [150, 166]], leg: [[5, 5], [5, 5]] },
      { arm: [[100, 120], [100, 120]], leg: [[5, 5], [5, 5]], mark: 'rotate' },
    ],
  },
  {
    name: 'Chest opener',
    text: 'Open the arms wide and press the chest open.',
    frames: [
      { arm: [[30, 55], [30, 55]], leg: [[6, 6], [6, 6]] },
      { arm: [[78, 56], [78, 56]], leg: [[6, 6], [6, 6]] },
      { arm: [[96, 84], [96, 84]], leg: [[6, 6], [6, 6]] },
    ],
  },
  {
    name: 'Side bend',
    text: 'One arm overhead, bend to the side; then the other.',
    frames: [
      { arm: [[150, 168], [10, 8]], leg: [[9, 9], [9, 9]] },
      { lean: 24, arm: [[158, 172], [12, 10]], leg: [[9, 9], [9, 9]] },
      { lean: -24, arm: [[12, 10], [158, 172]], leg: [[9, 9], [9, 9]] },
    ],
  },
  {
    name: 'Forward + back bend',
    text: 'Bend forward toward the floor, then arch gently back.',
    frames: [
      { arm: [[8, 8], [8, 8]], leg: [[3, 3], [3, 3]] },
      { lean: 62, arm: [[4, 2], [4, 2]], leg: [[2, 2], [2, 2]] },
      { lean: -24, arm: [[150, 170], [150, 170]], leg: [[2, 2], [2, 2]] },
    ],
  },
  {
    name: 'Body twist',
    text: 'Arms out; twist the upper body left and right.',
    frames: [
      { arm: [[88, 70], [88, 70]], leg: [[12, 12], [12, 12]] },
      { arm: [[55, 40], [110, 120]], leg: [[12, 12], [12, 12]], mark: 'twist' },
      { arm: [[110, 120], [55, 40]], leg: [[12, 12], [12, 12]] },
    ],
  },
  {
    name: 'Arms up and down',
    text: 'Feet apart; stretch one arm up, one down. Alternate.',
    frames: [
      { arm: [[158, 170], [12, 8]], leg: [[17, 17], [17, 17]] },
      { arm: [[86, 70], [86, 70]], leg: [[17, 17], [17, 17]] },
      { arm: [[12, 8], [158, 170]], leg: [[17, 17], [17, 17]] },
    ],
  },
  {
    name: 'Diagonal bend',
    text: 'Bend diagonally down, then open the chest upward.',
    frames: [
      { arm: [[150, 164], [150, 164]], leg: [[13, 13], [13, 13]] },
      { lean: 30, arm: [[150, 162], [24, 16]], leg: [[13, 13], [13, 13]] },
      { lean: -12, arm: [[140, 158], [140, 158]], leg: [[13, 13], [13, 13]] },
    ],
  },
  {
    name: 'Body circles',
    text: 'Circle the upper body in a big loop, both ways.',
    frames: [
      { arm: [[152, 166], [152, 166]], leg: [[12, 12], [12, 12]] },
      { lean: 28, arm: [[150, 164], [150, 164]], leg: [[12, 12], [12, 12]] },
      { lean: 55, arm: [[6, 4], [6, 4]], leg: [[8, 8], [8, 8]] },
      { lean: -28, arm: [[150, 164], [150, 164]], leg: [[12, 12], [12, 12]], mark: 'rotate' },
    ],
  },
  {
    name: 'Two-foot hops',
    text: 'Hop lightly on both feet, together then apart.',
    frames: [
      { arm: [[18, 14], [18, 14]], leg: [[6, -6], [6, -6]] },
      { lift: 12, arm: [[130, 140], [130, 140]], leg: [[26, 26], [26, 26]] },
      { arm: [[18, 14], [18, 14]], leg: [[6, -6], [6, -6]] },
    ],
  },
  {
    name: 'Arm swing + knee bend',
    text: 'Repeat no. 2: swing the arms, bend the knees.',
    frames: [
      { arm: [[8, 8], [8, 8]], leg: [[4, 4], [4, 4]] },
      { arm: [[50, 60], [50, 60]], leg: [[18, -4], [18, -4]] },
      { arm: [[74, 58], [74, 58]], leg: [[32, -8], [32, -8]] },
    ],
  },
  {
    name: 'Deep breathing',
    text: 'Breathe in as the arms rise, out as they lower.',
    frames: [
      { arm: [[8, 8], [8, 8]], leg: [[4, 4], [4, 4]], mark: 'up' },
      { arm: [[72, 58], [72, 58]], leg: [[4, 4], [4, 4]] },
      { arm: [[128, 142], [128, 142]], leg: [[4, 4], [4, 4]] },
    ],
  },
]

// One sheet of an illustrated routine: a title block, then a grid of numbered
// movements, each a strip of poses read left to right so the shape of the
// movement is visible without reading the caption. The caller picks the grid,
// so a long sequence can run 2-up while a short one takes the full width.
// Title, subtitle, small print and the rule under them: shared by every
// routine sheet so the pages stack with their headers in the same place.
// Returns the y of the rule, which is the top of whatever grid follows.
export function sheetHeader({ page, w, h, font, bold, settings }, { title, sub, note }) {
  const ink = settings?.highContrast ? BLACK : INK
  const titleSize = 9
  let y = h - MARGIN - titleSize
  page.drawText(title, {
    x: (w - bold.widthOfTextAtSize(title, titleSize)) / 2,
    y,
    size: titleSize,
    font: bold,
    color: ink,
  })

  if (sub) {
    for (const line of wrapText(sub, font, 5.5, w - 2 * MARGIN)) {
      y -= 9
      page.drawText(line, {
        x: (w - font.widthOfTextAtSize(line, 5.5)) / 2,
        y,
        size: 5.5,
        font,
        color: ink,
      })
    }
  }

  if (note) {
    y -= 8
    page.drawText(note, {
      x: (w - font.widthOfTextAtSize(note, 4.5)) / 2,
      y,
      size: 4.5,
      font,
      color: settings?.highContrast ? ink : LINE,
    })
  }

  y -= 5
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: w - MARGIN, y },
    thickness: 0.6,
    color: LINE,
  })
  return y
}

function moveSheet(ctx, opts) {
  const { page, w, font, bold, settings } = ctx
  const { title, sub, note, moves, footer = [], cols = 2, rows = 4 } = opts
  const numberFrom = opts.numberFrom ?? 1
  const maxFigH = opts.maxFigH ?? 25
  const { bg, fg } = bandColors(settings)
  const ink = settings?.highContrast ? BLACK : INK
  const left = MARGIN
  const right = w - MARGIN

  const y = sheetHeader(ctx, { title, sub, note })

  const cellW = (right - left) / cols
  const rowH = (y - MARGIN) / rows

  moves.forEach((move, slot) => {
    const cellX = left + (slot % cols) * cellW
    const cellTop = y - Math.floor(slot / cols) * rowH

    // Numbered badge in the corner, figure centred under it.
    const badge = 4.8
    page.drawCircle({ x: cellX + badge, y: cellTop - badge - 1, size: badge, color: bg })
    const num = String(numberFrom + slot)
    page.drawText(num, {
      x: cellX + badge - bold.widthOfTextAtSize(num, 4.5) / 2,
      y: cellTop - badge - 2.6,
      size: 4.5,
      font: bold,
      color: fg,
    })

    // Sets and reps ride in the opposite corner, which the figures leave free.
    if (move.reps) {
      page.drawText(move.reps, {
        x: cellX + cellW - 3 - bold.widthOfTextAtSize(move.reps, 5),
        y: cellTop - badge - 2.6,
        size: 5,
        font: bold,
        color: ink,
      })
    }

    // The frames share one ground line, which is what makes the hop read as
    // leaving the floor and keeps the leaning poses from looking like falls.
    const baseY = cellTop - rowH + 22
    const stripX = cellX + 3
    const stripW = cellW - 6
    page.drawLine({
      start: { x: stripX, y: baseY },
      end: { x: stripX + stripW, y: baseY },
      thickness: 0.4,
      color: settings?.highContrast ? LINE : FAINT,
    })
    // A movement done on the floor stands maybe a third as tall as a standing
    // one, so it can be drawn bigger before it runs out of cell: `figH` lets
    // such a movement raise its own cap without changing the rest of the page.
    const frameW = stripW / move.frames.length
    const figH = Math.min(move.figH ?? maxFigH, frameW * 1.2)
    move.frames.forEach((pose, f) => {
      stickFigure(page, stripX + (f + 0.5) * frameW, baseY, figH, pose, ink)
    })

    const nameSize = 5
    page.drawText(move.name, {
      x: cellX + (cellW - bold.widthOfTextAtSize(move.name, nameSize)) / 2,
      y: cellTop - rowH + 16,
      size: nameSize,
      font: bold,
      color: ink,
    })

    const textSize = 4.3
    let ty = cellTop - rowH + 9
    for (const line of wrapText(move.text, font, textSize, cellW - 8).slice(0, 2)) {
      page.drawText(line, {
        x: cellX + (cellW - font.widthOfTextAtSize(line, textSize)) / 2,
        y: ty,
        size: textSize,
        font,
        color: ink,
      })
      ty -= 5
    }
  })

  // Whatever the last row leaves empty carries the closing note.
  const empty = rows * cols - moves.length
  if (footer.length && empty >= cols) {
    let ny = y - rows * rowH + rowH / 2 + 4
    for (const line of footer) {
      page.drawText(line, {
        x: (w - font.widthOfTextAtSize(line, 4.8)) / 2,
        y: ny,
        size: 4.8,
        font,
        color: ink,
      })
      ny -= 7
    }
  }
}

// Half the taiso sequence per page. Both pages use the same four-row grid so
// the cells line up when the two pages sit side by side in the booklet.
function taiso(ctx, from, to) {
  moveSheet(ctx, {
    title: 'Radio Taiso No. 1',
    sub: `Movements ${from + 1} - ${to}`,
    note: 'Japanese radio calisthenics - whole set about 3 minutes.',
    moves: TAISO.slice(from, to),
    numberFrom: from + 1,
    footer: [
      'Keep the pace steady and breathe through the set.',
      'Finish with no. 13, then stand quietly for a moment.',
    ],
  })
}

// --- Dumbbell workout -------------------------------------------------------
//
// Same posing system as the taiso pages, plus a weight in the hand. The view
// is front-on, so a movement that happens front-to-back (a row, a kickback,
// a lunge) is staged as an in-plane silhouette: the frames still read as the
// start, middle and end of the rep, which is what the page is for.
// Lying on the back, head to the right: the legs mirror onto the same side as
// the torso, and the hips slide left so the body centres in the frame.
const SUPINE = {
  lean: 90,
  lift: -40.8,
  shift: -10,
  leg: [[-230, 40], [230, -40]],
}

const ARMS = [
  {
    name: 'Dumbbell curl',
    reps: '3 x 10',
    text: 'Elbows pinned to the ribs; curl up, lower slowly.',
    frames: [
      { hold: true, arm: [[20, 20], [20, 20]], leg: [[5, 5], [5, 5]] },
      { hold: true, arm: [[20, 76], [20, 76]], leg: [[5, 5], [5, 5]] },
      { hold: true, arm: [[20, 128], [20, 128]], leg: [[5, 5], [5, 5]] },
    ],
  },
  {
    name: 'Overhead triceps extension',
    reps: '3 x 10',
    text: 'One dumbbell in both hands; only the elbows move.',
    frames: [
      { hold: 'center', arm: [[172, 178], [172, 178]], leg: [[5, 5], [5, 5]] },
      { hold: 'center', arm: [[172, 148], [172, 148]], leg: [[5, 5], [5, 5]] },
      { hold: 'center', arm: [[172, 124], [172, 124]], leg: [[5, 5], [5, 5]] },
    ],
  },
  {
    name: 'Hammer curl',
    reps: '3 x 12',
    text: 'Palms facing in. Alternate arms, no swinging.',
    frames: [
      { hold: true, arm: [[20, 20], [20, 20]], leg: [[5, 5], [5, 5]] },
      { hold: true, arm: [[20, 128], [20, 20]], leg: [[5, 5], [5, 5]] },
      { hold: true, arm: [[20, 20], [20, 128]], leg: [[5, 5], [5, 5]] },
    ],
  },
  {
    name: 'Triceps kickback',
    reps: '3 x 12',
    text: 'Hinge forward, elbows high, straighten the arms back.',
    frames: [
      { hold: true, lean: 52, arm: [[30, 98], [30, 98]], leg: [[10, -6], [10, -6]] },
      { hold: true, lean: 52, arm: [[30, 62], [30, 62]], leg: [[10, -6], [10, -6]] },
      { hold: true, lean: 52, arm: [[30, 30], [30, 30]], leg: [[10, -6], [10, -6]] },
    ],
  },
]

const FULL_BODY = [
  {
    name: 'Goblet squat',
    reps: '3 x 10',
    text: 'Weight at the chest; sit down between the heels.',
    frames: [
      { hold: 'center', arm: [[18, 126], [18, 126]], leg: [[6, 6], [6, 6]] },
      { hold: 'center', arm: [[18, 126], [18, 126]], leg: [[24, -6], [24, -6]] },
      { hold: 'center', arm: [[18, 126], [18, 126]], leg: [[42, -14], [42, -14]] },
    ],
  },
  {
    name: 'Floor press',
    reps: '3 x 10',
    text: 'On the back, knees up; press straight over the chest.',
    frames: [
      { hold: true, ...SUPINE, arm: [[-200, -20], [200, 20]] },
      { hold: true, ...SUPINE, arm: [[-186, -172], [186, 172]] },
      { hold: true, ...SUPINE, arm: [[-180, -180], [180, 180]] },
    ],
  },
  {
    name: 'Romanian deadlift',
    reps: '3 x 10',
    text: 'Soft knees; push the hips back, weights close in.',
    frames: [
      { hold: true, arm: [[6, 6], [6, 6]], leg: [[4, 4], [4, 4]] },
      { hold: true, lean: 34, arm: [[6, 6], [6, 6]], leg: [[3, 3], [3, 3]] },
      { hold: true, lean: 66, arm: [[4, 4], [4, 4]], leg: [[2, 2], [2, 2]] },
    ],
  },
  {
    name: 'Bent-over row',
    reps: '3 x 10',
    text: 'Flat back; pull the weights to the ribs, then lower.',
    frames: [
      { hold: true, lean: 58, arm: [[8, 8], [8, 8]], leg: [[10, -6], [10, -6]] },
      { hold: true, lean: 58, arm: [[124, 12], [124, 12]], leg: [[10, -6], [10, -6]] },
      { hold: true, lean: 58, arm: [[148, 6], [148, 6]], leg: [[10, -6], [10, -6]] },
    ],
  },
  {
    name: 'Overhead press',
    reps: '3 x 10',
    text: 'From the shoulders, press up without arching back.',
    frames: [
      { hold: true, arm: [[88, 168], [88, 168]], leg: [[5, 5], [5, 5]] },
      { hold: true, arm: [[126, 172], [126, 172]], leg: [[5, 5], [5, 5]] },
      { hold: true, arm: [[170, 176], [170, 176]], leg: [[5, 5], [5, 5]], mark: 'up' },
    ],
  },
  {
    name: 'Reverse lunge',
    reps: '2 x 10',
    text: 'Step back, drop the rear knee, drive back up.',
    frames: [
      { hold: true, arm: [[18, 18], [18, 18]], leg: [[5, 5], [5, 5]] },
      { hold: true, arm: [[18, 18], [18, 18]], leg: [[16, -14], [-26, -6]] },
      { hold: true, arm: [[18, 18], [18, 18]], leg: [[30, -30], [-38, 6]] },
    ],
  },
  {
    name: 'Hammer curl',
    reps: '2 x 12',
    text: 'Palms facing in. Alternate arms, no swinging.',
    frames: [
      { hold: true, arm: [[20, 20], [20, 20]], leg: [[5, 5], [5, 5]] },
      { hold: true, arm: [[20, 128], [20, 20]], leg: [[5, 5], [5, 5]] },
      { hold: true, arm: [[20, 20], [20, 128]], leg: [[5, 5], [5, 5]] },
    ],
  },
  {
    name: 'Farmer carry',
    reps: '2 x 40s',
    text: 'Heavy in both hands; walk tall, ribs down, no lean.',
    frames: [
      { hold: true, arm: [[18, 18], [18, 18]], leg: [[14, -10], [-10, 4]] },
      { hold: true, arm: [[18, 18], [18, 18]], leg: [[4, 4], [4, 4]] },
      { hold: true, arm: [[18, 18], [18, 18]], leg: [[-10, 4], [14, -10]] },
    ],
  },
]

function dumbbellArms(ctx) {
  moveSheet(ctx, {
    title: 'Dumbbell Arms',
    sub: 'Four movements - about 20 minutes',
    note: 'Rest 60 seconds between sets. Last two reps should be hard.',
    moves: ARMS,
    cols: 1,
    maxFigH: 30,
  })
}

function dumbbellFull(ctx, from, to) {
  moveSheet(ctx, {
    title: 'Dumbbell Full Body',
    sub: `Movements ${from + 1} - ${to}`,
    note: 'One session: squat, hinge, push, pull, lunge, carry.',
    moves: FULL_BODY.slice(from, to),
    numberFrom: from + 1,
    footer: [
      'Rest 90 seconds on the big lifts, 60 on the rest.',
      'Hit the top of every rep range, then add weight.',
    ],
  })
}

// --- Bodyweight legs --------------------------------------------------------
//
// Same posing system again, with nothing in the hands. Bending the legs would
// leave the feet hanging over the ground line, so each frame carries a lift
// that drops the hips by exactly what the bent legs lose in height - the feet
// stay planted and the squat reads as a squat.
const LEGS = [
  {
    name: 'Bodyweight squat',
    reps: '3 x 15',
    text: 'Feet shoulder width; sit down, drive up through the heels.',
    frames: [
      { arm: [[12, 12], [12, 12]], leg: [[5, 5], [5, 5]] },
      { lift: -2, lean: 10, arm: [[22, 48], [22, 48]], leg: [[24, -6], [24, -6]] },
      { lift: -6.2, lean: 18, arm: [[30, 72], [30, 72]], leg: [[42, -14], [42, -14]] },
    ],
  },
  {
    name: 'Side leg raise',
    reps: '3 x 12 ea',
    text: 'Stand tall; lift one leg out to the side. Both sides.',
    frames: [
      { arm: [[16, 14], [16, 14]], leg: [[4, 4], [4, 4]] },
      { arm: [[46, 40], [46, 40]], leg: [[38, 40], [4, 4]] },
      { arm: [[62, 56], [62, 56]], leg: [[66, 70], [4, 4]] },
    ],
  },
  {
    name: 'Heel raise',
    reps: '3 x 20',
    text: 'Rise onto the toes, pause at the top, lower slowly.',
    frames: [
      { arm: [[10, 10], [10, 10]], leg: [[3, 3], [3, 3]] },
      { lift: 4, arm: [[12, 10], [12, 10]], leg: [[2, 2], [2, 2]] },
      { lift: 8, arm: [[12, 10], [12, 10]], leg: [[1, 1], [1, 1]], mark: 'up' },
    ],
  },
]

function legs(ctx) {
  moveSheet(ctx, {
    title: 'Bodyweight Legs',
    sub: 'Three movements - about 12 minutes',
    note: 'No weights. Slow on the way down, strong on the way up.',
    moves: LEGS,
    cols: 1,
    maxFigH: 30,
    footer: [
      'Rest 60 seconds between sets.',
      'Add reps before you add weight.',
    ],
  })
}

// --- Standing stretches -----------------------------------------------------
//
// A stretch is one shape held, not a rep, so these don't get the three-frame
// strip the workout sheets use: each stretch is a card with the hold time in
// the corner and two figures sharing a floor line. A one-sided stretch shows
// the same shape on each side (`both`), a two-sided one shows the easy version
// next to the full one, so both figures are a pose you actually hold.
// Everything is done from standing - no mat, no wall, no floor.

// The same shape on the other side: the figure's sides are the two slots of
// the limb pairs, so mirroring is a swap, plus a flip of anything that leans.
function mirrorPose(pose) {
  return {
    ...pose,
    lean: -(pose.lean ?? 0),
    shift: -(pose.shift ?? 0),
    arm: [pose.arm[1], pose.arm[0]],
    leg: [pose.leg[1], pose.leg[0]],
  }
}

const STRETCHES = [
  {
    name: 'Overhead reach',
    hold: '20s',
    text: 'Reach tall, palms up.',
    frames: [
      { arm: [[92, 104], [92, 104]], leg: [[3, 3], [3, 3]] },
      { arm: [[146, 162], [146, 162]], leg: [[3, 3], [3, 3]] },
    ],
  },
  {
    name: 'Side bend',
    hold: '20s ea',
    text: 'Lean over, hips still.',
    both: true,
    pose: { lean: 26, arm: [[148, 166], [14, 10]], leg: [[9, 9], [9, 9]] },
  },
  {
    name: 'Chest opener',
    hold: '20s',
    text: 'Arms wide and back.',
    frames: [
      { arm: [[86, 92], [86, 92]], leg: [[8, 8], [8, 8]] },
      { arm: [[104, 120], [104, 120]], leg: [[8, 8], [8, 8]] },
    ],
  },
  {
    name: 'Cross-body shoulder',
    hold: '20s ea',
    text: 'Arm across, hug it in.',
    both: true,
    pose: { arm: [[88, -88], [42, -72]], leg: [[5, 5], [5, 5]] },
  },
  {
    name: 'Overhead triceps',
    hold: '20s ea',
    text: 'Elbow up, press it back.',
    both: true,
    pose: { arm: [[150, -34], [14, 10]], leg: [[5, 5], [5, 5]] },
  },
  {
    name: 'Standing quad',
    hold: '30s ea',
    text: 'Heel to the hip, knees together.',
    both: true,
    pose: { arm: [[40, 44], [16, 76]], leg: [[5, 5], [-14, 160]] },
  },
  {
    name: 'Forward fold',
    hold: '30s',
    text: 'Soft knees, let the head hang.',
    frames: [
      { lean: 34, arm: [[8, 6], [8, 6]], leg: [[3, 3], [3, 3]] },
      { lean: 66, arm: [[6, 4], [6, 4]], leg: [[3, 3], [3, 3]] },
    ],
  },
  {
    name: 'Calf stretch',
    hold: '30s ea',
    text: 'Back leg straight, heel down.',
    both: true,
    pose: { lean: 30, arm: [[74, 80], [74, 80]], leg: [[26, -8], [-24, -24]] },
  },
]

// Card grid: one stretch per cell, read across then down. Same header and
// margins as the workout sheets, so a stretch page sits next to them cleanly.
function stretchSheet(ctx, opts) {
  const { page, w, font, bold, settings } = ctx
  const { title, sub, note, poses, cols = 2, rows = 4 } = opts
  const { bg, fg } = bandColors(settings)
  const ink = settings?.highContrast ? BLACK : INK
  const left = MARGIN
  const right = w - MARGIN

  const y = sheetHeader(ctx, { title, sub, note })

  const cellW = (right - left) / cols
  const rowH = (y - MARGIN) / rows
  const pad = 3

  poses.forEach((s, slot) => {
    const cellX = left + (slot % cols) * cellW
    const cellTop = y - Math.floor(slot / cols) * rowH
    page.drawRectangle({
      x: cellX + pad,
      y: cellTop - rowH + pad,
      width: cellW - 2 * pad,
      height: rowH - 2 * pad,
      borderWidth: 0.5,
      borderColor: settings?.highContrast ? LINE : FAINT,
    })

    // Hold time in a filled chip, top right, where the figures never reach.
    const holdSize = 4.5
    const chipW = bold.widthOfTextAtSize(s.hold, holdSize) + 5
    page.drawRectangle({
      x: cellX + cellW - pad - 2 - chipW,
      y: cellTop - pad - 8,
      width: chipW,
      height: 7,
      color: bg,
    })
    page.drawText(s.hold, {
      x: cellX + cellW - pad - 2 - chipW + 2.5,
      y: cellTop - pad - 6.2,
      size: holdSize,
      font: bold,
      color: fg,
    })

    // Mirror first, so a two-sided pair leans away from itself rather than
    // the two figures folding into each other in the middle of the card.
    const frames = s.both ? [mirrorPose(s.pose), s.pose] : s.frames
    const baseY = cellTop - rowH + 16
    const stripX = cellX + pad + 2
    const stripW = cellW - 2 * pad - 4
    page.drawLine({
      start: { x: stripX, y: baseY },
      end: { x: stripX + stripW, y: baseY },
      thickness: 0.4,
      color: settings?.highContrast ? LINE : FAINT,
    })
    const frameW = stripW / frames.length
    const figH = Math.min(30, rowH - 26, frameW * 0.85)
    frames.forEach((pose, f) => {
      stickFigure(page, stripX + (f + 0.5) * frameW, baseY, figH, pose, ink)
    })

    const nameSize = 4.8
    page.drawText(s.name, {
      x: cellX + (cellW - bold.widthOfTextAtSize(s.name, nameSize)) / 2,
      y: cellTop - rowH + 9.5,
      size: nameSize,
      font: bold,
      color: ink,
    })

    const textSize = 4.1
    const line = wrapText(s.text, font, textSize, cellW - 2 * pad - 4)[0]
    page.drawText(line, {
      x: cellX + (cellW - font.widthOfTextAtSize(line, textSize)) / 2,
      y: cellTop - rowH + 4.5,
      size: textSize,
      font,
      color: ink,
    })
  })
}

function stretches(ctx) {
  stretchSheet(ctx, {
    title: 'Standing Stretches',
    sub: 'Eight holds - about 6 minutes',
    note: 'All from standing. Breathe out into each hold; never bounce.',
    poses: STRETCHES,
  })
}

// --- Seven-minute workout ---------------------------------------------------
//
// The ACSM high-intensity circuit: twelve bodyweight movements, 30 seconds of
// work and 10 to change over, ordered so upper body, lower body and core take
// turns and one group rests while the next works. Four of them need a chair or
// a wall, which is drawn from the same unit body as the figure. The floor
// movements are staged the way the dumbbell floor press is - the body lies
// along the ground line with the head to the right - so a push-up reads as a
// push-up rather than as a figure seen from above.
const CHAIR = { kind: 'box', x: 8, w: 26, h: 20 }
const CHAIR_BEHIND = { kind: 'box', x: 12, w: 26, h: 20 }
const WALL = { kind: 'wall', x: 12, h: 92 }

// Both sides of an alternating movement: posed once, mirrored for the return.
const HIGH_KNEE = { lift: 3, arm: [[30, 100], [-20, -30]], leg: [[2, 2], [72, 16]] }
const SIDE_PLANK = {
  lean: 78,
  lift: -29,
  shift: -4,
  arm: [[180, 180], [0, 90]],
  leg: [[76, 76], [-76, -76]],
}

// A push-up is one straight line from the toes to the shoulders, so the lean
// and the leg angle are the same angle: at the top the line clears the floor
// by an arm's length, at the bottom by a bent arm's.
const PUSHUP_TOP = {
  lean: 65,
  lift: -24,
  shift: -4,
  arm: [[0, 0], [0, 0]],
  leg: [[65, 65], [-65, -65]],
}

const SEVEN = [
  {
    name: 'Jumping jacks',
    reps: '30s',
    text: 'Feet out and arms overhead; land soft, keep a rhythm.',
    frames: [
      { arm: [[10, 8], [10, 8]], leg: [[4, 4], [4, 4]] },
      { lift: 7, arm: [[74, 84], [74, 84]], leg: [[18, 18], [18, 18]] },
      { lift: 11, arm: [[150, 166], [150, 166]], leg: [[30, 30], [30, 30]] },
    ],
  },
  {
    name: 'Wall sit',
    reps: '30s',
    text: 'Back flat on the wall, thighs level, hold still.',
    frames: [
      { prop: WALL, arm: [[6, -6], [-6, 6]], leg: [[2, 0], [-2, 0]] },
      { prop: WALL, lift: -9, arm: [[6, -6], [-6, 6]], leg: [[46, -24], [-46, 24]] },
      { prop: WALL, lift: -22, arm: [[6, -6], [-6, 6]], leg: [[90, 0], [-90, 0]] },
    ],
  },
  {
    name: 'Push-up',
    figH: 40,
    reps: '30s',
    text: 'Hands under the shoulders; body stays one straight line.',
    frames: [
      PUSHUP_TOP,
      { lean: 74, lift: -30, shift: -4, arm: [[40, -55], [-40, 55]], leg: [[74, 74], [-74, -74]] },
    ],
  },
  {
    name: 'Abdominal crunch',
    figH: 40,
    reps: '30s',
    text: 'Knees up; curl the shoulders off the floor, then lower.',
    frames: [
      { ...SUPINE, arm: [[118, 118], [-118, -118]] },
      { ...SUPINE, lean: 62, arm: [[100, 100], [-100, -100]] },
    ],
  },
  {
    name: 'Step-up onto chair',
    reps: '30s',
    text: 'Whole foot on the seat; stand up tall, step back down.',
    frames: [
      { prop: CHAIR, arm: [[10, 10], [10, 10]], leg: [[3, 3], [3, 3]] },
      { prop: CHAIR, lean: 8, shift: 3, arm: [[14, 14], [14, 14]], leg: [[3, 3], [80, -26]] },
      { prop: CHAIR, lift: 20, shift: 20, arm: [[12, 12], [12, 12]], leg: [[3, 3], [3, 3]] },
    ],
  },
  {
    name: 'Squat',
    reps: '30s',
    text: 'Feet shoulder width; sit down, drive up through the heels.',
    frames: LEGS[0].frames,
  },
  {
    name: 'Triceps dip on chair',
    figH: 38,
    reps: '30s',
    text: 'Hands on the edge behind you; elbows track straight back.',
    frames: [
      { prop: CHAIR_BEHIND, lift: -26, shift: 8, arm: [[-24, -24], [24, 24]], leg: [[68, 68], [-68, -68]] },
      { prop: CHAIR_BEHIND, lift: -30, shift: 8, arm: [[-60, 7], [60, -7]], leg: [[78, 66], [-78, -66]] },
    ],
  },
  {
    name: 'Plank',
    figH: 36,
    reps: '30s',
    text: 'Elbows under the shoulders. Knees down if the hips sag.',
    frames: [
      { lean: 86, lift: -25, shift: -4, arm: [[0, -90], [0, 90]], leg: [[51, 90], [-51, -90]] },
      { lean: 75, lift: -31, shift: -4, arm: [[0, -90], [0, 90]], leg: [[79, 79], [-79, -79]] },
    ],
  },
  {
    name: 'High knees',
    reps: '30s',
    text: 'Run on the spot; drive each knee up to hip height.',
    frames: [
      HIGH_KNEE,
      { lift: 6, arm: [[16, 20], [16, 20]], leg: [[8, 8], [8, 8]] },
      mirrorPose(HIGH_KNEE),
    ],
  },
  {
    name: 'Lunge',
    reps: '30s',
    text: 'Step back, drop the rear knee, drive up. Alternate legs.',
    frames: [
      { arm: [[30, -32], [30, -32]], leg: [[5, 5], [5, 5]] },
      { lift: -2, arm: [[32, -34], [32, -34]], leg: [[16, -14], [-26, -6]] },
      { lift: -5, arm: [[34, -36], [34, -36]], leg: [[30, -30], [-38, 6]] },
    ],
  },
  {
    name: 'Push-up + rotation',
    figH: 38,
    reps: '30s',
    text: 'Push up, then turn into a side plank, top arm to the ceiling.',
    frames: [
      PUSHUP_TOP,
      { ...PUSHUP_TOP, arm: [[180, 180], [0, 0]] },
    ],
  },
  {
    name: 'Side plank',
    figH: 36,
    reps: '30s',
    text: 'Hips up, body in a line. Half the time on each side.',
    frames: [mirrorPose(SIDE_PLANK), SIDE_PLANK],
  },
]

// Six movements a page, on the same four-row grid as the taiso pages, so the
// two halves of the circuit line up when they sit side by side.
function sevenMin(ctx, from, to) {
  moveSheet(ctx, {
    title: 'Seven-Minute Workout',
    sub: `Movements ${from + 1} - ${to}`,
    note: '30 seconds each, 10 to change over. Needs a chair and a wall.',
    moves: SEVEN.slice(from, to),
    numberFrom: from + 1,
    maxFigH: 28,
    footer:
      from === 0
        ? [
            'Work hard enough that the last few seconds are a fight.',
            'Movements 7 - 12 finish the round.',
          ]
        : [
            'One round is seven minutes. Go again if you have more in you.',
            'The order alternates upper body, lower body and core.',
          ],
  })
}

// US amateur band plan (FCC Part 97, 97.301/97.305/97.307/97.313) as a bar
// chart: one bar per licence class. Hatched where only CW is allowed
// (Technician segments on 80/40/15 m, and the bottom 100 kHz of 6 m and
// 2 m), black where CW, RTTY and data are allowed, and grey where phone and
// image are also allowed. Each band is stretched to the full bar width, so
// the scale changes from band to band like the ARRL chart.
const CWO = 'cwonly'
const CW = 'cw'
const PH = 'ph'
const HF_BANDS = [
  { band: '80 m', lo: 3.5, hi: 4.0, rows: [
    ['E', [[3.5, 3.6, CW], [3.6, 4.0, PH]]],
    ['G', [[3.525, 3.6, CW], [3.8, 4.0, PH]]],
    ['T', [[3.525, 3.6, CWO]]],
  ] },
  { band: '40 m', lo: 7.0, hi: 7.3, rows: [
    ['E', [[7.0, 7.125, CW], [7.125, 7.3, PH]]],
    ['G', [[7.025, 7.125, CW], [7.175, 7.3, PH]]],
    ['T', [[7.025, 7.125, CWO]]],
  ] },
  { band: '30 m', lo: 10.1, hi: 10.15, rows: [['E G', [[10.1, 10.15, CW]]]], note: '200 W all classes' },
  { band: '20 m', lo: 14.0, hi: 14.35, rows: [
    ['E', [[14.0, 14.15, CW], [14.15, 14.35, PH]]],
    ['G', [[14.025, 14.15, CW], [14.225, 14.35, PH]]],
  ] },
  { band: '17 m', lo: 18.068, hi: 18.168, rows: [['E G', [[18.068, 18.11, CW], [18.11, 18.168, PH]]]] },
  { band: '15 m', lo: 21.0, hi: 21.45, rows: [
    ['E', [[21.0, 21.2, CW], [21.2, 21.45, PH]]],
    ['G', [[21.025, 21.2, CW], [21.275, 21.45, PH]]],
    ['T', [[21.025, 21.2, CWO]]],
  ] },
  { band: '12 m', lo: 24.89, hi: 24.99, rows: [['E G', [[24.89, 24.93, CW], [24.93, 24.99, PH]]]] },
  { band: '10 m', lo: 28.0, hi: 29.7, rows: [
    ['E G', [[28.0, 28.3, CW], [28.3, 29.7, PH]]],
    ['T', [[28.0, 28.3, CW], [28.3, 28.5, PH]]],
  ] },
  { band: '6 m', lo: 50, hi: 54, rows: [['All', [[50, 50.1, CWO], [50.1, 54, PH]]]] },
  { band: '2 m', lo: 144, hi: 148, rows: [['All', [[144, 144.1, CWO], [144.1, 148, PH]]]] },
  { band: '70 cm', lo: 420, hi: 450, rows: [['All', [[420, 450, PH]]]] },
]

const BAND_NOTES = [
  'Tech: 200 W PEP on HF, 1500 W from 6 m up.  1.25 m 222-225: all modes, all classes (T and up).',
  '160 m 1.8-2.0: all modes (E G A).  60 m (E G A): USB, CW, data, 100 W ERP, dial 5330.5, 5346.5, 5357.0, 5371.5, 5403.5 kHz.',
]

// Diagonal hatching clipped to a rectangle, drawn as individual 45-degree
// lines so no PDF clipping path is needed.
function hatchRect(page, x, y, wd, ht, color) {
  const step = 1.5
  for (let c = x - y - ht; c <= x + wd - y; c += step) {
    const xa = Math.max(x, y + c)
    const xb = Math.min(x + wd, y + ht + c)
    if (xb <= xa) continue
    page.drawLine({ start: { x: xa, y: xa - c }, end: { x: xb, y: xb - c }, thickness: 0.35, color })
  }
}

function bandPlan({ page, w, h, font, bold, settings }) {
  const ink = settings?.highContrast ? BLACK : INK
  const grey = settings?.highContrast ? rgb(0.55, 0.55, 0.55) : rgb(0.7, 0.73, 0.77)
  let y = sheetHeader({ page, w, h, font, bold, settings }, {
    title: 'US Amateur Bands',
    sub: 'E = Extra, G = General, T = Technician (Advanced not shown)',
    note: 'Hatched: CW only.  Black: CW, RTTY, data.  Grey: phone and image too (CW allowed).',
  })
  const labelW = 22
  const classW = 10
  const bx0 = MARGIN + labelW + classW
  const bx1 = w - MARGIN
  const rowH = 4
  const rowGap = 0.7
  const freqSize = 4
  y -= 3
  for (const { band, lo, hi, rows, note } of HF_BANDS) {
    const X = (f) => bx0 + ((f - lo) / (hi - lo)) * (bx1 - bx0)
    const top = y
    // Band label, vertically centred on the bar stack.
    const stackH = rows.length * (rowH + rowGap) - rowGap
    page.drawText(band, { x: MARGIN, y: top - stackH / 2 - 2.5, size: 6.5, font: bold, color: ink })
    const edges = new Set([lo, hi])
    rows.forEach(([cls, segs], i) => {
      const ry = top - (i + 1) * rowH - i * rowGap
      page.drawText(cls, { x: MARGIN + labelW, y: ry + 0.8, size: 4.5, font: bold, color: ink })
      page.drawRectangle({ x: bx0, y: ry, width: bx1 - bx0, height: rowH, borderWidth: 0.3, borderColor: LINE })
      for (const [a, b, kind] of segs) {
        edges.add(a)
        edges.add(b)
        const sx = X(a)
        const sw = X(b) - X(a)
        if (kind === CWO) {
          hatchRect(page, sx, ry, sw, rowH, ink)
          page.drawRectangle({ x: sx, y: ry, width: sw, height: rowH, borderWidth: 0.3, borderColor: ink })
        } else {
          page.drawRectangle({ x: sx, y: ry, width: sw, height: rowH, color: kind === CW ? ink : grey })
        }
      }
    })
    y = top - stackH
    // Frequency labels under the stack; a label that would collide with the
    // previous one drops to a second line.
    const sorted = [...edges].sort((a, b) => a - b)
    let lastRight = [-Infinity, -Infinity]
    const placed = []
    let usedRows = 1
    for (const f of sorted) {
      const label = f.toFixed(3)
      const tw = font.widthOfTextAtSize(label, freqSize)
      let x = Math.min(Math.max(X(f) - tw / 2, bx0 - 6), bx1 - tw + 6)
      const row = x < lastRight[0] + 2 ? 1 : 0
      if (row === 1) usedRows = 2
      else placed.push([x, x + tw])
      lastRight[row] = x + tw
      page.drawLine({ start: { x: X(f), y: y + 0.5 }, end: { x: X(f), y: y - 1.5 }, thickness: 0.3, color: ink })
      page.drawText(label, { x, y: y - 2 - freqSize - row * (freqSize + 0.5), size: freqSize, font, color: ink })
    }
    if (note) {
      // The note goes in the widest gap between first-line labels if it
      // fits there, otherwise right-aligned on the second line.
      const tw = font.widthOfTextAtSize(note, 4.5)
      let best = null
      for (let i = 1; i < placed.length; i++) {
        const gap = placed[i][0] - placed[i - 1][1]
        if (gap >= tw + 8 && (!best || gap > best[1])) best = [placed[i - 1][1] + (gap - tw) / 2, gap]
      }
      const row = best ? 0 : 1
      if (row === 1) usedRows = 2
      const nx = best ? best[0] : bx1 - tw - 4
      page.drawText(note, { x: nx, y: y - 2 - freqSize - row * (freqSize + 0.5), size: 4.5, font, color: ink })
    }
    y -= 2 + usedRows * (freqSize + 0.5) + 2
  }
  for (const text of BAND_NOTES) {
    for (const line of wrapText(text, font, 4.5, w - 2 * MARGIN)) {
      y -= 5.5
      page.drawText(line, { x: MARGIN, y, size: 4.5, font, color: ink })
    }
  }
}

const RADIO_FREQS = [
  S('Calling (MHz)', [
    ['2 m FM simplex', '146.520'], ['70 cm FM', '446.000'], ['6 m FM', '52.525'],
    ['6 m SSB', '50.125'], ['2 m SSB', '144.200'], ['70 cm SSB', '432.100'],
    ['10 m SSB', '28.400'], ['1.25 m FM', '223.500'],
  ]),
  S('QRP calling', [
    ['CW', 'SSB'], ['3.560', '3.985'], ['7.030', '7.285'], ['10.106', '-'], ['14.060', '14.285'],
    ['18.096', '18.130'], ['21.060', '21.385'], ['24.906', '24.950'], ['28.060', '28.385'],
  ]),
  S('FT8', [
    ['80 m', '3.573'], ['40 m', '7.074'], ['30 m', '10.136'], ['20 m', '14.074'], ['17 m', '18.100'],
    ['15 m', '21.074'], ['12 m', '24.915'], ['10 m', '28.074'], ['6 m', '50.313'],
  ]),
  S('Repeater offsets', [
    ['6 m', '-500 kHz'], ['2 m', '+/- 600 kHz'], ['1.25 m', '-1.6 MHz'], ['70 cm', '+/- 5 MHz'],
    ['33 cm', '-12 MHz'],
    '2 m minus: 145.1 - 145.5,', '   146.6 - 147.0, 147.6 - 148', '2 m plus: 146.0 - 146.4,', '   147.0 - 147.4',
  ]),
  S('CTCSS tones (Hz)', [
    ['67.0', '94.8', '131.8', '179.9'], ['71.9', '97.4', '136.5', '186.2'], ['74.4', '100.0', '141.3', '192.8'],
    ['77.0', '103.5', '146.2', '203.5'], ['79.7', '107.2', '151.4', '210.7'], ['82.5', '110.9', '156.7', '218.1'],
    ['85.4', '114.8', '162.2', '225.7'], ['88.5', '118.8', '167.9', '233.6'], ['91.5', '123.0', '173.8', '241.8'],
    ['', '127.3', '', '250.3'],
  ]),
  S('Other services (MHz)', [
    'WWV: 2.5, 5, 10, 15, 20', 'NOAA wx: 162.400 - .550', '   7 ch, 25 kHz steps',
    'Marine 16: 156.800', 'Air distress: 121.5', 'CB ch 9: 27.065, 19: 27.185',
    'FRS/GMRS 1-7: 462.5625 +', '   ch 8-14: 467.5625 +', '   ch 15-22: 462.550 +',
    '   (25 kHz steps)', 'MURS: 151.820, .880, .940', '   154.570, 154.600',
  ]),
]
const radioFreqs = (ctx) => refSheet(ctx, { title: 'Radio frequencies', sections: RADIO_FREQS })

// --- Code tables -----------------------------------------------------------

const MORSE_LETTERS = 'A .-|B -...|C -.-.|D -..|E .|F ..-.|G --.|H ....|I ..|J .---|K -.-|L .-..|M --|N -.|O ---|P .--.|Q --.-|R .-.|S ...|T -|U ..-|V ...-|W .--|X -..-|Y -.--|Z --..'
const MORSE_DIGITS = '1 .----|2 ..---|3 ...--|4 ....-|5 .....|6 -....|7 --...|8 ---..|9 ----.|0 -----'
const morseRows = (str) => str.split('|').map((e) => e.split(' '))
const MORSE = [
  S('Letters', morseRows(MORSE_LETTERS)),
  S('Numbers', morseRows(MORSE_DIGITS)),
  S('Punctuation', [
    ['. period', '.-.-.-'], [', comma', '--..--'], ['? query', '..--..'], ['/ slash', '-..-.'],
    ['= break', '-...-'], ['- hyphen', '-....-'], ['error', '........'],
  ]),
  S('Prosigns (run together)', [
    ['AR', '.-.-.', 'end of msg'], ['SK', '...-.-', 'end contact'],
    ['BT', '-...-', 'paragraph'], ['KN', '-.--.', 'named stn'],
    ['AS', '.-...', 'wait'], ['SOS', '...---...', 'distress'],
  ]),
  S('Timing', [
    'dot = 1, dash = 3', 'gap in a letter = 1',
    'between letters = 3', 'between words = 7',
    '20 wpm: dot = 60 ms',
  ]),
  S('Common abbreviations', [
    ['CQ', 'calling anyone'], ['DE', 'from'], ['K', 'go ahead'], ['R', 'received'],
    ['73', 'best regards'], ['TU', 'thank you'],
  ]),
]
// Two Morse trees, one per opening element: the dot tree rooted at E on the
// top of the page and the dash tree rooted at T below it. Each is drawn as a
// left-to-right chart: from a node go up for a dot and down for a dash, and
// the letter you land on is the character. Rows are allotted only where a
// character exists, so the page height carries the leaves and the page
// width carries the codes, and the marks can be drawn at a printable size.
const MORSE_EXTRA = 'Ü ..--|Ä .-.-|Ö ---.|CH ----|= -...-|/ -..-.|+ .-.-.'
// Width of a code drawn by drawMorseCode: a dot is `unit` wide, a dash 2.5
// units, with a unit gap between elements.
const morseWidth = (code, unit) =>
  [...code].reduce((n, c) => n + (c === '-' ? unit * 2.5 : unit), 0) + unit * (code.length - 1)
// Draw a code as filled dots and solid bars, starting at x and centred
// vertically on y. Text glyphs print as specks at small sizes, so the marks
// are drawn as shapes.
function drawMorseCode(page, x, y, code, unit, ink) {
  const dash = unit * 2.5
  let cx = x
  for (const c of code) {
    if (c === '-') {
      page.drawRectangle({ x: cx, y: y - unit / 2, width: dash, height: unit, color: ink })
      cx += dash + unit
    } else {
      page.drawCircle({ x: cx + unit / 2, y, size: unit / 2, color: ink })
      cx += unit + unit
    }
  }
}
function morseTree(ctx) {
  const { page, bold, settings, w: W, h: H } = ctx
  const ink = settings?.highContrast ? BLACK : INK
  const wire = settings?.highContrast ? INK : LINE
  const byCode = new Map()
  for (const src of [MORSE_LETTERS, MORSE_DIGITS, MORSE_EXTRA]) {
    for (const [ch, code] of morseRows(src)) byCode.set(code, ch)
  }
  const size = 8 // type size for every node
  const u = 1.8 // dot diameter; a dash is 2.5 units long
  const textGap = 3 // between a letter and its code
  const link = 8 // horizontal room for the connector between columns

  // Allot rows depth first: a node with no children takes the next row; a
  // node with children sits midway between them. Both trees share one row
  // counter with half a row between them.
  const nodes = [] // { code, ch, level, row, children }
  let nextRow = 0
  const place = (code, level) => {
    const ch = byCode.get(code)
    if (!ch) return null
    const children = ['.', '-'].map((c) => place(code + c, level + 1)).filter(Boolean)
    const row = children.length ? (children[0].row + children[children.length - 1].row) / 2 : nextRow++
    const node = { code, ch, level, row, children }
    nodes.push(node)
    return node
  }
  place('.', 0)
  nextRow += 0.5
  place('-', 0)

  // Column widths follow the widest node at each level.
  const depth = Math.max(...nodes.map((n) => n.level))
  const colW = Array.from({ length: depth + 1 }, () => 0)
  for (const n of nodes) {
    const w = bold.widthOfTextAtSize(n.ch, size) + textGap + morseWidth(n.code, u)
    colW[n.level] = Math.max(colW[n.level], w)
  }
  // Centre the chart on the page, keeping equal padding on every side.
  const chartW = colW.reduce((a, b) => a + b, 0) + link * depth
  const colX = [(W - chartW) / 2]
  for (let l = 0; l < depth; l++) colX.push(colX[l] + colW[l] + link)
  const rowH = (H - 24) / nextRow
  const top = H - (H - rowH * nextRow) / 2
  const yOf = (row) => top - (row + 0.5) * rowH

  for (const n of nodes) {
    const x = colX[n.level]
    const y = yOf(n.row)
    const lw = bold.widthOfTextAtSize(n.ch, size)
    page.drawText(n.ch, { x, y: y - size * 0.36, size, font: bold, color: ink })
    drawMorseCode(page, x + lw + textGap, y, n.code, u, ink)
    if (!n.children.length) continue
    // Connector: out from the code, down a bus spanning the children, and
    // a stub into each child.
    const from = x + lw + textGap + morseWidth(n.code, u) + 2
    const busX = colX[n.level + 1] - link / 2
    const into = colX[n.level + 1] - 1.5
    const line = (a, b) => page.drawLine({ start: a, end: b, thickness: 0.8, color: wire })
    line({ x: from, y }, { x: busX, y })
    if (n.children.length > 1) {
      line({ x: busX, y: yOf(n.children[0].row) }, { x: busX, y: yOf(n.children[1].row) })
    }
    for (const c of n.children) line({ x: busX, y: yOf(c.row) }, { x: into, y: yOf(c.row) })
  }
}

const morseSheet = (ctx) => refSheet(ctx, { title: 'Morse code', sections: MORSE })

const NATO = 'Alfa Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett Kilo Lima Mike November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey X-ray Yankee Zulu'.split(' ')
const PHONETICS = [
  S('', NATO.map((n) => [n[0].toUpperCase(), n])),
  S('Phone contact', [
    'CQ CQ CQ, this is [call],', '   [call], calling CQ and', '   standing by',
    'Answer: [their call], this', '   is [call], over',
    'Exchange: RST, name, QTH,', '   rig, antenna, weather',
    'Close: 73, [their call],', '   this is [call], clear',
  ]),
  S('Before calling', [
    'Listen, then: "Is this', '   frequency in use? [call]"',
    'Ask twice, then call CQ',
  ]),
  S('Repeater', [
    '"[call] listening" or', '   "[call] monitoring"',
    'To call: "[their call],', '   [your call]"',
    'Join: say "[call]" between', '   overs, not "break"',
    'Sign off: "[call], clear', '   and monitoring"',
  ]),
  S('Net and emergency', [
    'Net: "[call], [name],', '   [town], no traffic"',
    'Report: "You are 5 9', '   into [town]"',
    'Emergency: "Break, break,', '   [call], emergency traffic"',
  ]),
]
const QCODES = [
  S('', [
    ['QRA', 'station name'], ['QRG', 'exact frequency'], ['QRH', 'freq drifting'],
    ['QRK', 'readability'], ['QRL', 'frequency busy'], ['QRM', 'interference'],
    ['QRN', 'static, noise'], ['QRO', 'high power'], ['QRP', 'low power'],
    ['QRQ', 'send faster'], ['QRS', 'send slower'], ['QRT', 'stop sending'],
    ['QRU', 'nothing for you'], ['QRV', 'ready'], ['QRX', 'stand by'],
    ['QRZ', 'who is calling?'], ['QSA', 'signal strength'], ['QSB', 'fading'],
    ['QSD', 'defective keying'], ['QSK', 'break-in'], ['QSL', 'confirmed'],
    ['QSO', 'a contact'], ['QSP', 'relay to'], ['QST', 'call to all'],
    ['QSX', 'listening on'], ['QSY', 'change frequency'], ['QTC', 'have messages'],
    ['QTH', 'location'], ['QTR', 'time (UTC)'],
  ]),
  S('RST: readability', [
    ['1', 'unreadable'], ['2', 'barely readable'], ['3', 'with difficulty'],
    ['4', 'little difficulty'], ['5', 'perfectly readable'],
  ]),
  S('Strength', [
    ['1', 'faint'], ['3', 'weak'], ['5', 'fairly good'],
    ['7', 'moderately strong'], ['9', 'very strong'],
    '1 S-unit = 6 dB; S9 = 50 µV',
  ]),
  S('Tone (CW only)', [
    ['1 - 4', 'rough, raw AC'], ['5 - 8', 'some hum or ripple'], ['9', 'pure tone'],
    'Add C chirp, K clicks',
    '59 phone, 599 CW', '5NN = 599 in contests',
  ]),
  S('Radio words', [
    'CQ = calling anyone', 'Break = urgent traffic', 'Roger = received',
    'Wilco = will comply', 'Over = your turn', 'Clear = leaving the air',
    'Stand by = wait', 'Say again = repeat',
  ]),
]
const phoneticsSheet = (ctx) => refSheet(ctx, { title: 'Phonetics and phone', sections: PHONETICS })
const qcodeSheet = (ctx) => refSheet(ctx, { title: 'Q-codes and RST', sections: QCODES })

function toRoman(n) {
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let out = ''
  for (const [v, r] of map) while (n >= v) { out += r; n -= v }
  return out
}
const romanPairs = (a, b) => a.map((n, i) => [String(n), toRoman(n), String(b[i]), toRoman(b[i])])
const ROMAN = [
  S('1 to 20', romanPairs([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [11, 12, 13, 14, 15, 16, 17, 18, 19, 20])),
  S('Tens and hundreds', [
    ...romanPairs([30, 40, 50, 60, 70, 80, 90, 100], [200, 300, 400, 500, 600, 700, 800, 900]),
    ['', '', '1000', 'M'],
  ]),
  S('Rules', [
    'I V X L C D M', '1 5 10 50 100 500 1000',
    'Add left to right; smaller', '   first subtracts: IV IX',
    '   XL XC CD CM only', 'IIII only on clock faces',
  ]),
  S('Years', [1776, 1999, 2024, 2026].map((n) => [String(n), toRoman(n)])),
  S('Number bases', Array.from({ length: 16 }, (_, n) => [String(n), n.toString(2).padStart(4, '0'), n.toString(16).toUpperCase()]), ['dec', 'bin', 'hex']),
  S('Powers of two', [
    ['2^8', '256'], ['2^10', '1,024 (1 K)'], ['2^16', '65,536'], ['2^20', '1,048,576 (1 M)'], ['2^32', '4.29 billion'],
  ]),
]
const romanSheet = (ctx) => refSheet(ctx, { title: 'Roman numerals and bases', sections: ROMAN })

// Dropdown groups, in display order.
export const GROUPS = ['Cover & notes', 'Planner', 'Logs', 'Reference', 'Ham radio', 'Knots', 'Exercise']

export const TEMPLATES = {
  cover: { label: 'Cover', group: 'Cover & notes', draw: cover },
  blank: { label: 'Blank', group: 'Cover & notes', draw: blank },
  lined: { label: 'Lined', group: 'Cover & notes', draw: lined },
  linedRoomy: { label: 'Lined (roomy)', group: 'Cover & notes', draw: (ctx) => lined(ctx, 24) },
  dotgrid: { label: 'Dot grid', group: 'Cover & notes', draw: dotgrid },
  grid: { label: 'Graph grid', group: 'Cover & notes', draw: grid },
  checklist: { label: 'Checklist', group: 'Cover & notes', draw: checklist },
  storyboard: { label: 'Storyboard', group: 'Cover & notes', draw: storyboard },
  ledger: { label: 'Transaction log', group: 'Logs', draw: ledger },
  ledgerRoomy: { label: 'Transaction log (roomy)', group: 'Logs', draw: (ctx) => ledger(ctx, 20) },
  radiolog: { label: 'Radio contact log', group: 'Ham radio', draw: radiolog },
  radiologRoomy: { label: 'Radio contact log (roomy)', group: 'Ham radio', draw: (ctx) => radiolog(ctx, { rowH: 19 }) },
  radiologBand: { label: 'Radio contact log (one band)', group: 'Ham radio', draw: (ctx) => radiolog(ctx, { bandColumn: false, rowH: 13 }) },
  radiologCompact: { label: 'Radio contact log (2-up)', group: 'Ham radio', draw: radiologCompact },
  address: { label: 'Address book (4/page)', group: 'Logs', draw: (ctx) => address(ctx, 15, 8) },
  addressRoomy: { label: 'Address book (3/page)', group: 'Logs', draw: (ctx) => address(ctx, 19, 12) },
  conversions: { label: 'Unit conversions', group: 'Reference', draw: conversions },
  tempTable: { label: 'Temperature F / C', group: 'Reference', draw: tempTable },
  weights: { label: 'Weight of things', group: 'Reference', draw: weights },
  speedTable: { label: 'Speed, pace and fuel', group: 'Reference', draw: speedTable },
  areaSheet: { label: 'Area, volume and coverage', group: 'Reference', draw: areaSheet },
  shopTable: { label: 'Fractions and mm', group: 'Reference', draw: shopTable },
  electrical: { label: 'Electrical and radio', group: 'Ham radio', draw: electrical },
  electronicsSheet: { label: 'Electronics formulas', group: 'Ham radio', draw: electronicsSheet },
  energySheet: { label: 'Pressure, power and energy', group: 'Reference', draw: energySheet },
  kitchenSheet: { label: 'Kitchen', group: 'Reference', draw: kitchenSheet },
  fitnessSheet: { label: 'Fitness numbers', group: 'Exercise', draw: fitnessSheet },
  mathSheet: { label: 'Math and formulas', group: 'Reference', draw: mathSheet },
  romanSheet: { label: 'Roman numerals and bases', group: 'Reference', draw: romanSheet },
  morseTree: { label: 'Morse code tree', group: 'Ham radio', draw: morseTree },
  morseSheet: { label: 'Morse code table', group: 'Ham radio', draw: morseSheet },
  phoneticsSheet: { label: 'Phonetics and phone', group: 'Ham radio', draw: phoneticsSheet },
  qcodeSheet: { label: 'Q-codes and RST', group: 'Ham radio', draw: qcodeSheet },
  bandPlan: { label: 'US amateur band plan', group: 'Ham radio', draw: bandPlan },
  radioFreqs: { label: 'Radio frequencies', group: 'Ham radio', draw: radioFreqs },
  ropeKnots: { label: 'Bowline', group: 'Knots', draw: ropeKnots, image: 'bowline' },
  ropeKnots2: { label: 'Sheet bend', group: 'Knots', draw: ropeKnots2, image: 'sheetbend' },
  tautLine: { label: 'Taut-line hitch', group: 'Knots', draw: tautLine, image: 'tautline' },
  prusik: { label: 'Prusik', group: 'Knots', draw: prusik, image: 'prusik' },
  cloveHitch: { label: 'Clove hitch', group: 'Knots', draw: cloveHitch, image: 'clove' },
  twoHalfHitches: { label: 'Two half hitches', group: 'Knots', draw: twoHalfHitches, image: 'twohalf' },
  truckersHitch: { label: "Trucker's hitch", group: 'Knots', draw: truckersHitch, image: 'truckers' },
  ropeNotes: { label: 'Rope and line notes', group: 'Knots', draw: ropeNotes },
  fishingKnots: { label: 'Improved clinch', group: 'Knots', draw: fishingKnots, image: 'clinch' },
  fishingKnots2: { label: 'Palomar', group: 'Knots', draw: fishingKnots2, image: 'palomar' },
  fishingKnots3: { label: 'Uni knot', group: 'Knots', draw: fishingKnots3, image: 'uni' },
  taisoA: { label: 'Radio taiso (moves 1-7)', group: 'Exercise', draw: (ctx) => taiso(ctx, 0, 7) },
  taisoB: { label: 'Radio taiso (moves 8-13)', group: 'Exercise', draw: (ctx) => taiso(ctx, 7, 13) },
  dumbbellArms: { label: 'Dumbbell arms', group: 'Exercise', draw: dumbbellArms },
  dumbbellFull: { label: 'Dumbbell full body', group: 'Exercise', draw: (ctx) => dumbbellFull(ctx, 0, 8) },
  dumbbellFullA: { label: 'Dumbbell full body (moves 1-4)', group: 'Exercise', draw: (ctx) => dumbbellFull(ctx, 0, 4) },
  dumbbellFullB: { label: 'Dumbbell full body (moves 5-8)', group: 'Exercise', draw: (ctx) => dumbbellFull(ctx, 4, 8) },
  legs: { label: 'Bodyweight legs', group: 'Exercise', draw: legs },
  sevenMinA: { label: 'Seven-minute workout (1-6)', group: 'Exercise', draw: (ctx) => sevenMin(ctx, 0, 6) },
  sevenMinB: { label: 'Seven-minute workout (7-12)', group: 'Exercise', draw: (ctx) => sevenMin(ctx, 6, 12) },
  stretches: { label: 'Standing stretches', group: 'Exercise', draw: stretches },
  week: { label: 'Week (Sun-Sat)', group: 'Planner', draw: week, usesWeek: true },
  weekSplit: { label: 'Week (classic planner)', group: 'Planner', draw: weekSplit, usesWeek: true },
  calendar: { label: 'Month calendar', group: 'Planner', draw: calendar, usesMonth: true },
  calendarCheck: { label: 'Month + checkboxes', group: 'Planner', draw: (ctx) => calendar(ctx, { checkboxes: true }), usesMonth: true },
  calendarWide: { label: 'Month (horizontal)', group: 'Planner', draw: calendarWide, usesMonth: true },
  calendarWideCheck: { label: 'Month (horizontal) + checkboxes', group: 'Planner', draw: (ctx) => calendarWide(ctx, { checkboxes: true }), usesMonth: true },
  fourWeeks: { label: 'Next 4 weeks', group: 'Planner', draw: fourWeeks, usesWeek: true },
  fourWeeksWide: { label: 'Next 4 weeks (horizontal)', group: 'Planner', draw: fourWeeksWide, usesWeek: true },
  year: { label: 'Year calendar', group: 'Planner', draw: yearCalendar },
}
