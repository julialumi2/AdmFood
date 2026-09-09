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
