/* =========================================================
   R&S — RECRUTAMENTO (cadastro de pessoas)
   -----------------------------------------------------------
   O Recrutamento é o FICHÁRIO: guarda os dados de cada pessoa (nome, contato, origem, currículo) e mostra
   em que situação ela está. Quem trabalha uma vaga (etapas, avaliações, vídeo, prova prática) usa a tela
   "R&S — Processo seletivo". Daqui a pessoa é LEVADA para o processo seletivo de uma vaga.

   - Cada pessoa aparece UMA vez, mesmo que tenha se candidatado a várias vagas (os registros de cada vaga
     são juntados pelo e-mail ou, na falta dele, pelo telefone) — com todos os processos dela.
   - Quem se candidata pelo link da vaga entra direto no processo daquela vaga e também aparece aqui.
   - Banco de talentos: só entra quem marcou a autorização no formulário da vaga (isso é automático);
     aqui a pessoa só mostra se já está lá.
   - Só Administrador e RH acessam (são dados pessoais).

   O começo do arquivo são funções PURAS (sem tela), testadas.
   ========================================================= */

const SITUACOES_PESSOA_RS = {
  todas: 'Todas',
  cadastrada: 'Só cadastradas',
  em_processo: 'Em processo seletivo',
  reprovada: 'Reprovadas / desistiram',
  contratada: 'Contratadas',
};

function textoSemAcentoRS(t) {
  return String(t == null ? '' : t)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
function emailNormalizadoRS(e) {
  return String(e || '')
    .trim()
    .toLowerCase();
}
function telefoneSoDigitosRS(t) {
  return String(t || '').replace(/\D/g, '');
}
// Quem é "a mesma pessoa": mesmo e-mail; sem e-mail, mesmo telefone (com pelo menos 8 dígitos); senão, o próprio registro.
function chaveDaPessoaRS(c) {
  const e = emailNormalizadoRS(c.email);
  if (e) return `e:${e}`;
  const t = telefoneSoDigitosRS(c.telefone);
  if (t.length >= 8) return `t:${t}`;
  return `i:${c.id}`;
}

// Situação de UM registro: só cadastrada (sem vaga), em processo, reprovada/desistiu ou contratada.
function situacaoDoRegistroRS(c) {
  if (c.convertidoEm) return 'contratada';
  if (!c.vagaId) return 'cadastrada';
  if (c.reprovado) return 'reprovada';
  return 'em_processo';
}

// Junta os registros (um por vaga) em PESSOAS: cada uma aparece uma vez, com todos os processos dela.
function agruparPessoasRS(candidatos) {
  const grupos = new Map();
  for (const c of candidatos || []) {
    const chave = chaveDaPessoaRS(c);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(c);
  }
  const pessoas = [];
  for (const [chave, registros] of grupos) {
    registros.sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));
    const principal = registros[0]; // o mais recente: de onde vêm os dados de contato
    const processos = registros.filter((r) => r.vagaId);
    const situacoes = registros.map(situacaoDoRegistroRS);
    const situacao = situacoes.includes('em_processo')
      ? 'em_processo'
      : situacoes.includes('contratada')
        ? 'contratada'
        : processos.length
          ? 'reprovada'
          : 'cadastrada';
    pessoas.push({ chave, principal, registros, processos, situacao });
  }
  return pessoas.sort((a, b) => String(a.principal.nome).localeCompare(String(b.principal.nome), 'pt-BR'));
}

// Busca por nome, e-mail, telefone ou origem (todas as palavras precisam aparecer) + filtro de situação.
function filtrarPessoasRS(pessoas, filtro) {
  const palavras = textoSemAcentoRS(filtro && filtro.busca)
    .split(/\s+/)
    .filter(Boolean);
  const situacao = (filtro && filtro.situacao) || 'todas';
  return pessoas.filter((p) => {
    if (situacao !== 'todas' && p.situacao !== situacao) return false;
    const p0 = p.principal;
    const texto = textoSemAcentoRS(`${p0.nome} ${p0.email} ${p0.telefone} ${p0.origem}`);
    return palavras.every((w) => texto.includes(w));
  });
}

// Vagas para onde dá pra levar alguém: aprovadas e ainda não encerradas.
function vagasParaLevarRS(requisicoes) {
  return (requisicoes || []).filter((r) => r.status === 'aprovada' && !r.encerrada);
}

