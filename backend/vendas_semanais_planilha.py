# -*- coding: utf-8 -*-
"""Leitura da planilha de vendas semanais por canal (a que o chefe da Julia
manda). Mesmo papel de `precos_cardapio.ler_precos_da_planilha`: só entende
o arquivo e devolve dado limpo — quem grava é quem chama, seja o script de
linha de comando (importar_vendas_semanais.py) ou o botão "Importar
planilha" da tela de Vendas Semanais.

A planilha é uma aba por loja, com uma linha por semana:

    PERÍODO         | IFOOD | CARDÁPIO WEB | 99 FOOD | PRESENCIAL | TOTAL | ...
    31/03 a 06/04   | ...   | ...          |         | ...        | ...

Duas armadilhas dela, tratadas aqui:

1. **O período não tem ano** ("31/03 a 06/04") e cada aba emenda mais de um
   ciclo anual em sequência. O ano é inferido de trás pra frente a partir de
   hoje — ver `_atribuir_anos`.
2. **O separador varia** ("a", "á", travessão, ou nenhum), então qualquer
   coisa que não seja dígito entre as duas datas serve.
"""
import re
from datetime import date

import openpyxl

# Aba da planilha -> loja como o AdmFood chama
LOJA_POR_ABA = {
    "ARTESANOS": "Hamburgueria Artesanos",
    "TRADIÇA ZN": "Tradiça ZN",
    "SIMUS": "Tradiça Simus",
    "AÇAÍ NALATA": "Açaí Na Lata",
}

# Coluna da planilha (índice 0) -> canal, no mesmo vocabulário de
# NOMES_CANAL_REDE em app.py ("portal" é a venda presencial/balcão).
CANAL_POR_COLUNA = {1: "ifood", 2: "catalog", 3: "food99", 4: "portal"}

# Métricas da semana (não por canal). %CMV, classificação e variação NÃO
# vêm da planilha de propósito: são derivadas e o sistema recalcula, senão
# seriam duas contas capazes de divergir (a da planilha, aliás, divide por
# um total que nas semanas antigas não somava o 99 Food).
COLUNA_CMV = 6
COLUNA_PROMO_LOJA = 7

PRIMEIRA_LINHA_DADOS = 4

# O cabeçalho é conferido antes de ler: as colunas eram lidas por posição
# fixa, então uma coluna a mais na planilha fazia o "TOTAL" cair no lugar do
# CMV e a semana inteira virar ~100% ("ruim"), em silêncio (QA 22/09).
NOMES_DE_COLUNA = {
    "ifood": ("ifood",),
    "catalog": ("catalog", "cardapio web", "cardápio web", "catálogo", "catalogo"),
    "food99": ("99", "99food", "99 food"),
    "portal": ("portal", "presencial", "balcao", "balcão"),
    "cmv": ("cmv",),
    "promoLoja": ("promo", "promocao", "promoção"),
}


def _normalizar_cabecalho(texto):
    return re.sub(r"\s+", " ", str(texto or "").strip().lower())


def _mapear_colunas(ws):
    """Onde está cada coluna, pelo nome no cabeçalho. Devolve (mapa, aviso).
    Sem cabeçalho reconhecível, volta nas posições fixas de sempre."""
    for linha in ws.iter_rows(min_row=1, max_row=PRIMEIRA_LINHA_DADOS - 1, values_only=True):
        achadas = {}
        for indice, celula in enumerate(linha or ()):
            nome = _normalizar_cabecalho(celula)
            if not nome:
                continue
            for chave, apelidos in NOMES_DE_COLUNA.items():
                if chave in achadas:
                    continue
                if any(apelido in nome for apelido in apelidos):
                    achadas[chave] = indice
        # Precisa achar pelo menos os canais pra valer como cabeçalho.
        if len([c for c in achadas if c in ("ifood", "catalog", "food99", "portal")]) >= 3:
            return achadas, None
    return None, ("não achei o cabeçalho com os nomes das colunas (iFood, Catalog, 99, Portal): "
                  "li pelas posições de sempre. Se alguém acrescentou coluna, confira os valores.")

PERIODO = re.compile(r"^\s*(\d{1,2})/(\d{1,2})\s*\D*\s*(\d{1,2})/(\d{1,2})\s*$")

# Semana de verdade tem de 1 a 8 dias. Mais que isso é dígito trocado na
# planilha (ex: "02/06 á 07/09" no meio de junho) — gravar arquivaria o
# faturamento na semana errada.
MAX_DIAS_SEMANA = 8


def _numero(valor):
    """Número da célula. Quem digita na planilha às vezes escreve
    "R$ 1.234,56" como texto, e aí o valor sumia do canal sem uma palavra
    (QA 22/09)."""
    if valor is None or valor == "":
        return None
    try:
        return round(float(valor), 2)
    except (TypeError, ValueError):
        pass
    limpo = re.sub(r"[^\d,.\-]", "", str(valor)).strip()
    if not limpo:
        return None
    # "1.234,56" é milhar + decimal; "1234.56" é decimal do inglês.
    if "," in limpo:
        limpo = limpo.replace(".", "").replace(",", ".")
    try:
        return round(float(limpo), 2)
    except ValueError:
        return None


