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
  address: { label: 'Address book (4/page)', draw: (ctx) => address(ctx, 15, 8) },
  addressRoomy: { label: 'Address book (3/page)', draw: (ctx) => address(ctx, 19, 12) },
  conversions: { label: 'Conversions', draw: conversions },
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
