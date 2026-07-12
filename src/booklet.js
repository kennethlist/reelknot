import {
  PDFDocument,
  StandardFonts,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
} from 'pdf-lib'
import { TEMPLATES } from './templates.js'

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

export async function generateBooklet(settings) {
  const doc = await PDFDocument.create()
  doc.setTitle(settings.title || 'Booklet')
  const [W, H] = PAPER_SIZES[settings.paper].size
  const page = doc.addPage([W, H])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const cw = W / 4
  const ch = H / 2

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
    template.draw({ page, w: cw, h: ch, font, bold, settings, pageNum: i + 1, monthTotal, weekDate })
    if (settings.showPageNumbers && settings.pages[i] !== 'cover') {
      const label = String(i + 1)
      page.drawText(label, {
        x: (cw - font.widthOfTextAtSize(label, 6)) / 2,
        y: 6,
        size: 6,
        font,
        color: PAGE_NUM,
      })
    }
    page.pushOperators(popGraphicsState())
  }

  if (settings.showGuides) drawGuides(page, font, W, H)

  return doc.save()
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
