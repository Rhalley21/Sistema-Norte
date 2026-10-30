/* =========================================================
   R&S — ETAPAS DO PROCESSO SELETIVO
   -----------------------------------------------------------
   O funil de candidatos segue as etapas abaixo, na ordem. Cada VAGA escolhe quais etapas usa
   (por padrão, todas): uma vaga operacional pode dispensar a prova prática, uma de liderança
   pode usar tudo. "Nova candidatura", "Proposta" e "Aprovado" valem para toda vaga.

   tipo:     'registro'  -> o RH registra o resultado (feito fora do sistema ou por uma pessoa)
             'entrevista'-> usa o scorecard de entrevista
             'video'     -> vídeo de apresentação do candidato
   interna:  true -> etapa de verificação interna: o candidato NÃO recebe e-mail ao entrar nela.

   As etapas 1 e 2 do processo (perfil da vaga e divulgação) são da VAGA, não do candidato: já
   existem na requisição de vaga e na página pública de candidatura.

   O começo do arquivo são funções PURAS (sem tela), testadas.
   ========================================================= */

const ETAPAS_RS = [
  { id: 'nova', nome: 'Nova candidatura', fixa: true },
  { id: 'triagem', nome: 'Triagem dos currículos' },
  { id: 'disc_galt', nome: 'Teste DISC e GALT', tipo: 'registro' },
  { id: 'video', nome: 'Vídeo de apresentação', tipo: 'video' },
  { id: 'redes_sociais', nome: 'Verificação nas redes sociais', tipo: 'registro', interna: true },
  { id: 'checagem_curriculo', nome: 'Checagem de informações do currículo', tipo: 'registro', interna: true },
  { id: 'entrevista_fit', nome: 'Entrevista de fit cultural', tipo: 'entrevista' },
  { id: 'teste_logico', nome: 'Teste lógico', tipo: 'registro' },
  { id: 'prova_teorica', nome: 'Prova teórica', tipo: 'registro' },
  { id: 'prova_pratica', nome: 'Prova prática', tipo: 'registro' },
  { id: 'entrevista_final', nome: 'Entrevista final', tipo: 'entrevista' },
  { id: 'escolha', nome: 'Escolha do candidato' },
  { id: 'proposta', nome: 'Proposta', fixa: true },
  { id: 'aprovado', nome: 'Aprovado', fixa: true },
];

// Etapas do funil ANTIGO (8 etapas) -> etapa equivalente no novo. Candidatos que já estavam em uma etapa antiga
// são movidos sozinhos (com uma linha no histórico), sem perder nada.
const ETAPAS_LEGADAS_RS = {
  contato_inicial: 'triagem',
  avaliacao: 'disc_galt',
  entrevista: 'entrevista_fit',
  finalista: 'escolha',
};
const NOMES_ETAPAS_LEGADAS_RS = {
  contato_inicial: 'Contato inicial',
  avaliacao: 'Avaliação',
  entrevista: 'Entrevista',
  finalista: 'Finalista',
  reprovado: 'Reprovado',
};

function etapaNomeRS(id) {
  return ETAPAS_RS.find((e) => e.id === id)?.nome || NOMES_ETAPAS_LEGADAS_RS[id] || id;
}

// As etapas que se pode ligar/desligar por vaga (todas menos as fixas).
function etapasOpcionaisRS() {
  return ETAPAS_RS.filter((e) => !e.fixa);
}

// Só ids válidos e opcionais, na ordem do processo, sem repetir — o que vier da tela nunca é confiável.
function etapasMarcadasRS(ids) {
  const pedidos = new Set(Array.isArray(ids) ? ids.map(String) : []);
  return etapasOpcionaisRS()
    .map((e) => e.id)
    .filter((id) => pedidos.has(id));
}

// Etapas que a vaga usa: as fixas + as marcadas. Vaga sem escolha registrada (as antigas) usa todas.
function etapasAtivasDaVagaRS(vaga) {
  const marcadas = vaga && Array.isArray(vaga.etapasAtivas) ? new Set(vaga.etapasAtivas) : null;
  return ETAPAS_RS.filter((e) => e.fixa || !marcadas || marcadas.has(e.id));
}

