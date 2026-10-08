# Planejamento de evolução da UPX8 — UniFACENS-Map

Análise inicial em 07/10/2026. Base: artigo AC1 de 26 páginas, exportação do Trello de 07/10/2026 às 18:55 e leitura do código local. Os estados dos cartões representam essa exportação, não uma consulta ao quadro ao vivo. Este documento propõe trabalho e não altera o Trello.

Incremento implementado em 08/10/2026: catálogo de locais com cadastro, API, busca, categorias e detalhes, com tratamento da ausência de chave do mapa. Isso representa evolução parcial de N01, N03 e N05; os levantamentos reais, caminhos e validação dos marcadores continuam pendentes. Execução, limites e evidências estão em [Catálogo de locais](./catalogo-locais-upx8.md).

Revisão de acessibilidade em 07/10/2026: os critérios abaixo foram complementados a partir da pesquisa normativa fornecida e da verificação estática do sistema. A cobertura do plano não comprova conformidade do aplicativo. Evidências, limites e matriz de pendências estão em [Verificação de acessibilidade](./verificacao-acessibilidade-upx8.md).

## 1. O que o artigo exige que o planejamento cubra

O objetivo é desenvolver **e avaliar** uma aplicação de navegação acessível. A AR apoia a orientação; o produto também precisa informar condições dos caminhos e oferecer uma interface utilizável pelo público atendido.

| Compromisso do artigo | Referência no PDF | Entrega necessária |
| --- | --- | --- |
| Mapear destinos, caminhos e recursos de acessibilidade | p. 11, objetivos d/e; pp. 16–19 | Levantamento de campo e dados estruturados de pontos e trechos |
| Escolher caminhos adequados às necessidades de mobilidade | pp. 16–17, seção 3.3 | Regras explícitas e cálculo de rota com restrições |
| Considerar ambientes internos e externos | p. 17, seção 3.4 | Estratégia de localização e transição delimitada para o piloto |
| Apresentar orientação contextual por AR | pp. 17–18, seção 3.5 | Marcadores associados ao percurso e posicionamento validado |
| Oferecer formas acessíveis de interação | p. 18, seção 3.6 | Orientação textual, suporte a leitor de tela e alternativa à câmera |
| Avaliar desempenho e experiência | pp. 9–11 e 21–23 | Protocolo, testes com participantes, métricas e análise |

RQ1 trata do auxílio à navegação; RQ2 trata de clareza, facilidade e utilidade. H1 aborda autonomia e dificuldade percebida; H2 aborda a percepção dos usuários. Os resultados devem confrontar essas hipóteses, inclusive quando forem negativos ou inconclusivos.

A metodologia é exploratória/descritiva e mista. O artigo não propõe demonstrar causalidade em experimento controlado. Portanto, uma comparação com/sem aplicativo, se escolhida, precisa de um procedimento definido com o orientador; uma demonstração isolada não sustenta uma afirmação de melhoria causal.

## 2. Diferença entre proposta e implementação

Os pontos abaixo preservam o diagnóstico inicial de 07/10/2026. Para as alterações posteriores, consultar o registro do incremento acima.

- Existe uma API de cadastro, consulta e exclusão de âncoras; o banco possui uma tabela de âncoras.
- Existem catálogo web e cena AR nativa, mas não foi encontrada implementação do mapa de navegação, localização GPS, grafo de caminhos ou cálculo de rotas acessíveis.
- A hospedagem nativa tenta usar um identificador temporário e, se falhar, gera um identificador simulado, mas comunica sucesso de hospedagem na nuvem. Isso não comprova a existência de uma Cloud Anchor real.
- A cena reaproveita posições cartesianas salvas antes da resolução visual. Esses valores não demonstram repetibilidade no mesmo local físico em outra sessão.
- Os hooks de TanStack Query e a store Zustand existem, mas os principais componentes de AR usam chamadas manuais à API e estado local; TanStack Form não está integrado nesses formulários.
- O guia menciona serviços e cenários geoespaciais que não estão no código atual. O README aponta `/reference`, enquanto o bootstrap serve Scalar em `/scalar`.
- Há testes da API com PostgreSQL real, mas sua existência não valida hospedagem Google, posição física, navegação ou experiência dos participantes. Não foram executados nesta análise.

