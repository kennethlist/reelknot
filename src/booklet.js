import {
  PDFDocument,
  StandardFonts,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
} from 'pdf-lib'
import { TEMPLATES, RULER_BAND } from './templates.js'

// Landscape sheet sizes in PDF points.
export const PAPER_SIZES = {
  letter: { label: 'US Letter', size: [792, 612] },
  a4: { label: 'A4', size: [841.89, 595.28] },
}

// Classic one-sheet booklet imposition. The sheet is a 2x4 grid of cells; the top row
// is printed upside down so every page is upright after folding.
//
//   +-----+-----+-----+-----+
//   |  5* |  4* |  3* |  2* |   * = rotated 180 degrees
//   +-----+-----+-----+-----+
//   |  6  |  7  |  8  |  1  |   1 = front cover
//   +-----+-----+-----+-----+
//
// row 0 = bottom of the sheet (PDF origin is bottom-left).
const SLOTS = [
  { col: 3, row: 0, rotated: false }, // page 1
  { col: 3, row: 1, rotated: true },  // page 2
  { col: 2, row: 1, rotated: true },  // page 3
  { col: 1, row: 1, rotated: true },  // page 4
  { col: 0, row: 1, rotated: true },  // page 5
  { col: 0, row: 0, rotated: false }, // page 6
  { col: 1, row: 0, rotated: false }, // page 7
  { col: 2, row: 0, rotated: false }, // page 8
]

const GUIDE = rgb(0.8, 0.8, 0.8)
const PAGE_NUM = rgb(0.6, 0.63, 0.67)

// Picture files live in public/knot-images as JPEGs, which pdf-lib embeds
// without decoding. Bytes are fetched once and kept for later rebuilds. A
// script can install its own loader on globalThis.__loadKnotImage.
const imageBytes = new Map()
async function loadImage(name) {
  if (imageBytes.has(name)) return imageBytes.get(name)
  let bytes
  if (globalThis.__loadKnotImage) bytes = await globalThis.__loadKnotImage(name)
  else {
    const res = await fetch(`/knot-images/${name}.jpg`)
    if (!res.ok) throw new Error(`missing image ${name}`)
    bytes = new Uint8Array(await res.arrayBuffer())
  }
  imageBytes.set(name, bytes)
  return bytes
}

export async function generateBooklet(settings) {
  const doc = await PDFDocument.create()
  doc.setTitle(settings.title || 'Booklet')
  const [W, H] = PAPER_SIZES[settings.paper].size
  const page = doc.addPage([W, H])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const cw = W / 4
  const ch = H / 2

  // Pages that use a picture (the knot diagrams) have it embedded once here.
  const images = {}
  for (const key of new Set(settings.pages)) {
    const name = TEMPLATES[key]?.image
    if (!name || images[name]) continue
    images[name] = await doc.embedJpg(await loadImage(name))
  }
  // With the ruler on, every page's content is lifted clear of the ruler
  // band (each page's bottom edge is a sheet edge), and the page number
  // sits in the gap between the ticks and the content.
  const lift = settings.showRuler ? RULER_LIFT : 0

  let prevMonthTotal = null
  let prevWeekOffset = null
  for (let i = 0; i < 8; i++) {
    const { col, row, rotated } = SLOTS[i]
    const x = col * cw
    const y = row * ch
    page.pushOperators(
      pushGraphicsState(),
      rotated
        ? concatTransformationMatrix(-1, 0, 0, -1, x + cw, y + ch)
        : concatTransformationMatrix(1, 0, 0, 1, x, y),
    )
    const template = TEMPLATES[settings.pages[i]] ?? TEMPLATES.blank
    let monthTotal
    if (template.usesMonth) {
      // 'auto' continues from the previous calendar page (or the global
      // start month); an explicit month stands on its own.
      const choice = settings.pageMonths?.[i] ?? 'auto'
      monthTotal =
        choice === 'auto'
          ? prevMonthTotal === null
            ? settings.year * 12 + settings.month
            : prevMonthTotal + 1
          : settings.year * 12 + Number(choice)
      prevMonthTotal = monthTotal
    }
    let weekDate
    if (template.usesWeek && settings.weekStart != null) {
      // 'auto' continues from the previous week page (or this week); an
      // explicit choice is an offset in weeks from the current week.
      const choice = settings.pageWeeks?.[i] ?? 'auto'
      const offset =
        choice === 'auto' ? (prevWeekOffset === null ? 0 : prevWeekOffset + 1) : Number(choice)
      prevWeekOffset = offset
      const base = new Date(settings.weekStart)
      weekDate = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 7 * offset)
    }
    if (lift) page.pushOperators(pushGraphicsState(), concatTransformationMatrix(1, 0, 0, 1, 0, lift))
    template.draw({ page, w: cw, h: ch - lift, font, bold, settings, pageNum: i + 1, monthTotal, weekDate, images })
    if (lift) page.pushOperators(popGraphicsState())
    if (settings.showPageNumbers && settings.pages[i] !== 'cover') {
      const label = String(i + 1)
      page.drawText(label, {
        x: (cw - font.widthOfTextAtSize(label, 6)) / 2,
        y: settings.showRuler ? RULER_BAND + 1 : 6,
        size: 6,
        font,
        color: PAGE_NUM,
      })
    }
    page.pushOperators(popGraphicsState())
  }

  if (settings.showGuides) drawGuides(page, font, W, H)
  if (settings.showRuler) drawRulers(page, font, W, H)

  return doc.save()
}

