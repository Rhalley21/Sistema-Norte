const BANCO_INTELIGENCIA = {
  'Liderança': {
    competencias:['Visão estratégica','Tomada de decisão','Gestão de pessoas e equipes','Comunicação institucional'],
    indicadoresN:[
      {nome:'Domínio da estratégia e do mercado de atuação', competencia:'Visão estratégica'},
      {nome:'Conhecimento de gestão financeira e orçamentária', competencia:'Tomada de decisão'},
      {nome:'Conhecimento das políticas e processos internos da área', competencia:'Gestão de pessoas e equipes'},
      {nome:'Visão sobre tendências e concorrência do setor', competencia:'Comunicação institucional'},
      {nome:'Conhecimento das ferramentas de gestão utilizadas pela liderança', competencia:'Visão estratégica'},
    ],
    indicadoresO:[
      {nome:'Capacidade de organizar e priorizar a agenda estratégica', competencia:'Visão estratégica'},
      {nome:'Qualidade das decisões tomadas sob pressão', competencia:'Tomada de decisão'},
      {nome:'Condução eficaz de reuniões e alinhamentos com a equipe', competencia:'Gestão de pessoas e equipes'},
      {nome:'Delegação adequada de responsabilidades', competencia:'Comunicação institucional'},
      {nome:'Comunicação clara de diretrizes para os demais níveis', competencia:'Visão estratégica'},
    ],
    indicadoresR:[
      {nome:'Atingimento das metas estratégicas da área/empresa', competencia:'Visão estratégica'},
      {nome:'Sustentabilidade dos resultados no médio prazo', competencia:'Tomada de decisão'},
      {nome:'Desenvolvimento de sucessores e de novas lideranças', competencia:'Gestão de pessoas e equipes'},
      {nome:'Qualidade do clima e engajamento da equipe liderada', competencia:'Comunicação institucional'},
      {nome:'Contribuição para o crescimento consistente da organização', competencia:'Visão estratégica'},
    ],
  },
  'Coordenação': {
    competencias:['Organização de equipes','Resolução de problemas do dia a dia','Comunicação com múltiplos níveis','Gestão de prazos'],
    indicadoresN:[
      {nome:'Conhecimento técnico do processo coordenado', competencia:'Organização de equipes'},
      {nome:'Domínio de ferramentas de gestão da rotina', competencia:'Resolução de problemas do dia a dia'},
      {nome:'Conhecimento das normas e procedimentos da área', competencia:'Comunicação com múltiplos níveis'},
      {nome:'Capacidade de treinar e orientar a equipe tecnicamente', competencia:'Gestão de prazos'},
      {nome:'Conhecimento dos indicadores de desempenho da área coordenada', competencia:'Organização de equipes'},
    ],
    indicadoresO:[
      {nome:'Qualidade na distribuição e acompanhamento das tarefas da equipe', competencia:'Organização de equipes'},
      {nome:'Capacidade de resolver desvios operacionais rapidamente', competencia:'Resolução de problemas do dia a dia'},
      {nome:'Organização de escalas, prazos e prioridades do dia a dia', competencia:'Comunicação com múltiplos níveis'},
      {nome:'Comunicação clara de metas e expectativas à equipe', competencia:'Gestão de prazos'},
      {nome:'Acompanhamento próximo da rotina e das entregas da equipe', competencia:'Organização de equipes'},
    ],
    indicadoresR:[
      {nome:'Cumprimento das metas da equipe/processo coordenado', competencia:'Organização de equipes'},
      {nome:'Redução de retrabalho e não conformidades', competencia:'Resolução de problemas do dia a dia'},
      {nome:'Produtividade geral da equipe sob coordenação', competencia:'Comunicação com múltiplos níveis'},
      {nome:'Qualidade da entrega frente aos prazos combinados', competencia:'Gestão de prazos'},
      {nome:'Consistência dos resultados entre os membros da equipe', competencia:'Organização de equipes'},
    ],
  },
  'Operacional': {
    competencias:['Atenção a detalhes','Disciplina e cumprimento de normas','Trabalho em equipe','Agilidade na execução'],
    indicadoresN:[
      {nome:'Conhecimento técnico das ferramentas/equipamentos utilizados', competencia:'Atenção a detalhes'},
      {nome:'Domínio dos procedimentos operacionais padrão', competencia:'Disciplina e cumprimento de normas'},
      {nome:'Conhecimento das normas de segurança aplicáveis à função', competencia:'Trabalho em equipe'},
      {nome:'Capacidade de identificar e reportar falhas no processo', competencia:'Agilidade na execução'},
      {nome:'Conhecimento do fluxo completo do processo em que atua', competencia:'Atenção a detalhes'},
    ],
    indicadoresO:[
      {nome:'Qualidade e precisão na execução das tarefas', competencia:'Atenção a detalhes'},
      {nome:'Cumprimento de prazos operacionais estabelecidos', competencia:'Disciplina e cumprimento de normas'},
      {nome:'Organização do próprio posto/rotina de trabalho', competencia:'Trabalho em equipe'},
      {nome:'Registro correto de informações e apontamentos da rotina', competencia:'Agilidade na execução'},
      {nome:'Colaboração com os demais membros da equipe operacional', competencia:'Atenção a detalhes'},
    ],
    indicadoresR:[
      {nome:'Atingimento de metas individuais de produtividade', competencia:'Atenção a detalhes'},
      {nome:'Redução de falhas, retrabalho ou desperdício', competencia:'Disciplina e cumprimento de normas'},
      {nome:'Contribuição para o resultado da equipe/turno', competencia:'Trabalho em equipe'},
      {nome:'Consistência da entrega ao longo do período avaliado', competencia:'Agilidade na execução'},
      {nome:'Cumprimento integral das rotinas sob sua responsabilidade', competencia:'Atenção a detalhes'},
    ],
  },
  'Administrativo/Financeiro': {
    competencias:['Organização e atenção a detalhes','Confidencialidade e ética no trato de informações','Comunicação escrita','Raciocínio analítico'],
    indicadoresN:[
      {nome:'Conhecimento técnico da área (financeira, contábil, RH, etc.)', competencia:'Organização e atenção a detalhes'},
      {nome:'Domínio de sistemas e ferramentas utilizados na rotina', competencia:'Confidencialidade e ética no trato de informações'},
      {nome:'Conhecimento das políticas internas e obrigações legais da área', competencia:'Comunicação escrita'},
      {nome:'Capacidade de interpretar relatórios e dados da área', competencia:'Raciocínio analítico'},
      {nome:'Conhecimento dos processos das áreas com que se relaciona', competencia:'Organização e atenção a detalhes'},
    ],
    indicadoresO:[
      {nome:'Organização e cumprimento de prazos das rotinas administrativas', competencia:'Organização e atenção a detalhes'},
      {nome:'Qualidade e exatidão das informações produzidas', competencia:'Confidencialidade e ética no trato de informações'},
      {nome:'Registro correto e organizado de documentos e processos', competencia:'Comunicação escrita'},
      {nome:'Comunicação clara com outras áreas sobre pendências', competencia:'Raciocínio analítico'},
      {nome:'Cuidado com a confidencialidade das informações tratadas', competencia:'Organização e atenção a detalhes'},
    ],
    indicadoresR:[
      {nome:'Cumprimento dos indicadores de prazo e conformidade da área', competencia:'Organização e atenção a detalhes'},
      {nome:'Contribuição para redução de custos/erros administrativos', competencia:'Confidencialidade e ética no trato de informações'},
      {nome:'Qualidade dos relatórios e informações entregues à gestão', competencia:'Comunicação escrita'},
      {nome:'Cumprimento de obrigações legais/fiscais dentro do prazo', competencia:'Raciocínio analítico'},
      {nome:'Confiabilidade das informações entregues a outras áreas', competencia:'Organização e atenção a detalhes'},
    ],
  },
  'Comercial': {
    competencias:['Negociação','Orientação a resultados','Relacionamento com clientes','Resiliência'],
    indicadoresN:[
      {nome:'Conhecimento do produto/serviço e do mercado de atuação', competencia:'Negociação'},
      {nome:'Domínio de técnicas de negociação e vendas', competencia:'Orientação a resultados'},
      {nome:'Conhecimento dos concorrentes diretos da região/segmento', competencia:'Relacionamento com clientes'},
      {nome:'Domínio do fluxo interno que impacta o atendimento ao cliente', competencia:'Resiliência'},
      {nome:'Conhecimento das políticas comerciais e condições praticadas', competencia:'Negociação'},
    ],
    indicadoresO:[
      {nome:'Qualidade do atendimento e relacionamento com o cliente', competencia:'Negociação'},
      {nome:'Organização da carteira e da rotina comercial', competencia:'Orientação a resultados'},
      {nome:'Registro de visitas, follow-ups e negociações no CRM', competencia:'Relacionamento com clientes'},
      {nome:'Qualidade e clareza das propostas comerciais apresentadas', competencia:'Resiliência'},
      {nome:'Cumprimento do roteiro/planejamento comercial estabelecido', competencia:'Negociação'},
    ],
    indicadoresR:[
      {nome:'Atingimento de metas de vendas/receita', competencia:'Negociação'},
      {nome:'Taxa de conversão e retenção de clientes', competencia:'Orientação a resultados'},
      {nome:'Captação de novos clientes dentro da meta estabelecida', competencia:'Relacionamento com clientes'},
      {nome:'Manutenção do ticket médio dentro do esperado', competencia:'Resiliência'},
      {nome:'Expansão do volume de negócios na carteira já ativa', competencia:'Negociação'},
    ],
  },
  'Público': {
    competencias:['Conhecimento normativo/legal','Ética e conduta no serviço público','Atendimento ao cidadão','Organização processual'],
    indicadoresN:[
      {nome:'Conhecimento da legislação e normas aplicáveis ao órgão', competencia:'Conhecimento normativo/legal'},
      {nome:'Domínio dos sistemas e processos administrativos do setor público', competencia:'Ética e conduta no serviço público'},
      {nome:'Conhecimento dos fluxos e prazos processuais do órgão', competencia:'Atendimento ao cidadão'},
      {nome:'Capacidade de interpretar e aplicar normativas corretamente', competencia:'Organização processual'},
      {nome:'Conhecimento das competências e limites do próprio cargo', competencia:'Conhecimento normativo/legal'},
    ],
    indicadoresO:[
      {nome:'Qualidade e conformidade na análise/condução de processos', competencia:'Conhecimento normativo/legal'},
      {nome:'Cumprimento de prazos legais e processuais', competencia:'Ética e conduta no serviço público'},
      {nome:'Organização e registro correto da documentação processual', competencia:'Atendimento ao cidadão'},
      {nome:'Clareza e cordialidade no atendimento ao público', competencia:'Organização processual'},
      {nome:'Colaboração com outras áreas/órgãos quando necessário', competencia:'Conhecimento normativo/legal'},
    ],
    indicadoresR:[
      {nome:'Contribuição para os indicadores de eficiência do órgão', competencia:'Conhecimento normativo/legal'},
      {nome:'Qualidade do atendimento prestado ao cidadão/público interno', competencia:'Ética e conduta no serviço público'},
      {nome:'Redução de pendências e processos em atraso', competencia:'Atendimento ao cidadão'},
      {nome:'Conformidade dos processos concluídos sob sua responsabilidade', competencia:'Organização processual'},
      {nome:'Consistência no cumprimento das metas do setor/órgão', competencia:'Conhecimento normativo/legal'},
    ],
  },
};

/* ---------- Base de Cargos (CBO) — biblioteca inicial ----------
   Ocupações comuns cobrindo as famílias do documento funcional
   (Liderança, Coordenação, Operacional, Administrativo/Financeiro,
   Comercial, Público). NÃO é a tabela oficial completa do CBO
   (milhares de códigos, em http://www.mtecbo.gov.br) — é um ponto
   de partida; confira os códigos antes de uso oficial. */
