# Pearls

[![CI](https://github.com/svenjacobs/pearls/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/svenjacobs/pearls/actions/workflows/ci.yml)

A self-hostable, turn-based multiplayer web implementation of a board game. Race to clear all 12 rows of pearls from your board before your opponents do. Full rules are explained in game.

![Screenshots](./screenshot.png)

## Features

- **Real-time multiplayer** — up to several players per game, board states update live via Server-Sent Events
- **Multiple parallel games** — join and manage several games at once from the active games list
- **AI players** — play against computer-controlled opponents
- **Invite via link or QR code** — share a game with one tap, no account required
- **All-boards view** — see every player's board live during the game
- **Initiative dice-off** — dice roll determines turn order at game start
- **Emoji reactions** — send one of 6 reactions during play, toggleable in settings
- **Sound effects** — 9 sounds for dice, pearls, and game events, mutable
- **Pearl color themes** — 30+ board themes across colors, nature, seasons, and country flags
- **Progressive Web App** — installable on mobile and desktop
- **Push notifications** — get notified when it's your turn, opt-in
- **Localization** — English and German
- **Dark mode** — follows system preference

## Tech Stack

| Layer             | Technology                               |
| ----------------- | ---------------------------------------- |
| Framework         | SvelteKit 2 (Svelte 5, SSR)              |
| Language          | TypeScript 6                             |
| Styling           | TailwindCSS v4                           |
| Build tool        | Vite 8                                   |
| Test runner       | Vitest 4                                 |
| Integration tests | Testcontainers (real Redis in container) |
| Database          | Redis 8                                  |
| Realtime          | Server-Sent Events (SSE)                 |
| Logging           | Pino                                     |
| i18n              | Paraglide JS                             |
| PWA               | vite-plugin-pwa + Workbox                |
| Package manager   | pnpm 11                                  |
| Runtime           | Node.js 26                               |
| Container         | Docker / Podman                          |

## Self-Hosting & Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for full instructions, including Docker Compose and Podman Quadlet setups.

---

> **Disclaimer:** This project was created with the assistance of AI tools.
