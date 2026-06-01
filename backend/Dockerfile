FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# System deps (curl used for healthchecks/debug)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Playwright Chromium для HTML-парсера 2GIS (2gis.ru/firm/{id} — SPA).
# --with-deps ставит системные библиотеки Chromium через apt (≈500MB).
# С Playwright 1.40+ `chromium.launch(headless=True)` дефолтно использует
# отдельный лёгкий бинарь `chromium-headless-shell` — без него launch падает
# с «Executable doesn't exist». Ставим ОБА: chromium как fallback и
# chromium-headless-shell как фактический рантайм headless-запусков.
RUN python -m playwright install --with-deps chromium chromium-headless-shell && \
    rm -rf /var/lib/apt/lists/* /root/.cache/pip

COPY . .

EXPOSE 8000

# Command is set in docker-compose.prod.yml
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