O recorte inicial sugerido é um setor do campus com poucos destinos e **2–3 percursos previamente verificados**, incluindo alternativa a escadas e, se viável, uma transição para o interior de um prédio. Quantidades e cobertura são sugestões a validar no card “Definir MVP”.

## 3. Como finalizar os cartões existentes

Preservar os cartões e anexar as entregas correspondentes. Os critérios abaixo são propostas de conclusão, não uma declaração de que o trabalho já foi realizado.

| Cartão | Estado na exportação | O que falta registrar para concluir |
| --- | --- | --- |
| Definir MVP | Andamento | Setor piloto, destinos/percursos, perfis efetivamente atendidos, plataformas, funcionalidades incluídas, limites de localização/AR, critérios de aceitação e validação do PO |
| Criar personas | Andamento | Perfis com necessidades, contexto de uso e barreiras; distinguir dados observados de suposições; relacionar cada perfil a decisões de interface/rota |
| Criar requisitos não funcionais | Andamento | Requisitos numerados com métrica, condição de teste e evidência; confirmar compatibilidade real da stack; separar funcionamento offline do uso de Cloud Anchors; revisar metas sem validação, como 99% de disponibilidade e 1000 usuários |
| Criar User Stories | Andamento | Stories do fluxo escolher origem/destino → definir restrições → consultar rota → navegar → chegar; critérios verificáveis e histórias de erro/ausência de rota |
| Pesquisar soluções semelhantes | Andamento | Matriz comparativa com fontes, público, localização indoor/outdoor, roteamento acessível, interface e limitações; concluir o que será aproveitado no projeto |
| Pesquisar normas de acessibilidade | Andamento | Consolidar fontes/edições, incluindo NBR 9050:2020 Versão Corrigida:2021, NBR 16537:2024, NBR 15599:2008, NBR 17060:2022, LBI e WCAG 2.2; avaliar NBR 17225:2025 para a web; entregar matriz norma → requisito → card → método de verificação → evidência e checklist de campo/interface; conferir cláusulas ABNT no texto integral; pesquisa concluída não equivale a produto conforme |
| Mapear pontos de interesse da faculdade | Backlog | Começar pelo setor piloto; registrar identificador, nome, categoria, prédio/andar, posição ou referência, fotos, descrição, responsável e data de verificação |
| Mapear recursos de acessibilidade | Backlog | Levantar conexões, medidas relevantes de rampas/passagens, condições do piso, escadas, elevadores, entradas, sanitários, obstáculos e segmentos de sinalização tátil direcional/de alerta; registrar método, unidade, data, disponibilidade e informação desconhecida; associar fotos e critérios verificados, sem classificar o percurso somente pela presença de rampa |
| Criar protótipo inicial | Espera | Registrar e resolver o impedimento; entregar fluxo navegável do MVP, telas de rota/detalhe/preferências/AR, alternativa textual e estados de erro; validar compreensão antes da implementação |
| Registrar ata da mentoria | Andamento | Manter como atividade recorrente ou por reunião; cada ata com data, participantes, decisões, responsáveis, prazos e links; não concluir como tarefa única enquanto houver mentorias |
| Preparar primeira apresentação | Andamento | Confirmar se a apresentação ocorreu; anexar versão dos slides, registro da entrega e feedback; manter a demonstração final em card próprio |

### Cartões concluídos que merecem conferência de evidência

- **Criar requisitos funcionais:** conferir os PDFs anexados e ligar requisitos a stories/testes. Requisito documentado não significa funcionalidade implementada. Metas de tempo de resposta devem ficar nos requisitos não funcionais.
- **Definir tecnologias / Definir arquitetura inicial:** registrar React Native/Expo, ViroReact, NestJS, Drizzle e PostgreSQL como escolhas efetivas; separar serviços externos previstos de serviços realmente utilizados.
- **Elaborar documentação inicial:** preservar a entrega AC1 e abrir evolução do artigo. A metodologia ainda precisa detalhar amostra, recrutamento, percursos, instrumentos, execução e análise. Corrigir sumário/paginação e incluir a seção 2.2 no sumário.
- **Levantar necessidades de acessibilidade:** conferir se existe matriz de necessidades por perfil e sua ligação com os requisitos. O público amplo do artigo não deve ser apresentado como integralmente atendido se só alguns perfis forem validados.
- **Repositórios Remotos e Links importantes:** preencher documento, Figma, atas, pesquisa e protótipo; identificar qual versão é a referência de cada entrega.

