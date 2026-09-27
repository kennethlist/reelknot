# ReelKnot

A pocket booklet builder: compose an 8-page booklet from templates (cover,
lined, dot grid, graph, checklist, storyboard, logs, calendars, exercise
sheets, reference tables, knots, blank), preview it live, and download a
print-ready PDF. All PDF generation happens in the
browser with [pdf-lib](https://pdf-lib.js.org/).

## Layout

The 8 mini-pages are imposed onto one landscape sheet; the top row is rotated
180° so every page is upright after folding:

```
+-----+-----+-----+-----+
|  5* |  4* |  3* |  2* |   * = upside down
+-----+-----+-----+-----+
|  6  |  7  |  8  |  1  |   1 = front cover
+-----+-----+-----+-----+
```

Print at 100% scale, fold in half three times to crease, unfold, cut the
marked slit along the middle, then fold into a booklet.

## Print maps

`/maps.html` is a second tool on the same site: it prints
[USGS US Topo](https://www.usgs.gov/programs/national-geospatial-program/national-map)
sheets at true scale (1:10,000, 1:24,000 or 1:25,000) on Letter or A4. Pan the
map, click page-sized cells to select sheets, and generate a PDF. Each sheet
gets a lat/lon graticule, UTM grid, km/mi scale bars, a magnetic declination
diagram, the quad name and publication year, and (for multi-sheet jobs) an
adjoining-sheets key plus an index page outlining every sheet.

This is the one part of the site that goes online: when you generate, the
browser fetches topo tiles from The National Map, looks up the quad name from
the USGS index, and asks NOAA for the declination. All rendering still happens
in the browser; nothing is sent to a server of ours.

If the browser cannot fetch tiles from USGS directly (a filtering proxy or
privacy extension stripping CORS headers, for example), the page falls back to
`/tiles/…`, a same-origin path that nginx (in the container) or the Vite dev
server proxies to USGS. The map preview switches to it too.

## Run with Docker

```sh
docker build -t reelknot .
docker run -d --name reelknot -p 8080:80 reelknot
```

Open http://localhost:8080

## Develop locally

```sh
npm install
npm run dev
```
