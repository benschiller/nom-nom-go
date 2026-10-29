# Decisions made while building

Choices this build made that the prompt (`docs/wonder-prompt.md`) left open. Newest last.

- **Node runtime:** `.nvmrc` pins 24 (available range `^22.12 || ^24`). Local development used Node 22.16; all gates pass on it.
- **Exact versions installed (2026-10-28):** every pinned version in section 3 exists on npm. `aws-cdk` CLI does not publish a `2.275.0`; the CLI uses independent versioning, so infra pins `aws-cdk@2.1146.1` (latest 2.x CLI) with `aws-cdk-lib@2.275.0`. This is the nearest match under the fallback rule.
- **aws-amplify events API:** in aws-amplify 6.22.2 the Events client is `events` from `aws-amplify/api`, with `events.connect(channel)` returning a channel with `subscribe(...)`, and publish via `events.post(channel, event)` (there is no `events.publish`). Transport implements that shape. Channel path form used: `/kitchen/<kitchenId>/<side>`. The section 5.6 spike could not be run against a deployed API before milestone 5 code existed; validate against the deployed endpoint at milestone 6 and adjust here if AppSync expects no leading slash.
- **Confetti:** own ~100-line canvas emitter (`game/src/ui/Confetti.tsx`), no library, per prompt.
- **Lint/format:** ESLint 9 flat config + Prettier 3, exact-pinned in `game/package.json`.
- **Clip/art sync:** `public/audio/clips.json` and `public/art/manifest.json` are generated from the frozen content in `game/src/content/content.ts`; a Vitest coverage test fails if any content item lacks a clip or art entry.
- **PWA icons:** generated from `game/public/icon.svg` with `@vite-pwa/assets-generator` (`game/pwa-assets.config.ts`).
- **Pre-built Level 1 burger ticket:** the bun is scenery under the pre-built patty; the ticket and call-out carry toppings only.
- **Baseten / hackathon model (2026-10-29):** Baseten provided a pre-assigned API key (in repo `.env`, gitignored) locked to `meta-models/muse-spark-open-1026`. Docs say `meta-models/muse-spark-open`; always use the `-1026` id. No integration decided yet; not required. Any use must not break the "no AI at runtime, nothing leaves the device" privacy stance without a deliberate decision.
- **Stretch goal (2026-10-29):** AI-generated, self-improving levels, only after gameplay is locked. Preferred shape is authoring-time generation baked into content, keeping runtime AI-free.
