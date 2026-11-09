/* =========================================================
   R&S — WHATSAPP E COMPARTILHAR A VAGA
   -----------------------------------------------------------
   1) WHATSAPP NA FICHA DO CANDIDATO. O botão abre o WhatsApp (aplicativo ou WhatsApp Web) com uma mensagem pronta; quem aperta
      "enviar" é a pessoa do RH. O sistema NÃO envia nada, não lê respostas e não mexe em ninguém sem clique. Três modelos:
      primeiro contato, entrevista marcada e lembrete (os dois últimos usam a data, a hora e o link da agenda). O texto fica num
      campo editável antes de abrir. O sistema só guarda QUANDO o WhatsApp foi aberto (para a equipe não chamar a mesma pessoa duas
      vezes), nunca o conteúdo da mensagem; a Auditoria guarda só contagens.
   2) COMPARTILHAR A VAGA PUBLICADA: WhatsApp, LinkedIn, e-mail e "copiar texto do anúncio". O texto do anúncio usa só o que já é
      público na página da vaga; vaga confidencial não revela cargo nem empresa.

   Limites declarados: um candidato por vez (não existe envio em massa), usa o WhatsApp de quem clicou (o ideal é um número da
   empresa), e a prévia do link no WhatsApp/LinkedIn ainda é genérica até existir a página de divulgação.

   O começo do arquivo são funções PURAS (sem tela, sem relógio), testadas.
   ========================================================= */

const WHATSAPP_TEXTO_MAXIMO_RS = 1000; // o endereço do link tem limite; texto maior é cortado

// ---------- telefone ----------
// Devolve { ok: true, numero, aviso? } com o número pronto para o link (só dígitos, com 55) ou { ok: false, motivo }.
function telefoneParaWhatsAppRS(telefone) {
  const bruto = String(telefone == null ? '' : telefone).trim();
  if (!bruto) return { ok: false, motivo: 'O candidato não tem telefone cadastrado.' };
  const soDigitos = bruto.replace(/\D/g, '');
  if (bruto.startsWith('+') && !bruto.startsWith('+55')) {
    // número de outro país: tamanho de telefone internacional
    return soDigitos.length >= 8 && soDigitos.length <= 15
      ? { ok: true, numero: soDigitos }
      : { ok: false, motivo: 'O telefone parece incompleto.' };
  }
  let d = soDigitos.replace(/^0+/, ''); // tira o 0 de operadora/discagem (0, 055...)
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  else if (!((d.length === 12 || d.length === 13) && d.startsWith('55')))
    return { ok: false, motivo: 'O telefone parece incompleto ou inválido.' };
  const ddd = d.slice(2, 4);
  const resto = d.slice(4);
  if (!/^[1-9][1-9]$/.test(ddd)) return { ok: false, motivo: 'O DDD do telefone parece inválido.' };
  if (resto.length === 9 && resto[0] !== '9')
    return { ok: false, motivo: 'O número de celular deve começar com 9 depois do DDD.' };
  const r = { ok: true, numero: d };
  if (resto.length === 8)
    r.aviso = /^[6-9]/.test(resto)
      ? 'Parece faltar o 9 na frente do número. Se o WhatsApp não abrir a conversa, corrija o telefone.'
      : 'Este número parece fixo: o WhatsApp pode não funcionar nele.';
  return r;
}
function linkWhatsAppRS(numero, texto) {
  return `https://wa.me/${numero}?text=${encodeURIComponent(String(texto || '').slice(0, WHATSAPP_TEXTO_MAXIMO_RS))}`;
}

