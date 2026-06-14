/**
 * Generate a demo .kb book without needing a real EPUB.
 *
 * Uses the same pipeline as the real converter:
 *   registerFont → renderPages → quantize → encode → generateBookAssets → buildKb
 *
 * Output: public/demo.kb
 *
 * Usage: node scripts/gen-demo-kb.mjs
 */

import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { writeFileSync } from 'fs'
import { renderPages, registerFont } from '../src/lib/convert/page-renderer.js'
import { generateBookAssets } from '../src/lib/convert/asset-gen.js'
import { buildKb } from '../src/lib/convert/kb-builder.js'
import { quantizeGamma } from '../src/lib/eink/quantize.js'
import { pixelsToLandscapePlanes, encodeKpV2 } from '../src/lib/eink/encoder.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// Register font
// ---------------------------------------------------------------------------

const fontsDir = resolve(webRoot, 'public/fonts')
// UI font — Verdana (always used for title, author, chapter names, footer)
registerFont(resolve(fontsDir, 'Verdana-Regular.ttf'), 'Verdana')
registerFont(resolve(fontsDir, 'Verdana-Bold.ttf'), 'Verdana')
// Body font — user-selected from Google Fonts
registerFont(resolve(fontsDir, 'ZillaSlab-Regular.ttf'), 'Zilla Slab')
registerFont(resolve(fontsDir, 'ZillaSlab-Bold.ttf'), 'Zilla Slab')

// ---------------------------------------------------------------------------
// Demo content
// ---------------------------------------------------------------------------

const TITLE = "Chip War: Fight for the World's Most Critical Technology"
const AUTHOR = 'Chris Miller'
// Two font roles:
// - UI_FONT: title, author, chapter names, footer — Verdana (consistent across books)
// - BODY_FONT: page content — user-selected (Roboto Slab, or any Google Font)
const UI_FONT = 'Verdana'
const BODY_FONT = 'Zilla Slab'

