FROM python:3.12-slim

# Sem isso, a saída do Python fica em buffer dentro do container e os
# print() (inclusive avisos de erro) podem nunca aparecer nos logs do
# Dokploy, mesmo rodando normalmente — só apareceriam se/quando o buffer
# enchesse, o que pode nunca acontecer num processo de longa duração.
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Onde o SQLite grava os dados — precisa ser um volume persistente
# (definido no docker-compose.yml), senão perde tudo a cada novo deploy.
RUN mkdir -p /app/data
ENV DATABASE_PATH=/app/data/admfood.db

# DEBUG TEMPORÁRIO — teste de controle pra descobrir se as variáveis
# definidas no painel do Dokploy estão mesmo chegando no container, sem
# depender de nada configurado lá (essa vem de dentro da própria imagem).
# Remover depois que o problema de login for resolvido.
ENV DEBUG_ENV_DOCKERFILE=presente-no-dockerfile

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "60", "app:app"]