// ---------- mensagens ----------
function primeiroNomeRS(nome) {
  const t =
    String(nome || '')
      .trim()
      .split(/\s+/)[0] || '';
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : '';
}
// "online: link", "no endereço: ...", "por telefone".
function ondeDaEntrevistaTextoRS(e) {
  if (e.formato === 'online') return `online: ${e.local}`;
  if (e.formato === 'presencial') return `no endereço: ${e.local}`;
  return e.local ? `por telefone: ${e.local}` : 'por telefone';
}
// Os modelos de mensagem do candidato. entrevista: a próxima entrevista agendada (ou null).
function modelosWhatsAppRS({ candidato, nomeVaga, empresaNome, remetente, entrevista }) {
  const p = primeiroNomeRS(candidato.nome);
  const ola = `Olá${p ? `, ${p}` : ''}!`;
  const quem = `Aqui é ${remetente ? `${remetente}, ` : ''}do RH${empresaNome ? ` da ${empresaNome}` : ''}.`;
  const modelos = [
    {
      id: 'contato',
      rotulo: 'Primeiro contato',
      texto: `${ola} ${quem} Recebi a sua candidatura para a vaga de ${nomeVaga} e gostaria de conversar com você. Podemos falar agora?`,
    },
  ];
  if (entrevista) {
    const quando = rotuloQuandoRS(entrevista);
    const onde = ondeDaEntrevistaTextoRS(entrevista);
    modelos.push(
      {
        id: 'entrevista',
        rotulo: 'Entrevista marcada',
        texto: `${ola} Sua entrevista para a vaga de ${nomeVaga} está marcada para ${quando}, ${onde}. Você confirma presença?`,
      },
      {
        id: 'lembrete',
        rotulo: 'Lembrete',
        texto: `${ola} Passando para lembrar da sua entrevista para a vaga de ${nomeVaga}: ${quando}, ${onde}. Até lá!`,
      }
    );
  }
  return modelos;
}

