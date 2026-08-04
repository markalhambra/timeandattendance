# Time and Attendance Management System (TAMS)

A production-ready, browser-based Time and Attendance Management System supporting four user roles, GPS-based clock-in/out, leave/overtime workflows, and multi-level approvals.

---

## Features

- **GPS Clock-In/Out** — auto-detect On-Site (≤200m) or prompt WFH/OB selection
- **Four Roles** — Employee, Department Head, HR, Admin
- **Leave Management** — Sick, Vacation, PML, SML with multi-level approval
- **Overtime Tracking** — auto-generated at clock-out >9h; convert to CTO (4h min) or CDO (8h min)
- **Attendance Corrections** — employee-initiated, DH/HR approved
- **Reporting** — attendance, leave, overtime, absence reports with XLSX export
- **Audit Trail** — full system activity log
- **PWA** — installable, offline-capable
- **Responsive** — mobile, tablet, desktop

---

## User Guidelines and Manual

See `USER_MANUAL.md` for complete role-based usage guides for:
- Employee
- Department Head
- HR
- Admin

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, TanStack Query |
| Backend | Node.js 20, Express 4, TypeScript, Prisma 5 |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Auth | JWT (15m access / 7d refresh), bcrypt |
| Deploy | Docker Compose + Nginx |

---

## Quick Start

### Prerequisites
- Docker + Docker Compose
- Node.js 20+ (for local dev)

### 1. Clone & Configure

```bash
git clone <repo-url>
cd time-attendance-system
cp .env.example .env
# Edit .env with your values
```

### 2. Start with Docker

```bash
docker compose up -d
```

Visit `http://localhost` (production) or:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`

### 3. Seed Database

```bash
docker compose exec backend npx prisma db seed
```

---

## Local Development

```bash
# Backend
cd backend
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

---

## Demo Credentials

| Role | Email | Password |
|---|---|---|
| Admin | admin@tams.com | Admin@123456 |
| HR | hr@tams.com | Hr@123456 |
| Dept Head | head.digital@tams.com | Head@123456 |
| Employee | juan@tams.com | Employee@123 |

---

## Environment Variables

See `.env.example` for all required variables. Key ones:

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/tams
JWT_ACCESS_SECRET=your-secret
OFFICE_LAT=14.583889
OFFICE_LNG=121.062778
OFFICE_RADIUS_METERS=300
FRONTEND_URL=http://localhost:3000
```

---

## Architecture

```
nginx (80)
├── / → frontend:80 (React SPA)
└── /api/ → backend:4000 (Express REST API)
              └── postgres:5432
              └── redis:6379
```

---

## API Overview

| Prefix | Description |
|---|---|
| `POST /api/auth/login` | Login |
| `POST /api/attendance/clock-in` | Clock in with GPS |
| `POST /api/attendance/clock-out` | Clock out |
| `GET /api/dashboard/:role` | Role dashboard data |
| `POST /api/leave` | File leave |
| `PATCH /api/leave/:id/review` | DH review leave |
| `POST /api/overtime/convert` | Convert OT to CTO/CDO |
| `GET /api/reports/attendance/export` | XLSX export |

---

## Database Schema

See `backend/prisma/schema.prisma`. Key models:
- `User` + `Employee` — authentication and HR data
- `AttendanceRecord` — daily clock-in/out with GPS + status
- `LeaveRequest` — multi-level approval (DH → HR)
- `OvertimeRecord` — auto-generated, expires in 3mo (pending) / 12mo (approved)
- `AuditLog` — full change trail

---

## Overtime Rules

1. Working > 9h automatically creates a `PENDING` OvertimeRecord
2. DH approves → `APPROVED` (12-month expiry)
3. Employee can convert: CTO (≥4h) or CDO (≥8h)
4. HR approves conversion
5. Cron jobs expire stale records and send 7-day alerts

---

## Deployment

Production Docker Compose starts nginx reverse proxy:

```bash
docker compose --profile production up -d
```

For HTTPS, place SSL termination in front of nginx (e.g., Certbot, Cloudflare Tunnel, or a load balancer).

---

## License

MIT