Não é necessário reabrir todos os cartões concluídos: corrigir divergências concretas ou criar uma revisão específica, mantendo o histórico da AC1.

## 4. Novos cartões prontos para copiar

Os responsáveis são sugestões com base nos papéis do Trello, não atribuições confirmadas. Usar as etiquetas existentes. “Alta” indica dependência do MVP ou da avaliação; “Média” indica organização da entrega. Se um card superar poucos dias de trabalho, separar seus critérios em entregas menores.

### N01 — Modelar pontos, caminhos e recursos de acessibilidade

**Prioridade:** Alta. **Responsável sugerido:** Gustavo Gutierrez. **Etiquetas:** Programação, Documentação. **Dependências:** MVP e início dos dois levantamentos de campo.

**Descrição:** Definir os dados necessários para representar o setor piloto, separando local de destino, trecho percorrível e âncora AR.

**Critérios de conclusão:**

- [ ] Modelo representa prédios/andares, pontos, nós e conexões com distância e sentido de passagem.
- [ ] Trechos registram condições relevantes, disponibilidade, data de verificação e valores desconhecidos.
- [ ] Ficha e modelo contemplam medidas e evidências relevantes: largura livre, inclinação longitudinal/transversal, desníveis, piso, obstáculos, acessos e elevadores; limites normativos são preenchidos após consulta aos itens aplicáveis, com unidade e método de medição.
- [ ] Sinalização tátil é representada por segmentos direcionais/de alerta, conexões, interrupções e obstáculos; sanitário ou entrada não recebe classificação de conformidade só pelo nome/categoria.
- [ ] Âncora AR pode ser associada a um local ou etapa; metadados de expiração são previstos quando aplicáveis.
- [ ] Schemas Zod e tipos estão em `shared`; migrations e exemplos representam ao menos os percursos piloto.

### N02 — Definir regras de escolha das rotas acessíveis

**Prioridade:** Alta. **Responsável sugerido:** Henrique, com Giovanne e Gustavo Camargo. **Etiquetas:** Documentação, Programação. **Dependências:** MVP, personas, recursos mapeados.

**Descrição:** Transformar necessidades dos usuários e características físicas em regras verificáveis de roteamento.

**Critérios de conclusão:**

- [ ] Diferenciar restrição obrigatória de preferência: escadas proibidas não podem ser apenas um custo maior para o perfil correspondente.
- [ ] Definir tratamento de elevador indisponível, obstáculo, sentido de passagem e informação não verificada.
- [ ] Cada regra tem origem documentada: necessidade do usuário, preferência ou item normativo verificado. Não presumir que qualquer rampa ou trecho com piso tátil seja adequado; medida desconhecida permanece desconhecida.
- [ ] Documentar a resposta quando nenhuma rota atende às restrições.
- [ ] Exemplos mostram um caminho curto inadequado e uma alternativa adequada aos critérios escolhidos.

### N03 — Implementar API e carga dos dados do campus piloto

**Prioridade:** Alta. **Responsável sugerido:** Gustavo Gutierrez. **Etiquetas:** Programação, Testes. **Dependências:** N01 e levantamentos piloto.

**Descrição:** Persistir e disponibilizar os locais e caminhos realmente levantados.

**Critérios de conclusão:**

- [ ] Dados do piloto podem ser carregados e consultados sem depender de âncoras fictícias.
- [ ] Escritas usam schemas compartilhados; alterações relacionadas são atômicas e acesso a dados fica em repositories.
- [ ] Consultas relevantes têm índices e não executam consultas por item em loops.
- [ ] API está documentada e operações de escrita têm um modo de acesso definido para o ambiente de teste.

### N04 — Implementar cálculo de rotas com restrições

**Prioridade:** Alta. **Responsável sugerido:** Gustavo Gutierrez. **Etiquetas:** Programação, Testes. **Dependências:** N02, N03.

**Descrição:** Calcular um percurso no grafo do campus respeitando as restrições do usuário.

**Critérios de conclusão:**

