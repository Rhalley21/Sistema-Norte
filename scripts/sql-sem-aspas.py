#!/usr/bin/env python3
# Gera a versão SEM ASPAS de um arquivo sql/ para colar no SQL Editor do Supabase sem o risco de o chat ou o editor trocarem as
# aspas retas por curvas. Cada texto entre aspas simples vira um texto entre cifrões duplos ($$texto$$); os comentários saem.
#   python3 scripts/sql-sem-aspas.py sql/45-seguranca-papeis.sql > 45-seguranca-papeis-sem-aspas.sql
# Falha (código 1) se o arquivo tiver algo que a conversão não consegue fazer sem aspas (por exemplo, nome de política entre aspas
# duplas): nesse caso, o arquivo original deve usar nomes sem aspas.
import re, sys
import pglast

def converter(texto):
    sem_comentarios = '\n'.join(l for l in texto.split('\n') if not l.strip().startswith('--'))
    if '"' in sem_comentarios:
        raise SystemExit('o arquivo usa aspas duplas (nome entre aspas): use nomes sem aspas nele')
    def troca(m):
        if '$' in m.group(1): raise SystemExit('texto com cifrão dentro: não dá para converter')
        return '$$' + m.group(1) + '$$'
    novo = re.sub(r"'([^']*)'", troca, sem_comentarios).strip() + '\n'
    if any(c in novo for c in "'\"\u2018\u2019\u201c\u201d"): raise SystemExit('sobrou aspa depois da conversão')
    pglast.parse_sql(novo)
    volta = re.sub(r"\$\$([^$]*)\$\$", lambda m: "'" + m.group(1) + "'", novo)
    norm = lambda t: re.sub(r"\s+", ' ', t).strip()
    if norm(volta) != norm(sem_comentarios): raise SystemExit('a versão sem aspas NÃO é equivalente ao original')
    return novo

if __name__ == '__main__':
    sys.stdout.write(converter(open(sys.argv[1], encoding='utf-8').read()))