// ---------- o anúncio da vaga ----------
function primeiraFraseRS(texto, limite) {
  const linha =
    String(texto || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean) || '';
  const limpa = linha.replace(/[\s.;,:]+$/, '');
  return limpa.length > limite ? `${limpa.slice(0, limite - 1).trimEnd()}…` : limpa;
}
// Só o que já é público na página da vaga. Vaga confidencial: título genérico (a menos que o RH tenha escolhido um) e sem empresa.
function dadosPublicosDaVagaRS(r, cargos, empresa) {
  const pd = r.perfilDesejado || {};
  const cargo = (cargos || []).find((c) => c.id === r.cargoId);
  const publico = r.publico || {};
  const empresaVisivel = !r.confidencial && publico.mostrarEmpresa === true && empresa && empresa.nomeFantasia;
  return {
    titulo: publico.titulo || (r.confidencial ? 'Vaga em aberto' : (cargo && cargo.nome) || 'Vaga'),
    cidade: (publico.local !== undefined ? publico.local : pd.cidade) || '',
    modalidade: publico.modalidade || '',
    empresaNome: empresaVisivel ? empresa.nomeFantasia : '',
    atividades: primeiraFraseRS(pd.principaisAtividades || r.missaoHerdada, 140),
  };
}
function textoAnuncioVagaRS({ titulo, cidade, modalidade, empresaNome, atividades, link }) {
  const abertura = empresaNome ? `${empresaNome} está contratando:` : 'Estamos contratando:';
  const onde = cidade ? `, em ${cidade}` : '';
  const como = modalidade ? ` (${String(modalidade).toLowerCase()})` : '';
  return `${abertura} ${titulo}${onde}${como}. ${atividades ? `${atividades}. ` : ''}Candidate-se pelo link: ${link}`;
}
function linkCompartilharWhatsAppRS(texto) {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}
function linkCompartilharLinkedInRS(url) {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
}
function linkCompartilharEmailRS(assunto, corpo) {
  return `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}

// ---------- ações ----------
let _rsWhatsApp = null; // { candidatoId, modelo }

function compartilharGestorRS() {
  return ['owner', 'rh'].includes(meuPapelReal);
}
// Abre um endereço numa aba nova (como um clique de verdade, que o navegador deixa passar).
function abrirEnderecoRS(url) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function proximaEntrevistaDoCandidatoRS(candidatoId, agora) {
  if (typeof entrevistasDoCandidatoRS !== 'function') return null;
  return (
    entrevistasDoCandidatoRS(candidatoId).find((e) => e.status === 'agendada' && fimEntrevistaMsRS(e) >= agora) || null
  );
}
function modelosDoCandidatoRS(c, agora) {
  const vaga = state.rs.requisicoes.find((r) => r.id === c.vagaId);
  const nomeVaga = typeof nomeDaVagaDoCandidatoRS === 'function' ? nomeDaVagaDoCandidatoRS(c) : 'nossa vaga';
  const remetente = typeof nomePorPerfilId === 'function' ? primeiroNomeRS(nomePorPerfilId(meuPerfilId)) : '';
  const empresaNome = vaga && !vaga.confidencial && state.empresa ? state.empresa.nomeFantasia || '' : '';
  return modelosWhatsAppRS({
    candidato: c,
    nomeVaga,
    empresaNome,
    remetente,
    entrevista: proximaEntrevistaDoCandidatoRS(c.id, agora),
  });
}

function abrirPainelWhatsAppRS(candidatoId) {
  if (!compartilharGestorRS()) return;
  _rsWhatsApp = _rsWhatsApp && _rsWhatsApp.candidatoId === candidatoId ? null : { candidatoId, modelo: 'contato' };
  _psFichaAberta = candidatoId;
  render();
}
function escolherModeloWhatsAppRS(modeloId) {
  if (_rsWhatsApp) _rsWhatsApp.modelo = modeloId;
  render();
}
function fecharPainelWhatsAppRS() {
  _rsWhatsApp = null;
  render();
}
// texto: o que a pessoa deixou no campo (ou, vindo da agenda, o modelo direto).
function abrirWhatsAppRS(candidatoId, texto) {
  if (!compartilharGestorRS()) return;
  const c = state.rs.candidatos.find((x) => x.id === candidatoId);
  if (!c) return;
  const tel = telefoneParaWhatsAppRS(c.telefone);
  if (!tel.ok) return showToast(tel.motivo);
  let mensagem = texto;
  if (mensagem === undefined) {
    const campo = document.getElementById('rs_wa_texto');
    mensagem = campo ? campo.value : '';
  }
  abrirEnderecoRS(linkWhatsAppRS(tel.numero, mensagem));
  c.ultimoWhatsApp = { em: new Date().toISOString(), autorId: meuPerfilId };
  registrarAuditoria('rs.whatsapp_aberto', { vagaId: c.vagaId });
  showToast('WhatsApp aberto. Confira a mensagem e envie por lá.');
  render();
}
// Da página da Agenda: abre direto com o lembrete (a pessoa ainda pode editar no próprio WhatsApp).
function abrirWhatsAppDaAgendaRS(candidatoId) {
  if (!compartilharGestorRS()) return;
  const c = state.rs.candidatos.find((x) => x.id === candidatoId);
  if (!c) return;
  const modelo = modelosDoCandidatoRS(c, Date.now()).find((m) => m.id === 'lembrete');
  if (!modelo) return showToast('Este candidato não tem entrevista agendada.');
  abrirWhatsAppRS(candidatoId, modelo.texto);
}

function compartilharVagaRS(vagaId, canal) {
  if (!compartilharGestorRS()) return;
  const r = state.rs.requisicoes.find((x) => x.id === vagaId);
  if (!r || !r.publicada || r.encerrada || !r.vagaPublicaId) return showToast('Esta vaga não está publicada.');
  const link = linkPublicoRS(r);
  const dados = dadosPublicosDaVagaRS(r, state.cargos, state.empresa);
  const texto = textoAnuncioVagaRS({ ...dados, link });
  if (canal === 'whatsapp') abrirEnderecoRS(linkCompartilharWhatsAppRS(texto));
  else if (canal === 'linkedin') abrirEnderecoRS(linkCompartilharLinkedInRS(link));
  else if (canal === 'email') abrirEnderecoRS(linkCompartilharEmailRS(`Vaga: ${dados.titulo}`, texto));
  else if (canal === 'texto') {
    navigator.clipboard?.writeText(texto);
    showToast('Texto do anúncio copiado! Cole onde quiser divulgar.');
  } else return;
  registrarAuditoria('rs.vaga_compartilhada', { vagaId: r.id, canal });
}

// ---------- o que aparece na tela ----------
function whatsAppBotaoHtml(c) {
  if (!compartilharGestorRS()) return '';
  const tel = telefoneParaWhatsAppRS(c.telefone);
  const id = escaparParaOnclick(c.id);
  return `<button class="btn btn-sm btn-ghost" onclick="abrirPainelWhatsAppRS('${id}')" aria-expanded="${_rsWhatsApp && _rsWhatsApp.candidatoId === c.id ? 'true' : 'false'}" ${tel.ok ? '' : `title="${escaparHtml(tel.motivo)}"`}>WhatsApp</button>`;
}

function whatsAppPainelHtml(c) {
  if (!compartilharGestorRS() || !_rsWhatsApp || _rsWhatsApp.candidatoId !== c.id) return '';
  const x = escaparHtml;
  const id = escaparParaOnclick(c.id);
  const tel = telefoneParaWhatsAppRS(c.telefone);
  const moldura = (corpo) =>
    `<div role="region" aria-label="Mensagem de WhatsApp" style="border:1px solid var(--line);border-radius:8px;padding:10px;margin-top:8px;">${corpo}</div>`;
  if (!tel.ok)
    return moldura(
      `<div class="notice info" role="alert">${x(tel.motivo)} Corrija o telefone no cadastro da pessoa para usar o WhatsApp.</div><div style="margin-top:8px;"><button class="btn btn-sm btn-ghost" onclick="fecharPainelWhatsAppRS()">Fechar</button></div>`
    );
  const modelos = modelosDoCandidatoRS(c, Date.now());
  const atual = modelos.find((m) => m.id === _rsWhatsApp.modelo) || modelos[0];
  const ultimo =
    c.ultimoWhatsApp && c.ultimoWhatsApp.em
      ? `<div class="small-muted" style="margin-top:6px;">Último WhatsApp aberto: ${x(new Date(c.ultimoWhatsApp.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }))}</div>`
      : '';
  return moldura(`<div style="font-weight:600;font-size:13px;margin-bottom:6px;">Mensagem pronta para o WhatsApp</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">${modelos.map((m) => `<button class="btn btn-sm ${m.id === atual.id ? 'btn-primary' : 'btn-ghost'}" aria-pressed="${m.id === atual.id}" onclick="escolherModeloWhatsAppRS('${escaparParaOnclick(m.id)}')">${x(m.rotulo)}</button>`).join('')}</div>
    <label for="rs_wa_texto" class="small-muted" style="display:block;">Você pode editar o texto antes de abrir</label>
    <textarea id="rs_wa_texto" rows="5" maxlength="${WHATSAPP_TEXTO_MAXIMO_RS}" style="width:100%;">${x(atual.texto)}</textarea>
    ${tel.aviso ? `<div class="notice info" style="margin-top:6px;">${x(tel.aviso)}</div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px;">
      <button class="btn btn-sm btn-primary" onclick="abrirWhatsAppRS('${id}')">Abrir no WhatsApp</button>
      <button class="btn btn-sm btn-ghost" onclick="fecharPainelWhatsAppRS()">Fechar</button>
      <span class="small-muted" style="font-size:12px;">O sistema não envia nada: abre o WhatsApp com o texto e você aperta enviar.</span>
    </div>${ultimo}`);
}

// A linha de divulgação no cartão da vaga publicada (Administrador e RH).
function compartilharVagaHtml(r) {
  if (!compartilharGestorRS() || !r.publicada || r.encerrada || !r.vagaPublicaId) return '';
  const id = escaparParaOnclick(r.id);
  const b = (canal, texto) =>
    `<button class="btn btn-ghost btn-sm" onclick="compartilharVagaRS('${id}', '${canal}')">${texto}</button>`;
  return `<tr><td colspan="5" class="small-muted" style="padding-top:0;">Divulgar: ${b('whatsapp', 'WhatsApp')} ${b('linkedin', 'LinkedIn')} ${b('email', 'E-mail')} ${b('texto', 'Copiar texto do anúncio')}<div style="font-size:12px;margin-top:2px;">A prévia do link no WhatsApp e no LinkedIn ainda mostra o título genérico da página.</div></td></tr>`;
}