// Opções do seletor de etapa de um candidato: as da vaga + a etapa em que ele já está (mesmo que a vaga tenha
// desligado essa etapa depois), pra o seletor nunca mostrar uma etapa que não existe.
function etapasParaSelecaoRS(vaga, candidato) {
  const ativas = etapasAtivasDaVagaRS(vaga);
  if (candidato && !ativas.some((e) => e.id === candidato.etapa)) {
    const atual = ETAPAS_RS.find((e) => e.id === candidato.etapa) || {
      id: candidato.etapa,
      nome: etapaNomeRS(candidato.etapa),
    };
    return ETAPAS_RS.filter((e) => e.fixa || e.id === atual.id || ativas.some((a) => a.id === e.id));
  }
  return ativas;
}

// Move candidatos que estão numa etapa do funil antigo para a equivalente. Devolve quantos moveu. Pode rodar quantas vezes
// quiser: quem já está numa etapa nova não é tocado.
function migrarEtapasLegadasRS(candidatos, autorId) {
  let movidos = 0;
  for (const c of candidatos || []) {
    const nova = ETAPAS_LEGADAS_RS[c.etapa];
    if (!nova) continue;
    const antiga = c.etapa;
    c.etapa = nova;
    if (!Array.isArray(c.historico)) c.historico = [];
    c.historico.push({
      de: antiga,
      para: nova,
      autorId: autorId || null,
      em: new Date().toISOString(),
      observacao: 'Etapa atualizada automaticamente (novo processo seletivo)',
    });
    movidos++;
  }
  return movidos;
}

/* ---------- Escolha das etapas na tela ---------- */

function etapasCheckboxesHtml(marcadas, classe) {
  const ativas = marcadas ? new Set(marcadas) : null; // sem escolha = todas ligadas
  return `<div style="display:flex;flex-direction:column;gap:4px;">
    ${etapasOpcionaisRS()
      .map(
        (e) =>
          `<label style="display:flex;align-items:center;gap:8px;font-size:13px;"><input type="checkbox" class="${classe}" value="${e.id}" ${!ativas || ativas.has(e.id) ? 'checked' : ''}> ${escaparHtml(e.nome)}${e.interna ? ' <span class="small-muted">(interna — o candidato não recebe e-mail)</span>' : ''}</label>`
      )
      .join('')}
  </div>`;
}

function etapasVagaEditorHtml(vaga) {
  const outras = (state.rs.requisicoes || []).filter((r) => r.id !== vaga.id);
  const nomeDe = (r) => state.cargos?.find((c) => c.id === r.cargoId)?.nome || r.codigo;
  return `<details style="margin-bottom:12px;">
    <summary style="cursor:pointer;font-weight:600;font-size:13px;">Etapas do processo desta vaga</summary>
    <div style="padding:10px 0;">
      <p class="small-muted" style="margin:0 0 8px;">"Nova candidatura", "Proposta" e "Aprovado" valem para toda vaga. Marque as demais etapas que esta vaga usa.</p>
      ${etapasCheckboxesHtml(vaga.etapasAtivas, 'rs-etapa-vaga')}
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px;">
        <button class="btn btn-sm btn-primary" onclick="salvarEtapasVagaRS('${escaparParaOnclick(vaga.id)}')">Salvar etapas</button>
        ${
          outras.length
            ? `<select aria-label="Copiar as etapas de outra vaga" id="rs_etapas_copiar_${escaparHtml(vaga.id)}" style="max-width:220px;"><option value="">Copiar de outra vaga…</option>${outras.map((r) => `<option value="${escaparHtml(r.id)}">${escaparHtml(nomeDe(r))} (${escaparHtml(r.codigo)})</option>`).join('')}</select>
               <button class="btn btn-sm btn-ghost" onclick="copiarEtapasVagaRS('${escaparParaOnclick(vaga.id)}')">Copiar</button>`
            : ''
        }
      </div>
    </div>
  </details>`;
}

function salvarEtapasVagaRS(vagaId) {
  const vaga = state.rs.requisicoes.find((r) => r.id === vagaId);
  if (!vaga) return;
  const marcadas = [...document.querySelectorAll('.rs-etapa-vaga:checked')].map((el) => el.value);
  vaga.etapasAtivas = etapasMarcadasRS(marcadas);
  showToast('Etapas da vaga salvas.');
  render();
}

