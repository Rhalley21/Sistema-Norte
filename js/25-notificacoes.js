/* =========================================================
   NOTIFICAÇÕES IN-APP (sino de alertas)
   -----------------------------------------------------------
   Complementar ao e-mail (v0.15.2/v0.15.3) — mesmo evento, dois canais.
   Diferente dos cartões de "pendências" dos dashboards (calculados na
   hora, sempre a partir do estado atual), isso é um histórico de verdade:
   fica guardado, pode ser marcado como lido, e chega em tempo real via
   Realtime, igual ao "aviso de atualização" (v0.16.0).
   ========================================================= */
let _notificacoes = [];
let _notificacoesPainelAberto = false;
let _canalRealtimeNotificacoes = null;

async function criarNotificacaoInApp(perfilId, tipo, titulo, mensagem, rota){
  if(!perfilId) return;
  try{
    await sb.from('notificacoes').insert({
      empresa_id: empresaIdAtual, perfil_id: perfilId, tipo, titulo, mensagem, rota,
    });
  }catch(e){ console.error('Falha ao criar notificação in-app:', e); }
}

async function carregarNotificacoes(){
  const { data } = await sb.from('notificacoes')
    .select('id, tipo, titulo, mensagem, rota, lida, criado_em')
    .eq('perfil_id', meuPerfilId)
    .order('criado_em', { ascending:false })
    .limit(50);
  _notificacoes = data || [];
}

function assinarNotificacoesAoVivo(){
  if(_canalRealtimeNotificacoes || !meuPerfilId) return;
  _canalRealtimeNotificacoes = sb
    .channel(`notificacoes_${meuPerfilId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `perfil_id=eq.${meuPerfilId}`,
    }, (payload) => {
      _notificacoes = [payload.new, ..._notificacoes];
      render();
    })
    .subscribe();
}

function contarNaoLidas(){ return _notificacoes.filter(n=>!n.lida).length; }

function alternarPainelNotificacoes(){
  _notificacoesPainelAberto = !_notificacoesPainelAberto;
  render();
}

async function abrirNotificacao(id, rota){
  const n = _notificacoes.find(x=>x.id===id);
  if(n && !n.lida){
    n.lida = true; // otimista — atualiza a tela antes da confirmação do servidor
    sb.from('notificacoes').update({ lida: true }).eq('id', id);
  }
  _notificacoesPainelAberto = false;
  if(rota){ goto(rota); } else { render(); }
}

async function marcarTodasComoLidas(){
  _notificacoes.forEach(n=>n.lida=true);
  render();
  await sb.from('notificacoes').update({ lida: true }).eq('perfil_id', meuPerfilId).eq('lida', false);
}

function renderSinoNotificacoes(){
  const naoLidas = contarNaoLidas();
  return `
    <div style="position:relative;">
      <button class="btn btn-ghost btn-sm" onclick="alternarPainelNotificacoes()" style="position:relative;" title="Notificações">
        🔔${naoLidas ? `<span style="position:absolute;top:-4px;right:-4px;background:var(--iniciar);color:#fff;border-radius:10px;font-size:10px;padding:1px 5px;font-weight:700;">${naoLidas>9?'9+':naoLidas}</span>` : ''}
      </button>
      ${_notificacoesPainelAberto ? `
        <div style="position:absolute;top:38px;right:0;width:320px;max-height:400px;overflow-y:auto;background:var(--surface);border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.4);z-index:1000;">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line);">
            <b style="font-size:13px;">Notificações</b>
            ${naoLidas ? `<button class="btn btn-ghost btn-sm" onclick="marcarTodasComoLidas()" style="font-size:11px;">Marcar todas como lidas</button>` : ''}
          </div>
          ${_notificacoes.length ? _notificacoes.map(n=>`
            <div onclick="abrirNotificacao('${n.id}', ${n.rota?`'${n.rota}'`:'null'})" style="padding:10px 14px;border-bottom:1px solid var(--line);cursor:pointer;${n.lida?'opacity:.55;':''}background:${n.lida?'transparent':'var(--gold-soft)'};">
              <div style="font-size:12.5px;font-weight:${n.lida?'400':'700'};">${n.titulo}</div>
              ${n.mensagem?`<div class="small-muted" style="font-size:11.5px;margin-top:2px;">${n.mensagem}</div>`:''}
              <div class="small-muted" style="font-size:10px;margin-top:4px;">${new Date(n.criado_em).toLocaleString('pt-BR')}</div>
            </div>
          `).join('') : '<div class="small-muted" style="padding:20px 14px;text-align:center;">Nenhuma notificação ainda.</div>'}
        </div>
      ` : ''}
    </div>`;
}
