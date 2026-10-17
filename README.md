# Below the Waterline: Derek Umoren's portfolio

An iceberg off St. John's beneath its real local sky. The résumé is just the tip. Scroll to dive,
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
- **St. John’s sky:** weather loads automatically for the fixed scene coordinates, 47.56° N,
  52.71° W. [Open-Meteo](https://open-meteo.com/en/docs) supplies cloud cover, separate rain/showers/snowfall,
  visibility, direct solar radiation, weather codes and wind. Current precipitation totals are converted to hourly rates
  using the API interval, and rain and snow can appear together. Missing optional measurements fall back to weather codes.
  [SunCalc](https://github.com/mourner/suncalc) supplies sun/moon positions and lunar illumination for
  the same city. The displayed clock always uses `America/St_Johns`, including daylight saving time.
  Visitor location, browser geolocation permissions and location preferences are not used.
  Forecasts refresh every 15 minutes while visible; astronomy updates each minute. A recent forecast
  is retained through brief outages (up to 30 minutes); offline lighting still uses St. John’s astronomy.
  **Refresh St. John’s weather** performs a manual update.
- **Try another sky** in the sky settings offers 18 illustrative previews: clear sky, passing clouds,
  overcast, sunrise, golden hour, blue hour, moonlight, sea mist, dense fog, drizzle, heavy rain, thunderstorm,
  hailstorm, snow flurries, sleet, blizzard, sunset showers and moonlit flurries. Previews use example dates and conditions, are labelled
  **Preview**, and are not saved. **Return to St. John’s weather** resumes the real city conditions.
  Precipitation supports simultaneous rain, snow and ice pellets, with wind-driven motion. Thunderstorms
  have a brief lightning stroke with synchronized cloud lighting, disabled with reduced motion. The flash rises in 25 ms,
  fades out within 350 ms, and follows elapsed time even at low frame rates. Lighting, cloud, precipitation, fog and wind are independent continuous controls composed into one scene,
  so rain can coincide with sunset or snow with moonlight without new renderer branches. Live WMO codes distinguish drizzle,
  heavy rain, freezing rain, blowing snow and thunderstorms with hail.
- **Night sky:** a fixed star field fades in as daylight and twilight recede, with cloud patches, fog,
  precipitation and storms obscuring it. Sirius is the brightest blue-white point near the front centre of
  the opening sky, framed for both desktop and portrait screens. Its placement and the surrounding field
  are artistic rather than a dated star chart; the live Sun and Moon retain their astronomical positions.
  Stars remain steady in reduced-motion mode and share the sky's water reflections.
- **Tune this weather** opens a weather studio from the sky settings. Its 12 draggable dials and keyboard-accessible
  sliders control daylight, sunlight, moonlight, twilight, cloud cover, visibility, rain, snow, ice/hail,
  drizzle character, wind and storm strength. Start from live weather or any of the existing presets. Adjustments
  preview immediately, keep the starting sun/moon positions and are labelled **Custom weather**. Percentages indicate
  visual strength, not probability; 100% visibility represents 20 km or more, and 0% represents dense fog.
  **Reset adjustments** restores the selected preset or latest live conditions. **Return to St. John’s weather** exits
  manual mode. Edits stay in memory while browsing and are not saved across reloads. Live refreshes continue in the
  background without replacing a custom scene. Reduced motion still disables lightning.
- **One sky, one dive:** surface weather also shapes the water below. Sun and moon intensity, cloud cover,
  atmospheric visibility and storm strength determine transmitted light, beams and caustics. Twilight gives
  the upper water a warmer tint; snow and ice shift it towards blue. Wind, rain and hail increase suspended
  particles, near-surface haze, drift and bubbles. Fog softens the incoming light without turning calm water
  muddy. The disturbance fades with depth, while the torch, sonar, contact lights and anchor clearing remain
  readable. Presets, live observations and manual adjustments all use the same continuous mapping.
- **Offshore sea state:** live mode also loads [Open-Meteo's marine model](https://open-meteo.com/en/docs/marine-weather-api)
  using a preferred sea grid cell near St. John’s. Significant wave height, period and incoming direction, plus
  separate swell/wind-wave components, drive the surface. Surface current speed and outgoing direction drive
  suspended-particle and bubble drift. Sky settings show the model values and valid time; hover the model time
  for the selected offshore cell coordinates. This is a regional model, with limited coastal resolution.
  Weather and marine requests succeed or fail independently. Marine data refreshes every 15 minutes while visible;
  a recent response is kept for up to 30 minutes through outages, and model times older than 90 minutes are rejected.
  Cached data and weather-based fallbacks are labelled. Presets and custom weather use illustrative seas, and returning
  to live mode restores the marine model. Underwater clarity, colour and the depth profile of the current remain
  artistic estimates. They are not measurements supplied by this feed.
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
npm run test:environment
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

Weather composition is defined in `src/weather-parameters.js`: `WEATHER_PARAMETERS` describes the shared 0–1
controls, `weatherParameters()` extracts them from a scene, and `composeWeatherConditions()` applies them while
retaining astronomy. `src/environment.js` maps API observations and the 18 presets into that model;
`src/weather-controls.js` builds the studio controls. Visibility feeds the existing atmospheric fog rendering.
Direct sunlight uses solar irradiance when available, with the real solar horizon still respected in live mode.

`src/underwater-environment.js` maps those normalized controls to `waterLight`, `waterDirect`, `waterTurbidity`,
`waterShafts`, `waterCaustics`, `waterMotion`, `waterParticles` and an RGB `waterTint`. Edit its weights to tune
the relationship between surface and underwater art direction. The shared shaders in `src/world/glsl.js`
apply depth falloff, colour filtering and distance haze; the ice, fish, habitat and particle shaders use the
same values. Changes interpolate with the sky, while dial edits preview immediately. New particle, bubble,
shaft and caustic motion uses a separate clock that stays still when reduced motion is requested.

`src/marine-environment.js` decodes the marine response and builds three directional wave components. The total
energy follows significant wave height (`Hs = 4 × RMS elevation`), and deep-water dispersion sets wavelength from
period. `src/scene-scale.js` shares metres-per-unit and the geographic compass with astronomy. Incoming wave bearings
are reversed for propagation; current bearings already describe the direction of flow. Extreme rendered significant
height is capped at 8 m to keep the dive usable, with a visible note when this happens. Missing current data produces
no model-driven drift. Current speed converts from km/h to scene units/second; its influence fades with depth because
the feed only describes the surface current.

The GPU surface, normals, submerged-material waterline and lens crossing share wave coefficients and phases with the
CPU camera depth and ship heave/roll. Wave phases and current displacement are integrated each frame, avoiding phase
jumps from multiplying a new period or current direction by the entire elapsed session time. Forecast changes blend
smoothly. Reduced motion holds both accumulators still. `npm run test:environment` includes marine units, direction,
freshness, spectrum-energy and CPU gradient checks.

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
