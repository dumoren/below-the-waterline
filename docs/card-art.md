# Weather-responsive card materials

The selected designs are concept 01 (Frosted glass) for dark conditions and concept 03
(Deep water) for bright conditions. The original component concepts were generated at
1536 x 1024. In the portfolio they are scaled to a 480px reading panel and a viewport-width
portrait panel, keeping native HTML type, controls, content, and scrolling. The decorative
desktop depth rail collapses into the header on portrait screens, as in the concept's
mobile continuation. Expanded highlights remain available while scrolling.

## Assets

- Runtime: `public/images/cards/frosted-ice-frame.webp`
- Runtime: `public/images/cards/deep-water-frame.webp`
- Original sources retained outside `public/` so they don't ship with the site:
  `art/cards/frosted-ice-frame.png` and `art/cards/deep-water-frame.png`.

Both sources are genuine RGBA frames with transparent reading areas. They were made with the
built-in Image Gen tool from the selected concept references and copied into the project.
CSS uses nine-slice borders rather than stretching the full image across the text.
No generated text or controls are shipped as images.

### Runtime encoding (2026-10-18)

The WebPs are codec conversions of those original PNGs, with no new artwork generation.
Both remain 1254 x 1254 RGBA. Pillow 12.3.0 with libwebp 1.6.0 encoded the selected
quality-85 candidates using method 6, lossless alpha (`alpha_quality=100`), and
`exact=True`. Decoded alpha matches each PNG pixel for pixel, including the transparent
reading area and outside corners. CSS still uses slice 170 and the original border widths.

Reproduce from the repository root with that Pillow/libwebp version:

```powershell
@'
from pathlib import Path
from PIL import Image
for path in Path('public/images/cards').glob('*.png'):
    Image.open(path).convert('RGBA').save(
        path.with_suffix('.webp'), format='WEBP', quality=85,
        method=6, alpha_quality=100, exact=True)
'@ | python -
```

Compared candidates (frosted / deep-water bytes): lossless with `lossless=True,
quality=100, method=6, exact=True`: 434,832 / 501,778; quality 90 with the selected
options except `quality=90`: 179,864 / 211,746; selected quality 85: 154,080 / 183,728.
Magnified corner comparisons retained the ice fractures, bubbles, edge glow and alpha
without visible objectionable artifacts; quality 85 was the smallest acceptable candidate.

The original PNGs total 1,344,476 bytes (648,980 / 695,496). Runtime WebPs total
337,808 bytes: 1,006,668 fewer bytes, a 74.87% reduction in card frame requests.
The retained PNGs are still copied into `dist` by Vite, so this is a runtime transfer
reduction, not an equivalent reduction in deployment artifact size. No preloads are added.

## Final generation prompts

### Frosted glass frame

Create a production UI material asset derived from the attached Frosted glass concept
(reference image, not a full UI edit target). Output exactly ONE square 1024 x 1024
transparent PNG containing ONLY the thin glacier-ice outer frame of the primary card.
No text, no card fill, no backdrop, no water scene, no shadow rectangle. The entire central
780 x 780 pixel reading area must be completely transparent alpha, and the outside cut
corners also transparent alpha. Frame runs close to all four canvas edges, with luminous
pale cyan beveled ice, short faceted/chipped corners, fine white frost and natural tiny ice
fracture veins concentrated in top-left and bottom-right corners, and restrained fine
textures on the straight edge segments. Keep material thin, maximum 90 pixels inward from
each side, with wider texture confined to the corners. The four edge middles must be
straight and evenly narrow, suitable for stretching via a nine-slice border image. Natural
tactile glacier glass, smoky cyan variations, crisp rim, matching the supplied concept
exactly. No amber marker (it will be code), no UI glyphs, no particles in the transparent
centre, no lettering. Genuine transparent background.

### Deep water frame

Create a production UI material asset derived from the attached Deep water card concept
(reference image, not a full UI edit target). Output exactly ONE square 1024 x 1024
transparent PNG containing ONLY the thin rounded submerged-glass outer frame and its
delicate marginal contours. No text, no card fill, no backdrop, no water scene, no shadow
rectangle. The entire central 780 x 780 pixel reading area must be completely transparent
alpha; the outside rounded corners also transparent alpha. A thin softly glowing icy cyan
rim follows the outer edge, more watery and smoothly rounded than jagged glacier. Tiny
trapped bubbles and refracted glacial ice on the LEFT edge and top-left corner; fine blue
oceanographic/glacial contour curves confined to top-right and bottom-right corners,
never across the reading area. Maximum 100 pixels inward, edge middles straight and
evenly narrow for nine-slice stretching. Restrained deep-blue glass and cyan contours,
faithful to the supplied concept; it should feel like submerged instrument glass rather
than heavy stone. No depth rail or ticks (will be code), no amber marker, no labels,
no glyphs, no particles in the transparent centre. Genuine transparent background.

The image tool returned 1254 x 1254 frames; the CSS slice values use those actual files.
