#!/usr/bin/env python3
# =========================================================================
# Matriz de segurança do banco: lê TODOS os arquivos sql/ em ordem, refaz o que cada um cria ou remove (políticas de
# segurança por linha, permissões de tabela) e mostra, por tabela, quem pode fazer o quê pela API.
#   python3 scripts/matriz-rls.py            -> imprime a matriz em Markdown (é o que vai para docs/MATRIZ-RLS.md)
#   python3 scripts/matriz-rls.py --check    -> sai com erro se existir política de ESCRITA sem controle de papel que
#                                               não esteja na lista de exceções conhecidas (EXCECOES abaixo)
# Existe para que uma migração futura não reabra, sem querer, as brechas corrigidas no sql/45.
# =========================================================================
import glob, json, re, sys
import pglast
from pglast import ast
from pglast.enums import AlterTableType, ObjectType
from pglast.stream import RawStream

RAIZ_SQL = 'sql/'
# Políticas de escrita que NÃO olham o papel de propósito (cada uma com o motivo). Qualquer outra faz o --check falhar.
EXCECOES = {
    ('auditoria', 'insert'): 'a trilha de auditoria é só de inclusão (ninguém edita nem apaga); qualquer pessoa da empresa registra um evento',
    ('eventos_dominio', 'insert'): 'registro de eventos do sistema, só de inclusão',
    ('chamados_suporte', 'insert'): 'qualquer pessoa da empresa pode abrir um chamado de suporte',
    ('notificacoes', 'insert'): 'qualquer pessoa da empresa pode notificar outra da mesma empresa',
    ('notificacoes', 'update'): 'cada pessoa marca como lida só as próprias notificações (perfil_id = auth.uid())',
    ('notificacoes', 'delete'): 'cada pessoa apaga só as próprias notificações (perfil_id = auth.uid())',
    ('solicitacoes_contratacao', 'insert'): 'formulário público de contratação (visitante sem login)',
    ('solicitacoes_teste', 'insert'): 'formulário público de teste grátis (visitante sem login)',
    ('perfis', 'update'): 'cada pessoa edita o próprio perfil; as colunas protegidas (papel, empresa, desativado...) são guardadas pelo gatilho trg_perfis_proteger_colunas (sql/45)',
    ('empresas', 'update'): 'a regra deixa a empresa editar o próprio cadastro; as colunas de plano, suspensão e pagamento são guardadas pelo gatilho trg_empresas_proteger_colunas (sql/45)',
}
TEM_PAPEL = re.compile(r'meu_papel|\bpapel\b|sou_super_admin|super_admin|auth\.role|service_role', re.I)

def numero(f): return int(re.match(r'(\d+)-', f.split('/')[-1]).group(1))
def texto(no):
    try: return RawStream()(no) if no is not None else ''
    except Exception: return '?'
def nomes(objs): return [[p.sval for p in o] for o in objs]

politicas, rls, sem_api = {}, {}, set()
for f in sorted(glob.glob(RAIZ_SQL + '*.sql'), key=lambda f: (numero(f), f)):  # desempate pelo nome: a ordem nunca depende do disco
    for s in pglast.parse_sql(open(f, encoding='utf-8').read()):
        st = s.stmt
        if isinstance(st, ast.CreatePolicyStmt):
            politicas[(st.table.relname, st.policy_name)] = dict(arquivo=f.split('/')[-1], cmd=st.cmd_name, qual=texto(st.qual), check=texto(st.with_check))
        elif isinstance(st, ast.DropStmt) and st.removeType == ObjectType.OBJECT_POLICY:
            for partes in nomes(st.objects): politicas.pop((partes[-2], partes[-1]), None)
        elif isinstance(st, ast.DropStmt) and st.removeType == ObjectType.OBJECT_TABLE:
            # tabela apagada (drop table): sai da matriz junto com as regras, o RLS e as permissões revogadas dela
            for partes in nomes(st.objects):
                t = partes[-1]
                for chave in [k for k in politicas if k[0] == t]: politicas.pop(chave)
                rls.pop(t, None)
                sem_api.discard(t)
        elif isinstance(st, ast.DoStmt):
            # bloco que remove políticas em laço: "for r in select policyname from pg_policies where tablename = 'X' [and policyname like 'P%']"
            corpo = ' '.join(a.arg.sval for a in st.args if getattr(a, 'defname', '') == 'as' and hasattr(a.arg, 'sval'))
            for m in re.finditer(r"tablename = '(\w+)'(?:\s+and policyname like '([^']*)')?", corpo):
                tabela, padrao = m.group(1), m.group(2)
                for (t, n) in list(politicas):
                    if t == tabela and (padrao is None or re.fullmatch(re.escape(padrao).replace('%', '.*').replace(r'\%', '.*'), n)): politicas.pop((t, n))
        elif isinstance(st, ast.AlterTableStmt):
            for c in st.cmds:
                if c.subtype == AlterTableType.AT_EnableRowSecurity: rls[st.relation.relname] = True
                if c.subtype == AlterTableType.AT_DisableRowSecurity: rls[st.relation.relname] = False
        elif isinstance(st, ast.GrantStmt) and not st.is_grant and st.objtype == ObjectType.OBJECT_TABLE:
            quem = {g.rolename for g in (st.grantees or []) if hasattr(g, 'rolename')}
            if 'authenticated' in quem and not st.privileges:  # "revoke all"
                for r in st.objects: sem_api.add(r.relname)

