# Progress

## Timeline

- Oct 28: build prompt reviewed, amended, and approved (`wonder-prompt.md`).
- Oct 28: game scaffold, pure core with seeded order generation, levels, pace, comparison, saving, boss and power cycle; placeholder screens; audio with Dad-clip playback and speech stand-in; Dad's Window over LocalTransport and AppSync; CDK infrastructure for CloudFront, S3, and AppSync Events. Unit, Playwright (iPhone/iPad/Chromium), offline, and `cdk synth` checks passing.
- Oct 29: initial core gameplay loop complete, committed and pushed.
- Oct 29: Baseten credits arrived (see `hackathon.md`). No credible integration found yet. Not required, but still under consideration.

## Roadmap

1. Refine gameplay (placeholder art stays for now).
2. Lock gameplay.
3. Visual and sound design: final art (Muse Image + SAM 3.1) and Dad's recorded clips.
4. Test, including the real-device checklist below, and deploy after Dad's approval.
5. Submit (feature freeze Mon Nov 2, submissions due Wed Nov 4, 9:00 PM ET).

## Open items and stretch goals

- **Baseten integration:** keep looking for a credible use. Any use must respect the privacy rules in the README (no AI at runtime on the child's device unless that changes deliberately).
- **Stretch: AI-generated, self-improving levels.** Only if gameplay is locked early. Preferred shape is authoring-time generation baked into content, so runtime stays AI-free.
- **README claims to keep honest:** the "How Meta AI was used" section says art is from Muse Image + SAM 3.1 and that Muse Spark playtested the levels. Neither has happened yet. Make them true or edit the text before submitting.

## Real-device checklist (manual)

- [ ] Sound with the silent switch on and off
- [ ] Sound during a Messenger Kids call in picture-in-picture
- [ ] Return from the background mid-order
- [ ] Airplane-mode play from the Home Screen icon
- [ ] Pairing from the installed app (including the paste-link fallback)
- [ ] Call corner with a real PiP window over the game
- [ ] Dad's Window between two real devices after deploy
