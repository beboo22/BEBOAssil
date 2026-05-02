# Aseel AI Trip

AI-powered travel planner that helps you generate complete itineraries, book flights & hotels, and explore destinations worldwide.

🌐 **Live site**: https://aseelaitrip.com

## Tech Stack

- React 18 + Vite + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (database, auth, edge functions, storage)
- React Router, React Query, i18next

## Local development

```sh
npm install
npm run dev
```

The app runs at `http://localhost:8080`.

## Build

```sh
npm run build
```

## Environment

Required env vars are auto-provisioned via the connected backend (`.env`):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

## License

© Aseel AI Trip. All rights reserved.
