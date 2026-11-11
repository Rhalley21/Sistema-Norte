#!/usr/bin/env python3
"""
Gera o SQL (sem aspas, para colar no Supabase) que cadastra os links de pagamento de cada plano.

Uso:
  python3 scripts/gerar-sql-links.py essencial:primeira=https://... gestao:primeira=https://... estrategico:primeira=https://...

Cada argumento e plano:tipo=link. Planos: essencial, gestao, estrategico. Tipos: primeira (o primeiro pagamento: mensalidade mais
implantacao) e mensalidade.

TRAVA DE SEGURANCA: os links do InfinitePay trazem o valor no fim do endereco (por exemplo ...-297,00). O script LE esse valor e
RECUSA o link se ele nao for exatamente o valor esperado para aquele plano e tipo. Assim nao entra, por engano, um link de 297 no
lugar do primeiro pagamento de 887 (o cliente pagaria menos e a implantacao nunca seria cobrada).
"""
import re
import sys

# valores esperados, em centavos (sem fidelidade): mensalidade; primeiro pagamento = mensalidade + implantacao
ESPERADO = {
    ('essencial', 'mensalidade'): 29700, ('essencial', 'primeira'): 29700 + 59000,
    ('gestao', 'mensalidade'): 59700, ('gestao', 'primeira'): 59700 + 99000,
    ('estrategico', 'mensalidade'): 99700, ('estrategico', 'primeira'): 99700 + 149000,
}

def reais(c):
    s = f"{c // 100:,}".replace(',', '.')
    return f"R$ {s},{c % 100:02d}"

def valor_do_link(url):
    """O valor escrito no fim do endereco (-297,00 ou -1.587,00 ou -1587,00), em centavos; None se nao houver."""
    m = re.search(r'-(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$', url)
    if not m:
        return None
    return int(m.group(1).replace('.', '')) * 100 + int(m.group(2))

def validar(plano, tipo, url):
    if (plano, tipo) not in ESPERADO:
        return f'plano/tipo invalido: {plano}:{tipo} (planos: essencial, gestao, estrategico; tipos: primeira, mensalidade)'
    if not re.match(r'^https://[^\s$"\']+$', url):
        return f'{plano}:{tipo}: o link precisa comecar com https:// e nao ter espaco, aspas nem cifrao'
    v = valor_do_link(url)
    esperado = ESPERADO[(plano, tipo)]
    if v is None:
        return f'{plano}:{tipo}: nao achei o valor no fim do link (esperava terminar em -{reais(esperado).replace("R$ ", "")}). Confira o link.'
    if v != esperado:
        return f'{plano}:{tipo}: o link cobra {reais(v)}, mas o esperado e {reais(esperado)}. Nao vou cadastrar.'
    return None

def gerar(args):
    itens, erros, vistos = [], [], set()
    for a in args:
        if '=' not in a or ':' not in a.split('=', 1)[0]:
            erros.append(f'argumento fora do formato plano:tipo=link: {a}')
            continue
        chave, url = a.split('=', 1)
        plano, tipo = chave.split(':', 1)
        if (plano, tipo) in vistos:
            erros.append(f'{plano}:{tipo} aparece duas vezes')
            continue
        vistos.add((plano, tipo))
        e = validar(plano, tipo, url.strip())
        if e:
            erros.append(e)
        else:
            itens.append((plano, tipo, url.strip()))
    if not itens and not erros:
        erros.append('nenhum link informado')
    if erros:
        return None, erros
    linhas = ',\n'.join(f'  ($${p}$$, $${t}$$, $${u}$$)' for p, t, u in itens)
    sql = ('-- Links de pagamento (gerado por scripts/gerar-sql-links.py). Seguro rodar de novo: troca o link do mesmo plano e tipo.\n'
           'insert into links_pagamento (plano, tipo, url) values\n' + linhas + '\n'
           'on conflict (plano, tipo) do update set url = excluded.url, atualizado_em = now();\n')
    return sql, []

if __name__ == '__main__':
    sql, erros = gerar(sys.argv[1:])
    if erros:
        for e in erros:
            print('ERRO:', e, file=sys.stderr)
        sys.exit(1)
    sys.stdout.write(sql)
