import {
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
} from 'pdf-lib'
import {
  LINE, FAINT, INK, BLACK, WHITE, MARGIN,
  bandColors, fillFields, logTable, refSheet, S,
} from './templates.js'

// Magic: The Gathering score sheets: life trackers for two-player games and
// four-player Commander pods, a match record log, and a rules reference.
// Life is tracked the way most players do on paper: write each new total in
// the next empty box, so the last filled box is the current total.

// Small bold label with a fill-in rule running to `right`.
function labelRule({ page, bold }, label, { x, y, right, size = 5.5 }) {
  page.drawText(label, { x, y: y + 2, size, font: bold, color: INK })
  page.drawLine({
    start: { x: x + bold.widthOfTextAtSize(label, size) + 4, y },
    end: { x: right, y },
    thickness: 0.5,
    color: LINE,
  })
}

// Grid of empty boxes for successive life totals. The first box is
// pre-filled with the starting total.
function lifeGrid({ page, font }, { x, top, cols, rows, boxW, boxH, start }) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      page.drawRectangle({
        x: x + c * boxW,
        y: top - (r + 1) * boxH,
        width: boxW,
        height: boxH,
        borderWidth: 0.4,
        borderColor: LINE,
      })
    }
  }
  if (start != null) {
    const label = String(start)
    const size = Math.min(7, boxH - 4)
    page.drawText(label, {
      x: x + (boxW - font.widthOfTextAtSize(label, size)) / 2,
      y: top - boxH + (boxH - size) / 2 + 0.5,
      size,
      font,
      color: LINE,
    })
  }
  return top - rows * boxH
}

// A row of small tick circles with a label in front, e.g. poison counters.
function tickRow({ page, bold }, label, { x, y, count, right, size = 5 }) {
  page.drawText(label, { x, y: y - 1.5, size, font: bold, color: INK })
  const lx = x + bold.widthOfTextAtSize(label, size) + 5
  const r = 2.4
  const step = Math.min(8, (right - lx - r) / Math.max(count - 1, 1))
  for (let i = 0; i < count; i++) {
    page.drawCircle({ x: lx + r + i * step, y, size: r, borderWidth: 0.5, borderColor: LINE })
  }
}

// Small boxes with a letter under each, e.g. game wins or seats.
function boxRow({ page, bold }, label, { x, y, labels, right, size = 5, box = 7 }) {
  page.drawText(label, { x, y: y - 1.5, size, font: bold, color: INK })
  const lx = x + bold.widthOfTextAtSize(label, size) + 5
  const step = Math.min(box + 5, (right - lx - box) / Math.max(labels.length - 1, 1))
  labels.forEach((text, i) => {
    const bx = lx + i * step
    page.drawRectangle({ x: bx, y: y - box / 2, width: box, height: box, borderWidth: 0.5, borderColor: LINE })
    if (text) {
      page.drawText(text, {
        x: bx + (box - bold.widthOfTextAtSize(text, 3.8)) / 2,
        y: y - box / 2 - 4.6,
        size: 3.8,
        font: bold,
        color: LINE,
      })
    }
  })
}

function pageTitle({ page, w, h, bold, settings }, title) {
  const ink = settings?.highContrast ? BLACK : INK
  page.drawText(title, { x: MARGIN, y: h - MARGIN - 8, size: 8, font: bold, color: ink })
  page.drawLine({
    start: { x: MARGIN, y: h - MARGIN - 12 },
    end: { x: w - MARGIN, y: h - MARGIN - 12 },
    thickness: 0.5,
    color: LINE,
  })
  return h - MARGIN - 12
}

