# Clinical Ledger — Hospital Management System (HMS)

A hospital management system built with **React**, **Tailwind CSS**, **Express**, **tRPC**, and **Drizzle ORM** with **Supabase PostgreSQL** and **Vercel** serverless deployment.

---

## Features

- **Protected Role-Based Workspaces**: Admin, Doctor, and Receptionist views with role context validation.
- **Patient Registry**: Active patient management, record search, demographic care contexts, and safe soft-archiving.
- **Appointment Scheduling & Availability**: Conflict-free 30-minute slot booking engine, real-time doctor availability checking, and schedule management.
- **Electronic Health Records (EHR)**: Clinical notes (SOAP format), prescription management with medication items, and laboratory test ordering/results.
- **Billing & Payments Desk**: Bill generation, partial and full payment collections, outstanding balances, and financial summaries.
- **Archive & Audit Ledger**: Soft-deletion safeguards, record restoration, and audit logs.

---

## Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide Icons, Radix UI primitives, Wouter
- **Backend**: Node.js, Express, tRPC (v11), superjson
- **Database**: Supabase PostgreSQL (Postgres-JS + Drizzle ORM)
- **Deployment**: Vercel (Static frontend on CDN + Serverless Function on Node.js 22.x)

---

## Getting Started

### 1. Database Setup (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in your Supabase dashboard.
3. Paste the contents of [`supabase/setup.sql`](./supabase/setup.sql) and click **Run**.
   - This creates all required enums, tables, indexes, constraints, and seeds default demo data.

### 2. Environment Configuration

Create a `.env` file in the root directory (based on [`.env.example`](./.env.example)):

```env
# Supabase PostgreSQL Connection String (Transaction Pooler, Port 6543)
DATABASE_URL=postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres

# Session Secret (min 32 random characters)
JWT_SECRET=your-secure-random-jwt-secret-key-at-least-32-chars

# Environment
NODE_ENV=development
PORT=3000
VITE_APP_ID=clinical-ledger
```

### 3. Install & Run Locally

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Demo Accounts

| Role | Email | Password |
|---|---|---|
| **Admin** | `admin@clinicalledger.demo` | `CL-Admin!2026` |
| **Doctor** | `doctor@clinicalledger.demo` | `CL-Doctor!2026` |
| **Receptionist** | `reception@clinicalledger.demo` | `CL-Front!2026` |

---

## Deployment to Vercel

1. Push this repository to GitHub.
2. Import the repository into [Vercel](https://vercel.com).
3. Set the **Framework Preset** to `Vite`.
4. In **Environment Variables**, add:
   - `DATABASE_URL`: Your Supabase Transaction Pooler URI (port 6543, with `?sslmode=require` if required).
   - `JWT_SECRET`: A secure 32+ character string.
   - `NODE_ENV`: `production`
5. Click **Deploy**.

Vercel will use [`vercel.json`](./vercel.json) to build the frontend with `pnpm build:vercel` into `dist/public` and route `/api/*` and `/trpc/*` to the serverless function in `api/index.ts`.

---

## Scripts

- `pnpm dev`: Start local development server with hot-reloading
- `pnpm build`: Full build (client bundle + server bundle)
- `pnpm build:vercel`: Client bundle build for Vercel deployment
- `pnpm test`: Run Vitest test suite
- `pnpm check`: TypeScript type checks
