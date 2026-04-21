import os

SECRET_KEY: str = os.environ["SECRET_KEY"]
ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_DAYS", "7"))
REGISTRATION_ENABLED: bool = os.getenv("REGISTRATION_ENABLED", "false").lower() == "true"
COOKIE_SECURE: bool = os.getenv("COOKIE_SECURE", "false").lower() == "true"
