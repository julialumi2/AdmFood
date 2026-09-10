# -*- coding: utf-8 -*-
"""Casamento entre o nome de insumo escrito nas planilhas do chefe e o
nome cadastrado no AdmFood.

Existe porque as duas listas foram escritas por pessoas diferentes: a
planilha de CMV diz "Queijo cheddar (fatia)" e "Smash burger", o catálogo
de estoque (que veio da VMarket) diz "Queijo cheddar" e "Smashburger
110g". Sem isso, importar custo ou receita cria insumo repetido e parte o
estoque do mesmo produto em dois.

São só regras determinísticas. Nada de similaridade automática de
propósito: "Geleia de Frutas Vermelhas" e "Geleia de pimenta" são 60%
parecidas e não têm nada a ver uma com a outra, enquanto "Smash burger" e
"Smashburger 110g" são a mesma carne — nenhum algoritmo separa esses dois
casos sozinho, então o que não cai numa regra vira decisão humana em
EQUIVALENCIAS.
"""
import re

from backend.armazenamento import _normalizar_nome_insumo

SUFIXO_PARENTESES = re.compile(r"\s*\([^)]*\)\s*$")

# Nome da planilha -> candidatos no cadastro. Lista porque o nome muda de
# loja pra loja (o Artesanos usa "Smashburger 110g"; o catálogo da VMarket,
# "Hamb. Select 110g"). Vale o primeiro que existir.
EQUIVALENCIAS = {
    "smash burger": ["Smashburger 110g", "Hamb. Select 110g", "Smash burger 110g"],
    "batata crinkle": ["Batata frita Crinkle", "Batata Crinkle Bem Brasil (1 Cx - 12Kg)"],
    "oleo de soja": ["Oleo De Soja (Mais Barato)", "Óleo de soja"],
    "ovo pasteurizado": ["Ovo Pasteurizado Kg"],
    "bacon fatia crua": ["Bacon", "Bacon Fatiado Smoke-MR BEEF"],
}


def sem_sufixo(nome):
    """"CLASSICO (simples)" -> "CLASSICO". O parêntese nas planilhas é
    anotação de variação, não faz parte do nome cadastrado."""
    return SUFIXO_PARENTESES.sub("", nome).strip()


# Tamanho/embalagem colado no nome de quem cadastra pelo pacote: "Amendoim
# triturado 1kg", "Confete1kg", "Ovomaltine 750gr", "Farinha de Paçoca
# (pacote 1kg)". Tirar isso é regra, não similaridade: sobra o produto.
_TAMANHO_DE_PACOTE = re.compile(r"\d+(?:[.,]\d+)?\s*(?:kg|g|gr|grs|ml|l|lt)\b")
_PALAVRA_DE_PACOTE = re.compile(r"\b(?:pacote|pct|bisnaga|balde|galao|caixa|cx|fardo|saco)\b")


def nome_base(nome):
    """"Amendoim triturado 1kg" -> "amendoim triturado". Normalizado. O
    tamanho sai antes de normalizar, que troca a vírgula de "2,5kg" por
    espaço e deixaria um "2" sobrando."""
    base = _TAMANHO_DE_PACOTE.sub(" ", sem_sufixo(nome).lower())
    base = _PALAVRA_DE_PACOTE.sub(" ", _normalizar_nome_insumo(base))
    return re.sub(r"\s+", " ", base).strip()


def localizar_insumo(candidatos, cadastro):
    """Insumo já cadastrado que corresponde a algum dos `candidatos` (nomes
    que ele pode ter: o que o import criaria, o da planilha...). `cadastro`
    é {nome_normalizado: insumo}. Tenta primeiro o nome exato de cada
    candidato; depois o nome sem o tamanho do pacote — mas só se um único
    insumo tiver aquela base, porque dois ("Leite condensado caixa" e
    "Leite condensado bag", digamos) é decisão humana, não regra."""
    for candidato in candidatos:
        achado = resolver(candidato, cadastro)
        if achado:
            return achado
    por_base = {}
    for insumo in cadastro.values():
        por_base.setdefault(nome_base(insumo["nome"]), []).append(insumo)
    for candidato in candidatos:
        # Se os dois nomes dizem o tamanho e ele é diferente, não é o mesmo
        # insumo: "Lata embalagem 500ml" e "Lata embalagem 300ml" têm a
        # mesma base, mas numa lata o tamanho É o produto.
        achados = [
            insumo for insumo in por_base.get(nome_base(candidato), [])
            if not (_tamanhos(candidato) and _tamanhos(insumo["nome"]) and _tamanhos(candidato) != _tamanhos(insumo["nome"]))
        ]
        if len(achados) == 1:
            return achados[0]
    return None


def _tamanhos(nome):
    """{"500ml"} de "Lata embalagem 500ml"; vazio quando o nome não diz."""
    return {t.replace(" ", "").replace(",", ".") for t in _TAMANHO_DE_PACOTE.findall(nome.lower())}


def resolver(nome, mapa_normalizado):
    """Devolve o valor de `mapa_normalizado` (indexado por nome
    normalizado) correspondente a `nome`, tentando, nesta ordem: o nome
    como veio, o nome sem o sufixo entre parênteses, e os candidatos de
    EQUIVALENCIAS. None se nenhum bater."""
    candidatos = [nome, sem_sufixo(nome)]
    candidatos += EQUIVALENCIAS.get(_normalizar_nome_insumo(nome), [])
    candidatos += EQUIVALENCIAS.get(_normalizar_nome_insumo(sem_sufixo(nome)), [])
    for candidato in candidatos:
        achado = mapa_normalizado.get(_normalizar_nome_insumo(candidato))
        if achado:
            return achado
    return None
