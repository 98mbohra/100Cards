# 100 Cards

Sideways prompts for when a song is stuck. 103 original cards in the spirit of
Oblique Strategies, tagged writing / arranging / recording / mindset.

- **Edit the deck:** `cards.json`. Each card is `{ "id", "tag", "text" }`; ids must be unique,
  tag must be one of the four above.
- **Use:** tap or shake for a new card, swipe right to keep, left to let go.
  Your kept cards, history and own cards live in the browser on your phone.
- **Host:** GitHub Pages (Settings → Pages → Deploy from a branch → `main` / root).
  The service worker makes it work offline once it has been opened.

After editing `cards.json` online it updates on next open. If you change
`app.js` or `styles.css`, bump `VERSION` in `sw.js` so phones pick it up.