function copiarEtapasVagaRS(vagaId) {
  const vaga = state.rs.requisicoes.find((r) => r.id === vagaId);
  const origemId = document.getElementById(`rs_etapas_copiar_${vagaId}`)?.value;
  const origem = state.rs.requisicoes.find((r) => r.id === origemId);
  if (!vaga || !origem) return showToast('Escolha de qual vaga copiar as etapas.');
  vaga.etapasAtivas = etapasMarcadasRS(etapasAtivasDaVagaRS(origem).map((e) => e.id));
  showToast('Etapas copiadas.');
  render();
}

/* ---------- Orientações e links de cada etapa ----------
   A empresa cola, por etapa, as orientações e até 3 links (testes feitos em sites externos, endereço da
   entrevista...). Isso vai no e-mail que o candidato recebe ao entrar na etapa. Os links NÃO ficam no código:
   cada empresa escolhe os seus. Só endereços https:// são aceitos.

   Cada VAGA pode ter as suas orientações, que têm prioridade sobre as da empresa. E a PROVA PRÁTICA só existe
   por vaga: o que se pede a um vendedor não é o que se pede a um analista financeiro. Ela tem enunciado, prazo
   de entrega, links e critérios de avaliação (os critérios são só do RH — não vão no e-mail do candidato). */
const CONFIG_ETAPA_LIMITES = {
  instrucoes: 500,
  instrucoesPorEtapa: { prova_pratica: 2000 },
  links: 3,
  rotulo: 60,
  url: 300,
  prazoDiasMax: 30,
  criterios: 6,
  criterioDescricao: 120,
  criterioPesoMax: 10,
};
// Etapas cujo conteúdo depende da vaga: não existe versão "geral" da empresa — cada vaga define a sua.
const ETAPAS_SO_POR_VAGA_RS = ['prova_pratica'];

// Etapas em que o candidato DEVOLVE um resultado pelo sistema (botão "Enviar meu resultado" no e-mail da etapa).
const ETAPAS_COM_ENTREGA_RS = ['disc_galt', 'teste_logico', 'prova_teorica', 'prova_pratica'];

// Etapas cujo e-mail só serve se tiver LINK ou instrução da empresa (o candidato precisa saber onde fazer).
const ETAPAS_QUE_PRECISAM_ORIENTACAO_RS = ['disc_galt', 'teste_logico', 'prova_teorica'];

// Etapas que mandam e-mail ao candidato e, portanto, podem ter orientações (as internas e as fixas não).
function etapasConfiguraveisRS() {
  return ETAPAS_RS.filter((e) => !e.fixa && !e.interna);
}
// As que têm texto geral da empresa (todas, menos as que só existem por vaga).
function etapasConfiguraveisEmpresaRS() {
  return etapasConfiguraveisRS().filter((e) => !ETAPAS_SO_POR_VAGA_RS.includes(e.id));
}

