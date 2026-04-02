# 🟠 Clawd Run

A browser-based endless runner game featuring **Clawd** — the Claude Code mascot — styled after the claude.ai design system.

Inspired by the Google Chrome offline Dino game.

![Image Alt](https://github.com/firedintern/clawd-run/blob/114850f46340c41afc331ffd399e8122655badd9/Screenshot%202026-04-02%20at%2011.56.53.png)
![Image Alt](https://github.com/firedintern/clawd-run/blob/114850f46340c41afc331ffd399e8122655badd9/Screenshot%202026-04-02%20at%2011.57.29.png)

## 🎮 Play

Open `bundle.html` in your browser — no install needed.

Or play directly: just open the HTML file.

## 🕹️ Controls

- `Space` / `↑` / `Tap` — jump
- Avoid the API error signs (`429`, `500`, `403`...) and floating warning bubbles
- Speed increases over time — survive as long as you can

## 🛠️ Built With

- React 18 + TypeScript
- Vite + Parcel (bundling)
- HTML5 Canvas (game engine)
- Lora serif font (matching claude.ai)
- Claude.ai color palette (`#F0EAE0`, `#C8623A`, etc.)

## 🚀 Dev Setup

```bash
pnpm install
pnpm dev
```

### Build single-file bundle

```bash
bash scripts/bundle-artifact.sh
# outputs: bundle.html
```

## 🎨 Design

Fully themed to match claude.ai:
- Warm parchment background
- Terracotta orange accents
- Serif typography (Lora)
- Error obstacles styled as API error cards
- Flying obstacles: `deprecated()`, `NaN tokens`, `hallucination`

---

Built with [Claude](https://claude.ai) 🤖
