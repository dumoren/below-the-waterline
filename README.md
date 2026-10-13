# Below the Waterline: Derek Umoren's portfolio

An iceberg off St. John's at blue hour. The résumé is just the tip. Scroll to dive,
and the camera spirals down around the berg to the seabed, about 200 metres below. The work is frozen inside
the ice as glowing crystals, and a sonar ping finds it.

- **Scroll or swipe** to dive. The camera settles gently onto each contact.
- **Click or tap** open water to send a **sonar ping**. The wavefront sweeps over the ice and the seabed, and
  reveals nearby contacts. It also fires on its own the first time you stop beside an undiscovered one.
- **Click a crystal** to swim up to it and open its card: a name, a role, one line and a few tags.
- **Your cursor is a diver's torch**. The capelin school scatters from its beam.
- The **depth gauge** on the right shows your depth, temperature and pressure. Its diamonds jump to each contact.
- **Contact is the boat.** A research vessel is moored beside the berg, and its anchor chain runs to the seabed.
  The dive ends at the anchor. **Follow the chain up** to ascend and come aboard. You can also click the boat from the
  surface, or use the ✉ button in the header from anywhere.
- **Dive again from the boat:** scroll down to glide over the water back to the iceberg's opening view,
  then continue underwater. Scroll or swipe input during the return is carried into the next dive.
- **Keys:** ↓ / ↑ next or previous contact, `Space` ping, `Enter` open (at the anchor: follow the chain up), `Esc` close, `Home` / `End`, `L` log, `M` sound.
- **Sound** (off by default) synthesizes surf, a muffled underwater drone, pings with echo, ice creaks
  and a chime for each contact found.
- The **dive log** (≡) lists everything as plain text. It's also the page visitors get without WebGL.
- **Text view** in the header opens the dive log directly. Cards receive keyboard focus when opened;
  Escape or Close returns focus to their trigger (including the original item in text view).
- **Project links:** `#project/greenqueue` and `#project/a11yguard` open the corresponding cards,
  including on a fresh visit or reload. Each project card has a **Copy project link** button.

## What's in the water

Each résumé section has its own depth band, form and colour:

| Section | Depth | Form | Colour |
|---|---|---|---|
| I · Experience | 20 – 82 m | crystals grown out of the ice | amber |
| II · Projects | 82 – 140 m | instrument probes tethered to the berg | mint / cyan |
| III · Education | 140 – 176 m | an ice core drawn from the glowing base stratum | ivory |
| IV · Toolkit | every depth | the capelin school that follows you down | silver-blue |
| V · Contact | 0 m | the research vessel; its chain leads up from the anchor | red |

## Develop and deploy

```bash
npm install
npm run dev
npm run build
npm run test:camera
npm run test:seabed
```

`dist/` is a static site with relative paths. It works on Vercel, Netlify, Cloudflare Pages or GitHub Pages.

The social sharing image is `public/social-preview.jpg` (1200 × 630). When the public address is chosen,
set `SITE_URL` to that address (including any hosting subdirectory) in the hosting environment or `.env.local`.
Vite then writes absolute Open Graph and Twitter image URLs into the generated HTML. No domain is assumed locally.

## Editing content

Everything lives in `index.html` under `#log`. Each `<section class="zone">` is a résumé section
(`data-from`/`data-to` set its depth band), and each `<li>` in it is one item. `data-depth` (metres)
places the item, `data-color` sets its glow, and `data-angle` nudges it around the berg relative to the camera.
Add a job or project by adding an `<li>` to the right section.

## How it's made

The whole scene is procedural. There are no model or texture files.

- **Iceberg:** an icosphere remapped onto a hand-shaped profile, with a leaning pinnacle above the water and a
  lobed belly six times deeper below, broken up with simplex noise. Facets come from screen-space derivatives.
  One shader lights it three ways: sunlit ice above water, ice seen through the surface from the air, and
  underwater ice with caustics, depth absorption, crystal glow, torchlight and the sonar ring.
- **Water:** Gerstner-style waves with fresnel reflection of the sky and foam traced from the berg's real
  waterline. From below, the surface shows Snell's window.
- **Crossing:** a lens pass works out, per pixel, whether a virtual camera port is above or below the
  surface, so the frame splits with a meniscus as you go under.
- **Life:** muted capelin, herring, cod, skates and translucent moon jellyfish, driven by instanced GPU
  animation. The separate Toolkit school uses travelling silver glints, two shimmer rings and an always-visible
  label. Mobile uses smaller populations. Marine snow, light shafts, bubbles and a scour trench complete the scene.
- **Seabed habitat:** sparse patches of seagrass, kelp, coral, sea fans, anemones, sea stars,
  crabs and bottom-dwelling fish across the wider floor. An open anchor clearing is framed by modeled
  coral with corallites and two layered, swaying anemones; three resident fish swim into and out of
  their tentacles. Mobile framing widens to show both formations. Positions follow the terrain's actual triangles;
  reduced-motion mode holds the habitat animations still. Tap or click the anchor to follow the chain
  back to the ship; the iron highlights on hover and has a generous touch target.
- **Vessel** (`src/world/ship.js`): a hull lofted from stations (flare, sheer, raked stem, bulwarks, antifouling
  and boot-top), a two-level deckhouse and raked bridge, a mast with a turning radar, an A-frame and winch, a rescue
  boat on its davit, railings, lights, and a rudder and propeller below the water. Parts are merged per material,
  so it costs only a few draw calls. It heaves and rolls on the same wave function as the water, and foam traces
  its hull footprint.
- **Camera travel:** contact navigation and closing a card use curved paths around the iceberg. Mail first
  orbits through open water to the anchor chain, then ascends ahead of the bow to the ship. Paths use a safety
  envelope calculated from the actual iceberg triangles; travel time scales with distance, with shorter
  transitions for reduced-motion preferences. A brief velocity ramp at each end leaves a steady cruising
  speed through the middle of the journey, including across the waterline. The lens framing blends through
  the journey as well.