const chapters = [
  {
    title: 'Chapter 1: Introduction',
    paragraphs: [
      { text: 'Introduction', tag: 'h2' },
      'The modern world runs on chips. From smartphones to satellites, from cars to cardiac monitors, semiconductors are the foundation of virtually every technology we depend on. Yet few people understand how we got here, or why the supply of these tiny silicon wafers has become one of the most contested strategic resources on earth.',
      'This book tells the story of the chip industry, from its origins in the garages of Silicon Valley to the vast fabrication plants of Taiwan. It is a story of scientific genius and geopolitical ambition, of fortunes made and empires built, of the relentless drive to make transistors smaller, faster, and cheaper.',
      'At the heart of this story is a paradox. The most complex devices ever manufactured are produced by a handful of companies, in a few locations, using tools so precise they seem to defy the laws of physics. The concentration of this capability has created both extraordinary wealth and extraordinary vulnerability.',
    ]
  },
  {
    title: 'Chapter 2: The Transistor',
    paragraphs: [
      { text: 'The Transistor', tag: 'h2' },
      'In December 1947, three physicists at Bell Labs demonstrated a device that would change the world. William Shockley, John Bardeen, and Walter Brattain had created the first working transistor, a tiny switch made of germanium that could amplify electrical signals. It was ugly, unreliable, and difficult to manufacture. But it worked.',
      'The transistor replaced the vacuum tube, which was bulky, power-hungry, and prone to burning out. A computer built with vacuum tubes, like the ENIAC, filled an entire room and consumed enough electricity to power a small town. The transistor promised to make electronics smaller, cooler, and more reliable.',
      'Shockley was brilliant but difficult. His management style drove away his best researchers, who left to form their own company: Fairchild Semiconductor. This exodus would become the founding myth of Silicon Valley, a place where talent could walk out the door and start a competitor across the street.',
      'The key insight that transformed the transistor from a laboratory curiosity into a world-changing technology was integration. Instead of wiring individual transistors together by hand, engineers figured out how to fabricate entire circuits on a single piece of silicon. The integrated circuit was born.',
    ]
  },
  {
    title: 'Chapter 3: Silicon Valley',
    paragraphs: [
      { text: 'Silicon Valley', tag: 'h2' },
      'The valley south of San Francisco was once known for its orchards. Apricots, plums, and cherries grew in the mild California climate, tended by families who had farmed the land for generations. But by the 1960s, the orchards were giving way to office parks and clean rooms.',
      'Robert Noyce and Gordon Moore left Fairchild to start Intel in 1968. Their goal was audacious: to replace magnetic core memory with semiconductor chips. Core memory was the standard technology, reliable and well understood. But it was expensive, bulky, and could not be scaled. Noyce and Moore bet that silicon would win.',
      'They were right. Intel\'s first memory chips were a commercial success, but it was the microprocessor, an entire computer on a single chip, that truly changed everything. The Intel 4004, released in 1971, contained 2,300 transistors. It was designed for a Japanese calculator company, but its implications went far beyond arithmetic.',
      'Moore\'s Law, the observation that the number of transistors on a chip doubles roughly every two years, became the metronome of the industry. It was not a law of physics but a law of economics and engineering ambition. Each generation of chips required new tools, new materials, and new manufacturing techniques.',
    ]
  },
  {
    title: 'Chapter 4: The Cold War',
    paragraphs: [
      { text: 'The Cold War', tag: 'h2' },
      'The military was the chip industry\'s first and most important customer. Minuteman missiles needed guidance computers that were small enough to fit inside a warhead and reliable enough to work after being stored for years. The Pentagon was willing to pay premium prices for chips that met these demanding specifications.',
      'The Soviet Union recognized the strategic importance of semiconductors but struggled to keep pace. Its centrally planned economy was poorly suited to the rapid innovation cycles that characterized the chip industry. Soviet engineers were talented, but they lacked the ecosystem of venture capital, startups, and academic research that fueled Silicon Valley.',
      'Export controls became a key weapon in the technology Cold War. The United States and its allies restricted the sale of advanced chip-making equipment to the Soviet bloc, forcing Soviet manufacturers to rely on reverse-engineered copies of Western designs that were always one or two generations behind.',
    ]
  },
  {
    title: 'Chapter 5: Japan Rising',
    paragraphs: [
      { text: 'Japan Rising', tag: 'h2' },
      'In the 1980s, Japan seemed poised to dominate the semiconductor industry. Companies like NEC, Toshiba, and Hitachi produced memory chips that were cheaper and more reliable than their American competitors. The Japanese government supported the industry through coordinated research programs and trade policies that gave domestic producers significant advantages.',
      'American chip makers panicked. They lobbied Congress for protection, filed trade complaints, and warned that losing the chip industry would undermine national security. The result was a series of trade agreements that forced Japan to guarantee American companies a minimum share of the Japanese market.',
      'But the real threat to Japan\'s dominance came not from trade policy but from a shift in the industry\'s structure. As chips grew more complex, the cost of building a fabrication plant soared. Companies that once could afford to both design and manufacture chips found themselves forced to choose one or the other.',
      'This was the beginning of the fabless revolution. Companies like Qualcomm and Nvidia designed chips but outsourced manufacturing to specialized foundries. The most important of these foundries was a Taiwanese company that few people outside the industry had heard of: TSMC.',
    ]
  },
  {
    title: 'Chapter 6: The Fabless Revolution',
    paragraphs: [
      { text: 'The Fabless Revolution', tag: 'h2' },
      'The idea of separating chip design from chip manufacturing was heretical in the 1980s. Integrated device manufacturers like Intel and Samsung believed that controlling both design and fabrication was essential for producing the best chips. But the economics of the industry were changing.',
      'Building a state-of-the-art fabrication plant cost hundreds of millions of dollars in the 1990s. By the 2020s, that figure had risen to more than twenty billion dollars. Only a handful of companies could afford such investments, and they needed to keep their fabs running at near-full capacity to justify the expense.',
      'The fabless model allowed small teams of engineers to design innovative chips without raising billions of dollars for manufacturing. They could focus on architecture and algorithms, leaving the messy physics of transistor fabrication to the foundries.',
      'This democratization of chip design unleashed a wave of innovation. New types of processors emerged for graphics, networking, artificial intelligence, and mobile devices. The smartphone revolution, in particular, was powered by fabless chip companies designing processors that were manufactured in foundries thousands of miles away.',
    ]
  },
  {
    title: 'Chapter 7: TSMC',
    paragraphs: [
      { text: 'TSMC', tag: 'h2' },
      'Morris Chang founded Taiwan Semiconductor Manufacturing Company in 1987 with a simple but radical idea: a company that would manufacture chips for other companies but design none of its own. This pure-play foundry model eliminated the conflict of interest that plagued integrated manufacturers who competed with their own customers.',
      'TSMC grew slowly at first, taking on the overflow work that larger companies did not want. But Chang invested relentlessly in technology and quality, gradually winning the trust of the industry\'s most demanding customers. By the 2010s, TSMC was manufacturing the most advanced chips in the world.',
      'The company\'s dominance created a new kind of strategic vulnerability. Taiwan, a self-governing island of 23 million people that China claims as its own territory, had become the indispensable node in the global semiconductor supply chain. More than 90 percent of the world\'s most advanced chips were manufactured on this small island.',
      'This concentration of capability was not the result of government planning but of relentless execution. TSMC\'s engineers perfected each new generation of manufacturing technology faster than their competitors, building a lead that proved nearly impossible to close.',
    ]
  },
  {
    title: 'Chapter 8: The GPU Era',
    paragraphs: [
      { text: 'The GPU Era', tag: 'h2' },
      'Graphics processing units were originally designed to render the complex images needed for video games. But researchers discovered that the same massively parallel architecture that could draw millions of polygons per second was also ideal for training artificial intelligence models.',
      'Nvidia, founded in 1993 by Jensen Huang, had spent two decades building the best GPUs in the world. When the AI revolution arrived, Nvidia was perfectly positioned to supply the chips that powered it. The company\'s market value soared as demand for AI training hardware exploded.',
      'The race to build more powerful AI chips became the latest chapter in the long history of semiconductor competition. Nations that had once competed for oil and steel were now competing for access to the most advanced chips and the equipment needed to make them.',
      'The stakes could hardly be higher. Artificial intelligence promises to transform every industry, from healthcare to transportation to national defense. The countries and companies that control the chips that power AI will shape the future of the global economy and the balance of military power for decades to come.',
      'As this book has shown, the history of semiconductors is not just a story about technology. It is a story about power, about the concentration of an essential capability in a few hands, and about the geopolitical consequences that follow.',
    ]
  },
]