def olha_papel(p): return bool(TEM_PAPEL.search(p['qual'] + ' ' + p['check']))
def escreve(p): return p['cmd'] in ('all', 'insert', 'update', 'delete', '*')
CMD = {'all': 'tudo', '*': 'tudo', 'select': 'ler', 'insert': 'criar', 'update': 'alterar', 'delete': 'apagar'}

tabelas = sorted({t for t, _ in politicas} | set(rls) | sem_api)
perigosas = []
for (t, n), p in sorted(politicas.items()):
    if t in sem_api: continue
    if escreve(p) and not olha_papel(p) and (t, p['cmd'] if p['cmd'] != 'all' else 'all') not in EXCECOES: perigosas.append((t, n, p['cmd'], p['arquivo']))
    # "tudo" também precisa de exceção explícita por comando
if '--json' in sys.argv:
    print(json.dumps({t: sorted(n for (tt, n) in politicas if tt == t) for t in tabelas}, ensure_ascii=False))
    sys.exit(0)
if '--check' in sys.argv:
    if perigosas:
        print('Política de ESCRITA sem controle de papel e fora da lista de exceções (scripts/matriz-rls.py):')
        for t, n, c, a in perigosas: print(f'  {t}: "{n}" ({c}) em {a}')
        print('\nSe for intencional, acrescente a exceção em EXCECOES com o motivo; senão, exija o papel na política.')
        sys.exit(1)
    print(f'matriz de segurança ok: {len(tabelas)} tabelas, {len(politicas)} políticas, nenhuma escrita sem controle de papel fora das exceções.')
    sys.exit(0)

L = ['# Matriz de segurança do banco', '', 'Gerada por `python3 scripts/matriz-rls.py` a partir de todos os arquivos `sql/`. **Não edite à mão**: um teste confere que este arquivo está igual ao gerado.', '',
     'Legenda: **papel** = a regra olha o papel de quem acessa (Administrador, RH, líder, colaborador ou super admin); **só empresa** = vale para qualquer pessoa da empresa; **só servidor** = nenhuma permissão para a API (só as Edge Functions, que usam a chave de serviço).', '',
     '| Tabela | Acesso direto pela API | Regras (comando: política → controle) |', '|---|---|---|']
for t in tabelas:
    if t in sem_api: L.append(f'| `{t}` | **só servidor** | todas as permissões da API foram revogadas |'); continue
    regras = []
    for (tt, n), p in sorted(politicas.items()):
        if tt != t: continue
        controle = 'papel' if olha_papel(p) else 'só empresa/dono'
        exc = ' (exceção documentada)' if escreve(p) and not olha_papel(p) and (t, p['cmd']) in EXCECOES else ''
        regras.append(f"{CMD.get(p['cmd'], p['cmd'])}: `{n}` → {controle}{exc}")
    L.append(f"| `{t}` | {'RLS ligado' if rls.get(t) else '**RLS DESLIGADO**'} | " + '<br>'.join(regras or ['(nenhuma política: ninguém acessa)']) + ' |')
L += ['', '## Exceções documentadas (escrita sem olhar o papel)', '']
for (t, c), motivo in sorted(EXCECOES.items()): L.append(f'- `{t}` ({c}): {motivo}.')
print('\n'.join(L))
