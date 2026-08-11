/* ---------- Regras de hierarquia (critério de aceite do módulo Estrutura Organizacional — PRD Cap. 5: ao menos 3 níveis; aqui implementados 4) ---------- */
const NIVEL_RANK = { unidade: 0, departamento: 1, setor: 2, equipe: 3 };
const NIVEL_LABEL = { unidade: 'Unidade', departamento: 'Departamento', setor: 'Setor', equipe: 'Equipe' };

// Um nível só pode ter como pai o nível IMEDIATAMENTE acima na hierarquia
// (Unidade → Departamento → Setor → Equipe) — sem pular etapas, conforme o
// Dicionário de Dados (Setor depende de Departamento, que depende de Unidade).
function paisValidosPara(tipo) {
  if (tipo === 'unidade') return [];
  return state.estrutura.filter((n) => NIVEL_RANK[n.tipo] === NIVEL_RANK[tipo] - 1);
}
// Evita ciclos: verifica se, subindo a árvore a partir de novoPaiId, chegamos
// de volta ao próprio nó (o que criaria um laço, ex.: setor A pai de si mesmo).
function causariaCiclo(nodeId, novoPaiId) {
  let atual = novoPaiId;
  while (atual) {
    if (atual === nodeId) return true;
    const pai = state.estrutura.find((n) => n.id === atual);
    atual = pai ? pai.paiId : null;
  }
  return false;
}

// Colaboradores só se vinculam diretamente a Unidade e Setor (não a
// Departamento/Equipe, que são níveis puramente estruturais/intermediários).
// Por isso, pra saber "quem pertence a este nó" quando o nó é um
// Departamento ou uma Equipe, é preciso descer a árvore até achar todos os
// Setores descendentes, e então juntar os colaboradores desses Setores.
function setoresDescendentesDe(nodeId) {
  const diretos = state.estrutura.filter((n) => n.paiId === nodeId);
  let setores = diretos.filter((n) => n.tipo === 'setor').map((n) => n.id);
  diretos.forEach((filho) => {
    setores = setores.concat(setoresDescendentesDe(filho.id));
  });
  return setores;
}
function colaboradoresDoNo(node) {
  if (node.tipo === 'unidade') {
    return state.colaboradores.filter((p) => p.unidadeId === node.id && !p.inativo);
  }
  if (node.tipo === 'setor') {
    return state.colaboradores.filter((p) => p.setorId === node.id && !p.inativo);
  }
  // Departamento ou Equipe: todos os colaboradores cujo Setor está dentro deste nó.
  const setoresIds = setoresDescendentesDe(node.id);
  return state.colaboradores.filter((p) => setoresIds.includes(p.setorId) && !p.inativo);
}

let _tipoNovoEstrutura = 'unidade';
let _paiNovoEstrutura = '';
let _moverEstruturaId = null;
let _expandidosEstrutura = new Set();

function toggleExpandirEstrutura(nodeId) {
  if (_expandidosEstrutura.has(nodeId)) _expandidosEstrutura.delete(nodeId);
  else _expandidosEstrutura.add(nodeId);
  render();
}

