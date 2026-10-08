"""Compara TODA tabela e coluna usada no código (js/, Edge Functions, vaga.html, index.html)
com o que os arquivos SQL realmente definem. Pega erro de digitação que só estouraria em produção.
Roda a partir da raiz do projeto: python scripts/verificar-esquema.py"""
import os
import sys

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import re, glob, collections

# ---------- 1) schema a partir dos SQL ----------
schema = collections.defaultdict(set)
def le(f): return open(f, encoding='utf-8').read()
sqls = sorted(glob.glob('sql/*.sql')) + sorted(glob.glob('sql-ponto-db/*.sql'))
RESERV = {'primary','unique','check','foreign','constraint','references','create','like'}
for f in sqls:
    s = re.sub(r'--[^\n]*', '', le(f))
    for m in re.finditer(r'create table (?:if not exists )?(?:public\.)?(\w+)\s*\((.*?)\n\)\s*;', s, re.S|re.I):
        tab, corpo = m.group(1), m.group(2)
        depth = 0; linha = ''
        for ch in corpo + '\n':
            if ch == '(': depth += 1
            if ch == ')': depth -= 1
            if ch == ',' and depth == 0:
                partes = linha.strip().split()
                if partes and partes[0].lower() not in RESERV: schema[tab].add(partes[0].strip('"'))
                linha = ''
            else: linha += ch
        partes = linha.strip().split()
        if partes and partes[0].lower() not in RESERV: schema[tab].add(partes[0].strip('"'))
    for m in re.finditer(r'alter table (?:if exists )?(?:public\.)?(\w+)\s+(.*?);', s, re.S|re.I):
        for c in re.findall(r'add column (?:if not exists )?(\w+)', m.group(2), re.I):
            schema[m.group(1)].add(c)
# tabelas internas do Supabase que o código toca
schema['auth.users'] = set()

# ---------- 2) uso no código ----------
arquivos = sorted(glob.glob('js/*.js')) + sorted(glob.glob('supabase/functions/*/index.ts')) + ['vaga.html','index.html']
problemas = collections.defaultdict(set)
tabelas_desconhecidas = collections.defaultdict(set)
def chaves_objeto(txt):
    # chaves de 1º nível de um literal { a: 1, b, c: {..} }
    out, depth, buf, i = [], 0, '', 0
    for ch in txt:
        if ch in '{[(': depth += 1
        if ch in '}])': depth -= 1
        if depth == 1 and ch == ',': out.append(buf); buf = ''
        elif depth >= 1: buf += ch
    out.append(buf)
    ks = []
    for p in out:
        p = p.strip().lstrip('{').strip()
        m = re.match(r"['\"]?(\w+)['\"]?\s*(?::|$|,)", p)
        if m and not p.startswith('...'): ks.append(m.group(1))
    return ks
for f in arquivos:
    src = le(f)
    for m in re.finditer(r"\.from\(\s*['\"](\w+)['\"]\s*\)", src):
        tab = m.group(1)
        trecho = src[m.end(): m.end()+900]
        fim = re.search(r"\.from\(|;\s*\n|\n\s*\n", trecho)
        trecho = trecho[:fim.start()] if fim else trecho
        if tab not in schema:
            tabelas_desconhecidas[tab].add(f); continue
        cols = schema[tab]
        for sel in re.findall(r"\.select\(\s*['\"`]([^'\"`]*)['\"`]", trecho):
            if sel.strip() == '*': continue
            sel = re.sub(r'\([^)]*\)', '', sel)  # relações embutidas
            for c in sel.split(','):
                c = c.strip().split(':')[-1].strip()
                if c and c != '*' and re.match(r'^\w+$', c) and c not in cols: problemas[(tab, f)].add(('select', c))
        for c in re.findall(r"\.(?:eq|neq|gt|gte|lt|lte|in|is|like|ilike|contains|order|not|or)\(\s*['\"](\w+)['\"]", trecho):
            if c not in cols: problemas[(tab, f)].add(('filtro', c))
        for op in ('insert','update','upsert'):
            mm = re.search(r"\." + op + r"\(\s*(\{)", trecho)
            if mm:
                ini = mm.start(1); depth = 0
                for j in range(ini, len(trecho)):
                    if trecho[j] == '{': depth += 1
                    if trecho[j] == '}':
                        depth -= 1
                        if depth == 0: break
                for k in chaves_objeto(trecho[ini:j+1]):
                    if k not in cols: problemas[(tab, f)].add((op, k))
print("Tabelas no schema:", len(schema))
print("\n== Tabelas usadas no código mas NÃO definidas no SQL ==")
for t, fs in sorted(tabelas_desconhecidas.items()): print(" ", t, "<-", sorted(fs))
print("\n== Colunas usadas no código e NÃO definidas no SQL (revisar) ==")
for (tab, f), cs in sorted(problemas.items()):
    print(f"  {tab}  [{f}]: {sorted(cs)}")

if len(schema) < 20:
    print(f"ERRO: li só {len(schema)} tabelas dos SQL — o parser do esquema quebrou?")
    sys.exit(1)
sys.exit(1 if (tabelas_desconhecidas or problemas) else 0)
