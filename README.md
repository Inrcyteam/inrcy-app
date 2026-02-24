This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Rate limiting & quotas (production)

This app uses Upstash/Vercel KV for rate limiting and daily quotas.

Required env (already present in Vercel KV integration):

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

Optional tuning env (defaults are safe):

- `RL_BOOSTER_GENERATE_PER_MIN` (default: 8)
- `QUOTA_BOOSTER_GENERATE_PER_DAY` (default: 120)
- `RL_TEMPLATES_RENDER_PER_MIN` (default: 20)
- `QUOTA_TEMPLATES_RENDER_PER_DAY` (default: 500)
- `RL_PUBLISH_NOW_PER_MIN` (default: 6)
- `QUOTA_PUBLISH_NOW_PER_DAY` (default: 80)
- `RL_WIDGET_ISSUE_TOKEN_PER_MIN` (default: 30)
- `QUOTA_WIDGET_ISSUE_TOKEN_PER_DAY` (default: 2000)

Expensive endpoints are configured **fail-closed** to protect costs if KV is unavailable.

## Ops (production)

### Internal health

- Public (safe): `GET /api/health`
- Internal (deep): `GET /api/health/internal` with header `x-health-token: <HEALTHCHECK_TOKEN>`

Add in Vercel (Production + Preview):

- `HEALTHCHECK_TOKEN` (random long secret)

### Smoke check after deploy

Run locally:

- `APP_BASE_URL=https://app.inrcy.com HEALTHCHECK_TOKEN=... npm run smoke:health`

### Runbook

See:

- `ops/RUNBOOK.md`
- `ops/DEPLOY_CHECKLIST.md`
- `ops/MIGRATIONS.md`