// Só https://, sem espaço, aspas ou sinais de HTML, sem "usuario@" no endereço (truque de golpe) — devolve '' se não serve.
function urlSegura(url) {
  const t = String(url ?? '').trim();
  if (!t || t.length > CONFIG_ETAPA_LIMITES.url || /[\s"'<>`\\]/.test(t)) return '';
  try {
    const u = new URL(t);
    if (u.protocol !== 'https:' || !u.hostname.includes('.') || u.username || u.password) return '';
    return u.href;
  } catch (e) {
    return '';
  }
}

function criteriosSanitizados(lista) {
  const L = CONFIG_ETAPA_LIMITES;
  return (Array.isArray(lista) ? lista : [])
    .map((c) => ({
      descricao: String(c?.descricao ?? '')
        .split('\u0000')
        .join('')
        .trim()
        .slice(0, L.criterioDescricao),
      peso: Number(c?.peso),
    }))
    .filter((c) => c.descricao)
    .map((c) => ({
      descricao: c.descricao,
      peso: Number.isInteger(c.peso) && c.peso >= 1 && c.peso <= L.criterioPesoMax ? c.peso : 1,
    }))
    .slice(0, L.criterios);
}
function prazoDiasSanitizado(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= CONFIG_ETAPA_LIMITES.prazoDiasMax ? n : null;
}

// A prova prática (e só ela) também tem prazo de entrega e critérios de avaliação.
function configEtapaSanitizada(entrada, etapaId) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const limite = CONFIG_ETAPA_LIMITES.instrucoesPorEtapa[etapaId] || CONFIG_ETAPA_LIMITES.instrucoes;
  const instrucoes = String(e.instrucoes ?? '')
    .split('\u0000')
    .join('')
    .trim()
    .slice(0, limite);
  const links = (Array.isArray(e.links) ? e.links : [])
    .map((l) => ({
      rotulo: String(l?.rotulo ?? '')
        .trim()
        .slice(0, CONFIG_ETAPA_LIMITES.rotulo),
      url: urlSegura(l?.url),
    }))
    .filter((l) => l.url)
    .map((l) => ({ rotulo: l.rotulo || l.url, url: l.url }))
    .slice(0, CONFIG_ETAPA_LIMITES.links);
  const base = { instrucoes, links };
  if (etapaId === 'prova_pratica') {
    base.prazoDias = prazoDiasSanitizado(e.prazoDias);
    base.criterios = criteriosSanitizados(e.criterios);
  }
  return base;
}
function temOrientacoesEtapaRS(cfg, etapaId) {
  const c = configEtapaSanitizada(cfg, etapaId);
  return !!(c.instrucoes || c.links.length);
}
function configTemConteudoRS(c) {
  return !!(c.instrucoes || c.links.length || c.prazoDias || (c.criterios || []).length);
}

// O que vale pra esta vaga nesta etapa: as orientações da própria vaga, ou (se não tiver) as da empresa.
// A prova prática NUNCA cai no texto geral: ou a vaga definiu a sua, ou ela está pendente.
function configEfetivaEtapaRS(vaga, etapaId) {
  const daVaga = configEtapaSanitizada(vaga?.etapasConfig?.[etapaId], etapaId);
  if (temOrientacoesEtapaRS(daVaga, etapaId)) return { ...daVaga, origem: 'vaga' };
  if (ETAPAS_SO_POR_VAGA_RS.includes(etapaId)) return { ...daVaga, origem: 'nenhuma' };
  const geral = configEtapaSanitizada(state.rs?.configEtapas?.[etapaId], etapaId);
  return { ...geral, origem: temOrientacoesEtapaRS(geral, etapaId) ? 'empresa' : 'nenhuma' };
}

// A vaga já definiu a prova prática (tem enunciado)? 'nao_usa' | 'pendente' | 'definida'
function provaPraticaDefinidaRS(vaga) {
  return !!configEtapaSanitizada(vaga?.etapasConfig?.prova_pratica, 'prova_pratica').instrucoes;
}
function situacaoProvaPraticaRS(vaga) {
  if (!etapasAtivasDaVagaRS(vaga).some((e) => e.id === 'prova_pratica')) return 'nao_usa';
  return provaPraticaDefinidaRS(vaga) ? 'definida' : 'pendente';
}

// "dd/mm/aaaa" de daqui a N dias (calendário local).
function prazoEntregaTexto(prazoDias, hoje = new Date()) {
  if (!prazoDias) return '';
  return new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + prazoDias).toLocaleDateString('pt-BR');
}

// O trecho que vai no FIM do e-mail da etapa (vazio se a etapa não tem nada). Tudo escapado. Os critérios de avaliação
// da prova prática NÃO entram: são do RH.
function blocoConfigEtapaHtml(cfg, etapaId, hoje) {
  const c = configEtapaSanitizada(cfg, etapaId);
  const partes = [];
  const titulo = etapaId === 'prova_pratica' ? 'Prova prática' : 'Orientações';
  if (c.instrucoes) partes.push(`<p><b>${titulo}:</b><br>${escaparHtml(c.instrucoes).replace(/\n/g, '<br>')}</p>`);
  if (c.prazoDias)
    partes.push(
      `<p><b>Prazo de entrega:</b> até ${prazoEntregaTexto(c.prazoDias, hoje)} (${c.prazoDias} dia${c.prazoDias === 1 ? '' : 's'}).</p>`
    );
  if (c.links.length) {
    partes.push(
      `<ul>${c.links.map((l) => `<li><a href="${escaparHtml(l.url)}">${escaparHtml(l.rotulo)}</a></li>`).join('')}</ul><p style="font-size:12px;color:#666;">Os links acima levam a sites externos, que têm a própria política de privacidade.</p>`
    );
  }
  return partes.join('');
}

