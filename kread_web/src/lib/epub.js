import JSZip from 'jszip';

/**
 * Parse an EPUB file and extract chapter content.
 *
 * EPUB structure:
 *   META-INF/container.xml → points to content.opf
 *   content.opf → lists spine (reading order) of XHTML files
 *   chapter files → HTML content
 *
 * @param {ArrayBuffer} epubData - Raw EPUB file data
 * @returns {Promise<{title: string, author: string, chapters: Array<{title: string, html: string}>}>}
 */
export async function parseEpub(epubData) {
  const zip = await JSZip.loadAsync(epubData);

  // 1. Find content.opf path from container.xml
  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerXml) throw new Error('Invalid EPUB: missing container.xml');

  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXml, 'application/xml');
  const rootfilePath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
  if (!rootfilePath) throw new Error('Invalid EPUB: no rootfile');

  // 2. Parse content.opf
  const opfXml = await zip.file(rootfilePath)?.async('text');
  if (!opfXml) throw new Error('Invalid EPUB: missing ' + rootfilePath);

  const opfDoc = parser.parseFromString(opfXml, 'application/xml');
  const opfDir = rootfilePath.includes('/') ? rootfilePath.substring(0, rootfilePath.lastIndexOf('/') + 1) : '';

  // Extract metadata
  const title = opfDoc.querySelector('metadata title')?.textContent || 'Untitled';
  const author = opfDoc.querySelector('metadata creator')?.textContent || 'Unknown';

  // 3. Get spine (reading order)
  const manifest = {};
  opfDoc.querySelectorAll('manifest item').forEach(item => {
    manifest[item.getAttribute('id')] = item.getAttribute('href');
  });

  const spine = [];
  opfDoc.querySelectorAll('spine itemref').forEach(ref => {
    const id = ref.getAttribute('idref');
    if (manifest[id]) spine.push(opfDir + manifest[id]);
  });

  // 4. Extract chapter HTML content
  const chapters = [];
  for (const path of spine) {
    const file = zip.file(path);
    if (!file) continue;
    const html = await file.async('text');
    // Extract title from first heading if available
    const doc = parser.parseFromString(html, 'application/xhtml+xml');
    const heading = doc.querySelector('h1, h2, h3')?.textContent || `Chapter ${chapters.length + 1}`;
    chapters.push({ title: heading, html });
  }

  return { title, author, chapters };
}

/**
 * Extract plain text from HTML, preserving paragraph structure.
 * @param {string} html - Chapter HTML
 * @returns {string[]} - Array of paragraphs
 */
export function extractText(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'application/xhtml+xml');

  // Remove scripts, styles
  doc.querySelectorAll('script, style').forEach(el => el.remove());

  const paragraphs = [];
  const blocks = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, div');

  if (blocks.length === 0) {
    // Fallback: use body text
    const text = doc.body?.textContent?.trim();
    if (text) paragraphs.push(text);
  } else {
    blocks.forEach(block => {
      const text = block.textContent?.trim();
      if (text) paragraphs.push(text);
    });
  }

  return paragraphs;
}
