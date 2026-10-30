# Matriz de segurança do banco

Gerada por `python3 scripts/matriz-rls.py` a partir de todos os arquivos `sql/`. **Não edite à mão**: um teste confere que este arquivo está igual ao gerado.

Legenda: **papel** = a regra olha o papel de quem acessa (Administrador, RH, líder, colaborador ou super admin); **só empresa** = vale para qualquer pessoa da empresa; **só servidor** = nenhuma permissão para a API (só as Edge Functions, que usam a chave de serviço).

| Tabela | Acesso direto pela API | Regras (comando: política → controle) |
|---|---|---|
| `auditoria` | RLS ligado | ler: `auditoria - consulta por empresa` → só empresa/dono<br>criar: `auditoria - insercao por empresa` → só empresa/dono (exceção documentada) |
| `avaliacoes` | **só servidor** | todas as permissões da API foram revogadas |
| `banco_acoes` | **só servidor** | todas as permissões da API foram revogadas |
| `cargos` | **só servidor** | todas as permissões da API foram revogadas |
| `chamados_suporte` | RLS ligado | ler: `empresa ve os proprios chamados` → só empresa/dono<br>alterar: `super admin atualiza qualquer chamado` → papel<br>ler: `super admin ve todos os chamados` → papel<br>criar: `usuario cria chamado para a propria empresa` → só empresa/dono (exceção documentada) |
| `codigos_licenca_empresa` | RLS ligado | tudo: `so super admin mexe em codigos de licenca` → papel |
| `colaboradores` | **só servidor** | todas as permissões da API foram revogadas |
| `convites` | RLS ligado | apagar: `convites_apaga` → papel<br>alterar: `convites_atualiza` → papel<br>criar: `convites_cria` → papel<br>ler: `convites_le` → papel |
| `culturas` | **só servidor** | todas as permissões da API foram revogadas |
| `dados_sistema` | RLS ligado | ler: `dados_sistema_le` → só empresa/dono<br>ler: `super admin le dados_sistema de todas as empresas` → papel |
| `empresa_ponto_seguranca` | RLS ligado | (nenhuma política: ninguém acessa) |
| `empresas` | RLS ligado | alterar: `edita a propria empresa` → só empresa/dono (exceção documentada)<br>alterar: `super admin atualiza qualquer empresa` → papel<br>ler: `super admin ve todas as empresas` → papel<br>ler: `ve a propria empresa` → só empresa/dono |
| `eventos_dominio` | RLS ligado | ler: `eventos_dominio - consulta por empresa` → só empresa/dono<br>criar: `eventos_dominio - insercao por empresa` → só empresa/dono (exceção documentada) |
| `folhas_ponto_papel` | RLS ligado | apagar: `gestor apaga so rascunho de folha de ponto em papel` → papel<br>criar: `gestor cria folhas de ponto em papel da empresa` → papel<br>alterar: `gestor edita folhas de ponto em papel da empresa` → papel<br>ler: `gestor ve folhas de ponto em papel da empresa` → papel |
| `notificacoes` | RLS ligado | apagar: `cada um apaga suas proprias notificacoes` → só empresa/dono (exceção documentada)<br>alterar: `cada um marca como lida suas proprias notificacoes` → só empresa/dono (exceção documentada)<br>ler: `cada um ve suas proprias notificacoes` → só empresa/dono<br>criar: `qualquer um da empresa cria notificacao pra empresa` → só empresa/dono (exceção documentada) |
| `nr1_campanhas` | RLS ligado | (nenhuma política: ninguém acessa) |
| `nr1_consentimentos` | RLS ligado | (nenhuma política: ninguém acessa) |
| `nr1_participantes` | RLS ligado | (nenhuma política: ninguém acessa) |
| `nr1_respostas` | RLS ligado | (nenhuma política: ninguém acessa) |
| `nr1_visualizacoes` | RLS ligado | (nenhuma política: ninguém acessa) |
| `perfis` | RLS ligado | alterar: `dono ou rh administram perfis da empresa` → papel<br>ler: `perfis_le_o_proprio` → só empresa/dono<br>alterar: `usuario edita o proprio perfil` → só empresa/dono (exceção documentada)<br>ler: `ve perfis da mesma empresa` → só empresa/dono |
| `rate_limit_log` | RLS ligado | (nenhuma política: ninguém acessa) |
| `rs_banco_talentos` | RLS ligado | (nenhuma política: ninguém acessa) |
| `rs_candidaturas_publicas` | RLS ligado | (nenhuma política: ninguém acessa) |
| `rs_entregas` | **só servidor** | todas as permissões da API foram revogadas |
| `rs_vagas_publicas` | RLS ligado | (nenhuma política: ninguém acessa) |
| `rs_videos` | **só servidor** | todas as permissões da API foram revogadas |
| `seguranca_log` | **só servidor** | todas as permissões da API foram revogadas |
| `solicitacoes_contratacao` | RLS ligado | criar: `qualquer um cria solicitacao de contratacao` → só empresa/dono (exceção documentada)<br>alterar: `super admin atualiza solicitacoes de contratacao` → papel<br>ler: `super admin le solicitacoes de contratacao` → papel |
| `solicitacoes_teste` | RLS ligado | criar: `qualquer um cria solicitacao de teste` → só empresa/dono (exceção documentada)<br>alterar: `super admin atualiza solicitacoes` → papel<br>ler: `super admin le solicitacoes` → papel |
| `super_admins` | RLS ligado | ler: `so super admin ve super admins` → papel |
| `webhooks_configurados` | RLS ligado | tudo: `dono/rh gerencia webhooks da propria empresa` → papel |

## Exceções documentadas (escrita sem olhar o papel)

- `auditoria` (insert): a trilha de auditoria é só de inclusão (ninguém edita nem apaga); qualquer pessoa da empresa registra um evento.
- `chamados_suporte` (insert): qualquer pessoa da empresa pode abrir um chamado de suporte.
- `empresas` (update): a regra deixa a empresa editar o próprio cadastro; as colunas de plano, suspensão e pagamento são guardadas pelo gatilho trg_empresas_proteger_colunas (sql/45).
- `eventos_dominio` (insert): registro de eventos do sistema, só de inclusão.
- `notificacoes` (delete): cada pessoa apaga só as próprias notificações (perfil_id = auth.uid()).
- `notificacoes` (insert): qualquer pessoa da empresa pode notificar outra da mesma empresa.
- `notificacoes` (update): cada pessoa marca como lida só as próprias notificações (perfil_id = auth.uid()).
- `perfis` (update): cada pessoa edita o próprio perfil; as colunas protegidas (papel, empresa, desativado...) são guardadas pelo gatilho trg_perfis_proteger_colunas (sql/45).
- `solicitacoes_contratacao` (insert): formulário público de contratação (visitante sem login).
- `solicitacoes_teste` (insert): formulário público de teste grátis (visitante sem login).
