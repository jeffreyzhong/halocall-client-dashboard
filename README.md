This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Color Theme

### HaloCall Custom Colors (Warm Wellness Palette)

**Sage Green (Primary)**
- Sage: `#8B9E8B`
- Sage Light: `#A8B8A8`
- Sage Dark: `#6B7E6B`

**Cream (Secondary)**
- Cream: `#F5F2EB`
- Cream Dark: `#EBE7DC`

**Terracotta (Accent)**
- Terracotta: `#C4836E`
- Terracotta Light: `#D4A090`
- Terracotta Dark: `#A4634E`

**Neutrals**
- Charcoal: `#2D2D2D`
- Warm Gray: `#8A8A8A`
- Warm Gray Light: `#B8B8B8`

### Light Theme
- Background: `#FDFCFA`
- Foreground: `#2D2D2D`
- Card: `#FFFFFF`
- Primary: `#8B9E8B`
- Secondary: `#F5F2EB`
- Accent: `#C4836E`
- Border: `#E8E5DE`

### Dark Theme
- Background: `#1A1A1A`
- Foreground: `#F5F2EB`
- Card: `#262626`
- Primary: `#A8B8A8`
- Secondary: `#2D2D2D`
- Accent: `#D4A090`
- Border: `#3D3D3D`

## Font Styles

This project uses Google Fonts loaded via [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) for optimal performance.

### Primary Font: DM Sans
- **Usage**: Body text and general content
- **CSS Variable**: `--font-dm-sans`
- **Tailwind Class**: `font-sans`
- **Weights**: 400 (Regular), 500 (Medium), 600 (SemiBold), 700 (Bold)
- **Display**: `swap` (for better performance)

### Heading Font: Nunito
- **Usage**: Headings (h1-h6)
- **CSS Variable**: `--font-nunito`
- **Tailwind Class**: `font-serif`
- **Weights**: 300 (Light), 400 (Regular), 500 (Medium), 600 (SemiBold), 700 (Bold), 800 (ExtraBold), 900 (Black)
- **Display**: `swap` (for better performance)

### Font Usage
- Body text automatically uses DM Sans via `font-sans`
- All headings (h1-h6) automatically use Nunito via `font-serif`
- Fonts are self-hosted and optimized by Next.js for optimal loading performance

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
