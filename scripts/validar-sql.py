"""Confere a SINTAXE de todos os arquivos SQL com o parser do próprio PostgreSQL (pglast).
Não aplica nada no banco — só garante que nenhum arquivo tem erro de digitação."""
import glob
import os
import sys

import pglast

raiz = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
arquivos = sorted(glob.glob(os.path.join(raiz, 'sql', '*.sql')) + glob.glob(os.path.join(raiz, 'sql-ponto-db', '*.sql')))
erros = []
for arquivo in arquivos:
    with open(arquivo, encoding='utf-8') as f:
        try:
            pglast.parse_sql(f.read())
        except Exception as e:  # noqa: BLE001
            erros.append((os.path.relpath(arquivo, raiz), str(e)[:300]))
if len(arquivos) < 10:
    erros.append(('(geral)', f'achei só {len(arquivos)} arquivos SQL — a pasta mudou de lugar?'))
for nome, erro in erros:
    print(f'✗ {nome}: {erro}')
print(f'SQL: {len(arquivos) - len([e for e in erros if e[0] != "(geral)"])} de {len(arquivos)} arquivos com sintaxe válida.')
sys.exit(1 if erros else 0)
