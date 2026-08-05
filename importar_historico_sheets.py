"""
Importa o histórico diário de faturamento (dados anteriores ao início da
sincronização com a Cardápio Web) de uma planilha pública do Google Sheets
para o banco local (admfood.db).

A planilha tem uma aba "DIARIO ..." por unidade, com uma linha por dia:
  coluna A = data (às vezes só "Quarta 01/10", sem ano)
  colunas B..E = valores por canal de venda (nem sempre rotuladas)
  coluna F = Total do dia (soma das colunas de canal)

Como nem toda linha tem o ano explícito, o ano de cada data é descoberto
comparando o dia da semana escrito na planilha (ex: "Terça") com o dia da
semana calculado para os anos candidatos — só um ano bate.

Só o Total (coluna F) é importado, como faturamento_dia. Não há contagem de
pedidos na planilha, então quantidade_pedidos e ticket_medio ficam zerados
para essas linhas históricas.

Nunca sobrescreve um dia que já existe no banco (dado sincronizado ao vivo
pela Cardápio Web sempre tem prioridade sobre o valor da planilha).

Uso:
  python importar_historico_sheets.py            # modo simulação (não grava nada)
  python importar_historico_sheets.py --apply     # grava de verdade no banco
"""

import csv
import io
import re
import sys
import unicodedata
from datetime import date

import requests

from backend.armazenamento import inicializar_banco, salvar_historico_se_ausente

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

SHEET_ID = "1X7AGsFlarnuUIzV-592z39oojj8V2T8SAHP5UEqyZEo"

ABAS_POR_UNIDADE = {
    "DIARIO ART": "Hamburgueria Artesanos",
    "DIARIO ZN": "Tradiça ZN",
    "DIARIO SIMUS": "Tradiça Simus",
    "DIÁRIO AÇAÍ ": "Açaí Na Lata",
}

DIAS_SEMANA = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"]

REGEX_DATA = re.compile(r"(\d{1,2})/(\d{1,2})(?:/(\d{4}))?")


def _sem_acento(texto):
    normalizado = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in normalizado if not unicodedata.combining(c)).lower().strip()


def _extrair_weekday_da_linha(linha):
    for celula in linha:
        base = _sem_acento(celula)
        for i, nome in enumerate(DIAS_SEMANA):
            if base.startswith(nome):
                return i
    return None


def _parsear_valor_moeda(texto):
    texto = (texto or "").strip().replace("R$", "").strip()
    if not texto:
        return 0.0
    texto = texto.replace(".", "").replace(",", ".")
    try:
        return float(texto)
    except ValueError:
        return 0.0


def _resolver_data(celula_data, linha, hoje):
    m = REGEX_DATA.search(celula_data)
    if not m:
        return None, "sem padrão de data reconhecível"

    dia, mes, ano = int(m.group(1)), int(m.group(2)), m.group(3)
    if ano:
        try:
            return date(int(ano), mes, dia), None
        except ValueError:
            return None, "data inválida (dia/mês fora do range)"

    weekday_esperado = _extrair_weekday_da_linha(linha)
    if weekday_esperado is None:
        return None, "sem ano e sem dia da semana pra inferir o ano"

    for candidato in range(hoje.year, hoje.year - 3, -1):
        try:
            dt = date(candidato, mes, dia)
        except ValueError:
            continue
        if dt.weekday() == weekday_esperado and dt <= hoje:
            return dt, None

    return None, "nenhum ano candidato bate com o dia da semana da planilha"


def _buscar_csv_da_aba(nome_aba):
    url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq"
    resposta = requests.get(url, params={"tqx": "out:csv", "sheet": nome_aba}, timeout=30)
    resposta.raise_for_status()
    return list(csv.reader(io.StringIO(resposta.text)))


def importar(aplicar=False):
    inicializar_banco()
    hoje = date.today()
    resumo_geral = []

    for nome_aba, unidade in ABAS_POR_UNIDADE.items():
        print(f"\n=== {nome_aba} -> {unidade} ===")
        try:
            linhas = _buscar_csv_da_aba(nome_aba)
        except Exception as erro:
            print(f"  ERRO ao buscar a aba: {erro}")
            continue

        importados = 0
        ja_existentes = 0
        ignorados_valor_zero = 0
        falhas = []

        for linha in linhas:
            if not linha or not linha[0].strip():
                continue
            celula_data = linha[0].strip()
            if _sem_acento(celula_data).startswith("data"):
                continue  # linha de cabeçalho

            dt, motivo_falha = _resolver_data(celula_data, linha, hoje)
            if dt is None:
                falhas.append((celula_data, motivo_falha))
                continue

            total = _parsear_valor_moeda(linha[5]) if len(linha) > 5 else 0.0
            if total <= 0:
                ignorados_valor_zero += 1
                continue

            dia_iso = dt.isoformat()
            if aplicar:
                gravou = salvar_historico_se_ausente(unidade, dia_iso, total)
                if gravou:
                    importados += 1
                else:
                    ja_existentes += 1
            else:
                importados += 1  # contagem estimada em modo simulação

        print(f"  Linhas com data+valor válidos: {importados}")
        print(f"  Já existiam no banco (não sobrescritas): {ja_existentes}")
        print(f"  Ignoradas (valor zerado/vazio): {ignorados_valor_zero}")
        if falhas:
            print(f"  Linhas não reconhecidas ({len(falhas)}):")
            for texto, motivo in falhas[:15]:
                print(f"    - \"{texto}\": {motivo}")
            if len(falhas) > 15:
                print(f"    ... e mais {len(falhas) - 15}")

        resumo_geral.append((unidade, importados, ja_existentes, len(falhas)))

    print("\n=== RESUMO ===")
    for unidade, importados, ja_existentes, n_falhas in resumo_geral:
        print(f"{unidade}: {importados} importados, {ja_existentes} já existentes, {n_falhas} não reconhecidas")

    if not aplicar:
        print("\nModo SIMULAÇÃO — nada foi gravado no banco.")
        print("Revise os números acima e rode com --apply para gravar de verdade:")
        print("  python importar_historico_sheets.py --apply")


if __name__ == "__main__":
    importar(aplicar="--apply" in sys.argv)
