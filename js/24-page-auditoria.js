/* =========================================================
   AUDITORIA — visualização do histórico de eventos (RNF003)
   -----------------------------------------------------------
   O sistema já registra dezenas de eventos importantes (login,
   desligamento, mudança de papel, aprovação de PDI etc.) numa tabela
   append-only desde o início — só faltava uma tela pra ver isso.
   ========================================================= */
const AUDITORIA_LABEL = {
  'banco_acoes.customizada_criada': 'Ação personalizada criada no Banco de Ações',
  'cargo.versao_publicada': 'Nova versão do Desenho de Cargo publicada',
  'ciclo.ausencia_registrada': 'Ausência de avaliador registrada num ciclo',
  'ciclo.pendencia_avaliador': 'Ciclo entrou em pendência de avaliador',
  'ciclo.prazo_estendido': 'Prazo de um ciclo foi estendido',
  'ciclo.reaberto': 'Ciclo reaberto formalmente',
  'ciclo.reuniao_feedback_registrada': 'Reunião de feedback registrada',
  'colaborador.acesso_sincronizado': 'Login de colaborador desligado foi desativado (correção retroativa)',
  'colaborador.anonimizado': 'Dados de colaborador anonimizados (LGPD)',
  'colaborador.desligado': 'Colaborador desligado',
  'colaborador.movimentado': 'Movimentação de colaborador (promoção, troca de setor/gestor)',
  'colaborador.religado': 'Colaborador religado à empresa',
  'colaboradores.importados_em_lote': 'Colaboradores importados em lote (planilha)',
  'configuracoes.atualizadas': 'Configurações da empresa atualizadas',
  'empresa.atualizada': 'Dados da empresa atualizados',
  'empresa.criada': 'Empresa cadastrada',
  'estrutura.criada': 'Unidade/Departamento/Setor criado',
  'estrutura.movida': 'Item da Estrutura Organizacional movido',
  'pdi.aprovado': 'PDI aprovado',
  'pdi.evidencia_validada': 'Evidência de ação do PDI validada',
  'relatorio.exportado': 'Relatório exportado',
  'usuario.login': 'Login realizado',
  'usuario.papel_alterado': 'Papel de um usuário foi alterado',
  'usuario.desativado': 'Conta de usuário desativada',
  'usuario.reativado': 'Conta de usuário reativada',
};

let _auditoriaCarregando = false;
let _auditoriaJaCarregou = false;
let _auditoriaEventos = [];
let _auditoriaFiltroEvento = '';
let _auditoriaFiltroPessoa = '';

async function carregarAuditoria(){
  _auditoriaCarregando = true; render();
  const { data, error } = await sb.from('auditoria')
    .select('id, evento, detalhes, criado_por, criado_em')
    .eq('empresa_id', empresaIdAtual)
    .order('criado_em', { ascending: false })
    .limit(500);
  if(error) showToast('Não foi possível carregar a auditoria: ' + error.message);
  _auditoriaEventos = data || [];
  _auditoriaCarregando = false;
  _auditoriaJaCarregou = true;
  render();
}

function nomePorPerfilId(perfilId){
  return _perfisEmpresa.find(p=>p.id===perfilId)?.nome || 'Alguém (conta removida)';
}

function pageAuditoria(){
  // BUG-CLASSE evitada de propósito: usa uma flag de "já carregou" em vez de
  // checar se a lista está vazia (o mesmo erro corrigido na v0.14.1 da tela
  // de Super Admin — lista vazia é uma resposta válida, não motivo pra
  // ficar recarregando pra sempre).
  if(!_auditoriaJaCarregou && !_auditoriaCarregando){
    carregarAuditoria();
  }

  const tiposDisponiveis = [...new Set(_auditoriaEventos.map(e=>e.evento))].sort();
  const pessoasDisponiveis = [...new Set(_auditoriaEventos.map(e=>e.criado_por).filter(Boolean))]
    .map(id=>({ id, nome: nomePorPerfilId(id) }))
    .sort((a,b)=>a.nome.localeCompare(b.nome));

  const eventosFiltrados = _auditoriaEventos.filter(e=>
    (!_auditoriaFiltroEvento || e.evento === _auditoriaFiltroEvento) &&
    (!_auditoriaFiltroPessoa || e.criado_por === _auditoriaFiltroPessoa)
  );

  return `
    <div class="page-head">
      <div class="eyebrow">Governança · RNF003</div>
      <h1>Auditoria</h1>
      <p class="page-desc">Histórico completo de eventos importantes do sistema — quem fez o quê e quando. Registro append-only: nada aqui pode ser editado ou apagado, nem pelo Administrador.</p>
      <button class="btn btn-ghost btn-sm" onclick="carregarAuditoria()">↻ Atualizar</button>
    </div>

    <div class="card">
      <div class="grid2">
        <div class="field"><label>Filtrar por tipo de evento</label>
          <select onchange="_auditoriaFiltroEvento=this.value; render();">
            <option value="">Todos</option>
            ${tiposDisponiveis.map(t=>`<option value="${t}" ${_auditoriaFiltroEvento===t?'selected':''}>${AUDITORIA_LABEL[t]||t}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Filtrar por pessoa</label>
          <select onchange="_auditoriaFiltroPessoa=this.value; render();">
            <option value="">Todas</option>
            ${pessoasDisponiveis.map(p=>`<option value="${p.id}" ${_auditoriaFiltroPessoa===p.id?'selected':''}>${p.nome}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>Eventos <small>${eventosFiltrados.length} de ${_auditoriaEventos.length} (últimos 500 registros)</small></h3>
      ${_auditoriaCarregando ? '<div class="empty">Carregando…</div>' : (
        eventosFiltrados.length ? `
          <table><thead><tr><th>Quando</th><th>Evento</th><th>Quem fez</th><th>Detalhes</th></tr></thead><tbody>
            ${eventosFiltrados.map(e=>`
              <tr>
                <td class="small-muted" style="white-space:nowrap;">${new Date(e.criado_em).toLocaleString('pt-BR')}</td>
                <td><b>${AUDITORIA_LABEL[e.evento]||e.evento}</b><br><span class="small-muted" style="font-family:var(--mono);font-size:10.5px;">${e.evento}</span></td>
                <td>${e.criado_por ? nomePorPerfilId(e.criado_por) : '<span class="small-muted">Sistema</span>'}</td>
                <td class="small-muted" style="max-width:280px;font-family:var(--mono);font-size:11px;word-break:break-all;">${e.detalhes && Object.keys(e.detalhes).length ? JSON.stringify(e.detalhes) : '—'}</td>
              </tr>
            `).join('')}
          </tbody></table>
        ` : '<div class="empty">Nenhum evento encontrado com esse filtro.</div>'
      )}
    </div>
  `;
}
