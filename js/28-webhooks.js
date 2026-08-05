/* =========================================================
   WEBHOOKS PÚBLICOS — integrações externas (folha, ATS, Slack)
   -----------------------------------------------------------
   Reaproveita o barramento de eventos de domínio que já existe desde a
   v0.7.0 (RNF012) — a tabela eventos_dominio já registra tudo (ciclo
   aberto, PDI aprovado, diagnóstico gerado etc.). Aqui só cadastramos
   PARA ONDE mandar esses eventos. O disparo em si acontece direto no
   banco (gatilho SQL, ver sql/18-webhooks-eventos-dominio.sql) — não
   depende do navegador de ninguém estar aberto.
   ========================================================= */
const EVENTOS_DOMINIO_DISPONIVEIS = [
  'avaliacao.encerrada', 'cargo.desenho_publicado', 'ciclo.aberto',
  'ciclo.extraordinario_agendado', 'ciclo.reaberto',
  'colaboradores.importados_em_lote', 'diagnostico.gerado',
  'lgpd.dados_anonimizados', 'pdi.aprovado', 'pdi.criado',
];

let _webhooks = [];
let _webhooksJaCarregou = false;
let _webhooksCarregando = false;
let _webhookNovoAberto = false;
let _webhookNovoNome = '';
let _webhookNovoUrl = '';
let _webhookNovoEventos = []; // vazio = todos

async function carregarWebhooks(){
  _webhooksCarregando = true; render();
  const { data, error } = await sb.from('webhooks_configurados')
    .select('id, nome, url, eventos, secreto, ativo, criado_em, ultima_chamada_em')
    .order('criado_em', { ascending:false });
  if(error) showToast('Não foi possível carregar os webhooks: ' + error.message);
  _webhooks = data || [];
  _webhooksCarregando = false;
  _webhooksJaCarregou = true;
  render();
}

