import { BLACK, WHITE, MARGIN, RULER_BAND, sheetHeader, refSheet, S } from './templates.js'

// Knot pages: a picture of the tying steps under a header, plus a notes page.

// A knot page built round a picture: header, then the diagram fitted below,
// with a numbered badge on each step. Step positions are fractions of the
// image (x from the left, y from the top), one per panel in tying order.
const STEPS = {
  bowline: [[0.02, 0.02], [0.5, 0.02], [0.02, 0.52], [0.5, 0.52]],
  sheetbend: [[0.01, 0.02], [0.37, 0.38], [0.01, 0.72]],
  clove: [[0.01, 0.02], [0.34, 0.02], [0.67, 0.02], [0.01, 0.52], [0.44, 0.52]],
  twohalf: [[0.01, 0.02], [0.5, 0.02], [0.01, 0.5], [0.5, 0.5]],
  truckers: [[0.01, 0.02], [0.33, 0.02], [0.62, 0.02], [0.01, 0.52], [0.34, 0.52], [0.68, 0.52]],
  tautline: [[0.01, 0.02], [0.5, 0.02], [0.01, 0.42], [0.5, 0.42], [0.01, 0.78]],
  prusik: [[0.01, 0.05], [0.5, 0.05], [0.01, 0.48], [0.5, 0.48]],
  clinch: [[0.01, 0.03], [0.45, 0.24], [0.01, 0.43], [0.42, 0.6], [0.01, 0.74]],
  palomar: [[0.01, 0.03], [0.5, 0.03], [0.01, 0.32], [0.5, 0.32], [0.01, 0.68], [0.5, 0.68]],
  uni: [[0.01, 0.15], [0.5, 0.15], [0.01, 0.55], [0.5, 0.55], [0.01, 0.86], [0.5, 0.86]],
}

const picture = (_group, name, _note, image) => (ctx) => {
  const { page, w, font, bold, settings, images } = ctx
  const y = sheetHeader(ctx, { title: name, sub: '', note: '' })
  const bottom = settings?.showRuler ? RULER_BAND + 4 : MARGIN
  const img = images?.[image]
  if (!img) return
  const availW = w - 2 * MARGIN
  const availH = y - 10 - bottom
  const k = Math.min(availW / img.width, availH / img.height)
  const iw = img.width * k, ih = img.height * k
  const x0 = (w - iw) / 2, y0 = y - 6 - ih
  page.drawImage(img, { x: x0, y: y0, width: iw, height: ih })
  const r = 4.2, size = 6
  ;(STEPS[image] || []).forEach(([fx, fy], i) => {
    const cx = x0 + fx * iw + r, cy = y0 + ih - fy * ih - r
    const label = String(i + 1)
    page.drawCircle({ x: cx, y: cy, size: r, color: BLACK })
    page.drawText(label, {
      x: cx - bold.widthOfTextAtSize(label, size) / 2, y: cy - size * 0.36,
      size, font: bold, color: WHITE,
    })
  })
}
export const ropeKnots = picture('Knots', 'Bowline', 'Fixed loop that will not slip or jam.', 'bowline')
export const ropeKnots2 = picture('Knots', 'Sheet bend', 'Joins two ropes, even of different sizes. The thicker rope makes the bight.', 'sheetbend')
export const cloveHitch = picture('Hitches', 'Clove hitch', 'Quick tie to a post or rail. Can slip; back it up with a half hitch.', 'clove')
export const twoHalfHitches = picture('Hitches', 'Two half hitches', 'Ties a rope to a ring or post under load.', 'twohalf')
export const truckersHitch = picture('Hitches', "Trucker's hitch", 'Tensions a line 3 to 1: loop, round the anchor, back through, lock off.', 'truckers')
export const tautLine = picture('Knots', 'Taut-line hitch', 'Adjustable loop for guy lines; grips under load, slides when slack.', 'tautline')
export const prusik = picture('Knots', 'Prusik', 'A sling that grips a rope under load and slides when slack. Cord about half the rope diameter.', 'prusik')
export const fishingKnots = picture('Fishing knots', 'Improved clinch', 'Line to hook or lure. Wet the line, pull steadily, trim the tag.', 'clinch')
export const fishingKnots2 = picture('Fishing knots', 'Palomar', 'Strongest simple hook knot; the one to use with braid.', 'palomar')
export const fishingKnots3 = picture('Fishing knots', 'Uni knot', 'Line to hook, or line to line: tie one each way and slide them together.', 'uni')

export function ropeNotes(ctx) {
  const notes = [
    S("Trucker's hitch", [
      '1. Twist a loop in the line', '2. End round the anchor, up', '   through the loop: 3 to 1',
      '3. Pull tight, lock with two', '   half hitches',
    ]),
    S('Rope', [
      'Safe load ~ 1/5 of breaking', '   strength (1/10 for lifting)',
      'A knot cuts strength 30 - 50%', 'Nylon stretches (anchors,',
      '   towing); poly floats', 'Paracord 550: 550 lb break,',
      '   ~ 100 lb safe load',
    ]),
    S('Care', [
      'Dress each knot neatly', '   before loading it',
      'Coil, do not kink; keep', '   out of sun and grit',
      'Retire rope that is fuzzy,', '   stiff or has flat spots',
    ]),
    S('Line', [
      'Mono: stretchy, cheap, floats', 'Fluoro: near invisible, sinks',
      'Braid: thin, no stretch; add', '   a mono or fluoro leader',
      'Leader ~ 2 x main line test', 'Retie after a big fish or',
      '   a snag; check for nicks',
    ]),
  ]
  refSheet(ctx, { title: 'Rope and line', sections: notes })
}