function pageEstrutura() {
  const roots = state.estrutura.filter((n) => !n.paiId);
  const responsaveis = _perfisEmpresa.filter((p) => ['owner', 'rh', 'lider'].includes(p.papel));
  const nomeResponsavel = (id) => _perfisEmpresa.find((p) => p.id === id)?.nome || '—';

  const NIVEL_ICONE = { unidade: 'U', departamento: 'D', setor: 'S', equipe: 'E' };
  const NIVEL_COR_VAR = {
    unidade: 'var(--nivel-unidade)',
    departamento: 'var(--nivel-departamento)',
    setor: 'var(--nivel-setor)',
    equipe: 'var(--nivel-equipe)',
  };
  const NIVEL_COR_SOFT_VAR = {
    unidade: 'var(--nivel-unidade-soft)',
    departamento: 'var(--nivel-departamento-soft)',
    setor: 'var(--nivel-setor-soft)',
    equipe: 'var(--nivel-equipe-soft)',
  };
  function iniciaisNome(nome) {
    if (!nome) return '?';
    const partes = nome.trim().split(/\s+/);
    return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || '?';
  }

  function nodeHTML(n, depth) {
    const children = state.estrutura.filter((c) => c.paiId === n.id);
    const emMovimento = _moverEstruturaId === n.id;
    const expandido = _expandidosEstrutura.has(n.id);
    const opcoesPai = state.estrutura.filter(
      (x) => x.id !== n.id && NIVEL_RANK[x.tipo] === NIVEL_RANK[n.tipo] - 1 && !causariaCiclo(n.id, x.id)
    );
    const nomeResp = n.responsavelId ? nomeResponsavel(n.responsavelId) : null;
    const colaboradoresDoNode = colaboradoresDoNo(n);
    return `
      <div class="tree-node-wrap">
        <div class="tree-node" style="--nivel-cor:${NIVEL_COR_VAR[n.tipo]};--nivel-cor-soft:${NIVEL_COR_SOFT_VAR[n.tipo]};cursor:pointer;" onclick="toggleExpandirEstrutura('${n.id}')">
          <div class="tree-node-info">
            <span class="tree-node-chevron ${expandido ? 'aberto' : ''}">▸</span>
            <div class="tree-node-icone">${NIVEL_ICONE[n.tipo]}</div>
            <div class="tree-node-textos">
              <span class="tree-node-nome">${escaparHtml(n.nome)}</span>
              <span class="tree-node-tipo">${NIVEL_LABEL[n.tipo]} <span class="tree-node-contagem">· ${colaboradoresDoNode.length} colaborador${colaboradoresDoNode.length === 1 ? '' : 'es'}</span></span>
            </div>
          </div>
          <div class="tree-node-resp">
            ${nomeResp ? `<span class="tree-node-avatar">${iniciaisNome(nomeResp)}</span><span>${escaparHtml(nomeResp)}</span>` : '<span>sem responsável</span>'}
          </div>
          <div class="tree-node-acoes" onclick="event.stopPropagation();">
            ${n.tipo !== 'unidade' ? `<button class="btn btn-ghost btn-sm" onclick="_moverEstruturaId='${emMovimento ? '' : n.id}';render();">${emMovimento ? 'Cancelar' : 'Mover'}</button>` : ''}
          </div>
        </div>
        ${
          expandido && n.tipo !== 'unidade'
            ? `
          <div class="tree-node-colaboradores">
            ${
              colaboradoresDoNode.length
                ? colaboradoresDoNode
                    .map((p) => {
                      const cargo = state.cargos.find((c) => c.id === p.cargoId);
                      return `<div class="tree-node-colaborador"><span class="tree-node-avatar">${iniciaisNome(p.nome)}</span><span>${escaparHtml(p.nome)}</span><span class="small-muted">${cargo ? escaparHtml(cargo.nome) : '—'}</span></div>`;
                    })
                    .join('')
                : `<div class="small-muted" style="padding:6px 2px;">Nenhum colaborador vinculado ${n.tipo === 'setor' ? 'aqui' : 'em nenhum Setor dentro deste nível'} ainda.</div>`
            }
          </div>
        `
            : ''
        }
        ${
          emMovimento
            ? `
          <div class="tree-node" style="background:var(--surface);margin-left:38px;">
            <div class="field" style="margin:0;flex:1;">
              <label style="font-size:11px;">Novo nível superior</label>
              <select id="novo_pai_${n.id}">
                <option value="">— nenhum (torna raiz) —</option>
                ${opcoesPai.map((p) => `<option value="${p.id}">${escaparHtml(p.nome)} (${NIVEL_LABEL[p.tipo]})</option>`).join('')}
              </select>
            </div>
            <button class="btn btn-primary btn-sm" onclick="moverEstrutura('${n.id}')">Confirmar</button>
          </div>
        `
            : ''
        }
        ${expandido && children.length ? `<div class="tree-children">${children.map((c) => nodeHTML(c, depth + 1)).join('')}</div>` : ''}
      </div>
    `;
  }

  const paisDisponiveis = paisValidosPara(_tipoNovoEstrutura);

  return `
    <div class="page-head">
      <div class="eyebrow">Etapa 02 · Fundação</div>
      <h1>Estrutura Organizacional</h1>
      <p class="page-desc">Hierarquia sequencial: Unidade → Departamento → Setor → Equipe. <b>Unidade é o local físico</b> onde a empresa funciona (ex: a matriz, uma filial) — os demais níveis organizam quem trabalha dentro dela. Cada nível só pode ficar diretamente dentro do nível imediatamente acima — não é possível pular etapas (ex: um Setor precisa estar dentro de um Departamento, não direto na Unidade).</p>
    </div>

    <div class="card">
      <h3>Adicionar nível hierárquico</h3>
      <div class="grid3">
        <div class="field"><label>Nome ${_tipoNovoEstrutura === 'unidade' ? '<small>(o local físico onde a empresa funciona — não repita a palavra "Unidade" no nome)</small>' : ''}</label>
          <input id="e_nome" placeholder="${
            {
              unidade: 'Ex: Matriz São Paulo, Filial Centro',
              departamento: 'Ex: Comercial',
              setor: 'Ex: Vendas Internas',
              equipe: 'Ex: Equipe de Prospecção',
            }[_tipoNovoEstrutura]
          }">
        </div>
        <div class="field"><label>Tipo</label>
          <select id="e_tipo" onchange="_tipoNovoEstrutura=this.value; _paiNovoEstrutura=''; render();">
            ${Object.keys(NIVEL_LABEL)
              .map(
                (t) => `<option value="${t}" ${_tipoNovoEstrutura === t ? 'selected' : ''}>${NIVEL_LABEL[t]}</option>`
              )
              .join('')}
          </select>
        </div>
        <div class="field"><label>Nível superior (pai) ${_tipoNovoEstrutura === 'unidade' ? '<small>(Unidade não tem pai)</small>' : ''}</label>
          <select id="e_pai" ${_tipoNovoEstrutura === 'unidade' ? 'disabled' : ''}>
            <option value="">${_tipoNovoEstrutura === 'unidade' ? '— não se aplica —' : '— selecione —'}</option>
            ${paisDisponiveis.map((n) => `<option value="${n.id}">${escaparHtml(n.nome)} (${NIVEL_LABEL[n.tipo]})</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field"><label>Responsável <small>(opcional — vincule a uma conta de Dono, RH ou Gestor já convidada)</small></label>
        <select id="e_resp">
          <option value="">— sem responsável vinculado —</option>
          ${responsaveis.map((p) => `<option value="${p.id}">${p.nome || '(sem nome)'} — ${PAPEL_LABEL_UI[p.papel]}</option>`).join('')}
        </select>
      </div>
      ${_tipoNovoEstrutura !== 'unidade' && paisDisponiveis.length === 0 ? `<div class="notice">Cadastre ao menos uma Unidade antes de criar um nível de "${NIVEL_LABEL[_tipoNovoEstrutura]}".</div>` : ''}
      <button class="btn btn-primary" onclick="addEstrutura()" ${_tipoNovoEstrutura !== 'unidade' && paisDisponiveis.length === 0 ? 'disabled' : ''}>Adicionar nível</button>
    </div>

    <div class="card">
      <h3>Árvore organizacional</h3>
      ${
        roots.length
          ? `
        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px;font-size:11.5px;color:var(--ink-faint);">
          ${Object.entries(NIVEL_LABEL)
            .map(
              ([tipo, label]) =>
                `<span style="display:flex;align-items:center;gap:5px;"><span style="width:9px;height:9px;border-radius:3px;background:${NIVEL_COR_VAR[tipo]};display:inline-block;"></span>${label}</span>`
            )
            .join('')}
        </div>
        <div class="tree">${roots.map((r) => nodeHTML(r, 0)).join('')}</div>
      `
          : '<div class="empty">Nenhum nível cadastrado ainda. Comece criando uma Unidade.</div>'
      }
    </div>
  `;
}

function addEstrutura() {
  const nome = document.getElementById('e_nome').value.trim();
  if (!nome) {
    showToast('Informe um nome para o nível hierárquico.');
    return;
  }
  const tipo = document.getElementById('e_tipo').value;
  const paiId = tipo === 'unidade' ? null : document.getElementById('e_pai').value || null;

  if (tipo !== 'unidade' && !paiId) {
    showToast('Selecione o nível superior (pai) — obrigatório para tudo além de Unidade.');
    return;
  }
  if (paiId) {
    const pai = state.estrutura.find((n) => n.id === paiId);
    if (!pai || NIVEL_RANK[pai.tipo] !== NIVEL_RANK[tipo] - 1) {
      showToast(
        `Um(a) ${NIVEL_LABEL[tipo]} só pode ter como nível superior um(a) ${NIVEL_LABEL[Object.keys(NIVEL_RANK).find((k) => NIVEL_RANK[k] === NIVEL_RANK[tipo] - 1)]} (hierarquia não pula etapas).`
      );
      return;
    }
  }

  const novo = {
    id: uid(),
    nome,
    tipo,
    paiId,
    responsavelId: document.getElementById('e_resp').value || null,
    ...novoCarimbo(),
  };
  state.estrutura.push(novo);
  registrarAuditoria('estrutura.criada', { nome, tipo });
  showToast('Nível adicionado à estrutura.');
  render();
}

function moverEstrutura(nodeId) {
  const select = document.getElementById(`novo_pai_${nodeId}`);
  const novoPaiId = select.value || null;
  const node = state.estrutura.find((n) => n.id === nodeId);

  if (novoPaiId) {
    if (causariaCiclo(nodeId, novoPaiId)) {
      showToast('Movimento inválido: criaria um ciclo na hierarquia.');
      return;
    }
    const novoPai = state.estrutura.find((n) => n.id === novoPaiId);
    if (NIVEL_RANK[novoPai.tipo] !== NIVEL_RANK[node.tipo] - 1) {
      showToast(
        `Um(a) ${NIVEL_LABEL[node.tipo]} só pode ficar diretamente dentro de um(a) ${NIVEL_LABEL[Object.keys(NIVEL_RANK).find((k) => NIVEL_RANK[k] === NIVEL_RANK[node.tipo] - 1)]}.`
      );
      return;
    }
  }

  const paiAntigoId = node.paiId;
  node.paiId = novoPaiId;
  atualizarCarimbo(node);
  _moverEstruturaId = null;
  // Vínculos de colaboradores (setorId) continuam apontando para este mesmo
  // nó (mesmo id) — a reorganização não afeta o histórico já registrado.
  registrarAuditoria('estrutura.movida', { nome: node.nome, de: paiAntigoId, para: novoPaiId });
  showToast('Estrutura reorganizada. Vínculos de colaboradores preservados.');
  render();
}

/* ===================== 3. CULTURA ===================== */