// ---------------------------------------------------------------------------
// Render pages per-chapter (each chapter gets its own footer with title)
// ---------------------------------------------------------------------------

console.log('Rendering pages...')

const chapterStartPages = []
const canvases = []

for (const ch of chapters) {
  chapterStartPages.push(canvases.length)
  const chapterCanvases = renderPages(ch.paragraphs, {
    pageWidth: 480,
    pageHeight: 800,
    bodyFont: BODY_FONT,
    uiFont: UI_FONT,
    fontSize: 22,
    lineHeight: 1.5,
    marginTop: 28,
    marginBottom: 12,
    marginLeft: 28,
    marginRight: 28,
    align: 'left',
    pageNumbers: true,
    chapterTitle: ch.title,
  })
  canvases.push(...chapterCanvases)
}

console.log(`  ${canvases.length} pages rendered`)

// ---------------------------------------------------------------------------
// Encode each page canvas as KP v1 (bitDepth=2: 2-bit grayscale only)
// ---------------------------------------------------------------------------

console.log('Encoding pages...')

const GAMMA = 1.8
const PW = 480, PH = 800

const encodedPages = canvases.map((canvas, i) => {
  const ctx = canvas.getContext('2d')
  const imageData = ctx.getImageData(0, 0, PW, PH)

  // 2-bit grayscale planes → KP v2
  const pixels = quantizeGamma(imageData.data, PW, PH, GAMMA)
  const { bw, gs, width: lw, height: lh } = pixelsToLandscapePlanes(pixels, PW, PH)
  const kpData = encodeKpV2({ width: lw, height: lh, bitDepth: 2, contentFlags: 0x05, compress: false, bw, gs }) // 0x05 = HAS_TEXT | LANDSCAPE

  if (i === 0) {
    console.log(`  Page 0: ${kpData.byteLength} bytes`)
  }

  return new Uint8Array(kpData)
})

console.log(`  Chapter starts: [${chapterStartPages.join(', ')}]`)

// ---------------------------------------------------------------------------
// Generate book assets (title, author, cover, chapter names)
// ---------------------------------------------------------------------------

console.log('Generating book assets...')

const coverPath = resolve(webRoot, 'public/cover-demo.jpg')
const assets = await generateBookAssets({
  title: TITLE,
  author: AUTHOR,
  fontFamily: UI_FONT,
  chapters: chapters.map(ch => ({ title: ch.title })),
  coverPath,
}, {
  titleWidth: 424,
  gamma: GAMMA,
})

console.log(`  ${assets.length} assets generated`)

// ---------------------------------------------------------------------------
// Assemble .kb
// ---------------------------------------------------------------------------

console.log('Assembling .kb...')

const kb = buildKb({
  pages: encodedPages,
  chapters: chapterStartPages,
  assets,
  metadata: {
    title: TITLE,
    author: AUTHOR,
    bodyFont: BODY_FONT,
    uiFont: UI_FONT,
    chapters: chapters.map(ch => ch.title),
  },
  fontSizeIdx: 2,
  orientation: 0,
  mode: 0,
  flags: 0x00,
})

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

const outPath = resolve(webRoot, 'public/demo.kb')
writeFileSync(outPath, kb)

const sizeKB = (kb.byteLength / 1024).toFixed(1)
console.log(`\nDone! Written ${outPath} (${sizeKB} KB, ${canvases.length} pages)`)