- [ ] Receber origem, destino e restrições e devolver trechos ordenados, distância e informações do percurso.
- [ ] Validar alternativas com e sem escadas, elevador indisponível e destino sem conexão adequada.
- [ ] Nunca devolver um trecho proibido como alternativa supostamente acessível.
- [ ] Casos de medida ausente, barreira, interrupção de caminho e recurso indisponível seguem a política de N02; a resposta informa cobertura e restrições sem prometer acessibilidade não verificada.
- [ ] Cobrir regras do algoritmo com testes e contrato HTTP com integração real.

### N05 — Implementar mapa 2D, busca e detalhes dos locais

**Prioridade:** Alta. **Responsável sugerido:** Lucas Paifer, com Lucas Tomazeli. **Etiquetas:** Programação, Interfaces. **Dependências:** protótipo, N03.

**Descrição:** Permitir encontrar destinos e consultar recursos do piloto pela interface principal.

**Critérios de conclusão:**

- [ ] Mapa apresenta pontos reais; busca e filtros levam aos detalhes e à escolha do destino.
- [ ] Origem e destino podem ser escolhidos sem câmera; existe alternativa em lista para acessar os locais.
- [ ] A lista identifica recursos, condições conhecidas/desconhecidas e data de verificação; na versão web, os controles também devem funcionar por teclado.
- [ ] Conteúdo vem da API por TanStack Query; estados de carregamento, vazio e erro são visíveis.
- [ ] Telas ficam finas, componentes usam NativeWind e o fluxo funciona no Android definido pelo MVP.

### N06 — Implementar localização e transição indoor/outdoor do piloto

**Prioridade:** Alta. **Responsável sugerido:** Gustavo Camargo, com Lucas Paifer. **Etiquetas:** Programação, Testes. **Dependências:** MVP, N05.

**Descrição:** Definir e implementar como a aplicação identifica a origem e mantém orientação nas condições do piloto.

**Critérios de conclusão:**

- [ ] Permissões, ausência de sinal e localização imprecisa têm tratamento explícito.
- [ ] Usuário pode informar origem manualmente quando necessário.
- [ ] Estratégia indoor é escolhida e testada; pode usar pontos de referência e confirmação manual no recorte inicial.
- [ ] Transição para prédio/andar preserva o percurso sem tratar coordenadas locais de AR como posição global.

### N07 — Implementar navegação por etapas e preferências de percurso

**Prioridade:** Alta. **Responsável sugerido:** Lucas Paifer, com Lucas Tomazeli. **Etiquetas:** Programação, Interfaces. **Dependências:** N04, N05, N06.

**Descrição:** Conectar a escolha de destino ao acompanhamento de uma rota compreensível.

**Critérios de conclusão:**

- [ ] Usuário seleciona restrições do MVP e vê o percurso antes de iniciar.
- [ ] Orientação textual informa etapa atual, referência seguinte e recurso relevante, como rampa ou elevador.
- [ ] Mudança de etapa, ausência de rota e alteração relevante de disponibilidade têm mensagem acessível; apresentar a mesma informação essencial no modo textual, sem depender de cor, áudio ou cena 3D.
- [ ] É possível pausar, encerrar e confirmar avanço manual quando localização não permite detecção confiável.
- [ ] Alteração de destino/restrições e indisponibilidade de rota produzem comportamento definido.

### N08 — Corrigir hospedagem real das Cloud Anchors

**Prioridade:** Alta. **Responsável sugerido:** Gustavo Camargo. **Etiquetas:** Programação, Testes. **Dependências:** dispositivo compatível e ambiente Google configurado.

**Descrição:** Distinguir demonstração local de uma âncora efetivamente hospedada no serviço Google.

**Critérios de conclusão:**

- [ ] Hospedagem parte de uma âncora local real criada pelo motor e usa a API suportada pela versão instalada do ViroReact.
- [ ] Falha não produz identificador fictício apresentado como Cloud Anchor válido.
- [ ] Tracking insuficiente, falha de autorização, indisponibilidade e expiração têm feedback adequado.
- [ ] Evidência em aparelho mostra retorno válido do serviço, persistência do ID e política de duração utilizada.

### N09 — Validar resolução AR entre sessões e dispositivos

**Prioridade:** Alta. **Responsável sugerido:** Gustavo Camargo. **Etiquetas:** Programação, Testes. **Dependências:** N08.