// Two-player life tracker. `games` sections share one page; each has a
// name rule and a life grid per player, poison ticks, and a win box.
export function mtgLife(ctx, { games = 2, start = 20 } = {}) {
  const { page, w, h, font, bold, settings } = ctx
  const { bg, fg } = bandColors(settings)
  const left = MARGIN
  const right = w - MARGIN

  let y = pageTitle(ctx, 'Magic: The Gathering')
  y = fillFields(ctx, [
    [{ label: 'Date', width: 64 }, { label: 'Format' }],
  ], { left, right, top: y - 2, lineGap: 11 }) - 5

  const gutter = 6
  const colW = (right - left - gutter) / 2
  const sectionGap = 8
  const sectionH = (y - MARGIN - (games - 1) * sectionGap) / games
  const tabH = 10
  const nameGap = 11
  const footH = 22 // poison + wins rows
  const gridH = sectionH - tabH - nameGap - footH - 4
  const cols = 4
  const boxW = colW / cols
  const rows = Math.max(2, Math.floor(gridH / 13))
  const boxH = Math.min(gridH / rows, 20)

  for (let g = 0; g < games; g++) {
    const top = y - g * (sectionH + sectionGap)
    // Game tab band across both columns.
    page.drawRectangle({ x: left, y: top - tabH, width: right - left, height: tabH, color: bg })
    const tab = games > 1 ? `Game ${g + 1}` : 'Game'
    page.drawText(tab, { x: left + 3, y: top - tabH + 2.7, size: 5.5, font: bold, color: fg })
    const hint = `start at ${start}`
    page.drawText(hint, {
      x: right - 3 - font.widthOfTextAtSize(hint, 4.5),
      y: top - tabH + 3,
      size: 4.5,
      font,
      color: fg,
    })

    for (let p = 0; p < 2; p++) {
      const x = left + p * (colW + gutter)
      const colRight = x + colW
      let cy = top - tabH - nameGap
      labelRule(ctx, p === 0 ? 'Me' : 'Opp', { x, y: cy, right: colRight })
      cy -= 3
      cy = lifeGrid(ctx, { x, top: cy, cols, rows, boxW, boxH, start })
      cy -= 7
      tickRow(ctx, 'Poison', { x, y: cy, count: 10, right: colRight })
      cy -= 10
      boxRow(ctx, 'Won', { x, y: cy, labels: [''], right: colRight })
      // Side-by-side with the win box: a short notes rule.
      const nx = x + 24
      page.drawLine({ start: { x: nx, y: cy - 3 }, end: { x: colRight, y: cy - 3 }, thickness: 0.5, color: LINE })
    }
  }
}

// Four-player Commander pod: one quadrant per seat with life from 40,
// commander damage taken from each other seat, and poison.
export function mtgCommander(ctx) {
  const { page, w, h, font, bold, settings } = ctx
  const { bg, fg } = bandColors(settings)
  const left = MARGIN
  const right = w - MARGIN

  let y = pageTitle(ctx, 'Commander')
  y = fillFields(ctx, [
    [{ label: 'Date', width: 64 }, { label: 'Winner' }],
  ], { left, right, top: y - 2, lineGap: 11 }) - 5

  const gutter = 6
  const colW = (right - left - gutter) / 2
  const seats = ['A', 'B', 'C', 'D']
  const quadH = (y - MARGIN - gutter) / 2
  const tabH = 10
  const lineGap = 11
  const cols = 4
  const boxW = colW / cols
  const footH = 24
  const gridH = quadH - tabH - 2 * lineGap - footH - 6
  const rows = Math.max(2, Math.floor(gridH / 13))
  const boxH = Math.min(gridH / rows, 18)

  seats.forEach((seat, i) => {
    const x = left + (i % 2) * (colW + gutter)
    const top = y - Math.floor(i / 2) * (quadH + gutter)
    const colRight = x + colW
    page.drawRectangle({ x, y: top - tabH, width: colW, height: tabH, color: bg })
    page.drawText(`Seat ${seat}`, { x: x + 3, y: top - tabH + 2.7, size: 5.5, font: bold, color: fg })
    const hint = '40 life'
    page.drawText(hint, {
      x: colRight - 3 - font.widthOfTextAtSize(hint, 4.5),
      y: top - tabH + 3,
      size: 4.5,
      font,
      color: fg,
    })
    let cy = top - tabH - lineGap
    labelRule(ctx, 'Name', { x, y: cy, right: colRight })
    cy -= lineGap
    labelRule(ctx, 'Cmdr', { x, y: cy, right: colRight })
    cy -= 3
    cy = lifeGrid(ctx, { x, top: cy, cols, rows, boxW, boxH, start: 40 })
    cy -= 7
    // Commander damage: one box per opposing seat, lettered.
    boxRow(ctx, 'Cmdr dmg', { x, y: cy, labels: seats.filter((s) => s !== seat), right: colRight, box: 8 })
    cy -= 13
    tickRow(ctx, 'Poison', { x, y: cy, count: 10, right: colRight })
  })
}

