# Narrated studio walkthrough

Recorded September 30, 2026 against the real isolated development application at `http://localhost:4371`, with Justin signing in through the normal admin and authenticator flow. Narration uses the local Voicebox Justin profile with LuxTTS. The 1920×1080 MP4 runs 4 minutes 36 seconds and includes captions and brand-colored title cards.

The local artifact is `output/demoreel/good-apollo-studio.mp4` (ignored). Its editable demo is `/Users/justin/Projects/demoreel/demos/good-apollo-studio/`; the recording workflow follows that repository's `.agents/skills/demoreel-demo/SKILL.md`. Demoreel now supports optional title-card background, text color and font separately from browser-frame styling, preserving existing defaults.

## Coverage

1. Products: start a private, optionless hat draft, enter name/description/fixed details/sample price, upload the supplied `hat-demo.png` through a faithful resized JPEG derivative, describe the photo and save its order. Show that optional sizes/colors remain available.
2. Inventory: view available/held/unsold, enter a three-piece demo batch with a reason, inspect its preview, save, then publish the completed listing and verify its Products row.
3. Storefront: browse the actual catalog and listing with the supplied photo, one price and no artificial size selection; show disabled prelaunch checkout.
4. Orders: switch among Paid / To pack, Needs attention and All orders, and point out the protected export. The actual queues are empty.
5. Settings: save a sample $7.25 shipping rate and 4–6 business day window, verify the saved values, then restore $6.95 / 3–5 business days. Show tax verification, store/account controls and the daily guide.

## Limits and cleanup

No Stripe charge, paid-order shipment, packing slip, refund or transactional delivery was demonstrated because this environment has no actual paid orders or configured hosted checkout. Separate disposable-database browser tests cover paid packing/tracking, but are not provider evidence. This reel supports onboarding; it does not complete independent timed operator acceptance or production launch gates.

Recording created two clearly named demo hats during capture refinement. Both are now archived with zero available stock, their photographs retained privately and stock changes audited. Shipping and processing defaults were restored. The original supplied PNG, owner merchandise, existing account credentials, tax verification and sales flag were preserved. Checkout remains disabled. Reruns capture the current shipping/timing baseline and touch only known demo products; cleanup refuses unrelated renamed products or unexpected stock/settings changes.

Every completed clip and its important frames were inspected. Final QA found video duration 275.904 seconds and audio duration 275.919 seconds (under one frame apart), legible subtitle samples, and no narration overlap warnings. Viewing/typing/transition pauses over 3.5 seconds were 3.7–4.7 seconds, including time to inspect the stock-change preview and saved results. No failed capture steps remain in the final clips.

## Re-recording

Start the Good Apollo development application and local Voicebox service. In the demoreel repository:

```sh
cd /Users/justin/Projects/demoreel
node bin/demoreel.mjs login good-apollo-studio
node bin/demoreel.mjs build good-apollo-studio
DEMO_DIR=/Users/justin/Projects/demoreel/demos/good-apollo-studio node demos/good-apollo-studio/cleanup.mjs
```

The operator signs in themselves and closes the login window to save its session before building. Each clip has repeatable preconditions for changes, and the final Settings clip restores its baseline. Run cleanup after recording, including after a failed capture. Review the recordings and run the skill's QA script before copying the MP4 to Good Apollo's ignored output folder. Sign-in state, narration cache and rendered media remain ignored; do not commit them.