**Descrição:** Comprovar que uma âncora volta ao local físico após reiniciar a sessão.

**Critérios de conclusão:**

- [ ] Não apresentar posição antiga como resolução física bem-sucedida.
- [ ] Estados de busca, resolução, perda de tracking e falha são distintos.
- [ ] Repetir abertura a partir de posições/direções diferentes; testar outro dispositivo compatível, se disponível.
- [ ] Registrar erro observado, tempo de resolução, condições de iluminação e limitações; critério tolerável é definido antes do teste.

### N10 — Integrar a orientação AR ao percurso

**Prioridade:** Alta. **Responsável sugerido:** Gustavo Camargo, com Lucas Paifer. **Etiquetas:** Programação, Interfaces, Testes. **Dependências:** N07, N09.

**Descrição:** Exibir informação relacionada à rota ativa, além do catálogo de cubos e identificadores técnicos.

**Critérios de conclusão:**

- [ ] Próxima referência/etapa corresponde ao percurso calculado e ao posicionamento validado.
- [ ] Indicações exibem linguagem de navegação e informações de acessibilidade úteis ao usuário.
- [ ] Alternar entre mapa/texto e AR preserva destino e progresso.
- [ ] Falta de suporte, permissão ou resolução permite continuar pelo modo textual/mapa.

### N11 — Integrar os padrões de estado e separar a lógica da AR

**Prioridade:** Alta. **Responsável sugerido:** Lucas Paifer, com Gustavo Camargo. **Etiquetas:** Programação, Refatoração. **Dependências:** pode começar com a base atual.

**Descrição:** Aplicar os padrões já definidos no AGENTS.MD aos componentes existentes e às novas features.

**Critérios de conclusão:**

- [ ] Dados persistidos na API usam TanStack Query; sessão compartilhada usa Zustand com seletores.
- [ ] Formulários usam TanStack Form e validação de `shared`.
- [ ] Sensores e motor AR são isolados em hooks com cleanup; pose de alta frequência permanece em refs.
- [ ] Dados resolvidos da sessão ficam separados do catálogo persistido, sem perder estados de erro ou atualização.

### N12 — Implementar e validar acessibilidade da interface

**Prioridade:** Alta. **Responsável sugerido:** Lucas Tomazeli, com Lucas Paifer. **Etiquetas:** Interfaces, Programação, Testes. **Dependências:** protótipo e fluxos N05/N07; critérios começam antes da implementação.

**Descrição:** Verificar a acessibilidade do fluxo completo para os perfis definidos no piloto.

**Meta de verificação:** WCAG 2.2 nível AA para os critérios aplicáveis ao fluxo web; para o aplicativo nativo, usar os requisitos aplicáveis da NBR 17060:2022 e os recursos de acessibilidade da plataforma, com rastreabilidade dos critérios digitais. Essa meta não representa declaração de conformidade já obtida.

**Critérios de conclusão:**

- [ ] Origem, destino, rota e controles principais são utilizáveis com TalkBack no Android piloto.
- [ ] Texto ampliado, contraste, ordem de foco, nomes dos controles e áreas de toque são verificados.
- [ ] Nome, função e estado são expostos pelos controles; o botão de atualização tem nome descritivo, exclusões identificam o item e rótulos/ajuda/erros são associados aos campos.
- [ ] Contraste de texto normal atinge 4,5:1; texto grande e componentes gráficos relevantes são avaliados pelos critérios aplicáveis, inclusive estados de foco e fundos transparentes. Corrigir os pares de cor apontados no relatório.
- [ ] Modal e teclado não ocultam o controle em foco; confirmar foco na abertura, retorno após fechamento, texto ampliado e ausência de perda de conteúdo. Na web, testar teclado e foco visível.
- [ ] Carregamento, erro e vazio são distintos e comunicados às tecnologias assistivas sem anunciar atualizações de pose a cada frame.
- [ ] Áreas de toque seguem a meta do repositório de pelo menos 44 × 44 unidades lógicas na UI nativa e 44 × 44 CSS px na web; medir a área efetiva. O mínimo WCAG 2.2 AA de 24 × 24 CSS px, com exceções, não deve ser confundido com essa meta do projeto.
- [ ] Informações não dependem apenas de cor, som ou câmera; instruções textuais têm leitura acessível.
- [ ] Checklist cita critérios aplicáveis e evidências; registrar barreiras restantes sem declarar suporte a públicos não testados.