// Match record: one row per match, drawn sideways like the other logs.
export function mtgMatchLog(ctx, rowH = 14) {
  const { page, w, h, bold, settings } = ctx
  const { bg, fg } = bandColors(settings)
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(0, 1, -1, 0, w, 0))
  const lw = h
  const lh = w
  const left = MARGIN
  const right = lw - MARGIN
  const top = lh - MARGIN

  const lastRule = fillFields({ page, bold }, [
    [{ label: 'Event', width: 0 }, { label: 'Format', width: 70 }, { label: 'My deck', width: 80 }],
  ], { left, right, top, lineGap: 12 })

  logTable({ page, bold }, [
    { label: 'Date', width: 30 },
    { label: 'Opponent', width: 0 },
    { label: 'Their deck', width: 58 },
    { label: 'G1', width: 14 },
    { label: 'G2', width: 14 },
    { label: 'G3', width: 14 },
    { label: 'W-L', width: 22 },
  ], {
    left,
    right,
    top: lastRule - 5,
    bottom: MARGIN,
    rowH,
    headerH: 12,
    size: 5.5,
    bg,
    fg,
  })
  page.pushOperators(popGraphicsState())
}

// Built on demand: templates.js imports this module before its own helpers
// (S, refSheet) have been initialised.
const mtgRules = () => [
  S('Turn structure', [
    'Beginning: untap, upkeep, draw',
    'Main phase 1 (play a land, cast)',
    'Combat: begin, attackers,',
    '  blockers, damage, end',
    'Main phase 2',
    'Ending: end step, cleanup',
    'No draw on the first player\'s turn 1',
    'Discard to 7 at cleanup',
  ]),
  S('You lose when', [
    'Life is 0 or less',
    '10 or more poison counters',
    'Drawing from an empty library',
    '21+ combat damage from one',
    '  commander (Commander only)',
  ]),
  S('Formats', [
    ['Constructed', '60+', '20'],
    ['Limited', '40+', '20'],
    ['Commander', '100', '40'],
    ['Brawl', '60/100', '25'],
    ['2HG (team)', '60+', '30'],
  ], ['Format', 'Deck', 'Life']),
  S('Mulligan (London)', [
    'Draw 7; if you keep after N',
    '  mulligans, put N cards on the',
    '  bottom of your library',
  ]),
  S('Evergreen keywords', [
    'Flying: only flying/reach block',
    'First strike: damages first',
    'Double strike: first + regular',
    'Deathtouch: any damage kills',
    'Lifelink: damage gains you life',
    'Trample: excess dmg to player',
    'Vigilance: attacks untapped',
    'Haste: no summoning sickness',
    'Hexproof: opponents can\'t target',
    'Indestructible: can\'t be destroyed',
    'Menace: needs 2+ blockers',
    'Reach: can block flyers',
    'Flash: cast at instant speed',
    'Defender: can\'t attack',
    'Ward N: countered unless pay N',
    'Protection (DEBT): no damage,',
    '  enchant, block or target from X',
  ]),
  S('Lands', [
    ['Limited (40)', '17', '23 spells'],
    ['60-card', '24', 'aggro 20-22'],
    ['Commander', '37', '+10 ramp'],
  ], ['Deck', 'Lands', 'Notes']),
  S('Limited curve (23 spells)', [
    '2 MV: 5-7    3 MV: 4-6',
    '4 MV: 3-4    5 MV: 2-3',
    '1 MV: 0-2    6+ MV: 1-2',
    '15-17 creatures, 2 colors',
    '16 lands if very aggressive',
  ]),
  S('Commander rule of thumb', [
    '37 lands, 10 ramp, 10 draw,',
    '10 removal, 3 wipes, rest theme',
    'Average mana value near 3',
  ]),
  S('Remember', [
    'Summoning sick: no attack/tap',
    '  abilities the turn it enters',
    'Legend rule: keep one of a name',
    'Damage wears off at cleanup',
    'State-based actions check often',
  ]),
]

