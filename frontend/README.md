# Truth-Triggered Weather Payouts Frontend

Next.js frontend for a GenLayer-based weather parametric payout application.

## Setup

1. Install dependencies:

**Using bun:**
```bash
bun install
```

**Using npm:**
```bash
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Configure environment variables:
   - `NEXT_PUBLIC_CONTRACT_ADDRESS` - Deployed `DroughtCover` contract address
   - `NEXT_PUBLIC_GENLAYER_RPC_URL` - GenLayer Studio URL (default: https://studio.genlayer.com/api)

## Development

**Using bun:**
```bash
bun dev
```

**Using npm:**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Build

**Using bun:**
```bash
bun run build
bun start
```

**Using npm:**
```bash
npm run build
npm start
```

## Tech Stack

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS v4** - Styling with custom glass-morphism theme
- **genlayer-js** - GenLayer blockchain SDK
- **TanStack Query (React Query)** - Data fetching and caching
- **Radix UI** - Accessible component primitives
- **shadcn/ui** - Pre-built UI components

## Wallet Management

The app uses GenLayer's account system:
- **Create Account**: Generate a new private key
- **Import Account**: Import existing private key
- **Export Account**: Export your private key (secured)
- **Disconnect**: Clear stored account data

Accounts are stored in browser's localStorage for development convenience.

## Features

- **Create Policy Offer**: Provider creates a fully collateralized policy offer
- **Pay Premium**: Buyer pays premium to activate policy
- **Resolve Policy**: Owner resolves policy with deterministic values for MVP testing
- **Verification Proof View**: Displays settlement result and proof hash
- **Active Policies Table**: Tracks live policy states
- **Withdrawable Balance View**: Shows earned/redeemable internal balance
