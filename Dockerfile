FROM python:3.12-slim

# Sem isso, a saída do Python fica em buffer dentro do container e os
# print() (inclusive avisos de erro) podem nunca aparecer nos logs do
# Dokploy, mesmo rodando normalmente — só apareceriam se/quando o buffer
# enchesse, o que pode nunca acontecer num processo de longa duração.
ENV PYTHONUNBUFFERED=1

# A imagem slim roda em UTC por padrão. O front manda prazo (datetime-local)
# como hora de Brasília sem indicar fuso nenhum, e o back compara direto
# com datetime.now()/date.today() — sem os dois lados no mesmo fuso, prazo
# marcado pra "hoje" parece vencer 3h mais cedo do que deveria (achado em
# 2026-08-31 testando o fluxo de Compras: prazo de hoje às 17h35 já
# aparecia vencido bem antes disso). tzdata precisa estar instalado pra
# TZ=America/Sao_Paulo funcionar de verdade nessa imagem base.
ENV TZ=America/Sao_Paulo
RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/*

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