export const mtgReference = (ctx) =>
  refSheet(ctx, { title: 'Magic: quick rules', sections: mtgRules(), size: 5, lineGap: 6.8 })

// Life-pad page: vertical rules split the page into one column per player.
// Write each new total under the last. Faint horizontal ruling keeps the
// columns in step; the starting total sits at the top of each column.
export function mtgColumns(ctx, { names = ['Me', 'Opp'], start = 20, ruleGap = 18, games = 1 } = {}) {
  const { page, w, h, font, bold, settings } = ctx
  const { bg, fg } = bandColors(settings)
  const left = MARGIN
  const right = w - MARGIN
  const bottom = MARGIN
  const cols = names.length
  const colW = (right - left) / cols
  const headH = 13
  const perGame = cols / games
  let top = h - MARGIN

  // With several games side by side, a label band sits above the names and
  // a heavier rule separates the games.
  if (games > 1) {
    const gameH = 11
    for (let g = 0; g < games; g++) {
      const x = left + g * perGame * colW
      const gw = perGame * colW
      page.drawRectangle({ x: x + 0.6, y: top - gameH, width: gw - 1.2, height: gameH, color: bg })
      const label = `Game ${g + 1}`
      page.drawText(label, {
        x: x + (gw - bold.widthOfTextAtSize(label, 6)) / 2,
        y: top - gameH + 3.2,
        size: 6,
        font: bold,
        color: fg,
      })
    }
    top -= gameH + 1.5
  }

  // Header band with one name per column; an empty name gets a fill-in rule.
  page.drawRectangle({ x: left, y: top - headH, width: right - left, height: headH, color: bg })
  names.forEach((name, i) => {
    const x = left + i * colW
    if (name) {
      page.drawText(name, {
        x: x + (colW - bold.widthOfTextAtSize(name, 6.5)) / 2,
        y: top - headH + 3.8,
        size: 6.5,
        font: bold,
        color: fg,
      })
    } else {
      page.drawLine({
        start: { x: x + 6, y: top - headH + 3 },
        end: { x: x + colW - 6, y: top - headH + 3 },
        thickness: 0.5,
        color: fg,
      })
    }
  })

  // Faint ruling, then the heavier column rules on top.
  for (let y = top - headH - ruleGap; y >= bottom; y -= ruleGap) {
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.3, color: FAINT })
  }
  for (let c = 0; c <= cols; c++) {
    const x = left + c * colW
    const edge = c === 0 || c === cols
    const gameBreak = games > 1 && c % perGame === 0
    page.drawLine({
      start: { x, y: edge || gameBreak ? h - MARGIN : top },
      end: { x, y: bottom },
      thickness: edge ? 0.5 : gameBreak ? 1.8 : 1.1,
      color: edge ? LINE : INK,
    })
  }
  page.drawLine({ start: { x: left, y: bottom }, end: { x: right, y: bottom }, thickness: 0.5, color: LINE })

  // Starting total at the head of each column.
  if (start != null) {
    const label = String(start)
    for (let c = 0; c < cols; c++) {
      page.drawText(label, {
        x: left + c * colW + (colW - font.widthOfTextAtSize(label, 9)) / 2,
        y: top - headH - ruleGap + 5,
        size: 9,
        font,
        color: LINE,
      })
    }
  }
}
