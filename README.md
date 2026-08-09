# my-agent

Electron desktop shell (React + TypeScript) for Windows and macOS.

## Prerequisites

- Node.js 20+（Vitest 4 需要）
- npm

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

## Quality checks

```bash
npm run lint
npm test
npm run format
```

## Build

```bash
npm run build
npm run build:win   # Windows installer (NSIS)
npm run build:mac   # macOS disk image (DMG)
```

**Note:** macOS packaging (`npm run build:mac`) must run on a macOS host with Xcode command-line tools available.
