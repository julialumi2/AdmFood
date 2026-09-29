# -*- coding: utf-8 -*-
"""Roda a suíte inteira:  python tests/rodar.py

Cada teste roda num processo separado, de propósito. Dois motivos:

  - o app cria agendador e estado de módulo no import, e rodar dois
    testes no mesmo processo faria um herdar o banco e o agendador do
    outro — falha que aparece só quando a ordem muda, que é o pior tipo;
  - um teste que trava ou derruba o interpretador não leva os outros
    junto.

Sai com código 1 se qualquer teste falhar, pra servir de porta num
eventual CI.
"""
import os
import subprocess
import sys
import time

# Só ASCII nas molduras: o console do Windows roda em cp1252 e caractere
# de desenho de caixa derruba o runner com UnicodeEncodeError antes de
# rodar teste nenhum.
PASTA = os.path.dirname(os.path.abspath(__file__))
TEMPO_LIMITE_S = 180


def main():
    alvos = sys.argv[1:]
    arquivos = sorted(
        n for n in os.listdir(PASTA)
        if n.startswith("test_") and n.endswith(".py")
        and (not alvos or any(a in n for a in alvos))
    )
    if not arquivos:
        print("Nenhum teste encontrado em", PASTA)
        return 1

    print("Rodando %d teste(s)\n" % len(arquivos))
    falhados, tempos = [], []
    for nome in arquivos:
        comeco = time.time()
        print('-' * 62)
        print(nome)
        print('-' * 62)
        try:
            r = subprocess.run([sys.executable, os.path.join(PASTA, nome)],
                               timeout=TEMPO_LIMITE_S)
            codigo = r.returncode
        except subprocess.TimeoutExpired:
            print("  ESTOUROU O TEMPO (%ds)" % TEMPO_LIMITE_S)
            codigo = 1
        tempos.append((nome, time.time() - comeco))
        if codigo != 0:
            falhados.append(nome)
        print()

    print('=' * 62)
    for nome, segundos in tempos:
        marca = "FALHOU" if nome in falhados else "ok"
        print("  %-6s %-42s %5.1fs" % (marca, nome, segundos))
    print('=' * 62)
    if falhados:
        print("\n%d de %d FALHARAM: %s" % (len(falhados), len(arquivos), ", ".join(falhados)))
        return 1
    print("\nTodos os %d passaram." % len(arquivos))
    return 0


if __name__ == "__main__":
    sys.exit(main())