// Dá pra levar esta pessoa para um processo? (Não, se já está em um ou se já foi contratada.)
function podeLevarPessoaRS(pessoa, vagaId) {
  if (pessoa.situacao === 'em_processo')
    return {
      ok: false,
      motivo:
        'Esta pessoa já está em um processo seletivo. Conclua ou reprove no processo antes de levá-la para outra vaga.',
    };
  if (pessoa.situacao === 'contratada') return { ok: false, motivo: 'Esta pessoa já foi contratada.' };
  if (vagaId && pessoa.processos.some((r) => r.vagaId === vagaId))
    return {
      ok: false,
      motivo: 'Esta pessoa já esteve nesta vaga. Para reabrir, use "Reabrir" no processo seletivo da vaga.',
    };
  return { ok: true };
}

// A pessoa está no banco de talentos? (O banco é preenchido sozinho quando a pessoa marca a autorização no formulário.)
function pessoaNoBancoRS(pessoa, talentos) {
  const e = emailNormalizadoRS(pessoa.principal.email);
  return !!e && (talentos || []).some((t) => emailNormalizadoRS(t.email) === e);
}

// Texto curto de cada processo da pessoa ("Vaga REQ-001 (Vendedor) — Vídeo de apresentação").
function descricaoDoProcessoRS(registro, requisicoes, cargos) {
  const vaga = (requisicoes || []).find((r) => r.id === registro.vagaId);
  const cargo = vaga && (cargos || []).find((c) => c.id === vaga.cargoId);
  const nomeVaga = vaga ? `${vaga.codigo}${cargo ? ` (${cargo.nome})` : ''}` : 'vaga removida';
  const sit = situacaoDoRegistroRS(registro);
  const etapa =
    sit === 'contratada'
      ? 'Contratado(a)'
      : sit === 'reprovada'
        ? 'Reprovado(a) / desistiu'
        : etapaNomeRS(registro.etapa);
  return { vagaId: registro.vagaId, texto: `Vaga ${nomeVaga} — ${etapa}`, situacao: sit };
}

// ---------- estado da tela ----------
let _rsCadastroFiltro = { busca: '', situacao: 'todas' };
let _rsPessoaFormAberto = false;
let _rsPessoaEditando = null; // id do registro principal da pessoa que está sendo editada
let _rsPessoaDadosAbertos = null; // id do registro principal com os dados expandidos

function pessoaPorIdRS(id) {
  return agruparPessoasRS(state.rs.candidatos).find((p) => p.principal.id === id) || null;
}

// ---------- ações ----------
function abrirNovaPessoaRS() {
  _rsPessoaFormAberto = !_rsPessoaFormAberto;
  render();
}

function criarPessoaRS() {
  const v = (id) => (document.getElementById(id)?.value ?? '').trim();
  const nome = v('rs_pes_nome');
  const email = v('rs_pes_email');
  const telefone = v('rs_pes_telefone');
  if (!nome) return showToast('Informe o nome da pessoa.');
  if (email && !/^[^\s@<>,;"']+@[^\s@<>,;"']+\.[^\s@<>,;"']{2,}$/.test(email))
    return showToast('O e-mail parece inválido.');
  // Duplicidade em TODO o cadastro (e-mail ou telefone): avisa, não impede.
  const chaveNova = chaveDaPessoaRS({ id: '', email, telefone });
  const existente = agruparPessoasRS(state.rs.candidatos).find(
    (p) => p.chave === chaveNova && !chaveNova.startsWith('i:')
  );
  if (
    existente &&
    !confirm(`Já existe uma pessoa com esse contato no cadastro (${existente.principal.nome}). Cadastrar mesmo assim?`)
  )
    return;
  state.rs.candidatos.push({
    id: uid(),
    vagaId: null,
    nome,
    email,
    telefone,
    origem: v('rs_pes_origem') || 'Cadastro manual',
    curriculo: v('rs_pes_curriculo'),
    etapa: null,
    reprovado: false,
    historico: [
      {
        de: null,
        para: null,
        autorId: meuPerfilId,
        em: new Date().toISOString(),
        observacao: 'Pessoa cadastrada no Recrutamento',
      },
    ],
    ...novoCarimbo(),
  });
  _rsPessoaFormAberto = false;
  showToast('Pessoa cadastrada.');
  render();
}

function abrirEditarPessoaRS(id) {
  _rsPessoaEditando = _rsPessoaEditando === id ? null : id;
  render();
}

