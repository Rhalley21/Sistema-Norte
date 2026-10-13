/* =========================================================
   GERADOR DE DADOS DE TESTE
   -----------------------------------------------------------
   Preenche a empresa atualmente logada com dados completos de
   TODOS os módulos do sistema — pensado pra apresentação/demo,
   não só um exemplo mínimo. Reaproveita as mesmas funções de
   cálculo do sistema real (consolidarCiclo, etc.) pra garantir
   que os números fiquem consistentes com o que a tela mostra.
   Não apaga nada que já exista: só adiciona por cima. As partes
   que vivem no servidor (NR1 e Ponto) são preenchidas via Edge
   Function, em modo "melhor esforço" — se a empresa não tiver
   esses módulos configurados ainda, essa parte é só ignorada.
   ========================================================= */

function gerarCNPJValido() {
  const aleatorio = () => Math.floor(Math.random() * 9);
  let base = Array.from({ length: 12 }, aleatorio);
  const calcularDigito = (arr, pesos) => {
    const soma = arr.reduce((acc, d, i) => acc + d * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = calcularDigito(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calcularDigito([...base, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base.join('') + String(d1) + String(d2);
}

// Preenche as notas dos 3 avaliadores pra um ciclo, com uma tendência
// (viés) escolhida, e chama a função REAL de consolidação do sistema —
// assim o diagnóstico e o PDI saem calculados de verdade, não inventados.
function _dtPreencherEConsolidar(ciclo, cargo, viesPositivo) {
  const indicadores = todosIndicadores(cargo, ciclo);
  const sortear = () => {
    const r = Math.random();
    if (viesPositivo === 'boa') return r < 0.7 ? 'A' : r < 0.9 ? 'D' : 'I';
    if (viesPositivo === 'fraca') return r < 0.5 ? 'I' : r < 0.85 ? 'D' : 'A';
    return r < 0.4 ? 'A' : r < 0.8 ? 'D' : 'I'; // 'mista'
  };
  indicadores.forEach((ind) => {
    ciclo.notas.colaborador[ind.id] = sortear();
    ciclo.notas.gestor[ind.id] = sortear();
    ciclo.notas.rh[ind.id] = sortear();
  });
  consolidarCiclo(ciclo.id);
}

async function gerarDadosTeste() {
  showToast('Gerando dados de teste completos — isso leva alguns segundos…');

  // 1) Empresa
  if (!state.empresa || state.empresa.estado !== 'Ativa') {
    const cnpj = gerarCNPJValido();
    const { error } = await sb.from('empresas').update({ cnpj }).eq('id', empresaIdAtual);
    state.empresa = {
      razaoSocial: 'Empresa de Testes NORTE Ltda',
      nomeFantasia: 'NORTE Testes',
      cnpj: error ? '' : cnpj,
      segmento: 'Serviços',
      porte: 'pequena',
      tipo: 'privada',
      logotipo: '',
      enderecos: ['Rua de Testes, 100 — Centro'],
      faturamento: {
        plano: 'Profissional',
        valorMensal: '499.00',
        dataInicio: hojeLocalISO(),
        formaPagamento: 'Pix',
      },
      estado: 'Ativa',
    };
    registrarAuditoria('empresa.criada', { razaoSocial: state.empresa.razaoSocial, teste: true });
  }

  // 2) Estrutura Organizacional — uma árvore mais completa, pra tela de
  // Estrutura não ficar vazia numa apresentação.
  const unidade = { id: uid(), nome: 'Matriz (Teste)', tipo: 'unidade', paiId: null, responsavelId: meuPerfilId };
  const depComercial = {
    id: uid(),
    nome: 'Comercial (Teste)',
    tipo: 'departamento',
    paiId: unidade.id,
    responsavelId: meuPerfilId,
  };
  const depAdmFin = {
    id: uid(),
    nome: 'Administrativo/Financeiro (Teste)',
    tipo: 'departamento',
    paiId: unidade.id,
    responsavelId: null,
  };
  const setorFinanceiro = {
    id: uid(),
    nome: 'Financeiro (Teste)',
    tipo: 'setor',
    paiId: depAdmFin.id,
    responsavelId: null,
  };
  const setorRH = {
    id: uid(),
    nome: 'Recursos Humanos (Teste)',
    tipo: 'setor',
    paiId: depAdmFin.id,
    responsavelId: null,
  };
  const equipeVendas = {
    id: uid(),
    nome: 'Equipe de Vendas (Teste)',
    tipo: 'equipe',
    paiId: depComercial.id,
    responsavelId: null,
  };
  const equipeSuporte = {
    id: uid(),
    nome: 'Suporte Comercial (Teste)',
    tipo: 'equipe',
    paiId: depComercial.id,
    responsavelId: null,
  };
  state.estrutura.push(unidade, depComercial, depAdmFin, setorFinanceiro, setorRH, equipeVendas, equipeSuporte);
  registrarAuditoria('estrutura.criada', { nome: unidade.nome, teste: true });

  // 3) Cultura Organizacional
  if (!state.cultura.missao) {
    state.cultura.missao =
      'Ajudar empresas a desenvolverem pessoas através de avaliações justas e planos de ação claros.';
    state.cultura.visao = 'Ser a metodologia de desenvolvimento humano mais confiável do mercado até 2030.';
    state.cultura.valores = 'Transparência, Evolução contínua, Respeito às pessoas, Excelência técnica';
  }
  // Os indicadores padrão de T e E já vêm pré-carregados automaticamente
  // (garantirIndicadoresPadraoCultura) — não precisa duplicar aqui.

  // 4) Cargos — 7 cargos variados da Base CBO, todos publicados com
  // indicadores do Banco de Inteligência.
  const codigosEscolhidos = ['2524-05', '1414-05', '2522-05', '3542-05', '5211-10', '4110-05', '3542-15'];
  const cargosPublicados = [];
  codigosEscolhidos.forEach((codigo) => {
    const src = CBO_MOCK.find((c) => c.codigo === codigo);
    if (!src) return;
    const banco = BANCO_INTELIGENCIA[src.familia];
    const cargo = {
      id: uid(),
      nome: src.nome,
      familia: src.familia,
      natureza: src.natureza,
      cbo: src.codigo,
      origemCBO: true,
      indicadoresN: banco
        ? banco.indicadoresN.map((item) => ({ id: uid(), nome: item.nome, competencia: item.competencia }))
        : [{ id: uid(), nome: 'Conhecimento técnico' }],
      indicadoresO: banco
        ? banco.indicadoresO.map((item) => ({ id: uid(), nome: item.nome, competencia: item.competencia }))
        : [{ id: uid(), nome: 'Qualidade na execução' }],
      indicadoresR: banco
        ? banco.indicadoresR.map((item) => ({ id: uid(), nome: item.nome, competencia: item.competencia }))
        : [{ id: uid(), nome: 'Atingimento de metas' }],
      sugestoes: null,
      desenho: {
        versao: 1,
        aprovado: true,
        dataAprovacao: hojeLocalISO(),
        area: src.area,
        nivelHierarquico: src.nivelHierarquico,
        regimeTrabalho: src.regimeTrabalho,
        subordinacao: src.subordinacao,
        subordinadosDiretos: src.subordinadosDiretos,
        localTrabalho: src.localTrabalho,
        missao: src.missao,
        responsabilidades: [...src.responsabilidades],
        culturaPostura: 'Atuar de forma colaborativa e alinhada aos valores institucionais.',
        formacaoAcademica: src.formacaoAcademica,
        experienciaProfissional: src.experienciaProfissional,
        conhecimentosTecnicos: src.conhecimentosTecnicos,
        idiomas: src.idiomas,
        competenciasComportamentais: [...src.competenciasComportamentais],
        ferramentasSistemas: [...src.ferramentasSistemas],
        kpis: [...src.kpis],
        condicoesTrabalho: src.condicoesTrabalho,
        perspectivasCarreira: [...src.perspectivasCarreira],
      },
      versoes: [],
      descontinuado: false,
    };
    cargo.versoes.push({
      versao: 1,
      data: hojeLocalISO(),
      motivo: 'Publicação inicial (dados de teste)',
      area: cargo.desenho.area,
      nivelHierarquico: cargo.desenho.nivelHierarquico,
      regimeTrabalho: cargo.desenho.regimeTrabalho,
      subordinacao: cargo.desenho.subordinacao,
      subordinadosDiretos: cargo.desenho.subordinadosDiretos,
      localTrabalho: cargo.desenho.localTrabalho,
      missao: cargo.desenho.missao,
      responsabilidades: [...cargo.desenho.responsabilidades],
      culturaPostura: cargo.desenho.culturaPostura,
      formacaoAcademica: cargo.desenho.formacaoAcademica,
      experienciaProfissional: cargo.desenho.experienciaProfissional,
      conhecimentosTecnicos: cargo.desenho.conhecimentosTecnicos,
      idiomas: cargo.desenho.idiomas,
      competenciasComportamentais: [...cargo.desenho.competenciasComportamentais],
      ferramentasSistemas: [...cargo.desenho.ferramentasSistemas],
      kpis: [...cargo.desenho.kpis],
      condicoesTrabalho: cargo.desenho.condicoesTrabalho,
      perspectivasCarreira: [...cargo.desenho.perspectivasCarreira],
      indicadoresN: cargo.indicadoresN.map((i) => ({ ...i })),
      indicadoresO: cargo.indicadoresO.map((i) => ({ ...i })),
      indicadoresR: cargo.indicadoresR.map((i) => ({ ...i })),
    });
    state.cargos.push(cargo);
    cargosPublicados.push(cargo);
  });

  // 5) Colaboradores — 10, distribuídos pelos cargos e pela estrutura.
  const nomes = [
    'Marina Duarte',
    'Ricardo Alves',
    'Fernanda Costa',
    'Bruno Lima',
    'Camila Rocha',
    'Diego Santos',
    'Elaine Souza',
    'Felipe Martins',
    'Gabriela Nunes',
    'Henrique Pires',
  ];
  const setoresRodizio = [equipeVendas.id, equipeSuporte.id, setorFinanceiro.id, setorRH.id];
  const colaboradoresCriados = [];
  nomes.forEach((nome, i) => {
    const cargo = cargosPublicados[i % cargosPublicados.length];
    if (!cargo) return;
    const colaborador = {
      id: uid(),
      nome,
      cargoId: cargo.id,
      unidadeId: unidade.id,
      setorId: setoresRodizio[i % setoresRodizio.length],
      gestorPerfilId: meuPerfilId,
      versaoCargoVinculada: cargo.desenho.versao,
      perfilId: null,
      admissao: dataLocalISO(new Date(Date.now() - (365 + i * 40) * 86400000)),
      movimentacoes: [
        {
          id: uid(),
          data: hojeLocalISO(),
          tipo: 'Cadastro inicial',
          detalhes: `Cadastrado no cargo "${cargo.nome}" (v${cargo.desenho.versao}) — dado de teste`,
        },
      ],
    };
    state.colaboradores.push(colaborador);
    colaboradoresCriados.push(colaborador);
  });

  // 6) Ciclos de avaliação — um por colaborador, em estados variados, pra
  // mostrar o fluxo inteiro numa apresentação: abertos, com pendência, e
  // consolidados (com diagnóstico e PDI de verdade, calculados pelo motor
  // real do sistema).
  colaboradoresCriados.forEach((p, i) => {
    const cargo = state.cargos.find((c) => c.id === p.cargoId);
    const base = {
      id: uid(),
      colaboradorId: p.id,
      cargoId: p.cargoId,
      etapa: 'colaborador',
      tipoAvaliacao: 'assincrono',
      dataAbertura: dataLocalISO(new Date(Date.now() - 25 * 86400000)),
      prazoLimite: dataLocalISO(new Date(Date.now() + 5 * 86400000)),
      ausencias: [],
      notas: { colaborador: {}, gestor: {}, rh: {}, consolidado: {} },
      indicadoresSnapshot: todosIndicadores(cargo),
      diagnostico: null,
      pdiDesenvolvimento: null,
      pdiMentalidade: null,
    };
    if (i < 2) {
      // Aberto — ainda na autoavaliação.
      state.ciclos.push({ ...base, estado: 'Aberto' });
    } else if (i < 4) {
      // Pendência de avaliador — colaborador já respondeu, falta o líder.
      const indicadores = todosIndicadores(cargo, base);
      indicadores.forEach((ind) => (base.notas.colaborador[ind.id] = ['A', 'D', 'I'][Math.floor(Math.random() * 3)]));
      state.ciclos.push({ ...base, estado: 'Pendência de Avaliador', etapa: 'lider' });
    } else {
      // Consolidado — diagnóstico e PDI gerados de verdade.
      state.ciclos.push(base);
      const ciclo = state.ciclos[state.ciclos.length - 1];
      const vies = i % 3 === 0 ? 'fraca' : i % 3 === 1 ? 'mista' : 'boa';
      _dtPreencherEConsolidar(ciclo, cargo, vies);
      if (i % 2 === 0) {
        ciclo.reuniaoFeedback = {
          realizada: true,
          data: hojeLocalISO(),
          notas: 'Reunião de feedback registrada como parte dos dados de demonstração.',
        };
        if (ciclo.pdiDesenvolvimento?.[0]) {
          ciclo.pdiDesenvolvimento[0].status = 'concluído';
          ciclo.pdiDesenvolvimento[0].evidencia = 'Evidência de exemplo anexada para demonstração.';
        }
      }
    }
  });

  // 7) Feedback contínuo (check-ins informais)
  colaboradoresCriados.slice(0, 3).forEach((p, i) => {
    state.feedbackContinuo.push({
      id: uid(),
      colaboradorId: p.id,
      autorPerfilId: meuPerfilId,
      texto: [
        'Ótima entrega no projeto desta semana, continue assim!',
        'Conversamos sobre prioridades — alinhado.',
        'Parabéns pela iniciativa no atendimento ao cliente.',
      ][i],
      criadoEm: new Date(Date.now() - (i + 1) * 3 * 86400000).toISOString(),
    });
  });

  // 8) Pesquisa de clima — uma encerrada, com respostas anônimas de
  // exemplo, pra mostrar o resultado consolidado sem precisar que ninguém
  // responda de verdade.
  const climaRespostas = [9, 10, 8, 6, 9, 7, 5, 10, 8, 9, 4, 8].map((nota) => ({
    nota,
    comentario:
      nota >= 9
        ? 'Ambiente muito bom, equipe unida.'
        : nota <= 5
          ? 'Poderia melhorar a comunicação entre setores.'
          : '',
    respondidoEm: new Date(Date.now() - Math.floor(Math.random() * 10) * 86400000).toISOString(),
  }));
  state.pesquisasClima.push({
    id: uid(),
    titulo: 'Pesquisa de Clima — 1º Trimestre (Demonstração)',
    pergunta: 'De 0 a 10, o quanto você recomendaria esta empresa como um bom lugar para trabalhar?',
    tipo: 'eNPS',
    ativa: false,
    criadoEm: new Date(Date.now() - 20 * 86400000).toISOString(),
    criadoPor: meuPerfilId,
    respostas: climaRespostas,
    jaResponderam: [],
  });

  // 9) NR1 — SST, risco e ação de exemplo (client-side); campanha com
  // respostas fica no servidor (melhor esforço — só funciona se a Edge
  // Function "nr1" já estiver implantada).
  garantirDimensoesNr1();
  if (!state.nr1.sst) {
    state.nr1.sst = {
      nome: 'Dra. Patrícia Andrade — Consultoria SST',
      contato: 'contato@sstexemplo.com.br',
      definidoEm: new Date().toISOString(),
    };
  }
  const riscoTeste = {
    id: uid(),
    descricao: 'Sobrecarga de trabalho identificada na Equipe de Vendas nos horários de pico (dado de demonstração).',
    dimensaoId: state.nr1.dimensoes[0]?.id || null,
    grupoAfetado: equipeVendas.nome,
    probabilidade: 4,
    severidade: 3,
    nivel: nivelRiscoNr1(4, 3).nivel,
    decisao: 'reduzir',
    ...novoCarimbo(),
  };
  state.nr1.riscos.push(riscoTeste);
  state.nr1.acoes.push({
    id: uid(),
    riscoId: riscoTeste.id,
    titulo: 'Contratar reforço temporário para o horário de pico (exemplo)',
    tipo: 'reducao',
    responsavelId: meuPerfilId,
    prazo: dataLocalISO(new Date(Date.now() + 20 * 86400000)),
    status: 'em_andamento',
    evidencia: '',
    eficacia: null,
    ...novoCarimbo(),
  });
  try {
    await sb.functions.invoke('nr1', {
      body: {
        action: 'seed_demo',
        dimensoesSnapshot: state.nr1.dimensoes,
        setoresIds: [equipeVendas.id, equipeSuporte.id, setorFinanceiro.id],
      },
    });
  } catch (e) {
    console.warn(
      'Não foi possível gerar a campanha de demonstração do NR1 (Edge Function "nr1" pode não estar implantada ainda).',
      e
    );
  }

  // 10) R&S — requisição aprovada e publicada, com candidatos em etapas
  // variadas do pipeline.
  garantirRS();
  const cargoParaVaga = cargosPublicados[0];
  if (cargoParaVaga) {
    const requisicaoTeste = {
      id: uid(),
      codigo: `REQ-${String(state.rs.requisicoes.length + 1).padStart(3, '0')}`,
      cargoId: cargoParaVaga.id,
      unidadeId: unidade.id,
      setorId: equipeVendas.id,
      quantidade: 1,
      motivo: 'Aumento de quadro',
      prazo: dataLocalISO(new Date(Date.now() + 15 * 86400000)),
      confidencial: false,
      missaoHerdada: cargoParaVaga.desenho.missao || '',
      responsabilidadesHerdadas: cargoParaVaga.desenho.responsabilidades || [],
      gestorSolicitanteId: meuPerfilId,
      status: 'aprovada',
      decididoPor: meuPerfilId,
      decididoEm: new Date().toISOString(),
      publicada: true,
      publicadaEm: new Date().toISOString(),
      encerrada: false,
      ...novoCarimbo(),
    };
    state.rs.requisicoes.push(requisicaoTeste);
    const candidatosDemo = [
      { nome: 'Juliana Ferreira', etapa: 'entrevista_fit' },
      { nome: 'Marcos Vinícius', etapa: 'triagem' },
      { nome: 'Patrícia Gomes', etapa: 'aprovado' },
      { nome: 'Rafael Teixeira', etapa: 'nova' },
    ];
    candidatosDemo.forEach((c) => {
      state.rs.candidatos.push({
        id: uid(),
        vagaId: requisicaoTeste.id,
        nome: c.nome,
        email: `${c.nome.split(' ')[0].toLowerCase()}@exemplo.com`,
        telefone: '(11) 90000-0000',
        origem: 'Cadastro manual (demonstração)',
        curriculo: '',
        etapa: c.etapa,
        reprovado: false,
        historico: [
          {
            de: null,
            para: c.etapa,
            autorId: meuPerfilId,
            em: new Date().toISOString(),
            observacao: 'Candidatura de demonstração',
          },
        ],
        ...novoCarimbo(),
      });
    });
  }

  // 11) Ponto — registros e justificativas de exemplo (melhor esforço; só
  // funciona se o módulo de Ponto estiver habilitado e a Edge Function
  // implantada).
  if (pontoHabilitado) {
    try {
      await sb.functions.invoke('ponto', { body: { action: 'gerar_dados_teste' } });
    } catch (e) {
      console.warn('Não foi possível gerar os dados de ponto de demonstração.', e);
    }
  }

  showToast(
    'Dados de teste completos gerados: estrutura, cultura, cargos, colaboradores, ciclos (abertos e consolidados), clima, NR1, R&S e ponto.'
  );
  render();
}