async function criarWebhook(){
  if(!_webhookNovoNome.trim() || !_webhookNovoUrl.trim()){ showToast('Preencha o nome e a URL.'); return; }
  if(!/^https?:\/\//i.test(_webhookNovoUrl.trim())){ showToast('A URL precisa começar com http:// ou https://'); return; }
  const { error } = await sb.from('webhooks_configurados').insert({
    empresa_id: empresaIdAtual, nome: _webhookNovoNome.trim(), url: _webhookNovoUrl.trim(),
    eventos: _webhookNovoEventos.length ? _webhookNovoEventos : null,
    criado_por: meuPerfilId,
  });
  if(error){ showToast('Não foi possível criar o webhook: ' + error.message); return; }
  registrarAuditoria('webhook.criado', { nome: _webhookNovoNome.trim() });
  _webhookNovoAberto = false; _webhookNovoNome = ''; _webhookNovoUrl = ''; _webhookNovoEventos = [];
  showToast('Webhook cadastrado — já vai receber os próximos eventos.');
  await carregarWebhooks();
}

async function alternarAtivoWebhook(id, ativarAgora){
  const { error } = await sb.from('webhooks_configurados').update({ ativo: ativarAgora }).eq('id', id);
  if(error){ showToast('Não foi possível atualizar.'); return; }
  showToast(ativarAgora ? 'Webhook ativado.' : 'Webhook desativado.');
  await carregarWebhooks();
}

async function excluirWebhook(id, nome){
  if(!confirm(`Excluir o webhook "${nome}"? Essa ação não pode ser desfeita.`)) return;
  const { error } = await sb.from('webhooks_configurados').delete().eq('id', id);
  if(error){ showToast('Não foi possível excluir.'); return; }
  registrarAuditoria('webhook.excluido', { nome });
  showToast('Webhook excluído.');
  await carregarWebhooks();
}

function alternarEventoNovoWebhook(evento){
  const i = _webhookNovoEventos.indexOf(evento);
  if(i>=0) _webhookNovoEventos.splice(i,1); else _webhookNovoEventos.push(evento);
  render();
}

function pageWebhooks(){
  if(!_webhooksJaCarregou && !_webhooksCarregando){ carregarWebhooks(); }

  return `
    <div class="page-head">
      <div class="eyebrow">Integrações</div>
      <h1>Webhooks</h1>
      <p class="page-desc">Cadastre uma URL e receba automaticamente os eventos importantes do sistema (ciclo aberto, PDI aprovado, diagnóstico gerado etc.) — útil pra conectar com folha de pagamento, ATS, Slack ou qualquer sistema externo, sem precisar de uma integração feita sob medida.</p>
      <button class="btn btn-ghost btn-sm" onclick="carregarWebhooks()">↻ Atualizar</button>
    </div>

    <div class="card">
      <h3>Novo webhook</h3>
      ${!_webhookNovoAberto ? `<button class="btn btn-primary" onclick="_webhookNovoAberto=true; render();">+ Cadastrar webhook</button>` : `
        <div class="field"><label>Nome (rótulo interno)</label><input value="${_webhookNovoNome}" oninput="_webhookNovoNome=this.value;" placeholder="Ex: Slack do RH"></div>
        <div class="field"><label>URL</label><input id="webhook_novo_url_input" value="${_webhookNovoUrl}" oninput="_webhookNovoUrl=this.value; document.getElementById('aviso_slack_detectado').style.display = /hooks\.slack\.com/i.test(this.value) ? '' : 'none';" placeholder="https://..."></div>
        <p id="aviso_slack_detectado" class="small-muted" style="color:var(--alavancar);margin-top:-8px;display:${/hooks\.slack\.com/i.test(_webhookNovoUrl) ? '' : 'none'};">✅ URL do Slack detectada — a mensagem vai chegar formatada como texto, não como JSON bruto.</p>
        <div class="field"><label>Eventos <small>(nenhum marcado = recebe todos)</small></label>
          <div class="chip-row">
            ${EVENTOS_DOMINIO_DISPONIVEIS.map(ev=>`
              <button type="button" class="filtro-pill ${_webhookNovoEventos.includes(ev)?'active':''}" onclick="alternarEventoNovoWebhook('${ev}')">${ev}</button>
            `).join('')}
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="criarWebhook()">Cadastrar</button>
        <button class="btn btn-ghost btn-sm" onclick="_webhookNovoAberto=false; render();">Cancelar</button>
      `}
    </div>

    <div class="card">
      <h3>Webhooks cadastrados <small>${_webhooks.length}</small></h3>
      ${_webhooksCarregando ? '<div class="empty">Carregando…</div>' : (
        _webhooks.length ? _webhooks.map(w=>`
          <div style="padding:12px 0;border-top:1px solid var(--line);">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <b>${w.nome||'(sem nome)'}</b> ${w.ativo?'<span class="pill pill-alavancar">Ativo</span>':'<span class="pill pill-neutral">Inativo</span>'}
                <div class="small-muted" style="font-family:var(--mono);font-size:11px;margin-top:2px;">${w.url}</div>
              </div>
              <div style="display:flex;gap:6px;">
                <button class="btn btn-ghost btn-sm" onclick="${w.ativo?'alternarAtivoWebhook':'alternarAtivoWebhook'}('${w.id}', ${!w.ativo})">${w.ativo?'Desativar':'Ativar'}</button>
                <button class="btn btn-ghost btn-sm" style="color:var(--iniciar);" onclick="excluirWebhook('${w.id}','${(w.nome||'').replace(/'/g,"\\'")}')">Excluir</button>
              </div>
            </div>
            <div class="small-muted" style="margin-top:6px;font-size:11.5px;">
              Eventos: ${w.eventos?.length ? w.eventos.join(', ') : 'todos'} ·
              Última chamada: ${w.ultima_chamada_em ? new Date(w.ultima_chamada_em).toLocaleString('pt-BR') : 'nenhuma ainda'}
            </div>
            <div class="small-muted" style="margin-top:4px;font-size:11px;">
              Assinatura (header <code>X-NORTE-Signature</code>): <code style="font-family:var(--mono);">${w.secreto}</code>
              — use isso do outro lado pra confirmar que a chamada realmente veio do NORTE.
            </div>
          </div>
        `).join('') : '<div class="empty">Nenhum webhook cadastrado ainda.</div>'
      )}
    </div>
  `;
}
