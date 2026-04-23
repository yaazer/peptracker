# PepTracker v1

A personal peptide and medication tracking app.

## Tech Stack

- **Backend**: FastAPI (Python 3.12), SQLAlchemy, SQLite
- **Frontend**: Next.js 14+, TypeScript, Tailwind CSS
- **Infrastructure**: Docker Compose

## Running Locally

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose

### Start

```bash
docker compose up --build
```

| Service  | URL                        |
|----------|----------------------------|
| Frontend | http://localhost:3000      |
| API docs | http://localhost:8000/docs |

The frontend proxies all `/api/*` requests to the backend container internally, so the browser only ever talks to port 3000 — regardless of what hostname or IP you use to access the app (local network, Tailscale, etc.).

### Stop

```bash
docker compose down
```

To also remove the SQLite volume:

```bash
docker compose down -v
```

## Configuration

Copy `.env.example` and adjust as needed (backend vars only):

| Variable                 | Default                              | Notes                              |
|--------------------------|--------------------------------------|------------------------------------|
| `DATABASE_URL`           | `sqlite:////app/data/peptracker.db`  |                                    |
| `SECRET_KEY`             | —                                    | Change in production               |
| `REGISTRATION_ENABLED`   | `false`                              | Set to `true` to allow sign-ups    |
| `COOKIE_SECURE`          | `false`                              | Set to `true` behind HTTPS         |
| `ACCESS_TOKEN_EXPIRE_DAYS` | `7`                                |                                    |

## Project Structure

```
peptracker/
├── backend/
│   ├── app/
│   │   ├── main.py        # FastAPI app
│   │   ├── database.py    # SQLAlchemy engine + session
│   │   ├── models.py      # ORM models
│   │   ├── schemas.py     # Pydantic schemas
│   │   └── routers/       # auth, compounds, injections, dashboard
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── app/               # Next.js App Router pages
│   ├── components/        # Shared UI components
│   ├── context/           # AuthContext, ThemeContext
│   ├── lib/               # apiFetch, types
│   ├── next.config.js     # /api/* rewrite → backend container
│   └── Dockerfile
├── docker-compose.yml
└── .env.example
```