// Os dados de contato valem para a pessoa toda: o que muda aqui muda em todos os registros dela.
function salvarPessoaRS(id) {
  const pessoa = pessoaPorIdRS(id);
  if (!pessoa) return;
  const v = (campo) => (document.getElementById(`rs_ed_${campo}`)?.value ?? '').trim();
  const nome = v('nome');
  const email = v('email');
  if (!nome) return showToast('Informe o nome da pessoa.');
  if (email && !/^[^\s@<>,;"']+@[^\s@<>,;"']+\.[^\s@<>,;"']{2,}$/.test(email))
    return showToast('O e-mail parece inválido.');
  for (const r of pessoa.registros) {
    r.nome = nome;
    r.email = email;
    r.telefone = v('telefone');
    r.origem = v('origem') || r.origem;
    r.curriculo = v('curriculo');
  }
  _rsPessoaEditando = null;
  showToast('Dados atualizados.');
  render();
}

// Apaga a pessoa inteira (todos os registros). Pedido de exclusão do candidato (LGPD) cai aqui.
function removerPessoaRS(id) {
  const pessoa = pessoaPorIdRS(id);
  if (!pessoa) return;
  const comVideo =
    typeof videoDoCandidatoRS === 'function' &&
    pessoa.registros.some((r) => (videoDoCandidatoRS(r.id) || {}).status === 'enviado');
  if (comVideo)
    return showToast(
      'Esta pessoa tem um vídeo enviado. Exclua o vídeo antes, no painel do candidato em R&S — Processo seletivo.'
    );
  const comResultado =
    typeof entregasDoCandidatoRS === 'function' &&
    pessoa.registros.some((r) => entregasDoCandidatoRS(r.id).some((x) => x.status === 'enviado'));
  if (comResultado)
    return showToast(
      'Esta pessoa enviou resultados (arquivos). Exclua os resultados antes, na ficha do candidato em R&S — Processo seletivo.'
    );
  const aviso =
    pessoa.situacao === 'em_processo' ? '\n\nATENÇÃO: ela está em um processo seletivo, que também será apagado.' : '';
  if (
    !confirm(
      `Excluir ${pessoa.principal.nome} do cadastro? Todos os dados e o histórico dela são apagados e isso não pode ser desfeito.${aviso}`
    )
  )
    return;
  const ids = new Set(pessoa.registros.map((r) => r.id));
  state.rs.candidatos = state.rs.candidatos.filter((c) => !ids.has(c.id));
  if (typeof registrarAuditoria === 'function') registrarAuditoria('rs.pessoa_excluida', { pessoaId: id });
  showToast('Pessoa excluída.');
  render();
}

// Leva a pessoa para o processo seletivo de uma vaga. Se ela era só cadastrada, o mesmo registro entra na vaga;
// se já passou por outro processo, cria um registro NOVO (o histórico do processo anterior fica intacto).
function levarPessoaParaVagaRS(id) {
  const pessoa = pessoaPorIdRS(id);
  const vagaId = document.getElementById(`rs_levar_${id}`)?.value;
  if (!pessoa) return;
  if (!vagaId) return showToast('Escolha a vaga para onde levar a pessoa.');
  const vaga = state.rs.requisicoes.find((r) => r.id === vagaId);
  if (!vaga || !vagasParaLevarRS([vaga]).length)
    return showToast('Esta vaga não está disponível (precisa estar aprovada e aberta).');
  const pode = podeLevarPessoaRS(pessoa, vagaId);
  if (!pode.ok) return showToast(pode.motivo);
  const agora = new Date().toISOString();
  const evento = {
    de: null,
    para: 'nova',
    autorId: meuPerfilId,
    em: agora,
    observacao: `Levada do Recrutamento para a vaga ${vaga.codigo}`,
  };
  let registro = pessoa.registros.find((r) => !r.vagaId);
  if (registro) {
    registro.vagaId = vagaId;
    registro.etapa = 'nova';
    registro.reprovado = false;
    registro.historico = [...(registro.historico || []), evento];
  } else {
    const base = pessoa.principal;
    registro = {
      id: uid(),
      vagaId,
      nome: base.nome,
      email: base.email,
      telefone: base.telefone,
      origem: base.origem,
      curriculo: base.curriculo,
      perfil: base.perfil || null,
      etapa: 'nova',
      reprovado: false,
      historico: [evento],
      ...novoCarimbo(),
    };
    state.rs.candidatos.push(registro);
  }
  enviarEmailEtapaRS(registro, 'nova');
  showToast(`${registro.nome} foi levada para a vaga ${vaga.codigo}.`);
  render();
}

