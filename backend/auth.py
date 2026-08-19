"""
Funções de senha pro login da equipe. Usa werkzeug.security (já vem junto
com o Flask, sem dependência nova) — PBKDF2 com salt aleatório por senha.
"""

from werkzeug.security import generate_password_hash, check_password_hash


def gerar_hash_senha(senha):
    return generate_password_hash(senha)


def senha_confere(senha, senha_hash):
    return check_password_hash(senha_hash, senha)
