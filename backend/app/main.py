from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.routers import auth, compounds, dashboard, health, injections, protocols, profile, reminders
from app.scheduler import scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title="peptracker", lifespan=lifespan)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(compounds.router)
app.include_router(injections.router)
app.include_router(dashboard.router)
app.include_router(protocols.router)
app.include_router(profile.router)
app.include_router(reminders.router)
