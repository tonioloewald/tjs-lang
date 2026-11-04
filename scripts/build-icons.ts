/**
 * PNG icons from the platform icon (`tjs-lang.svg`), for the places that do not take SVG:
 * iOS home-screen and bookmark icons (`apple-touch-icon.png`, 180 square), and the default
 * share image (`tjs-lang-512.png`). Written into `demo/static/`, which the doc site serves from
 * its root, and committed. Re-run after changing the icon:
 *
 *   bun scripts/build-icons.ts
 *
 * Rendered with @resvg/resvg-js (installed for tosijs-ui's site build). The touch icon gets a
 * white background and some padding: iOS fills transparency with black and crops to a rounded
 * square, which would cut into an icon drawn edge to edge.
 */
import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'node:fs'

const svg = readFileSync('tjs-lang.svg', 'utf8')

function render(size: number, pad: number, background?: string): Buffer {
  const inner = size - 2 * pad
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: inner } })
    .render()
    .asPng()
  if (!pad && !background) return png
  // Compose onto a padded canvas by wrapping the rendered PNG in an SVG and rendering that.
  const wrapper = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${
    background ? `<rect width="100%" height="100%" fill="${background}"/>` : ''
  }<image x="${pad}" y="${pad}" width="${inner}" height="${inner}" href="data:image/png;base64,${png.toString(
    'base64'
  )}"/></svg>`
  return new Resvg(wrapper).render().asPng()
}

writeFileSync('demo/static/apple-touch-icon.png', render(180, 18, '#ffffff'))
writeFileSync('demo/static/tjs-lang-512.png', render(512, 0))
console.log(
  'wrote demo/static/apple-touch-icon.png (180) and demo/static/tjs-lang-512.png (512)'
)
