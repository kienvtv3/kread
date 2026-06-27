# kread UI Layout Specification

Screen: 480×800 portrait, 2-bit (4 grayscale levels)

## Container System

Each screen is composed of stacked containers with fixed height and padding.
Content renders inside the padded area. Containers snap top-to-bottom.

```
Container { y, h, pad: [top, right, bottom, left] }
Content area: (pad.left, y + pad.top, W - pad.left - pad.right, h - pad.top - pad.bottom)
```

## Common Containers

### Status Bar
- Height: 30px
- Padding: [8, 16, 0, 16]
- Content: battery icon (24×12), right-aligned

### Nav Bar (anchored bottom)
- Height: 44px
- Padding: [0, 30, 12, 30]
- Y: 756 (always at bottom)
- Content: 1px separator at top, then 4 equal-width labels centered
- Labels: bold 17px sans-serif

---

## HOME Screen

```
STATUS_BAR   y=0    h=30   pad=[8,16,0,16]     Battery right
COVER_ZONE   y=30   h=480  pad=[10,30,10,30]    Cover image aspect-fit, centered
                                                  Double border: 3px outer + 1px inner
                                                  Max content: 420×460
INFO_BLOCK   y=510  h=120  pad=[14,30,0,30]     Stack:
                                                  - "N% READ" (15px, #555)
                                                  - Title (bold 22px, max 2 lines, ellipsis)
                                                  - Author (17px, #555, uppercase)
[auto gap]   y=630         126px
NAV_BAR      y=756  h=44   pad=[0,30,12,30]     READ | LIBRARY | PASSES | SETTINGS
```

### Home — No Book State
- Cover zone: gray placeholder box (200×300) centered, "No Cover" text
- Info block: "No book selected" as title, "Add a book via Library" as author line

### Button Mapping (Home)
Physical button order L→R: BACK | CONFIRM | LEFT | RIGHT
Maps to nav bar order L→R: READ | LIBRARY | PASSES | SETTINGS
- BACK → READ (open current book)
- CONFIRM → LIBRARY
- LEFT → PASSES
- RIGHT → SETTINGS

---

## READER Screen

```
CONTENT      y=0    h=760  pad=[24,30,8,30]     Body text area
                                                  - Heading: bold 20px serif
                                                  - Body: 18px serif, line-height 28px
                                                  - Left/Right to turn pages
STATUS_BAR   y=760  h=40   pad=[8,30,8,30]      Chapter + page info, centered
                                                  "CHAPTER 1: INTRO • 3 OF 4"
                                                  (14px sans-serif, #555, uppercase)
```

### Button Mapping (Reader)
- LEFT/UP → previous page
- RIGHT/DOWN → next page
- BACK → return to HOME

---

## LIBRARY Screen

```
HEADER       y=0    h=50   pad=[12,30,8,30]     "Library" bold 26px
                                                  1px separator at bottom
BOOK_LIST    y=50   h=706  pad=[8,30,0,30]      Scrollable list:
                                                  - Each item: 48px height
                                                  - Title (bold 18px) + Author (14px, #555)
                                                  - Selected item: inverted (black bg, white text)
                                                  - Empty: "No books. Connect to add."
NAV_BAR      y=756  h=44   pad=[0,30,12,30]     BACK only
```

### Button Mapping (Library)
- UP/DOWN → scroll list
- CONFIRM → open selected book (go HOME with book loaded)
- BACK → return to HOME

---

## PASSES Screen

```
HEADER       y=0    h=50   pad=[12,30,8,30]     "Passes" bold 26px
                                                  1px separator at bottom
CONTENT      y=50   h=706  pad=[16,30,0,30]     Pass card display or empty state
                                                  Empty: "No passes yet."
NAV_BAR      y=756  h=44   pad=[0,30,12,30]     BACK only
```

### Button Mapping (Passes)
- LEFT/RIGHT → switch between passes
- BACK → return to HOME

---

## SETTINGS Screen