// Abre o processo seletivo já com o funil da vaga aberto.
function irParaProcessoDaVagaRS(vagaId) {
  _rsRequisicaoExpandida = vagaId;
  goto('rs_processo');
}

function filtrarCadastroRS(campo, valor) {
  _rsCadastroFiltro = { ..._rsCadastroFiltro, [campo]: valor };
  render();
}

// ---------- a tela ----------
function pageRS() {
  if (!['owner', 'rh'].includes(meuPapelReal))
    return '<div class="empty">Só o Administrador e o RH acessam o cadastro de pessoas.</div>';
  garantirRS();
  if (typeof _talentosCarregados !== 'undefined' && !_talentosCarregados && !_talentosCarregando) carregarTalentos();
  const e = escaparHtml;
  const talentos = typeof _talentos !== 'undefined' ? _talentos : [];
  const todas = agruparPessoasRS(state.rs.candidatos);
  const lista = filtrarPessoasRS(todas, _rsCadastroFiltro);
  const vagas = vagasParaLevarRS(state.rs.requisicoes);
  const nomeDaVaga = (r) => `${r.codigo} — ${state.cargos.find((c) => c.id === r.cargoId)?.nome || 'vaga'}`;

  const linha = (p) => {
    const id = escaparParaOnclick(p.principal.id);
    const c = p.principal;
    const processos = p.processos.map((r) => descricaoDoProcessoRS(r, state.rs.requisicoes, state.cargos));
    const situacaoHtml = processos.length
      ? processos
          .map(
            (d) =>
              `<div style="margin-bottom:3px;"><span class="pill ${d.situacao === 'em_processo' ? 'pill-desenvolver' : d.situacao === 'contratada' ? 'pill-alavancar' : 'pill-neutral'}">${e(d.texto)}</span></div>`
          )
          .join('')
      : '<span class="pill pill-neutral">Só cadastrada</span>';
    const naBanco = pessoaNoBancoRS(p, talentos);
    const pode = podeLevarPessoaRS(p, null);
    const emProcesso = p.processos.find((r) => situacaoDoRegistroRS(r) === 'em_processo');
    const acoes = [
      pode.ok && vagas.length
        ? `<select id="rs_levar_${e(c.id)}" style="max-width:190px;"><option value="">Levar para a vaga…</option>${vagas.map((r) => `<option value="${e(r.id)}">${e(nomeDaVaga(r))}</option>`).join('')}</select> <button class="btn btn-sm btn-primary" onclick="levarPessoaParaVagaRS('${id}')">Levar</button>`
        : '',
      emProcesso
        ? `<button class="btn btn-sm btn-primary" onclick="irParaProcessoDaVagaRS('${escaparParaOnclick(emProcesso.vagaId)}')">Ver no processo</button>`
        : '',
      `<button class="btn btn-sm btn-ghost" onclick="_rsPessoaDadosAbertos=_rsPessoaDadosAbertos==='${id}'?null:'${id}';render();">Dados</button>`,
      `<button class="btn btn-sm btn-ghost" onclick="abrirEditarPessoaRS('${id}')">Editar</button>`,
      `<button class="btn btn-sm btn-ghost" onclick="removerPessoaRS('${id}')">Excluir</button>`,
    ]
      .filter(Boolean)
      .join(' ');
    const detalhe =
      _rsPessoaDadosAbertos === c.id
        ? `<tr><td colspan="4" style="padding-top:0;"><div class="card" style="background:var(--surface-2);margin:0;">
            <div class="small-muted">Origem: ${e(c.origem || '—')} · Cadastrada em ${e(c.criadoEm ? new Date(c.criadoEm).toLocaleDateString('pt-BR') : '—')}</div>
            ${c.curriculo ? `<div style="white-space:pre-wrap;margin:6px 0;font-size:13px;">${e(c.curriculo)}</div>` : ''}
            ${typeof renderPerfilCandidatoRS === 'function' && c.perfil ? renderPerfilCandidatoRS(c) : ''}
          </div></td></tr>`
        : '';
    const edicao =
      _rsPessoaEditando === c.id
        ? `<tr><td colspan="4" style="padding-top:0;"><div class="card" style="background:var(--surface-2);margin:0;">
            <div class="grid2"><div class="field"><label>Nome</label><input id="rs_ed_nome" type="text" value="${e(c.nome)}"></div>
              <div class="field"><label>E-mail</label><input id="rs_ed_email" type="email" value="${e(c.email)}"></div></div>
            <div class="grid2"><div class="field"><label>Telefone</label><input id="rs_ed_telefone" type="tel" value="${e(c.telefone)}"></div>
              <div class="field"><label>Origem</label><input id="rs_ed_origem" type="text" value="${e(c.origem)}"></div></div>
            <div class="field"><label>Currículo / resumo</label><textarea id="rs_ed_curriculo">${e(c.curriculo)}</textarea></div>
            <button class="btn btn-primary btn-sm" onclick="salvarPessoaRS('${id}')">Salvar</button>
            <button class="btn btn-ghost btn-sm" onclick="abrirEditarPessoaRS('${id}')">Cancelar</button>
          </div></td></tr>`
        : '';
    return `<tr>
        <td><b>${e(c.nome)}</b><div class="small-muted">${e(c.email || '—')}${c.telefone ? ` · ${e(c.telefone)}` : ''}</div></td>
        <td>${situacaoHtml}</td>
        <td>${naBanco ? '<span class="pill pill-alavancar" title="Autorizou ficar no banco de talentos">No banco</span>' : '<span class="small-muted">—</span>'}</td>
        <td style="white-space:nowrap;">${acoes}</td>
      </tr>${detalhe}${edicao}`;
  };

  return `
    <div class="page-head">
      <div class="eyebrow">Pessoas</div>
      <h1>R&S — Recrutamento</h1>
      <p class="page-desc">O cadastro das pessoas: aqui ficam os dados de cada uma. Quem trabalha uma vaga usa o <b>Processo seletivo</b>.</p>
      <div class="notice info" style="margin-top:10px;">
        <b>Como usar:</b> cadastre a pessoa aqui e clique em <b>Levar</b> para colocá-la no processo seletivo de uma vaga. Quem se candidata pelo link da vaga já entra direto no processo daquela vaga e também aparece nesta lista.
        O <b>banco de talentos</b> recebe sozinho quem marcou a autorização no formulário da vaga.
      </div>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <h3 style="margin:0;">Pessoas <span class="small-muted">(${lista.length}${lista.length !== todas.length ? ` de ${todas.length}` : ''})</span></h3>
        <button class="btn btn-primary btn-sm" onclick="abrirNovaPessoaRS()">${_rsPessoaFormAberto ? 'Fechar' : '+ Pessoa'}</button>
      </div>
      ${
        _rsPessoaFormAberto
          ? `<div class="card" style="background:var(--surface-2);margin-top:12px;">
          <div class="grid2"><div class="field"><label>Nome</label><input id="rs_pes_nome" type="text"></div>
            <div class="field"><label>E-mail</label><input id="rs_pes_email" type="email"></div></div>
          <div class="grid2"><div class="field"><label>Telefone</label><input id="rs_pes_telefone" type="tel"></div>
            <div class="field"><label>Origem</label><input id="rs_pes_origem" type="text" placeholder="Indicação, LinkedIn, etc."></div></div>
          <div class="field"><label>Currículo / resumo <small>(cole o texto ou um link)</small></label><textarea id="rs_pes_curriculo"></textarea></div>
          <button class="btn btn-primary btn-sm" onclick="criarPessoaRS()">Cadastrar</button>
          <button class="btn btn-ghost btn-sm" onclick="abrirNovaPessoaRS()">Cancelar</button>
        </div>`
          : ''
      }
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0;">
        <input id="rs_cad_busca" type="search" placeholder="Buscar por nome, e-mail, telefone ou origem…" value="${e(_rsCadastroFiltro.busca)}" onchange="filtrarCadastroRS('busca', this.value)" style="flex:1;min-width:220px;">
        <select onchange="filtrarCadastroRS('situacao', this.value)">${Object.entries(SITUACOES_PESSOA_RS)
          .map(
            ([k, rot]) =>
              `<option value="${k}" ${k === _rsCadastroFiltro.situacao ? 'selected' : ''}>${e(rot)}</option>`
          )
          .join('')}</select>
      </div>
      ${
        lista.length
          ? `<table><thead><tr><th>Pessoa</th><th>Situação</th><th>Banco de talentos</th><th></th></tr></thead><tbody>${lista.map(linha).join('')}</tbody></table>`
          : `<div class="empty">${todas.length ? 'Nenhuma pessoa com esse filtro.' : 'Nenhuma pessoa cadastrada ainda. Clique em "+ Pessoa".'}</div>`
      }
      ${vagas.length ? '' : '<p class="small-muted" style="margin:10px 0 0;">Para levar alguém a um processo seletivo, primeiro crie e aprove uma vaga em R&S — Processo seletivo.</p>'}
    </div>
  `;
}
