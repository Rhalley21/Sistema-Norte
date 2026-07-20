/* =========================================================
   GERADOR DE DADOS DE TESTE
   -----------------------------------------------------------
   Preenche a empresa atualmente logada com uma estrutura,
   cultura, cargos publicados, colaboradores vinculados e um
   ciclo de avaliação de exemplo — tudo de uma vez, para testes.
   Não apaga nada que já exista: só adiciona por cima.
   ========================================================= */

function gerarCNPJValido(){
  const aleatorio = () => Math.floor(Math.random()*9);
  let base = Array.from({length:12}, aleatorio);
  const calcularDigito = (arr, pesos) => {
    const soma = arr.reduce((acc,d,i)=>acc + d*pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = calcularDigito(base, [5,4,3,2,9,8,7,6,5,4,3,2]);
  const d2 = calcularDigito([...base, d1], [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return base.join('') + String(d1) + String(d2);
}

async function gerarDadosTeste(){
  showToast('Gerando dados de teste — isso leva alguns segundos…');

  // 1) Empresa (só preenche/ativa se ainda não estiver ativa)
  if(!state.empresa || state.empresa.estado !== 'Ativa'){
    const cnpj = gerarCNPJValido();
    const { error } = await sb.from('empresas').update({ cnpj }).eq('id', empresaIdAtual);
    state.empresa = {
      razaoSocial: 'Empresa de Testes NORTE Ltda',
      nomeFantasia: 'NORTE Testes',
      cnpj: error ? '' : cnpj,
      segmento: 'Serviços', porte: 'pequena', tipo: 'privada',
      logotipo: '', enderecos: ['Rua de Testes, 100 — Centro'],
      faturamento: { plano:'Profissional', valorMensal:'499.00', dataInicio: new Date().toISOString().slice(0,10), formaPagamento:'Pix' },
      estado: 'Ativa',
    };
    registrarAuditoria('empresa.criada', { razaoSocial: state.empresa.razaoSocial, teste:true });
  }

  // 2) Estrutura Organizacional (Unidade → Departamento/Setor → Equipe)
  const unidade = { id: uid(), nome:'Unidade Central (Teste)', tipo:'unidade', paiId:null, responsavelId: meuPerfilId };
  const departamento = { id: uid(), nome:'Departamento Comercial (Teste)', tipo:'departamento', paiId: unidade.id, responsavelId: meuPerfilId };
  const setor = { id: uid(), nome:'Setor Financeiro (Teste)', tipo:'setor', paiId: unidade.id, responsavelId: null };
  const equipe = { id: uid(), nome:'Equipe de Vendas (Teste)', tipo:'equipe', paiId: departamento.id, responsavelId: null };
  state.estrutura.push(unidade, departamento, setor, equipe);
  registrarAuditoria('estrutura.criada', { nome: unidade.nome, teste:true });

  // 3) Cultura Organizacional
  if(!state.cultura.missao){
    state.cultura.missao = 'Ajudar empresas a desenvolverem pessoas através de avaliações justas e planos de ação claros.';
    state.cultura.visao = 'Ser a metodologia de desenvolvimento humano mais confiável do mercado até 2030.';
    state.cultura.valores = 'Transparência, Evolução contínua, Respeito às pessoas, Excelência técnica';
  }
  // Os indicadores padrão de T e E já vêm pré-carregados automaticamente
  // (garantirIndicadoresPadraoCultura) — não precisa duplicar aqui.

  // 4) Cargos — importa 2 da Base CBO e já publica com indicadores do Banco de Inteligência
  const cargosParaCriar = [
    CBO_MOCK.find(c=>c.codigo==='2524-05'), // Analista de Recursos Humanos
    CBO_MOCK.find(c=>c.codigo==='1414-05'), // Gerente Comercial
  ];
  const cargosPublicados = [];
  cargosParaCriar.forEach(src=>{
    if(!src) return;
    const banco = BANCO_INTELIGENCIA[src.familia];
    const cargo = {
      id: uid(), nome: src.nome, familia: src.familia, natureza: src.natureza, cbo: src.codigo, origemCBO:true,
      indicadoresN: banco ? banco.indicadoresN.map(item=>({id:uid(), nome:item.nome, competencia:item.competencia})) : [{id:uid(), nome:'Conhecimento técnico'}],
      indicadoresO: banco ? banco.indicadoresO.map(item=>({id:uid(), nome:item.nome, competencia:item.competencia})) : [{id:uid(), nome:'Qualidade na execução'}],
      indicadoresR: banco ? banco.indicadoresR.map(item=>({id:uid(), nome:item.nome, competencia:item.competencia})) : [{id:uid(), nome:'Atingimento de metas'}],
      sugestoes: null,
      desenho: {
        versao:1, aprovado:true, dataAprovacao: new Date().toISOString().slice(0,10),
        sumario: src.sumario,
        atividadesEspecificas: src.atividades.split(';').map(s=>s.trim()).filter(Boolean),
        culturaPostura: 'Atuar de forma colaborativa e alinhada aos valores institucionais.',
        requisitos: src.requisitos,
      },
      versoes: [],
      descontinuado: false,
    };
    cargo.versoes.push({
      versao:1, data: new Date().toISOString().slice(0,10), motivo:'Publicação inicial (dados de teste)',
      sumario: cargo.desenho.sumario, atividadesEspecificas:[...cargo.desenho.atividadesEspecificas],
      culturaPostura: cargo.desenho.culturaPostura, requisitos: cargo.desenho.requisitos,
      indicadoresN: cargo.indicadoresN.map(i=>({...i})), indicadoresO: cargo.indicadoresO.map(i=>({...i})), indicadoresR: cargo.indicadoresR.map(i=>({...i})),
    });
    state.cargos.push(cargo);
    cargosPublicados.push(cargo);
  });

  // 5) Colaboradores — vinculados a unidade/setor/cargo, com você como gestor direto (placeholder de teste)
  const nomes = ['Marina Duarte', 'Ricardo Alves'];
  const colaboradoresCriados = [];
  nomes.forEach((nome, i)=>{
    const cargo = cargosPublicados[i % cargosPublicados.length];
    if(!cargo) return;
    const colaborador = {
      id: uid(), nome, cargoId: cargo.id,
      unidadeId: unidade.id, setorId: (i%2===0? setor.id : equipe.id),
      gestorPerfilId: meuPerfilId, versaoCargoVinculada: cargo.desenho.versao,
      perfilId: null, admissao: new Date().toISOString().slice(0,10),
      movimentacoes: [{ id: uid(), data: new Date().toISOString().slice(0,10), tipo:'Cadastro inicial', detalhes:`Cadastrado no cargo "${cargo.nome}" (v${cargo.desenho.versao}) — dado de teste` }],
    };
    state.colaboradores.push(colaborador);
    colaboradoresCriados.push(colaborador);
  });

  // 6) Um ciclo de avaliação já aberto, pronto pra testar o fluxo sequencial
  if(colaboradoresCriados[0]){
    const p = colaboradoresCriados[0];
    const cargo = state.cargos.find(c=>c.id===p.cargoId);
    const ciclo = {
      id: uid(), colaboradorId: p.id, cargoId: p.cargoId, estado:'Aberto', etapa:'colaborador',
      dataAbertura: new Date().toISOString().slice(0,10),
      prazoLimite: new Date(Date.now()+30*24*60*60*1000).toISOString().slice(0,10),
      ausencias: [], notas:{colaborador:{}, gestor:{}, rh:{}},
      indicadoresSnapshot: todosIndicadores(cargo),
      diagnostico:null, pdiDesenvolvimento:null, pdiMentalidade:null,
    };
    state.ciclos.push(ciclo);
  }

  showToast('Dados de teste gerados: empresa, estrutura, cultura, 2 cargos publicados, 2 colaboradores e 1 ciclo aberto.');
  render();
}