```
HEADER       y=0    h=50   pad=[12,30,8,30]     "Settings" bold 26px
                                                  1px separator at bottom
MENU_LIST    y=50   h=706  pad=[8,30,0,30]      Menu items:
                                                  - Each item: 48px height
                                                  - Label (18px) + Value (18px, right-aligned, #555)
                                                  - Selected: inverted
                                                  Items:
                                                  - Pages per refresh: 10
                                                  - Grayscale: ON
                                                  - Firmware: v0.1.0
                                                  - About
NAV_BAR      y=756  h=44   pad=[0,30,12,30]     BACK only
```

### Button Mapping (Settings)
- UP/DOWN → scroll menu
- LEFT/RIGHT → change value
- BACK → return to HOME

---

## Typography

| Element        | Font                    | Color  |
|---------------|-------------------------|--------|
| Nav label     | bold 17px sans-serif    | black  |
| Title (home)  | bold 22px sans-serif    | black  |
| Author        | 17px sans-serif         | #555   |
| Progress      | 15px sans-serif         | #555   |
| Header        | bold 26px sans-serif    | black  |
| Body text     | 18px serif              | black  |
| Menu item     | 18px sans-serif         | black  |
| Menu value    | 18px sans-serif         | #555   |
| Status info   | 14px sans-serif         | #555   |

## Sub-screen Headers

Sub-screens use `›` as breadcrumb separator: `Settings › Device`, `Book › Chapters`

**TODO (UI rendering phase):**
- Sub-level text (after ›) should render at smaller font size than parent
- Consider: parent 26px bold + separator 20px + child 22px regular
- Custom triangle icons should replace Unicode triangles (pixel-perfect sizing)
- Breadcrumb should be pre-rendered as a single bitmap element

## Cover Image Rules

- Maintain aspect ratio always
- Fit within container padded area (max 420×460 on home)
- Double border: outer 3px black, gap 3px, inner 1px black
- If no cover: gray (#ddd) rectangle with "No Cover" centered

## Safe Margins (Bezel Coverage)

Measured on Xteink X4 device:
- Top: ~5.5px, Left: ~6.5px, Right: ~6.2px, Bottom: ~6px
- Safe margin: **8px** all sides
- Content area: x=8→472, y=8→792 (464×784 usable)

## Dual-Render Text Strategy

**Goal**: Best quality text in both B&W and Grayscale modes from a single .kp file.

**Problem**: Grayscale→B&W threshold ≠ native B&W because:
- B&W uses aggressive font hinting (pixel-snapped strokes)
- Grayscale uses light hinting (sub-pixel AA positioning)
- Thresholded grayscale has wrong stroke widths and alignment

**Solution**: Delta encoding in .kp format:

```
.kp 2-bit with delta:
  [header]
  [B&W plane: LZ4]          ← native B&W rendering (aggressive hinting)
  [AA edge mask: LZ4]       ← 1-bit: which pixels differ in grayscale mode
  [AA values: LZ4]          ← 2-bit values for masked pixels only
```

**Web converter pipeline**:
1. Render text with aggressive hinting → B&W plane (1-bit, pixel-snapped)
2. Render same text with light hinting → grayscale (2-bit, AA)
3. Compute delta: XOR between B&W and thresholded grayscale → AA mask
4. Store: B&W base + AA mask + AA values
5. Compress each with LZ4 separately

**Firmware rendering**:
- B&W mode: decompress B&W plane only, FAST refresh → sharpest
- Grayscale mode: decompress B&W + AA data, apply delta → B&W base + grayscale overlay
- Settings toggle: "Text rendering: Sharp (B&W) / Smooth (Grayscale)"

**Size estimate** per page:
- B&W plane: ~8KB compressed (mostly white, sparse text)
- AA mask: ~2KB compressed (very sparse, only glyph edges)
- AA values: ~1KB compressed (subset of mask pixels)
- Total: ~11KB vs ~25KB for full 2-bit → ~56% smaller

**UI screens**: Always render as native B&W (1-bit .kp). No grayscale for UI text.
**Reader pages**: Delta-encoded 2-bit. User chooses Sharp or Smooth in settings.
**Cover images**: Always 2-bit grayscale (photos need gray levels).
