/* =========================================================
   COMBINAR ALTERAÇÕES (três vias) — o que impede duas pessoas de apagarem o trabalho uma da outra
   -----------------------------------------------------------
   Todos os dados da empresa ficam em um documento. Se a Ana carregou a versão 10, o Bruno salvou a 11 e a Ana salva agora,
   gravar a versão da Ana por cima apagaria o que o Bruno fez. Em vez disso, o sistema compara TRÊS versões:
     BASE   = o que a Ana carregou (versão 10);
     MEU    = o que está na tela da Ana agora;
     REMOTO = o que está no servidor agora (versão 11, do Bruno).
   Regra geral, campo a campo:
     - só EU mudei           -> vale o meu;
     - só o OUTRO mudou      -> vale o dele;
     - os dois fizeram igual -> esse valor;
     - os dois mudaram DIFERENTE -> se for objeto, combina campo a campo; se for lista de itens com "id", combina ITEM por
       item (candidato novo de um e candidato movido de outro ficam os dois); se for lista que só cresce (histórico), junta
       os acréscimos; senão é CONFLITO e vale o meu (e o ponto fica registrado).
   Sobre apagar: se um apagou um item e o outro alterou, o item FICA (alterado) — perder dado é pior do que sobrar um item.
   São funções PURAS (sem tela, sem banco), testadas em detalhe.
   ========================================================= */

// Texto canônico de um valor: as chaves de objeto saem em ordem, então dois valores iguais têm o mesmo texto,
// mesmo que as chaves tenham sido criadas em ordens diferentes. Propriedades "undefined" não contam.
function canonicoEstado(v) {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'object') {
    if (typeof v.toJSON === 'function') return canonicoEstado(v.toJSON());
    if (Array.isArray(v)) return `[${v.map(canonicoEstado).join(',')}]`;
    return `{${Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicoEstado(v[k])}`)
      .join(',')}}`;
  }
  const s = JSON.stringify(v);
  return s === undefined ? 'undefined' : s;
}

function clonarPayloadEstado(obj) {
  return JSON.parse(JSON.stringify(obj === undefined ? {} : obj));
}

// { area: texto canônico } do que está salvo — serve para saber, depois, quais áreas EU mudei.
function canonPorChave(payload, chaves) {
  const saida = {};
  for (const k of chaves) saida[k] = canonicoEstado(payload ? payload[k] : undefined);
  return saida;
}

function _ehObjetoSimples(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}
function _ehVazio(x) {
  return (
    x === undefined ||
    x === null ||
    x === '' ||
    (Array.isArray(x) && x.length === 0) ||
    (_ehObjetoSimples(x) && Object.keys(x).length === 0)
  );
}
function _idDoItem(x) {
  return _ehObjetoSimples(x) && x.id !== undefined && x.id !== null && String(x.id) !== '' ? String(x.id) : null;
}
// Todas as listas têm só itens com "id" e sem ids repetidos?
function _todasComIds(listas) {
  return listas.every((arr) => {
    const ids = arr.map(_idDoItem);
    return ids.every((id) => id !== null) && new Set(ids).size === ids.length;
  });
}

// Lista de itens com "id": combina item por item. A ordem é a do servidor; o que só eu criei vem no fim.
function mesclarListaComIds(base, meu, remoto, caminho, conflitos) {
  const porId = (arr) => new Map(arr.map((x) => [_idDoItem(x), x]));
  const mb = porId(base);
  const mm = porId(meu);
  const mr = porId(remoto);
  const ordem = [...mr.keys(), ...[...mm.keys()].filter((id) => !mr.has(id))];
  const saida = [];
  for (const id of ordem) {
    const v = mesclarValor(mb.get(id), mm.get(id), mr.get(id), `${caminho}[id=${id}]`, conflitos);
    if (v !== undefined) saida.push(v);
  }
  return saida;
}

// Lista SEM ids que só cresce (ex.: histórico): base + acréscimos do servidor + meus acréscimos (sem repetir). Senão, null.
function mesclarAcrescimos(base, meu, remoto) {
  const cb = base.map(canonicoEstado);
  const ehPrefixo = (arr) => arr.length >= base.length && cb.every((c, i) => canonicoEstado(arr[i]) === c);
  if (!ehPrefixo(meu) || !ehPrefixo(remoto)) return null;
  const novosRemoto = remoto.slice(base.length);
  const jaTem = new Set(novosRemoto.map(canonicoEstado));
  return [...base, ...novosRemoto, ...meu.slice(base.length).filter((x) => !jaTem.has(canonicoEstado(x)))];
}

// O coração: combina UM valor. "caminho" só serve para dizer onde houve conflito. Devolve undefined para "não existe".
function mesclarValor(base, meu, remoto, caminho, conflitos) {
  const cb = canonicoEstado(base);
  const cm = canonicoEstado(meu);
  const cr = canonicoEstado(remoto);
  if (cm === cr) return meu; // igual (ou os dois sem o valor)
  if (cm === cb) return remoto; // eu não mexi: vale o do outro
  if (cr === cb) return meu; // só eu mexi
  // Campo que a base NUNCA teve (empresa nova, ou área criada depois): um valor VAZIO (nulo, texto vazio, lista ou objeto sem nada)
  // é só o padrão do sistema, não uma alteração de ninguém — não pode apagar o dado real do outro lado.
  if (base === undefined) {
    if (_ehVazio(meu)) return remoto;
    if (_ehVazio(remoto)) return meu;
  }

  // os dois mudaram, de jeitos diferentes
  if (
    _ehObjetoSimples(meu) &&
    _ehObjetoSimples(remoto) &&
    (base === undefined || base === null || _ehObjetoSimples(base))
  ) {
    const b = _ehObjetoSimples(base) ? base : {};
    const saida = {};
    for (const k of new Set([...Object.keys(b), ...Object.keys(meu), ...Object.keys(remoto)])) {
      const v = mesclarValor(b[k], meu[k], remoto[k], `${caminho}.${k}`, conflitos);
      if (v !== undefined) saida[k] = v;
    }
    return saida;
  }
  if (Array.isArray(meu) && Array.isArray(remoto) && (base === undefined || base === null || Array.isArray(base))) {
    const b = Array.isArray(base) ? base : [];
    if (_todasComIds([b, meu, remoto])) return mesclarListaComIds(b, meu, remoto, caminho, conflitos);
    const juntada = mesclarAcrescimos(b, meu, remoto);
    if (juntada) return juntada;
  }
  // um apagou e o outro alterou: fica o que foi alterado (não perder dado)
  conflitos.push(caminho);
  if (meu === undefined) return remoto;
  if (remoto === undefined) return meu;
  return meu; // mesmo campo, valores diferentes: vale o meu
}

// Combina o documento inteiro, área por área. Devolve { estado, conflitos }.
function mesclarEstadoRemoto({ base, meu, remoto, chaves }) {
  const b = base || {};
  const m = meu || {};
  const r = remoto || {};
  const areas = chaves || [...new Set([...Object.keys(b), ...Object.keys(m), ...Object.keys(r)])];
  const estado = {};
  const conflitos = [];
  for (const k of areas) {
    const v = mesclarValor(b[k], m[k], r[k], k, conflitos);
    if (v !== undefined) estado[k] = v;
  }
  return { estado, conflitos };
}
