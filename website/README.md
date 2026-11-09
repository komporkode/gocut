# GoCut Release Website

Static release and download site for **GoCut**, deployed cleanly on **Cloudflare Pages** and **Vercel**.

## Local Development

```sh
cd website
npm install
npm run dev
```

Production check & build (`website/dist`):

```sh
npm --prefix website run build
npm --prefix website run preview
```

## Deploy to Cloudflare Pages

1. Connect the `komporkode/gocut` repository in Cloudflare Pages.
2. Configure build settings:
   - **Root directory**: `website`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
3. Security and caching headers are served from `website/public/_headers`. Cloudflare Pages automatically falls back unmatched paths to `index.html` because no `404.html` is emitted.

Or deploy directly with Wrangler CLI:

```sh
npm --prefix website run build
npx wrangler pages deploy website/dist --project-name=gocut-release
```

## Deploy to Vercel

1. Import the repository in Vercel.
2. Set **Root Directory** to `website`.
3. Vercel automatically reads `website/vercel.json` (Vite output directory `dist`, clean URLs, and security headers).

Or deploy via Vercel CLI:

```sh
cd website
vercel --prod
```

## Fork Attribution

GoCut is an independent MIT-licensed fork of [ReaCut](https://github.com/Xiangyu-CAS/rea-capcut) (Xiangyu-CAS & ReaCut contributors) informed by open research in [REA](https://github.com/morluto/rea) (morluto).