/* ---------- Formulário de uma etapa (usado na empresa e na vaga) ---------- */
function etapaConfigCamposHtml(prefixo, etapa, cfg, referenciaHtml = '', previaHtml = '') {
  const c = configEtapaSanitizada(cfg, etapa.id);
  const e = escaparHtml;
  const pp = etapa.id === 'prova_pratica';
  const id = (sufixo) => e(`${prefixo}${etapa.id}_${sufixo}`);
  const L = CONFIG_ETAPA_LIMITES;
  const limite = L.instrucoesPorEtapa[etapa.id] || L.instrucoes;
  const preenchida = configTemConteudoRS(c);
  const linha = (i) => {
    const l = c.links[i] || { rotulo: '', url: '' };
    return `<div style="display:flex;gap:8px;margin:4px 0;flex-wrap:wrap;"><input id="${id(`l${i}_r`)}" type="text" maxlength="${L.rotulo}" placeholder="Nome do link (ex.: Teste DISC)" value="${e(l.rotulo === l.url ? '' : l.rotulo)}" style="flex:1;min-width:150px;"><input id="${id(`l${i}_u`)}" type="text" maxlength="${L.url}" placeholder="https://..." value="${e(l.url)}" style="flex:2;min-width:220px;"></div>`;
  };
  const criterio = (i) => {
    const k = (c.criterios || [])[i] || { descricao: '', peso: '' };
    return `<div style="display:flex;gap:8px;margin:4px 0;"><input id="${id(`c${i}_d`)}" type="text" maxlength="${L.criterioDescricao}" placeholder="Critério (ex.: Organização e clareza da entrega)" value="${e(k.descricao)}" style="flex:1;"><input id="${id(`c${i}_p`)}" type="number" min="1" max="${L.criterioPesoMax}" placeholder="Peso" value="${e(k.peso)}" style="width:80px;"></div>`;
  };
  return `<details style="margin-bottom:8px;" ${preenchida ? 'open' : ''}>
    <summary style="cursor:pointer;font-weight:600;font-size:13px;">${e(etapa.nome)} ${preenchida ? '<span class="pill pill-alavancar">configurada</span>' : ''}</summary>
    <div style="padding:8px 0;">
      ${referenciaHtml}
      ${pp ? '<p class="small-muted" style="margin:0 0 6px;">Descreva a tarefa que o candidato deve fazer (coerente com as atividades desta vaga) e como ele deve entregar o resultado.</p>' : ''}
      <textarea id="${id('ins')}" maxlength="${limite}" placeholder="${pp ? 'Enunciado da prova prática: a tarefa, o que entregar e como entregar' : 'Orientações ao candidato (opcional)'}" style="width:100%;min-height:${pp ? 110 : 60}px;">${e(c.instrucoes)}</textarea>
      ${pp ? `<div class="field" style="margin:8px 0;"><label>Prazo de entrega (dias, de 1 a ${L.prazoDiasMax})</label><input id="${id('prazo')}" type="number" min="1" max="${L.prazoDiasMax}" value="${e(c.prazoDias || '')}" style="width:120px;"></div>` : ''}
      ${[0, 1, 2].map(linha).join('')}
      ${pp ? `<h4 style="font-size:13px;margin:10px 0 4px;">Critérios de avaliação <small class="small-muted">(só para você — não vão no e-mail do candidato)</small></h4>${Array.from({ length: L.criterios }, (_, i) => criterio(i)).join('')}` : ''}
      <details style="margin-top:8px;"><summary class="small-muted" style="cursor:pointer;font-size:12.5px;">Ver o e-mail que o candidato recebe</summary><div style="border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-top:6px;background:var(--surface-2);font-size:13px;">${previaHtml}</div></details>
    </div></details>`;
}

// Lê os campos de uma etapa da tela (valores brutos — quem chama sanitiza).
function lerConfigEtapaDosCampos(prefixo, etapa) {
  const val = (sufixo) => document.getElementById(`${prefixo}${etapa.id}_${sufixo}`)?.value ?? '';
  const bruto = {
    instrucoes: val('ins'),
    links: [0, 1, 2].map((i) => ({ rotulo: val(`l${i}_r`), url: val(`l${i}_u`) })),
  };
  if (etapa.id === 'prova_pratica') {
    bruto.prazoDias = val('prazo');
    bruto.criterios = Array.from({ length: CONFIG_ETAPA_LIMITES.criterios }, (_, i) => ({
      descricao: val(`c${i}_d`),
      peso: val(`c${i}_p`),
    }));
  }
  return bruto;
}
function linksDescartadosRS(bruto) {
  return bruto.links.filter((l) => String(l.url).trim() && !urlSegura(l.url)).length;
}

