# Hackathon details and operations

Meta Global AI Developer Hackathon. Solo entry, Indie Developer track. All times ET.

- **Team:** Cooked Chef (solo developer)
- **Project:** Nom Nom Go!

Full rules: [`participant-guide.md`](participant-guide.md) (copied from the Cerebral Valley event page on Oct 26, 2026).

## Key dates

| Date | Event |
| --- | --- |
| Mon Oct 26, 12:00 PM | Kickoff (livestream) |
| Tue Oct 27, 12:00-1:00 PM | Agents 101: Build a Multimodal AI Agent |
| Wed Oct 28, 12:00-1:00 PM | Agents 102: Best Practices for Verifiable Agents |
| Fri Oct 30, 12:00-1:00 PM | Building Specialized Intelligence on Fireworks |
| Oct 27 - Nov 4 | Building period (Discord office hours 10-11 AM weekdays) |
| Mon Nov 2 | Own target: feature freeze |
| Wed Nov 4, 9:00 PM | Submissions due, credit claim deadline |
| Nov 5 - 8 | Judging |
| Mon Nov 9, 12:00 PM | Closing ceremony, top 10 announced |
| Mon Nov 16 | Community vote winner announced |

## Submission requirements

- Public repository
- 3-minute demo video showing only what was built during the hackathon
- Submit via the Cerebral Valley platform
- Project must use Meta models (Muse Spark series, Muse Wonder, Muse Image, Muse Voice Transcribe, SAM 3.1, Muse Glimmer, Muse Spark Open)

## Links

- Notion workspace: https://app.notion.com/p/405e34f437ae81fbb496db802ac45f94
- Event details: https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details
- Livestream: https://cerebralvalley.ai/e/meta-ai-developer-hackathon/live
- Discord: https://cerebralvalley.ai/e/meta-ai-developer-hackathon/discord
- Submit: https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit
- Meta docs: https://dev.meta.ai/docs/overview
- Meta Model API cookbook: https://github.com/meta-models/meta-model-cookbook
- Open model cookbook: https://github.com/meta-models/meta-oss-cookbook

## Baseten

Credits arrive as a pre-assigned API key (in the repo `.env`, gitignored), locked to `meta-models/muse-spark-open-1026`. The Baseten docs say `meta-models/muse-spark-open`; for this hackathon always use the `-1026` id.

## Deploy and operations

```bash
npm run deploy     # builds, then cdk deploy --profile valerian253 (eu-central-1). Ask Dad before the first bootstrap/deploy.
npm run destroy
```

Offline PWA check: `npm --prefix game run build`, serve `game/dist` with `vite preview`, then `OFFLINE=1 npx playwright test --config playwright.offline.config.ts` from `game/`.

- **Power off / power on:** there is no start-over button and no reset in the parent area. After the boss, the closed screen has a power-off button. The next power-on starts fresh at Level 1: progress, stars, and order history reset, while Dad's Window pairing and the sound setting stay.
- **AppSync API key:** created with the longest allowed expiry (365 days). When it expires, Dad's Window silently stops connecting (solo play is unaffected). Redeploy to issue a new key and rebuild `config.json`.
- **Re-pairing:** re-pairing from the parent area rotates the kitchen id. Any Dad window open on the old id is orphaned and must use the new link.
- **Parent area:** hold the chef-hat icon on the title screen for 3 seconds.
