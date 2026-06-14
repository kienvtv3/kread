/**
 * Generate 3 demo .kb books with different characteristics.
 *
 * Uses the same pipeline as gen-demo-kb.mjs:
 *   registerFont → renderPages → quantize → encode → generateBookAssets → buildKb
 *
 * Output: public/demo1.kb, public/demo2.kb, public/demo3.kb
 *
 * Usage: node scripts/gen-demo-books.mjs
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
// Register fonts (once)
// ---------------------------------------------------------------------------

const fontsDir = resolve(webRoot, 'public/fonts')
registerFont(resolve(fontsDir, 'Verdana-Regular.ttf'), 'Verdana')
registerFont(resolve(fontsDir, 'Verdana-Bold.ttf'), 'Verdana')
registerFont(resolve(fontsDir, 'ZillaSlab-Regular.ttf'), 'Zilla Slab')
registerFont(resolve(fontsDir, 'ZillaSlab-Bold.ttf'), 'Zilla Slab')

const UI_FONT = 'Verdana'
const BODY_FONT = 'Zilla Slab'
const GAMMA = 1.8
const PW = 480, PH = 800

const coverPath = resolve(webRoot, 'public/cover-demo.jpg')

// ---------------------------------------------------------------------------
// Book definitions
// ---------------------------------------------------------------------------

// Book 1: 16 pages — "Chip War" (2-line title, 42% progress)
// Reuses the same 8-chapter content from gen-demo-kb.mjs
const book1Chapters = [
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

// Book 2: 8 pages — "The Pragmatic Programmer" (long title truncated with "...", UNREAD)
const book2Chapters = [
  {
    title: 'Preface',
    paragraphs: [
      { text: 'Preface', tag: 'h2' },
      'This book will help you become a better programmer. It doesn\'t matter whether you are a lone developer, a member of a large project team, or a consultant working with many clients at once. This book will help you, as an individual, to do better work.',
      'This is not a theoretical book. We concentrate on practical topics, on using your experience to make more informed decisions. The word pragmatic comes from the Latin pragmaticus, which in turn is derived from the Greek word meaning "skilled in business." We think programming is a craft, and that the approach should be practical and relevant.',
      'We don\'t pretend to have all the answers, or even most of them. But we do think we can offer some useful advice, advice that will help you on your journey. We believe you can learn from our experience, just as we have learned from the experience of others. And we believe this learning never stops.',
    ]
  },
  {
    title: 'Chapter 1: A Pragmatic Philosophy',
    paragraphs: [
      { text: 'A Pragmatic Philosophy', tag: 'h2' },
      'What distinguishes Pragmatic Programmers? We feel it is an attitude, a style, a philosophy of approaching problems and their solutions. They think beyond the immediate problem, placing it in its larger context and seeking out the bigger picture. After all, without this larger context, how can you be pragmatic? How can you make intelligent compromises and informed decisions?',
      'Another key to their success is that Pragmatic Programmers take responsibility for everything they do. Being responsible, Pragmatic Programmers won\'t sit idly by and watch their projects fall apart through neglect. They see something that needs fixing and they fix it.',
      'The greatest of all weaknesses is the fear of appearing weak. Pragmatic Programmers aren\'t afraid to admit ignorance or error. When they make a mistake, they fix it. When they don\'t know something, they aren\'t afraid to say so.',
      'Don\'t live with broken windows. Fix bad designs, wrong decisions, and poor code when you see them. If there is insufficient time to fix it properly, then board it up. Perhaps you can comment out the offending code, or display a "Not Implemented" message, or substitute dummy data instead.',
    ]
  },
  {
    title: 'Chapter 2: A Pragmatic Approach',
    paragraphs: [
      { text: 'A Pragmatic Approach', tag: 'h2' },
      'There are certain tips and tricks that apply at all levels of software development, ideas that are almost axiomatic, and processes that are virtually universal. However, these approaches are rarely documented as such; you\'ll mostly find them written as war stories, or as odd sentences in discussions of other topics.',
      'The essence of good design is the ability to change things easily. The ETC principle: Easier to Change. It\'s the principle behind all good design. Why is decoupling good? Because by isolating concerns we make each one easier to change. Why is the single responsibility principle useful? Because a change in requirements is mirrored by a change in just one module.',
      'DRY stands for Don\'t Repeat Yourself. Every piece of knowledge must have a single, unambiguous, authoritative representation within a system. It\'s not about code duplication, but knowledge duplication. Two pieces of code might look very different but represent the same knowledge, and that\'s still a DRY violation.',
      'Prototyping is a learning experience. Its value lies not in the code produced, but in the lessons learned. That\'s really the point of prototyping: it is a learning experience. Prototypes gloss over details, and focus in on specific aspects of the system being considered.',
    ]
  },
  {
    title: 'Chapter 3: The Basic Tools',
    paragraphs: [
      { text: 'The Basic Tools', tag: 'h2' },
      'Every craftsman starts their journey with a basic set of good-quality tools. A woodworker might need rulers, gauges, a couple of saws, some good planes, fine chisels, drills and braces, mallets, and clamps. These tools will be lovingly chosen, bought, and maintained. Over time, each will wear in to the woodworker\'s hands.',
      'Tools amplify your talent. The better your tools, and the better you know how to use them, the more productive you can be. Start with a basic set of generally applicable tools. As you gain experience, and as you come across special requirements, you\'ll add to your basic set.',
      'Keep knowledge in plain text. Plain text is the insurance policy against obsolescence. Human-readable forms of data, and self-describing data, will outlive all other forms of data and the applications that created them.',
      'Use the power of command shells. For programmers manipulating files of text, that workbench is the command shell. From the shell prompt, you can invoke your full repertoire of tools, using pipes to combine them in ways never dreamt of by their original developers.',
    ]
  },
]

// Book 3: 4 pages — "Clean Code" (short 1-line title, FINISHED)
const book3Chapters = [
  {
    title: 'Chapter 1: Clean Code',
    paragraphs: [
      { text: 'Clean Code', tag: 'h2' },
      'You are reading this book for two reasons. First, you are a programmer. Second, you want to be a better programmer. Good. We need better programmers. This is a book about good programming. It is filled with code. We are going to look at code from every different direction.',
      'We will look at it from the top and from the bottom. We will look at it from the inside out and from the outside in. By the time we are done, we are going to know a lot about code. And we will be able to tell the difference between good code and bad code. We will know how to write good code and how to transform bad code into good code.',
      'There will be code. We are going to examine code in every which way. We are going to look at what makes it bad and what makes it good. We are going to explore conventions and disciplines. We are going to describe heuristics and best practices.',
      'So what is clean code? There are probably as many definitions as there are programmers. Bjarne Stroustrup, inventor of C++, says clean code is elegant and efficient. Grady Booch, author of Object-Oriented Analysis, says clean code reads like well-written prose. Dave Thomas, founder of OTI, says clean code can be read and enhanced by a developer other than its original author.',
    ]
  },
  {
    title: 'Chapter 2: Meaningful Names',
    paragraphs: [
      { text: 'Meaningful Names', tag: 'h2' },
      'Names are everywhere in software. We name our variables, our functions, our arguments, classes, and packages. We name our source files and the directories that contain them. We name our jar files and war files and ear files. Because we do so much of it, we\'d better do it well.',
      'The name of a variable, function, or class should answer all the big questions. It should tell you why it exists, what it does, and how it is used. If a name requires a comment, then the name does not reveal its intent. Choosing good names takes time but saves more than it takes.',
      'Programmers must avoid leaving false clues that obscure the meaning of code. We should avoid words whose entrenched meanings vary from our intended meaning. Do not refer to a grouping of accounts as an accountList unless it is actually a List. The word list means something specific to programmers.',
      'Make meaningful distinctions. If names must be different, then they should also mean something different. Number-series naming such as a1, a2, and aN is the opposite of intentional naming. Such names are not disinformative; they are noninformative. They provide no clue to the author\'s intention.',
    ]
  },
]

const books = [
  {
    filename: 'demo1.kb',
    title: "Chip War: Fight for the World's Most Critical Technology",
    author: 'Chris Miller',
    progress: 42,
    chapters: book1Chapters,
  },
  {
    filename: 'demo2.kb',
    title: 'The Pragmatic Programmer: Your Journey to Mastery, 20th Anniversary Edition',
    author: 'David Thomas, Andrew Hunt',
    progress: 0,
    chapters: book2Chapters,
  },
  {
    filename: 'demo3.kb',
    title: 'Clean Code',
    author: 'Robert C. Martin',
    progress: 100,
    chapters: book3Chapters,
  },
]

// ---------------------------------------------------------------------------
// Render + encode pipeline (shared)
// ---------------------------------------------------------------------------

function renderAndEncodeBook(book) {
  console.log(`\n--- ${book.filename}: "${book.title}" ---`)
  console.log('Rendering pages...')

  const chapterStartPages = []
  const canvases = []

  for (const ch of book.chapters) {
    chapterStartPages.push(canvases.length)
    const chapterCanvases = renderPages(ch.paragraphs, {
      pageWidth: PW,
      pageHeight: PH,
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

  console.log('Encoding pages...')
  const encodedPages = canvases.map((canvas, i) => {
    const ctx = canvas.getContext('2d')
    const imageData = ctx.getImageData(0, 0, PW, PH)
    const pixels = quantizeGamma(imageData.data, PW, PH, GAMMA)
    const { bw, gs, width: lw, height: lh } = pixelsToLandscapePlanes(pixels, PW, PH)
    const kpData = encodeKpV2({ width: lw, height: lh, bitDepth: 2, contentFlags: 0x05, compress: false, bw, gs }) // 0x05 = HAS_TEXT | LANDSCAPE
    return new Uint8Array(kpData)
  })

  console.log(`  Chapter starts: [${chapterStartPages.join(', ')}]`)

  return { canvases, chapterStartPages, encodedPages }
}

async function generateBook(book) {
  const { chapterStartPages, encodedPages } = renderAndEncodeBook(book)

  console.log('Generating book assets...')
  const assets = await generateBookAssets({
    title: book.title,
    author: book.author,
    fontFamily: UI_FONT,
    chapters: book.chapters.map(ch => ({ title: ch.title })),
    coverPath,
  }, {
    titleWidth: 424,
    gamma: GAMMA,
  })

  console.log(`  ${assets.length} assets generated`)

  console.log('Assembling .kb...')
  const kb = buildKb({
    pages: encodedPages,
    chapters: chapterStartPages,
    assets,
    metadata: {
      title: book.title,
      author: book.author,
      bodyFont: BODY_FONT,
      uiFont: UI_FONT,
      chapters: book.chapters.map(ch => ch.title),
      progress: book.progress,
    },
    fontSizeIdx: 2,
    orientation: 0,
    mode: 0,
    flags: 0x00,
  })

  const outPath = resolve(webRoot, 'public', book.filename)
  writeFileSync(outPath, kb)

  const sizeKB = (kb.byteLength / 1024).toFixed(1)
  console.log(`  Written ${outPath} (${sizeKB} KB, ${encodedPages.length} pages)`)

  return { path: outPath, sizeKB, pages: encodedPages.length }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('=== Generating 3 demo .kb books ===')

const results = []
for (const book of books) {
  results.push(await generateBook(book))
}

console.log('\n=== Summary ===')
for (const r of results) {
  console.log(`  ${r.path} — ${r.sizeKB} KB, ${r.pages} pages`)
}
console.log('\nDone!')