/* ---------- Tela do Processo seletivo: orientações da EMPRESA ---------- */

function rsConfigEtapasPainelHtml() {
  const cfgs = (state.rs && state.rs.configEtapas) || {};
  return `<div>
    <p class="small-muted" style="margin:0 0 10px;">Para cada etapa, escreva as orientações e cole até ${CONFIG_ETAPA_LIMITES.links} links (por exemplo, onde fazer o teste DISC). Isso vai no e-mail do candidato quando ele entra na etapa. Só aceita endereços que começam com <b>https://</b>. Testes feitos em sites externos têm a política de privacidade do próprio site: confira antes de indicar. Cada vaga pode ter orientações próprias, que valem no lugar destas.</p>
    <p class="small-muted" style="margin:0 0 10px;">A <b>prova prática</b> não tem texto geral: ela é <b>criada em cada vaga</b> (em R&S, na vaga, em "Orientações e prova prática desta vaga").</p>
    ${etapasConfiguraveisEmpresaRS()
      .map((et) =>
        etapaConfigCamposHtml(
          'rsce_',
          et,
          cfgs[et.id],
          '',
          previaEmailEtapaRS(et.id, '', configEtapaSanitizada(cfgs[et.id], et.id))
        )
      )
      .join('')}
    <button class="btn btn-sm btn-primary" onclick="salvarConfigEtapasRS()">Salvar orientações</button>
  </div>`;
}

function salvarConfigEtapasRS() {
  if (!state.rs.configEtapas) state.rs.configEtapas = {};
  let descartados = 0;
  for (const e of etapasConfiguraveisEmpresaRS()) {
    const bruto = lerConfigEtapaDosCampos('rsce_', e);
    descartados += linksDescartadosRS(bruto);
    const c = configEtapaSanitizada(bruto, e.id);
    if (configTemConteudoRS(c)) state.rs.configEtapas[e.id] = c;
    else delete state.rs.configEtapas[e.id];
  }
  showToast(
    descartados
      ? `Orientações salvas. ${descartados} link(s) foram ignorados: use endereços que começam com https://`
      : 'Orientações das etapas salvas.'
  );
  render();
}

/* ---------- Orientações e prova prática DA VAGA (no funil da vaga, em R&S) ---------- */
let _rsOrientacoesVagaAberta = null; // id da vaga com o painel aberto (pra não fechar sozinho ao salvar)

// "Referência desta vaga": as responsabilidades do cargo e as habilidades desejadas, pra criar uma prova coerente com ela.
function referenciaDaVagaHtml(vaga) {
  const nomeDe = (r) => (typeof r === 'string' ? r : r?.descricao || r?.texto || r?.nome || '');
  const resp = (vaga.responsabilidadesHerdadas || []).map(nomeDe).filter(Boolean).slice(0, 8);
  const hard = String(vaga.perfilDesejado?.hardSkills || '').trim();
  if (!resp.length && !hard) return '';
  return `<div class="notice info" style="margin-bottom:8px;font-size:12.5px;"><b>Referência desta vaga</b> (para criar uma prova coerente com ela):${resp.length ? `<br>Responsabilidades: ${resp.map(escaparHtml).join(' · ')}` : ''}${hard ? `<br>Habilidades técnicas desejadas: ${escaparHtml(hard)}` : ''}</div>`;
}

function etapasVagaOrientacoesHtml(vaga) {
  const usadas = etapasAtivasDaVagaRS(vaga).filter((e) => etapasConfiguraveisRS().some((x) => x.id === e.id));
  if (!usadas.length) return '';
  const pendente = situacaoProvaPraticaRS(vaga) === 'pendente';
  return `<details ${_rsOrientacoesVagaAberta === vaga.id || pendente ? 'open' : ''} style="margin-bottom:12px;">
    <summary style="cursor:pointer;font-weight:600;font-size:13px;">Orientações e prova prática desta vaga ${pendente ? '<span class="pill pill-desenvolver">prova prática ainda não definida</span>' : ''}</summary>
    <div style="padding:10px 0;">
      <p class="small-muted" style="margin:0 0 8px;">As orientações desta vaga valem no lugar das da empresa (R&S — Processo seletivo). A <b>prova prática</b> só existe por vaga: crie a desta aqui.</p>
      ${usadas.map((et) => etapaConfigCamposHtml(`rsve_${vaga.id}_`, et, vaga.etapasConfig?.[et.id], et.id === 'prova_pratica' ? referenciaDaVagaHtml(vaga) : '', previaEmailEtapaRS(et.id, state.cargos.find((c) => c.id === vaga.cargoId)?.nome || vaga.codigo, configEfetivaEtapaRS(vaga, et.id)))).join('')}
      <button class="btn btn-sm btn-primary" onclick="salvarConfigEtapasVagaRS('${escaparParaOnclick(vaga.id)}')">Salvar orientações da vaga</button>
    </div></details>`;
}