// Rulers run along both long edges of the sheet. Because the top row is
// printed upside down, both edges end up as the bottom of booklet pages:
// inches along the sheet bottom (pages 1, 6, 7, 8) and centimetres along
// the top (pages 2-5). The zero of each scale is the corner that becomes a
// page's fore-edge (bottom-left for page 6, top-right for page 2).
//
// Most printers can't print within ~5 mm of the paper edge, so the scale
// line is inset and the ticks point inward; the paper edge itself is zero,
// and every printed tick is the correct distance from it.
const RULER_INSET = RULER_BAND - 8
// Content is lifted by this much so a page's usual bottom margin clears the
// ruler's labels, and the ruler itself stops short of the unprintable strip
// at the left and right paper edges (its zero stays at the edge).
const RULER_LIFT = 14
const RULER_PAD = 14
const RULER = rgb(0.35, 0.38, 0.42)
const PT_PER_IN = 72
const PT_PER_MM = 72 / 25.4

function drawRulers(page, font, W, H) {
  // Inches along the bottom edge, zero at the left.
  drawScale(page, font, {
    length: W,
    y: RULER_INSET,
    unit: PT_PER_IN / 16,
    major: 16,
    tick: (i) => (i % 8 === 0 ? 5 : i % 4 === 0 ? 3.5 : i % 2 === 0 ? 2.5 : 1.5),
    label: (i) => String(i / 16),
    name: 'in',
  })
  // Centimetres along the top edge, zero at the right, drawn upside down so
  // it reads upright on the rotated pages.
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(-1, 0, 0, -1, W, H))
  drawScale(page, font, {
    length: W,
    y: RULER_INSET,
    unit: PT_PER_MM,
    major: 10,
    tick: (i) => (i % 5 === 0 ? 4.5 : 2.5),
    label: (i) => String(i / 10),
    name: 'cm',
  })
  page.pushOperators(popGraphicsState())
}

// Draws one scale from x = 0 (the paper edge) along y, with `unit` points per
// tick; `major` ticks get a label, and `tick(i)` gives the other lengths.
// The scale line runs from the first tick clear of the unprintable strip to
// the last one, so it starts and ends on a tick whatever the unit.
function drawScale(page, font, { length, y, unit, major, tick, label, name }) {
  const first = Math.ceil(RULER_PAD / unit)
  const last = Math.floor((length - RULER_PAD) / unit)
  page.drawLine({ start: { x: first * unit, y }, end: { x: last * unit, y }, thickness: 0.5, color: RULER })
  for (let i = first; i <= last; i++) {
    const x = i * unit
    const len = i % major === 0 ? 7 : tick(i)
    page.drawLine({ start: { x, y }, end: { x, y: y + len }, thickness: 0.4, color: RULER })
    if (i % major === 0) {
      page.drawText(label(i), { x: x + 1.5, y: y + len - 3.5, size: 4, font, color: RULER })
    }
  }
  page.drawText(name, { x: first * unit + 1.5, y: y + 3, size: 4, font, color: RULER })
}

function drawGuides(page, font, W, H) {
  const dash = { dashArray: [3, 3], thickness: 0.4, color: GUIDE }
  for (let c = 1; c < 4; c++) {
    page.drawLine({ start: { x: (c * W) / 4, y: 0 }, end: { x: (c * W) / 4, y: H }, ...dash })
  }
  // Horizontal center: the outer quarters are fold, the middle half is the cut.
  page.drawLine({ start: { x: 0, y: H / 2 }, end: { x: W / 4, y: H / 2 }, ...dash })
  page.drawLine({ start: { x: (3 * W) / 4, y: H / 2 }, end: { x: W, y: H / 2 }, ...dash })
  page.drawLine({
    start: { x: W / 4, y: H / 2 },
    end: { x: (3 * W) / 4, y: H / 2 },
    thickness: 0.7,
    color: GUIDE,
  })
  page.drawText('cut', {
    x: W / 2 - font.widthOfTextAtSize('cut', 6) / 2,
    y: H / 2 + 3,
    size: 6,
    font,
    color: GUIDE,
  })
}