**Referências:** [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [acessibilidade do React Native](https://reactnative.dev/docs/accessibility) e matriz da [verificação normativa](./verificacao-acessibilidade-upx8.md). Conferir requisitos ABNT no texto integral e registrar aplicabilidade por plataforma, em vez de presumir que a WCAG substitui a norma de aplicativo.

### N13 — Ampliar testes automatizados e configurar integração contínua

**Prioridade:** Alta. **Responsável sugerido:** Gustavo Gutierrez, com Lucas Paifer. **Etiquetas:** Programação, Testes, Processos Internos. **Dependências:** acompanhar N03/N04/N07.

**Descrição:** Proteger as regras e contratos essenciais e tornar a verificação reproduzível.

**Critérios de conclusão:**

- [ ] Testar restrições, inexistência de rota e respostas de validação HTTP.
- [ ] Integração utiliza PostgreSQL real, migrations e teardown, seguindo o padrão Testcontainers.
- [ ] Automatizar verificações pertinentes de tipos, lint e testes no GitHub Actions.
- [ ] Documentar o que exige aparelho físico e não é comprovado pelo pipeline.

### N14 — Executar validação técnica e presencial dos percursos piloto

**Prioridade:** Alta. **Responsável sugerido:** Gustavo Camargo, com Enzo e responsáveis pelo app/API. **Etiquetas:** Testes, Processos Externos. **Dependências:** N07, N10, N12 e dados de campo.

**Descrição:** Verificar o fluxo no campus antes das sessões de avaliação com participantes.

**Critérios de conclusão:**

- [ ] Percorrer os trajetos e conferir conectividade, barreiras e orientações em cada etapa.
- [ ] Usar a ficha de levantamento com referência normativa, medidas/evidências e situação desconhecida; distinguir recurso encontrado de condição de acessibilidade efetivamente verificada, sem apresentar o app como certificação física do campus.
- [ ] Registrar comportamento com localização imprecisa, conexão interrompida, permissão negada e falha de AR.
- [ ] Testar caminho com alternativa a escadas e situação sem alternativa adequada.
- [ ] Classificar problemas encontrados; corrigir os que impedem uso e repetir os cenários afetados antes de liberar o piloto.

### N15 — Definir protocolo de avaliação com usuários

**Prioridade:** Alta. **Responsável sugerido:** Giovanne, com Henrique, Lucas Tomazeli e orientador. **Etiquetas:** Documentação, Testes, Processos Externos. **Dependências:** MVP/personas; iniciar agora, sem esperar o app pronto.

**Descrição:** Detalhar a avaliação prometida no artigo e preparar instrumentos consistentes.

**Critérios de conclusão:**

- [ ] Definir perfis e forma de recrutamento, quantidade viável de participantes e percursos/tarefas, registrando limitações da amostra.
- [ ] Definir início/fim de percurso, conclusão, desvio, interrupção e pedido de auxílio para evitar contagem subjetiva.
- [ ] Preparar ficha de observação, questões de clareza/utilidade/autonomia e instrumento de usabilidade escolhido; se usar SUS, registrar versão e cálculo.
- [ ] Explicar como cada medida responde a RQ1/RQ2 e confronta H1/H2; definir referência de comparação se houver alegação de melhoria.
- [ ] Alinhar com o orientador condições de participação, acompanhamento, interrupção e tratamento dos dados; realizar ensaio do protocolo.

### N16 — Realizar avaliação com usuários e registrar evidências

**Prioridade:** Alta. **Responsável sugerido:** Lucas Tomazeli, com Giovanne e Enzo. **Etiquetas:** Testes, Processos Externos, Documentação. **Dependências:** N14, N15.

**Descrição:** Executar o protocolo nas condições definidas e registrar resultados sem selecionar apenas sessões favoráveis.

**Critérios de conclusão:**

- [ ] Executar tarefas com participantes do público contemplado ou documentar claramente quando isso não for possível.
- [ ] Registrar tempo, conclusão, desvios, auxílio, interrupções e identificação dos recursos, conforme o protocolo.
- [ ] Coletar percepção de clareza, facilidade, utilidade e autonomia, além de observações e sugestões.
- [ ] Organizar registros por identificador de participante, versão do app e percurso; separar falha técnica de dificuldade de interação.

### N17 — Analisar resultados e confrontar as hipóteses

**Prioridade:** Alta. **Responsável sugerido:** Giovanne, com Henrique e Lucas Tomazeli. **Etiquetas:** Documentação, Testes. **Dependências:** N16.

**Descrição:** Transformar registros em evidências para responder às questões de pesquisa.

**Critérios de conclusão:**

- [ ] Consolidar medidas com denominadores e condições de teste claros; calcular o instrumento de usabilidade conforme a versão utilizada.
- [ ] Agrupar dificuldades e feedback qualitativo por tema e relacioná-los aos resultados quantitativos.
- [ ] Responder a RQ1/RQ2 e discutir H1/H2 sem assumir confirmação prévia.
- [ ] Registrar limitações da amostra, percursos, localização e AR; melhorias observadas não viram afirmações gerais sem sustentação.

### N18 — Evoluir o artigo para a entrega final

**Prioridade:** Alta. **Responsável sugerido:** Giovanne, com revisão da equipe. **Etiquetas:** Documentação. **Dependências:** pode começar agora; fechamento após N17.

**Descrição:** Preservar a AC1 e produzir a versão que descreve o que foi efetivamente desenvolvido e avaliado.

**Critérios de conclusão:**

- [ ] Atualizar escolhas técnicas, escopo, arquitetura e limites conforme a implementação real.
- [ ] Detalhar participantes, tarefas, instrumentos, coleta e análise na metodologia.
- [ ] Incluir resultados, discussão, conclusões e trabalhos futuros coerentes com as evidências.
- [ ] Conferir citações/referências, figuras, sumário, seção 2.2 e paginação; diferenciar contribuição local de atendimento integral aos ODS.

### N19 — Preparar versão demonstrável e apresentação final

**Prioridade:** Média. **Responsável sugerido:** Enzo, com Lucas Paifer, Gustavo Gutierrez e Henrique. **Etiquetas:** Processos Internos, Documentação, Testes. **Dependências:** MVP validado; preparação pode começar antes da análise final.

**Descrição:** Tornar a demonstração reproduzível para a banca e a equipe.

**Critérios de conclusão:**

- [ ] Identificar versão/commit, APK nativo, dados piloto e procedimento para iniciar backend e banco.
- [ ] Validar ambiente controlado da demonstração e configurações sem segredos versionados; hospedagem remota só se necessária ao uso previsto.
- [ ] Roteiro mostra problema, escolha de rota, alternativa a escadas, orientação textual e AR validada.
- [ ] Preparar slides, limitações e evidências dos resultados; ensaiar a apresentação e registrar alternativa para falha de conectividade.

## 5. Ordem de execução sugerida

| Frente | Trabalho | Condição para avançar |
| --- | --- | --- |
| Preparação imediata | Fechar MVP, stories, personas e NFR; desbloquear protótipo; iniciar levantamentos, N02 e N15 | Recorte piloto e critérios compreensíveis pela equipe |
| Dados e fluxo básico | N01 → N03 → N04; N05/N06 → N07; iniciar N12/N13 | Usuário encontra destino e percorre rota adequada aos critérios, com alternativa textual |
| AR e integração | N08 → N09 → N10; N11 acompanha a implementação | Hospedagem/resolução reais comprovadas e orientação vinculada à rota |
| Validação e pesquisa | N14 → N16 → N17, com N15 preparado antes | Percursos verificados, sessões documentadas e resultados analisados |
| Entrega | N18 e N19 | Artigo e demonstração correspondem à versão testada |

O fluxo mapa → rota → orientação textual e a prova de hospedagem/resolução AR podem avançar como frentes independentes. Evitar deixar a implementação da navegação dependente de concluir todos os experimentos de AR.

Caso o prazo seja insuficiente, reduzir a área, os destinos e os perfis cobertos; preservar os critérios de rota, a acessibilidade do fluxo e a avaliação do piloto. Reservar VR, gamificação, publicação em loja e integrações amplas para evolução futura, salvo mudança explícita do escopo.

## 6. Critério comum para mover um card a Concluído

- [ ] Entrega e critérios de aceitação estão atendidos.
- [ ] Evidência acessível foi anexada: documento, protótipo, PR/commit, relatório ou registro de teste, conforme a tarefa.
- [ ] Responsável e revisor conferiram o resultado; limitações e pendências estão explícitas.
- [ ] Para entregas com requisito de acessibilidade, a matriz normativa registra item aplicável, método, resultado e evidência; qualquer “não aplicável” tem justificativa. Cards de pesquisa/especificação podem concluir com a matriz e os instrumentos entregues, mantendo os testes do produto pendentes nos cards de implementação.
- [ ] Requisito/story e teste/evidência correspondente estão ligados quando aplicável.
- [ ] Novos problemas têm cartão próprio; concluir pesquisa ou especificação não implica concluir implementação.

Usar uma linha de rastreabilidade por entrega: **objetivo do artigo + norma/item aplicável → RF/RNF → User Story → card → teste/evidência**. Não criar outro card genérico de “definir tecnologias” ou “criar documentação inicial” sem uma entrega nova.

## 7. Cobertura normativa do plano após a revisão

As relações abaixo definem trabalho e evidência a produzir. Nenhuma linha significa que o produto ou o campus já está conforme. A aplicabilidade e o texto dos itens ABNT precisam ser conferidos na norma integral.

| Referência | Aplicação a verificar | Cards e entregas |
| --- | --- | --- |
| NBR 9050:2020 Versão Corrigida:2021 | Condições físicas relevantes para o percurso, entradas, circulação e recursos do piloto | Levantamentos; N01, N02, N04 e N14, com medidas e evidências |
| NBR 16537:2024 | Representação e verificação da sinalização tátil direcional/de alerta, continuidade e barreiras | Levantamento de recursos; N01, N02, N07 e N14 |
| NBR 15599:2008 | Comunicação das informações do serviço em formas compreensíveis e acessíveis | Personas/protótipo; N05, N07, N10 e N12; avaliação N15–N17 |
| NBR 17060:2022 | Requisitos aplicáveis ao app móvel e interação com tecnologias assistivas | Requisitos não funcionais; N12 e N14–N16 |
| Lei 13.146/2015, texto consolidado | Acesso à informação, eliminação de barreiras e escopo das obrigações aplicáveis; art. 63 trata especificamente de sítios da internet | Pesquisa normativa; requisitos e N12; resultados N17/N18. Avaliar a incidência no contexto de implantação, sem concluir cumprimento jurídico pela leitura de código |
| WCAG 2.2, meta AA | Critérios digitais aplicáveis: alternativas, contraste, teclado/foco, formulários, estados e alvos de interação | Protótipo; N05, N07 e N12–N14; matriz de resultados por critério |
| NBR 17225:2025, referência adicional para a web | Acessibilidade em conteúdo e aplicações web; avaliar a aplicação ao catálogo/painel web do projeto | Pesquisa normativa e N12; não tratar como substituição da NBR 17060 |

O relatório associado contém os achados do código atual, fontes consultadas e a distinção entre falha observada, risco a validar e funcionalidade ainda não implementada.

## Fontes

- Artigo fornecido: `C:\Users\X23\Downloads\Artigo AC1 - UPX8.pdf`, 26 páginas.
- Exportação fornecida: `C:\Users\X23\Downloads\UP018---Grupo-MNRs (1).xlsx`, abas Summary e Board Data. Os PDFs de requisitos/testes apenas vinculados no Trello não foram lidos nesta análise.
- Código local: `unifacens-api/src/db/schema.ts`, `src/anchors/`, `src/main.ts`; `unifacens-client/src/components/ar/`, `src/features/anchors/queries/`, `src/stores/`, `src/app/`; `packages/shared/src/` e `AGENTS.MD`.
- [Google ARCore — Cloud Anchors](https://developers.google.com/ar/develop/cloud-anchors): hospedagem, resolução visual e necessidade de conexão ao serviço. IDs simulados e posições locais armazenadas não comprovam essa operação.
- [W3C — WCAG 2.2](https://www.w3.org/TR/WCAG22/) e [React Native — Accessibility](https://reactnative.dev/docs/accessibility): referências para elaborar e verificar critérios de interface, sem declaração automática de conformidade.
