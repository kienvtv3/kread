#!/usr/bin/env node

// CLI wrapper for EPUB → .kb conversion
//
// Usage: node scripts/convert-epub.mjs <input.epub> <output.kb> [options]
//   --font <family>     Font family (default: Literata)
//   --size <pt>         8|10|11|12|14 (default: 11)
//   --orientation <o>   portrait|landscape (default: portrait)
//   --mode <m>          light|dark (default: light)
//   --align <a>         left|justify (default: left)
//   --no-pagenums       Disable page numbers

import { readFile, writeFile } from 'fs/promises'
import { resolve } from 'path'
import { convertEpubToKb } from '../src/lib/convert/epub-to-kb.js'

function usage() {
  console.log(`Usage: node scripts/convert-epub.mjs <input.epub> <output.kb> [options]

Options:
  --font <family>     Font family (default: Literata)
  --size <pt>         8|10|11|12|14 (default: 11)
  --orientation <o>   portrait|landscape (default: portrait)
  --mode <m>          light|dark (default: light)
  --align <a>         left|justify (default: left)
  --no-pagenums       Disable page numbers`)
  process.exit(1)
}

function parseArgs(argv) {
  const args = argv.slice(2)
  const positional = []
  const config = {
    fontFamily: 'Literata',
    fontSize: '11pt',
    orientation: 'portrait',
    mode: 'light',
    align: 'left',
    pageNumbers: true,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--font') {
      config.fontFamily = args[++i]
    } else if (arg === '--size') {
      const val = args[++i]
      config.fontSize = val.endsWith('pt') ? val : val + 'pt'
    } else if (arg === '--orientation') {
      config.orientation = args[++i]
    } else if (arg === '--mode') {
      config.mode = args[++i]
    } else if (arg === '--align') {
      config.align = args[++i]
    } else if (arg === '--no-pagenums') {
      config.pageNumbers = false
    } else if (arg.startsWith('-')) {
      console.error(`Unknown option: ${arg}`)
      usage()
    } else {
      positional.push(arg)
    }
  }

  if (positional.length < 2) {
    console.error('Error: input and output paths required')
    usage()
  }

  return { input: positional[0], output: positional[1], config }
}

async function main() {
  const { input, output, config } = parseArgs(process.argv)

  const inputPath = resolve(input)
  const outputPath = resolve(output)

  console.log(`Converting: ${inputPath}`)
  console.log(`  Font: ${config.fontFamily} @ ${config.fontSize}`)
  console.log(`  Mode: ${config.mode}, Align: ${config.align}`)
  console.log(`  Page numbers: ${config.pageNumbers}`)

  const epubData = await readFile(inputPath)

  const startTime = Date.now()
  const kb = await convertEpubToKb(epubData.buffer, {
    ...config,
    onProgress(pct, msg) {
      process.stdout.write(`\r  [${pct.toString().padStart(3)}%] ${msg.padEnd(40)}`)
    },
  })

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n  Output: ${outputPath}`)
  console.log(`  Size: ${(kb.byteLength / 1024).toFixed(1)} KB`)
  console.log(`  Time: ${elapsed}s`)

  await writeFile(outputPath, kb)
  console.log('Done.')
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
