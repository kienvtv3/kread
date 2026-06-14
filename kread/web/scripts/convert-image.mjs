#!/usr/bin/env node
import { writeFileSync } from 'fs'
import { imageToKp } from '../src/lib/convert/image-to-kp.js'

const args = process.argv.slice(2)
if (args.length < 2) {
  console.log('Usage: node scripts/convert-image.mjs <input> <output> [options]')
  console.log('  --dither <algo>    gamma|atkinson (default: atkinson)')
  console.log('  --landscape        Landscape orientation')
  console.log('  --fit <mode>       contain|cover|stretch (default: contain)')
  console.log('  --width <px>       Target width (default: 480)')
  console.log('  --height <px>      Target height (default: 800)')
  process.exit(1)
}

const [input, output] = args
const getOpt = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def }
const hasFlag = (flag) => args.includes(flag)

const kp = await imageToKp(input, {
  dither: getOpt('--dither', 'atkinson'),
  landscape: hasFlag('--landscape'),
  fit: getOpt('--fit', 'contain'),
  width: parseInt(getOpt('--width', '480')),
  height: parseInt(getOpt('--height', '800')),
})

writeFileSync(output, kp)
console.log(`Converted ${input} -> ${output} (${kp.length} bytes)`)