function salvarConfigEtapasVagaRS(vagaId) {
  const vaga = state.rs.requisicoes.find((r) => r.id === vagaId);
  if (!vaga) return;
  if (!vaga.etapasConfig) vaga.etapasConfig = {};
  const usadas = etapasAtivasDaVagaRS(vaga).filter((e) => etapasConfiguraveisRS().some((x) => x.id === e.id));
  let descartados = 0;
  for (const e of usadas) {
    const bruto = lerConfigEtapaDosCampos(`rsve_${vagaId}_`, e);
    descartados += linksDescartadosRS(bruto);
    const c = configEtapaSanitizada(bruto, e.id);
    if (configTemConteudoRS(c)) vaga.etapasConfig[e.id] = c;
    else delete vaga.etapasConfig[e.id]; // etapas que a vaga não usa não aparecem na tela: o que já estava guardado fica como está
  }
  _rsOrientacoesVagaAberta = vagaId;
  showToast(
    descartados
      ? `Orientações da vaga salvas. ${descartados} link(s) foram ignorados: use endereços que começam com https://`
      : 'Orientações da vaga salvas.'
  );
  render();
}

/* ---------- Modelos de processo e "próxima etapa" ---------- */

// Modelos prontos: em vez de marcar as 11 etapas uma a uma, a vaga começa de um modelo e ajusta só se precisar.
const MODELOS_PROCESSO_RS = {
  completo: { nome: 'Completo', descricao: 'Todas as etapas.', etapas: null },
  enxuto: {
    nome: 'Enxuto',
    descricao: 'Triagem, entrevista de fit, prova prática, entrevista final e escolha.',
    etapas: ['triagem', 'entrevista_fit', 'prova_pratica', 'entrevista_final', 'escolha'],
  },
  operacional: {
    nome: 'Operacional',
    descricao: 'Triagem, checagem do currículo, entrevista de fit e escolha.',
    etapas: ['triagem', 'checagem_curriculo', 'entrevista_fit', 'escolha'],
  },
};

// As etapas opcionais de um modelo (o desconhecido vira "completo").
function etapasDoModeloRS(modeloId) {
  const modelo = MODELOS_PROCESSO_RS[modeloId] || MODELOS_PROCESSO_RS.completo;
  return modelo.etapas ? etapasMarcadasRS(modelo.etapas) : etapasOpcionaisRS().map((e) => e.id);
}

// Marca na tela as etapas do modelo escolhido (o RH ainda pode ajustar uma a uma).
function aplicarModeloProcessoRS(modeloId) {
  const ids = new Set(etapasDoModeloRS(modeloId));
  document.querySelectorAll('.rs-req-etapa').forEach((el) => {
    el.checked = ids.has(el.value);
  });
}

function modeloProcessoSelectHtml() {
  return `<div class="field"><label>Modelo de processo</label>
    <select id="rs_req_modelo" onchange="aplicarModeloProcessoRS(this.value)">${Object.entries(MODELOS_PROCESSO_RS)
      .map(([id, m]) => `<option value="${id}">${escaparHtml(m.nome)} — ${escaparHtml(m.descricao)}</option>`)
      .join('')}</select></div>`;
}

// A próxima etapa DESTA vaga depois da etapa atual (as que a vaga desligou são puladas). Null no fim do processo.
function proximaEtapaDaVagaRS(vaga, etapaId) {
  const ordem = ETAPAS_RS.map((e) => e.id);
  const atual = ordem.indexOf(etapaId);
  if (atual < 0) return null;
  return etapasAtivasDaVagaRS(vaga).find((e) => ordem.indexOf(e.id) > atual) || null;
}
