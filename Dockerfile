FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Onde o SQLite grava os dados — precisa ser um volume persistente
# (definido no docker-compose.yml), senão perde tudo a cada novo deploy.
RUN mkdir -p /app/data
ENV DATABASE_PATH=/app/data/admfood.db

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "60", "app:app"]
