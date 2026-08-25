import {
  rgb,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
} from 'pdf-lib'

// All draw functions work in local coordinates: (0,0) is the bottom-left of
// the mini-page, (w,h) the top-right. The imposition layer has already applied
// the transform that places (and possibly rotates) the cell on the sheet.

const LINE = rgb(0.72, 0.76, 0.8)
const FAINT = rgb(0.85, 0.88, 0.91)
const INK = rgb(0.15, 0.17, 0.2)
const BLACK = rgb(0, 0, 0)
const WHITE = rgb(1, 1, 1)
const MARGIN = 16

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

const CONVERSIONS = [
  ['Length', [
    '1 in = 2.54 cm',
    '1 ft = 30.5 cm',
    '1 yd = 0.914 m',
    '1 mi = 1.609 km',
    '1 m = 3.28 ft',
  ]],
  ['Weight', [
    '1 oz = 28.3 g',
    '1 lb = 454 g',
    '1 kg = 2.20 lb',
  ]],
  ['Volume', [
    '1 tsp = 4.9 ml',
    '1 tbsp = 14.8 ml',
    '1 fl oz = 29.6 ml',
    '1 cup = 237 ml',
    '1 qt = 0.946 L',
    '1 gal = 3.785 L',
  ]],
  ['Kitchen', [
    '3 tsp = 1 tbsp',
    '16 tbsp = 1 cup',
    '2 cups = 1 pint',
    '4 cups = 1 quart',
  ]],
  ['Temperature', [
    'C = (F - 32) x 5/9',
    'F = C x 9/5 + 32',
    '0 C = 32 F, 100 C = 212 F',
    '350 F = 177 C (oven)',
  ]],
]

function conversions({ page, w, h, font, bold }) {
  const left = MARGIN
  const size = 6
  const lineGap = 8.2
  const sectionGap = 5
  let y = h - MARGIN - size
  for (const [heading, entries] of CONVERSIONS) {
    page.drawText(heading, { x: left, y, size: size + 1, font: bold, color: INK })
    y -= lineGap + 1
    for (const entry of entries) {
      if (y < MARGIN) return
      page.drawText(entry, { x: left + 6, y, size, font, color: INK })
      y -= lineGap
    }
    y -= sectionGap
  }
}

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

function wrapText(text, font, size, maxWidth) {
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
  page.drawRectangle({
    x: inset,
    y: inset,
    width: w - 2 * inset,
    height: h - 2 * inset,
    borderWidth: 1.2,
    borderColor: INK,
  })
  page.drawRectangle({
    x: inset + 3,
    y: inset + 3,
    width: w - 2 * (inset + 3),
    height: h - 2 * (inset + 3),
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
function sheetHeader({ page, w, h, font, bold, settings }, { title, sub, note }) {
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

  y -= 9
  page.drawText(sub, {
    x: (w - font.widthOfTextAtSize(sub, 5.5)) / 2,
    y,
    size: 5.5,
    font,
    color: ink,
  })

  y -= 8
  page.drawText(note, {
    x: (w - font.widthOfTextAtSize(note, 4.5)) / 2,
    y,
    size: 4.5,
    font,
    color: settings?.highContrast ? ink : LINE,
  })

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

export const TEMPLATES = {
  cover: { label: 'Cover', draw: cover },
  blank: { label: 'Blank', draw: blank },
  lined: { label: 'Lined', draw: lined },
  linedRoomy: { label: 'Lined (roomy)', draw: (ctx) => lined(ctx, 24) },
  dotgrid: { label: 'Dot grid', draw: dotgrid },
  grid: { label: 'Graph grid', draw: grid },
  checklist: { label: 'Checklist', draw: checklist },
  storyboard: { label: 'Storyboard', draw: storyboard },
  ledger: { label: 'Transaction log', draw: ledger },
  ledgerRoomy: { label: 'Transaction log (roomy)', draw: (ctx) => ledger(ctx, 20) },
  radiolog: { label: 'Radio contact log', draw: radiolog },
  radiologRoomy: { label: 'Radio contact log (roomy)', draw: (ctx) => radiolog(ctx, { rowH: 19 }) },
  radiologBand: { label: 'Radio contact log (one band)', draw: (ctx) => radiolog(ctx, { bandColumn: false, rowH: 13 }) },
  radiologCompact: { label: 'Radio contact log (2-up)', draw: radiologCompact },
  address: { label: 'Address book (4/page)', draw: (ctx) => address(ctx, 15, 8) },
  addressRoomy: { label: 'Address book (3/page)', draw: (ctx) => address(ctx, 19, 12) },
  conversions: { label: 'Conversions', draw: conversions },
  taisoA: { label: 'Radio taiso (moves 1-7)', draw: (ctx) => taiso(ctx, 0, 7) },
  taisoB: { label: 'Radio taiso (moves 8-13)', draw: (ctx) => taiso(ctx, 7, 13) },
  dumbbellArms: { label: 'Dumbbell arms', draw: dumbbellArms },
  dumbbellFull: { label: 'Dumbbell full body', draw: (ctx) => dumbbellFull(ctx, 0, 8) },
  dumbbellFullA: { label: 'Dumbbell full body (moves 1-4)', draw: (ctx) => dumbbellFull(ctx, 0, 4) },
  dumbbellFullB: { label: 'Dumbbell full body (moves 5-8)', draw: (ctx) => dumbbellFull(ctx, 4, 8) },
  legs: { label: 'Bodyweight legs', draw: legs },
  sevenMinA: { label: 'Seven-minute workout (1-6)', draw: (ctx) => sevenMin(ctx, 0, 6) },
  sevenMinB: { label: 'Seven-minute workout (7-12)', draw: (ctx) => sevenMin(ctx, 6, 12) },
  stretches: { label: 'Standing stretches', draw: stretches },
  week: { label: 'Week (Sun-Sat)', draw: week, usesWeek: true },
  weekSplit: { label: 'Week (classic planner)', draw: weekSplit, usesWeek: true },
  calendar: { label: 'Month calendar', draw: calendar, usesMonth: true },
  calendarCheck: { label: 'Month + checkboxes', draw: (ctx) => calendar(ctx, { checkboxes: true }), usesMonth: true },
  calendarWide: { label: 'Month (horizontal)', draw: calendarWide, usesMonth: true },
  calendarWideCheck: { label: 'Month (horizontal) + checkboxes', draw: (ctx) => calendarWide(ctx, { checkboxes: true }), usesMonth: true },
  fourWeeks: { label: 'Next 4 weeks', draw: fourWeeks, usesWeek: true },
  fourWeeksWide: { label: 'Next 4 weeks (horizontal)', draw: fourWeeksWide, usesWeek: true },
  year: { label: 'Year calendar', draw: yearCalendar },
}