def _ler_aba(ws):
    """Linhas cruas da aba, ainda sem ano: (dia_i, mes_i, dia_f, mes_f, canais)."""
    linhas, avisos = [], []
    mapa, aviso_cabecalho = _mapear_colunas(ws)
    if aviso_cabecalho:
        avisos.append(aviso_cabecalho)
    colunas_canal = ({canal: mapa[canal] for canal in ("ifood", "catalog", "food99", "portal") if canal in mapa}
                     if mapa else {canal: coluna for coluna, canal in CANAL_POR_COLUNA.items()})
    coluna_cmv = mapa.get("cmv", COLUNA_CMV) if mapa else COLUNA_CMV
    coluna_promo = mapa.get("promoLoja", COLUNA_PROMO_LOJA) if mapa else COLUNA_PROMO_LOJA
    for numero_linha, r in enumerate(ws.iter_rows(min_row=PRIMEIRA_LINHA_DADOS, values_only=True), PRIMEIRA_LINHA_DADOS):
        periodo = str(r[0]).strip() if r[0] is not None else ""
        canais = {canal: _numero(r[coluna]) for canal, coluna in colunas_canal.items()
                  if coluna < len(r)}
        if not periodo and all(v is None for v in canais.values()):
            continue
        casado = PERIODO.match(periodo)
        if not casado:
            avisos.append(f"linha {numero_linha}: período ilegível ({periodo!r})")
            continue
        if all(v is None for v in canais.values()):
            avisos.append(f"linha {numero_linha}: {periodo!r} sem nenhum valor de canal")
            continue
        dia_i, mes_i, dia_f, mes_f = (int(g) for g in casado.groups())
        if not (1 <= mes_i <= 12 and 1 <= mes_f <= 12 and 1 <= dia_i <= 31 and 1 <= dia_f <= 31):
            avisos.append(f"linha {numero_linha}: data inválida em {periodo!r} — corrija a planilha")
            continue
        extras = {
            "cmv": _numero(r[coluna_cmv]) if len(r) > coluna_cmv else None,
            "promoLoja": _numero(r[coluna_promo]) if len(r) > coluna_promo else None,
        }
        linhas.append((dia_i, mes_i, dia_f, mes_f, canais, extras))
    return linhas, avisos


def _atribuir_anos(linhas, hoje):
    """A planilha não traz ano. Como as linhas estão em ordem cronológica,
    ancora a ÚLTIMA no ano mais recente em que ela já terminou e caminha de
    trás pra frente, tirando um ano toda vez que o mês sobe ao voltar
    (fevereiro visto logo antes de janeiro = virada de ano)."""
    if not linhas:
        return []

    mes_f_ultima = linhas[-1][3]
    ano = hoje.year
    if mes_f_ultima > hoje.month:
        ano -= 1  # a última semana da planilha ainda não chegou neste ano

    datadas = []
    mes_anterior = None
    for dia_i, mes_i, dia_f, mes_f, canais, extras in reversed(linhas):
        if mes_anterior is not None and mes_i > mes_anterior:
            ano -= 1
        try:
            inicio = date(ano, mes_i, dia_i)
            # Semana que atravessa o ano novo ("29/12 a 04/01") termina no
            # ano seguinte.
            fim = date(ano + 1 if mes_f < mes_i else ano, mes_f, dia_f)
        except ValueError:
            mes_anterior = mes_i
            continue  # 31/02 e afins — já reportado como data inválida
        datadas.append((inicio, fim, canais, extras))
        mes_anterior = mes_i
    datadas.reverse()
    return datadas


def ler_vendas_semanais_da_planilha(caminho_ou_arquivo, hoje):
    """Devolve {loja: [(inicio, fim, {canal: valor}, {cmv, promoLoja}), ...]} e a lista de
    avisos do que ficou de fora. `hoje` é obrigatório porque a inferência de
    ano depende dele — deixar implícito esconderia essa dependência."""
    wb = openpyxl.load_workbook(caminho_ou_arquivo, data_only=True)
    por_loja, avisos = {}, []

    for aba, loja in LOJA_POR_ABA.items():
        if aba not in wb.sheetnames:
            avisos.append(f"{aba}: aba não encontrada na planilha")
            continue

        linhas, avisos_aba = _ler_aba(wb[aba])
        avisos.extend(f"{aba} — {a}" for a in avisos_aba)

        semanas = []
        for inicio, fim, canais, extras in _atribuir_anos(linhas, hoje):
            dias = (fim - inicio).days
            if not 1 <= dias <= MAX_DIAS_SEMANA:
                avisos.append(f"{aba} — {inicio} a {fim}: período de {dias} dias, dígito trocado na planilha")
                continue
            semanas.append((inicio, fim, {c: v for c, v in canais.items() if v is not None}, extras))
        por_loja[loja] = semanas

    return por_loja, avisos
