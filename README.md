# Reelrod

A pocket booklet builder: compose an 8-page booklet from templates (cover,
lined, dot grid, graph, checklist, storyboard, month calendar, blank), preview
it live, and download a print-ready PDF. All PDF generation happens in the
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

## Run with Docker

```sh
docker build -t reelrod .
docker run -d --name reelrod -p 8080:80 reelrod
```

Open http://localhost:8080

## Develop locally

```sh
npm install
npm run dev
```
