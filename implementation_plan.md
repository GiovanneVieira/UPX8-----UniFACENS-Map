# Plano de ação — Navegação acessível UniFACENS

RequestFeedback: true

- **Status:** contratos, elegibilidade, busca pura, persistência versionada e API de importação/publicação/cálculo implementados e testados; interface, extensões de dados e levantamento de campo pendentes.
- **Data:** 08/11/2026.
- **Branch:** `feat/navegacao-acessivel`.
- **Base analisada:** `1fd8c60` da `main`.
- **Objetivo:** permitir que uma pessoa escolha origem e destino, informe suas necessidades de deslocamento, compare percursos compatíveis e chegue ao destino com orientação compreensível, distância do trajeto e informação sobre os facilitadores utilizados.

## 1. Resultado esperado e limites da entrega

O fluxo completo será: **escolher origem/destino → ajustar necessidades → calcular → entender e comparar → iniciar → acompanhar → recalcular se necessário → chegar/encerrar**. Ele deverá funcionar por mapa e instruções textuais; AR será uma apresentação complementar do mesmo percurso.

**Primeiro marco confirmado pelo usuário em 08/11/2026: chegar ao prédio.** O destino será um ponto de acesso físico identificado de A/B/C/D/L, alcançado por caminho compatível com as necessidades selecionadas. Esse marco termina nesse ponto, sem exigir circulação interna, chegada a salas ou troca de andar dentro do prédio. O acesso pode estar em nível diferente do térreo; não assumir pavimento. Escadas, rampas, passarelas e desníveis no caminho até ele continuam fazendo parte do levantamento e das restrições.

Os itens deste plano sobre salas, circulação interna e transições entre pavimentos internos ficam para uma expansão posterior; não são condição de conclusão do primeiro marco. A modelagem pode prever esses recursos sem exigir o levantamento interno agora. A chegada exige identificar o acesso e confirmar o progresso até ele; proximidade ao centro do prédio não basta.

"Completo" significa concluir esse fluxo no setor piloto, com dados reais conferidos, testes e evidência presencial, dentro do marco de chegada ao prédio. A expansão para o restante do campus será progressiva, com a área coberta explícita. O usuário definiu o primeiro recorte em 08/11/2026: **portarias 1 e 2 e prédios A, B, C, D e L**. O [inventário e as fichas de levantamento](docs/levantamento-campus/README.md) registram esses sete locais e dez pares portaria–prédio, com ida e volta separadas. A seleção dos acessos físicos e participantes permanece pendente; nenhum prédio será apresentado como mapeado por suposição.

Não há promessa de ausência de erros: o processo abaixo procura detectar falhas cedo, impedir rotas incompatíveis e tornar as limitações visíveis. Cada etapa tem um critério de saída antes da seguinte.

**Execução sem depender da marcação física:** o usuário autorizou avançar com dados fictícios em 08/11/2026. O levantamento real condiciona a validação/publicação dos percursos do campus, não o desenvolvimento de contratos, motor, persistência e interface de demonstração. O [incremento atual](docs/navegacao-acessivel.md) conecta o núcleo ao PostgreSQL e à API nova; o endpoint legado e o aplicativo ainda não consomem essas regras.

### Princípios obrigatórios

1. **Necessidades ajustáveis:** oferecer escolhas funcionais como "não posso usar escadas", "prefiro menor esforço" e "preciso de orientação textual/por voz". Um nome de deficiência não determina automaticamente capacidades; presets são apenas atalhos editáveis.
2. **Restrições são obrigatórias:** uma escada proibida é excluída da busca. Nenhuma redução de distância ou pontuação pode fazê-la voltar ao percurso.
3. **Facilitadores precisam de contexto:** rampa, elevador, corrimão, descanso e sinalização só ajudam quando conectados ao percurso e compatíveis com os requisitos aplicáveis. Não premiar automaticamente a quantidade de rampas/elevadores; considerar também seus custos e condições.
4. **Desconhecido permanece desconhecido:** ausência de medida, informação vencida ou disponibilidade não confirmada não vira aprovação. Trechos sem evidência necessária para uma restrição são inelegíveis para a rota recomendada.
5. **Cobertura explícita:** fora da rede conferida, responder que não há cobertura. Retirar a linha reta automática do fluxo real de navegação; simulações ficam identificadas e separadas.
6. **Percurso conectado:** seguir caminhos reais, entradas e transições entre andares. Não atravessar prédios, cercas ou paredes para alcançar uma coordenada.
7. **Distância percorrida:** mostrar a soma dos trechos do caminho; distinguir distância total, restante e distância em linha reta. Tempo é estimativa com premissas explícitas, sem associar uma velocidade a um diagnóstico.
8. **Mesma rota em todos os modos:** mapa, texto e AR compartilham rota, destino e progresso. A câmera não é requisito para iniciar ou concluir.
9. **Localização com incerteza:** GPS/AR não provam o andar nem a passagem por uma porta. Permitir origem e avanço manuais; perda de precisão não dispara chegada ou troca de andar automaticamente.
10. **Privacidade:** não solicitar diagnóstico médico. Preferências e posição ficam na sessão por padrão; qualquer persistência é opcional. Evitar histórico de deslocamento e dados pessoais nos logs.

## 2. Ponto de partida verificado

| Componente | O que existe | O que precisa mudar para este objetivo |
| --- | --- | --- |
| `shared` | Schemas de locais, âncoras e rotas; cálculo geográfico | Contratos de necessidades, rede, evidências, resultados e etapas |
| Catálogo `places` | Cadastro, edição, busca, mapa, bloco/andar e origem dos dados | Vincular locais às entradas/nós e permitir escolher origem e destino |
| Roteamento atual | A* sobre grade com obstáculos aproximados; distância e instruções | Rede real de trechos, filtros obrigatórios, custos e cobertura explícita |
| `profile: accessible` | Campo aceito no contrato | Campo não é aplicado pelo serviço; substituir por critérios efetivos, com transição documentada |
| Destino `placeId` | Previsto no contrato | Ainda rejeitado pelo serviço; implementar resolução por acessos compatíveis |
| Autorização | JWT e papéis; qualquer POST exige admin | Liberar cálculo para autenticados sem liberar edição da rede |
| AR | Pontos geográficos, Terrain Anchors e orientação experimental | Consumir rota comum; corrigir atualização de projeção e validar lifecycle/precisão |
| Telas acadêmicas | Dados simulados; atalhos abrem Campus/AR | Passar destino resolvido, com tratamento explícito para sala não vinculada |
| Publicação | Docker, CI e Blueprint Render/Neon | Atualizar variáveis para Better Auth, rotas web e configuração do piloto |

Problemas já identificados que entram no trabalho: suavização corta quinas proibidas; modo direto ignora obstáculos fora do campus; acessos carregados não orientam a escolha do destino; a projeção AR depende de refs sem atualização reativa; zoom está em modo de diagnóstico. A galeria/upload de imagens de âncoras fica como pendência separada, salvo se necessária às referências do piloto.

Na análise anterior, após sincronizar dependências e regenerar tipos locais do Expo, passaram build da API, lint, typecheck, 69 testes em 11 suítes e exportação web. Isso é uma referência histórica, não uma validação das funcionalidades planejadas. As evidências de acessibilidade de outubro também não aprovam automaticamente telas novas.

## 3. Decisões de arquitetura propostas

### 3.1 Rede de navegação

Adotar um **grafo dirigido de nós e trechos percorríveis** como fonte da verdade da navegação. A grade experimental poderá permanecer isolada para demonstração ou estudo, sem fornecer atalhos no fluxo recomendado. A arquitetura deve suportar exterior, interior e conexões entre andares desde a modelagem.

| Entidade proposta | Responsabilidade e dados essenciais |
| --- | --- |
| Prédio/andar | Identidade, nível e vínculo entre espaços; andar não será inferido apenas pela altitude do GPS |
| Nó | Entrada, cruzamento, porta, descanso ou transição; prédio/andar, coordenada geográfica e/ou referência local de planta |
| Trecho dirigido | Nós de origem/destino, geometria ordenada, comprimento em metros, sentido, categoria e condições físicas |
| Acesso de um local | Liga `placeId` a um ou mais nós/portas; informa andar e evidência. Permite entradas diferentes conforme a rota |
| Evidência/verificação | Fonte, método, responsável, data, validade definida pela política e medidas; alteração relevante invalida a verificação |
| Ocorrência operacional | Interdição, obra, elevador fora de serviço ou barreira; trechos afetados, período e estado conhecido/desconhecido |
| Versão da rede | Identifica o conjunto utilizado no cálculo e permite detectar alterações durante uma sessão |
| Referência de orientação/AR | Texto e referência visual ligados a nó/etapa; âncora é auxiliar, sem determinar conectividade física |

Os trechos precisam representar, conforme o tipo: largura livre em metros, inclinação longitudinal e transversal com unidade explícita, desnível/degraus, superfície, corrimão, cobertura, iluminação, pontos de descanso e informações de sinalização tátil. Para portas/elevadores, registrar dimensões e condições pertinentes ao piloto. Campos não medidos são nulos/desconhecidos; não preencher defaults positivos como `accessible: true`.

A inclinação e o sentido importam: subida e descida podem ter custos e critérios diferentes. Transições verticais serão explícitas; uma rampa exige comprimento do percurso e um elevador exige conexão entre os andares, disponibilidade e custo de espera separado. Se uma regra depender do trajeto acumulado, como distância máxima sem descanso, o motor precisará representar esse estado na busca; filtrar cada trecho isoladamente não resolve essa regra.

### 3.2 Seleção de percurso

1. Resolver origem, destino, andar e acessos candidatos dentro da área coberta; validar a ligação da posição à rede.
2. Excluir trechos interditados, incompatíveis e sem evidência obrigatória vigente.
3. Calcular percursos no subgrafo elegível. Começar com Dijkstra, que permite validar o comportamento sem heurística; adotar A* depois apenas se medição de desempenho justificar e a heurística for comprovadamente admissível.
4. Entre as opções elegíveis, ordenar por distância ou custo de esforço conforme a escolha do usuário. Custos serão não negativos, documentados e testados; pesos são parâmetros de produto validados com usuários, não limites normativos inventados.
5. Exibir até três alternativas distintas, quando existirem: por exemplo, menor distância, menor esforço e opção que evita elevador quando compatível. A primeira versão pode entregar uma recomendação; comparação é um marco obrigatório posterior. Toda alternativa passa pelos mesmos filtros.
6. Explicar os motivos: distância extra, rampas verificadas, elevadores necessários, descanso e condições relevantes. Não declarar universalmente uma "melhor rota" para todas as pessoas.

Não conectar coordenadas à rede apenas pela proximidade euclidiana: o ponto mais próximo pode estar do outro lado de uma parede, cerca ou em outro andar. Preferir origem em local/nó identificado; o acesso automático exige conexão geométrica válida e precisão suficiente. Destinos com múltiplas entradas serão avaliados por compatibilidade e conectividade, sem escolher a porta somente pela proximidade.

### 3.3 Contratos e responsabilidades

- Criar schemas dedicados em `packages/shared/src/schemas/`, com tipos inferidos e validação compartilhada; não ampliar indefinidamente `access.schema.ts`.
- Separar em `modules/routing/`: controller HTTP, service de orquestração e repository de rede. O motor puro de busca/políticas foi implementado em `shared`, sem dependências de banco, NestJS ou sensores, para ser verificável independentemente da infraestrutura. Não executar queries por nó/trecho em loops.
- Manter `POST /routing/route` durante a transição ou versionar seu contrato explicitamente. Origem/destino aceitarão local/nó ou coordenada válida com contexto; compatibilidade com `anchorId` depende de vínculo resolvível. Não inferir acesso seguro de uma âncora arbitrária.
- Resultado discriminado: `ok`, `no_route`, `outside_coverage`, `insufficient_data` ou `origin_unresolved`. Em erro de entrada, autenticação ou servidor, usar o status HTTP apropriado. Ausência de rota é um resultado de domínio compreensível.
- Sucesso inclui versão/data da rede, critérios aplicados, nós/trechos ordenados, geometria por andar, distância total, decomposição de custos e etapas com identificadores estáveis. O client valida a resposta com Zod.
- Bloqueios retornam razões compreensíveis e próximas ações. Não apresentar uma alternativa proibida. Relaxar uma preferência exige escolha explícita e novo cálculo; nunca relaxar uma restrição silenciosamente.
- No client, criar `src/features/navigation/{components,hooks,queries,services}`. TanStack Query mantém dados remotos e cálculos; Zustand mantém seleção, preferências e sessão; TanStack Form mantém formulários; refs recebem pose de alta frequência. Estado e callbacks de navegação não dependerão da montagem da cena AR.
- Introduzir um estado explícito de sessão: planejamento, cálculo, prévia, navegando, pausado, recalculando, sem localização, sem rota, chegada e encerrado. Só uma resposta correspondente à solicitação vigente pode substituir a rota; cancelar/ignorar resultados antigos.

## 4. Execução em etapas

Os itens concluídos estão marcados; os demais permanecem pendentes. Cada etapa deve ser entregue em alterações pequenas e revisáveis; dividir quando o escopo impedir uma revisão clara. Registrar commit, verificações, evidência e limitações antes de avançar.

### Etapa 0 — Definir piloto e critérios do produto

**Entrega:** ficha do piloto, histórias de uso, matriz necessidade → regra → teste, inventário do que será medido e critérios de campo definidos antes do ensaio.

- [x] Definir os locais do recorte inicial: portarias 1 e 2 e prédios A, B, C, D e L.
- [x] Definir o primeiro marco como chegada a um acesso identificado do prédio; salas e circulação interna ficam para expansão posterior.
- [ ] Levantar os acessos físicos dos prédios e selecionar referências reproduzíveis de chegada, incluindo os desníveis existentes nos caminhos até eles.
- [ ] Definir participantes/perfis efetivamente avaliados: mobilidade, visão, audição e compreensão/orientação. Marcar o que não poderá ser validado no primeiro piloto.
- [ ] Confirmar necessidades com as pessoas envolvidas; separar restrições de preferências e regras acumuladas.
- [ ] Definir política de desconhecido, validade de evidências, recursos indisponíveis e limites de localização com base nos testes e espaços do piloto.
- [ ] Definir as métricas: conclusão, desvios, ajuda, distância real versus calculada, instruções compreendidas, falhas de localização e barreiras de interface. Fixar tolerâncias mensuráveis antes da avaliação; não inventar precisão garantida.

**Critério de saída:** piloto e matriz revisados pela equipe; falta de acesso ao campo não impede desenvolver testes com dados sintéticos, mas impede declarar o piloto pronto.

### Etapa 1 — Contratos e regras de elegibilidade

**Depende de:** etapa 0 para escopo; regras novas exigem atualização da matriz.

- [x] Criar schemas iniciais de nós, trechos, necessidades, medidas, evidências, disponibilidade, pedidos por nó e resultados do núcleo. Contratos da API e extensões físicas permanecem para os próximos incrementos.
- [x] Implementar política pura que diga se um trecho é elegível e por quê.
- [ ] Criar presets editáveis, sem diagnóstico obrigatório; separar necessidades físicas dos modos de apresentação.
- [ ] Definir migração do `profile` antigo. Não aceitar `accessible` e ignorar a intenção do cliente; requisições antigas devem ter mapeamento documentado ou erro explícito de atualização.
- [x] Testar precedência das restrições, valores inválidos, estados desconhecidos, evidência vencida e regras direcionais do núcleo atual.

**Critério de saída:** nenhuma preferência libera um trecho proibido; toda rejeição tem motivo testado. Regras que exigem medidas ainda não disponíveis permanecem indisponíveis, sem presumir conformidade.

### Etapa 2 — Persistência e administração da rede

**Depende de:** etapa 1.

- [x] Criar migration aditiva, FKs, índices e checks para redes, versões, nós e trechos, preservando catálogo e âncoras existentes. Evidências são referências na verificação do trecho; acessos por local e ocorrências detalhadas permanecem extensões pendentes.
- [ ] Validar geometria, comprimento, referências, andares, sentidos e medidas. Evitar nós duplicados e conexões impossíveis; validar importações antes de ativá-las.
- [x] Implementar leitura em lote e gravação transacional de conjuntos relacionados.
- [ ] Implementar um fluxo mínimo utilizável de cadastro/importação, conferência/publicação e atualização de interdições por admin, com histórico. Relato de usuário não pode liberar automaticamente um trecho.
- [x] Disponibilizar importação em rascunho, revisão explícita para levantamento, publicação administrativa e substituição por versão nova; histórico retirado não calcula nem é reativado. Interface administrativa e ocorrências específicas permanecem pendentes.
- [ ] Usar revisão/versionamento para invalidar cache e rotas quando rede, evidência ou disponibilidade mudarem.
- [x] Testar migrations e operações HTTP com Testcontainers/PostgreSQL real, incluindo falha parcial, rollback, concorrência e reaplicação da migration.

**Critério de saída:** rede consistente pode ser carregada, conferida e atualizada; edição não conserva uma aprovação que deixou de corresponder aos dados.

### Etapa 3 — Motor de rotas e autorização

**Depende de:** etapa 1 para motor puro, etapa 2 para integração HTTP/persistência. O núcleo já usa uma rede sintética pequena, sem esperar o levantamento.

- [x] Escrever primeiro cenários de integração HTTP com banco real e testes unitários do motor puro.
- [x] Implementar e testar Dijkstra no núcleo puro, com filtros obrigatórios, distância total, direções, bloqueio de dados fictícios no modo real e diagnóstico de informações insuficientes. Integração HTTP e regras físicas adicionais continuam pendentes.
- [ ] Implementar busca com filtros obrigatórios, custos não negativos, sentidos e transições verticais.
- [ ] Implementar `placeId` e múltiplas entradas, escolhendo acesso alcançável e compatível.
- [ ] Incluir distância dos trechos completos, conectores válidos de origem/destino e transições; não medir só a distância entre extremos.
- [x] Liberar cálculo na API nova para `user` e `admin` autenticados; preservar operações de edição exclusivas de admin. A permissão se aplica somente à consulta marcada explicitamente, sem liberar genericamente todos os POSTs. O endpoint legado permanece para migração posterior.
- [ ] Retornar resultado explícito para falta de cobertura, dados insuficientes ou caminho inexistente; retirar fallback direto do fluxo real.
- [ ] Preservar a geometria conferida. Se houver suavização, ela não poderá criar atalhos, cortar quinas, atravessar obstáculos ou remover informação de etapa/andar.
- [ ] Garantir casos de origem = destino, vértice isolado, entrada bloqueada, coordenada zero válida, direção inversa e atualização simultânea da rede.

**Critério de saída:** todos os cenários de elegibilidade passam e a rota retornada é uma sequência conectada de trechos permitidos, com distância reproduzível e versão identificada.

### Etapa 4 — Levantar e publicar dados reais do piloto

**Depende de:** etapa 0; pode começar durante as etapas 1–3. Publicação usa o fluxo da etapa 2.

- [ ] Percorrer os caminhos e registrar cada bifurcação, acesso, barreira e transição de andar.
- [ ] Medir e documentar condições relevantes; associar fotos/referências, responsável, método, data e unidade.
- [ ] Conferir com a equipe competente os critérios físicos aplicáveis; valores normativos só entram após consulta à fonte e ao item correspondente.
- [ ] Associar destinos aos acessos corretos; conferir a geometria no mapa e a conectividade caminhando.
- [ ] Submeter dados à revisão, separar demonstração e campo, e ativar somente o conjunto conferido.
- [ ] Registrar caminhos sem cobertura e alternativas inexistentes; não inventar conexões para fechar a rede.

**Critério de saída:** dados reais e revisão rastreáveis; equipe consegue reproduzir pelo menos os percursos piloto e identificar suas limitações.

### Etapa 5 — Planejamento no mapa e comparação de alternativas

**Depende de:** etapa 3; dados reais entram conforme etapa 4.

**Incremento entregue — planejamento textual:** `/planejar`, com entrada pela aba Campus, seleção pesquisável de pontos de uma versão publicada, destino restrito ao acesso de prédio, necessidades funcionais e medidas opcionais, cálculo pela API, distância e sequência textual de trechos, identificação explícita de demonstração e mensagens de ausência de rota/dados/erro. Alterar campos ou área descarta a prévia anterior e não reativa uma resposta atrasada. Validação: 129 testes, lint, tipos, build da API e export web; interface verificada em Chromium com respostas sintéticas em 360/768/1440 px, axe e teclado. Evidências e reprodução em [docs/evidencias/planejamento/README.md](docs/evidencias/planejamento/README.md). Esse incremento não conclui os itens compostos abaixo: GPS, troca dos extremos, catálogo, linha no mapa, esforço e alternativas continuam pendentes. Ensaio em aparelho e leitores de tela também pendente.

- [ ] Implementar origem manual, "minha localização" com indicação de precisão, destino e troca dos extremos.
- [ ] Permitir selecionar necessidades e preferências com explicação simples e valores ajustáveis.
- [ ] Ligar busca/lista/detalhes do catálogo a "Partir daqui" e "Ir para"; exigir andar/acesso quando ambíguo.
- [ ] Mostrar prévia com linha do trajeto, distância, mudanças de andar, facilitadores, restrições aplicadas e verificação dos dados.
- [ ] Entregar até três alternativas distintas quando disponíveis, calculadas com as mesmas restrições; explicar por que uma opção é mais longa ou usa elevador. Não criar alternativas só para preencher a interface.
- [ ] Mostrar erro, vazio, cobertura insuficiente e dados insuficientes com ações recuperáveis, sem prometer uma rota incompatível.
- [ ] Garantir seleção e instruções pela lista, mesmo sem chave do mapa ou carregamento do provedor.

**Critério de saída:** uma pessoa autenticada comum consegue planejar e entender a rota sem câmera nem edição de dados. Mudança de origem/destino/preferências descarta respostas antigas.

### Etapa 6 — Navegação por etapas e localização

**Depende de:** etapa 5.

- [ ] Extrair a sessão comum da navegação AR atual e apresentar etapa, referência e próxima ação no modo textual/mapa.
- [ ] Usar posição, precisão, tempo da leitura e direção para associar progresso à rede; aplicar tolerância e estabilidade validadas. Não usar só proximidade do destino para declarar chegada.
- [ ] Calcular distância restante ao longo do percurso e mostrar quando ela é estimada por localização imprecisa.
- [ ] Permitir pausa, retomada, cancelamento, repetição de instrução, confirmação manual de referência/andar e alteração de destino.
- [ ] Ao perder sinal ou ter posição ambígua, manter o percurso visível, indicar a incerteza e oferecer confirmação manual; não avançar etapas automaticamente.
- [ ] Recalcular por desvio sustentado, mudança de necessidades ou interdição; respeitar novamente todas as restrições. Controlar concorrência e evitar alternância contínua entre rotas.
- [ ] Sem rede, manter instruções já carregadas e indicar que disponibilidade não está sendo atualizada. Não calcular/mostrar uma nova rota como validada se os dados necessários não estiverem disponíveis.

**Critério de saída:** percurso pode ser acompanhado, pausado e concluído; testes de sinal ruim e mudança de disponibilidade não levam a orientação enganosa.

### Etapa 7 — Acessibilidade da experiência e necessidades sensoriais

**Depende de:** protótipos desde etapa 0; validações contínuas nas etapas 5–6.

- [ ] Conferir TalkBack no Android e teclado/leitor de tela na web, ordem de foco, rótulos, retorno de foco, estados e mensagens relevantes.
- [ ] Testar texto ampliado, contraste, orientação compreensível, teclado virtual e controles de pelo menos 44 × 44 unidades lógicas/CSS px conforme a meta do repositório.
- [ ] Oferecer instrução textual equivalente às indicações visuais. Planejar voz e vibração configuráveis e validar sua integração nativa; não depender só de áudio, cor ou vibração.
- [ ] Para orientação visual reduzida/ausente, validar referências e informação tátil/assistência de cada etapa com participantes. A presença de piso tátil em um ponto não garante continuidade ou navegação autônoma.
- [ ] Para necessidades auditivas, manter toda informação essencial visível e compatível com leitor de tela; para compreensão/orientação, testar linguagem curta e apresentação passo a passo.
- [ ] Criar matriz de evidência por critério e plataforma. Recursos não avaliados ficam marcados como pendentes, sem declarar atendimento a todos os públicos.

**Critério de saída:** fluxos essenciais funcionam nas tecnologias assistivas e nos perfis efetivamente testados; barreiras impeditivas corrigidas antes do piloto com usuários.

### Etapa 8 — Integrar AR e atalhos acadêmicos

**Depende de:** etapas 6 e 7 para que exista uma alternativa independente da câmera.

- [ ] Fazer AR consumir o identificador da mesma rota, etapas e progresso da sessão comum; trocar de aba não apaga o percurso.
- [ ] Corrigir fallback de projeção, reatividade, verificação de pose fresca e limpeza de operações nativas assíncronas ao desmontar.
- [ ] Rever o modo de diagnóstico de zoom e o tratamento de suporte, permissão, falha de API key e tracking degradado.
- [ ] Validar projeção, chão e orientação em aparelho; esconder orientação 3D não confiável e manter instruções textuais. GPS e AR não serão usados para inventar caminho indoor.
- [ ] Ligar aulas/salas a `placeId` explícito; se não existir vínculo, oferecer busca sem selecionar sala por coincidência de texto. Identificar a origem simulada dos dados acadêmicos.
- [ ] Testar abrir, sair, retornar, bloquear tela e retomar, sem crash e com estado coerente.

**Critério de saída:** mapa/texto/AR representam o mesmo destino e percurso; uma falha de AR permite continuar. Validar Android físico; iOS só entra como plataforma validada após ensaio próprio.

### Etapa 9 — Restrições acumuladas e calibração de preferências

**Depende de:** etapas 3–7 e feedback do piloto técnico. Antecipar se a etapa 0 identificar como requisito indispensável.

- [ ] Implementar regras acumuladas selecionadas, como distância máxima sem descanso, com estado adequado na busca e testes de reinício da contagem nos descansos válidos.
- [ ] Calibrar esforço e comparação de alternativas com participantes, mantendo as restrições obrigatórias fixas.
- [ ] Validar limites de comprimento total ou dependência de assistência que fizerem parte do escopo. Requisitos ainda não suportados não podem aparecer como opções ativas.
- [ ] Medir desempenho com redes maiores e múltiplos critérios; definir metas e só então considerar A*, cache adicional ou outras otimizações.

**Critério de saída:** toda opção oferecida altera o cálculo de forma testada e explicável; condições de percurso completo não são simuladas por filtros locais.

### Etapa 10 — Ambiente demonstrável e piloto presencial

**Depende de:** etapas 4–9 conforme o escopo acordado.

- [ ] Ajustar Render/Neon para Better Auth, URL pública, origens, rotas estáticas e conta admin provisionada por procedimento explícito; não publicar nesta etapa sem autorização de publicação.
- [ ] Garantir disponibilidade de um backend de teste, versão da rede e build nativo identificados. Preparar backup/restauração antes de migrar dados reais e ensaiar migrations num banco separado.
- [ ] Rodar o pipeline completo, testes de interface pertinentes e uma validação de ponta a ponta com JWT real para usuário comum.
- [ ] Fazer ensaio técnico com a equipe antes dos participantes: acessos, andares, desvio, elevador indisponível, falta de rota, sinal ruim e falha de AR.
- [ ] Executar protocolo com participantes voluntários, acompanhamento e condições de interrupção; coletar somente dados necessários, com identificação de sessão e versão.
- [ ] Registrar resultados quantitativos e observações, corrigir bloqueadores e repetir os cenários afetados.

**Critério de saída:** demonstrar origem → destino no piloto com evidência, sem trechos proibidos, sem bloqueadores e dentro dos critérios definidos na etapa 0. Uma suíte verde, sozinha, não conclui esta etapa.

### Etapa 11 — Documentar, liberar e expandir

**Depende de:** etapa 10.

- [ ] Atualizar README, documentação de navegação/API, procedimento de levantamento e operação de interdições.
- [ ] Relacionar esta entrega aos cards N01–N07, N10–N17 e N19 do planejamento existente. Rever cards antigos de Cloud Anchors conforme a estratégia geoespacial atual; não marcá-los concluídos por equivalência.
- [ ] Registrar área/perfis/plataformas validados, limitações, resultados e pendências para o artigo e apresentação.
- [ ] Preparar revisão de código, PR e plano de reversão. Publicação e merge são ações posteriores à validação e à autorização correspondente.
- [ ] Expandir por setores usando o mesmo ciclo de medição, revisão, cálculo e ensaio; não copiar uma classificação de acessibilidade para trechos não avaliados.

**Critério de saída:** versão identificável, documentação reproduzível e operação de atualização da rede definida.

## 5. Matriz mínima de cenários de teste

Dados sintéticos verificam o algoritmo; o ensaio de campo verifica sua correspondência com o campus. Ambos são necessários.

| ID | Cenário | Resultado obrigatório |
| --- | --- | --- |
| T01 | Caminho curto com escada; alternativa mais longa compatível | Restrição de escada seleciona a alternativa, independentemente do custo |
| T02 | Rampa existe, mas medida necessária é desconhecida/vencida | Trecho não é recomendado como compatível; motivo visível |
| T03 | Único elevador está indisponível | Usar alternativa elegível ou retornar ausência de rota; nunca liberar escada proibida |
| T04 | Dois acessos ao mesmo local; o mais perto é incompatível | Usar o acesso compatível alcançável |
| T05 | Origem/destino em andares diferentes com mesma lat/lon | Conectar somente por transição vertical cadastrada |
| T06 | Fora da cobertura ou coordenada junto de parede/cerca | Informar cobertura/origem não resolvida; não atravessar a barreira |
| T07 | Regra de largura/inclinação e sentido contrário | Aplicar medidas e direção pertinentes, inclusive nas fronteiras exatas |
| T08 | Facilitadores presentes, porém desconectados | Não inventar conexão; ausência de rota explícita |
| T09 | Geometria com quina, obstáculo ou curvatura | Preservar passagem e distância; nenhuma suavização cria atalho |
| T10 | Usuário comum, admin e não autenticado | Comuns/admin calculam; só admin edita; sem token é recusado |
| T11 | Recurso interditado durante navegação | Invalidar rota afetada e recalcular com as mesmas restrições |
| T12 | GPS impreciso, antigo ou andando próximo de percurso paralelo | Não avançar etapa/andar nem declarar chegada sem evidência suficiente |
| T13 | Pedidos concorrentes e cancelamento durante recálculo | Resposta antiga não substitui destino/rota atual nem reativa sessão encerrada |
| T14 | Troca mapa/texto/AR; AR perde tracking ou desmonta | Preservar sessão e alternativa textual; nenhum acesso ao nativo destruído |
| T15 | Sem internet ou timeout | Mensagem recuperável; instruções existentes identificadas; sem rota nova inventada |
| T16 | TalkBack, teclado, zoom de texto e ausência de áudio | Planejar, seguir e encerrar pelas alternativas oferecidas |
| T17 | Descanso obrigatório após distância acumulada | Validar percurso acumulado; rejeitar sequência sem descanso suficiente |
| T18 | Distância de trajeto curvo e mudanças de andar | Somar geometria/transições reais; restante acompanha o arco, não linha reta |
| T19 | Origem = destino, nó isolado e conexão unidirecional | Respostas determinísticas e coerentes, sem erro ou conexão reversa inventada |
| T20 | Alteração de necessidades durante a navegação | Recalcular e explicar; não manter percurso que ficou incompatível |
| T21 | Edição/importação parcial ou remoção de nó referenciado | Rollback/recusa consistente, sem quebrar a rede publicada |
| T22 | Preferência por menor esforço versus menor distância | Opções diferentes quando os dados justificarem; ambas respeitam restrições |

## 6. Ficha mínima de levantamento

Cada registro de campo deve preencher: identificador do trecho, nós inicial/final, prédio/andar, sentido, geometria/referências, comprimento, tipo de passagem, medidas aplicáveis com unidades, condições do piso, recursos de apoio, disponibilidade, barreiras, método/instrumento, data, responsável, fotos/evidências, fonte do critério e revisão. Registrar explicitamente o que não pôde ser medido.

Não usar uma única caixa "acessível: sim/não" como substituta das medidas. A aprovação de dados do trecho e a compatibilidade com determinada necessidade são decisões diferentes.

## 7. Verificação antes de concluir cada etapa

- Testes primeiro para contratos HTTP/regras novas; integração com PostgreSQL real, migrations oficiais e teardown, sem mocks de serviços/repositories nesses testes.
- Regressões devem provar comportamento, incluindo ausência de caminho; não apenas repetir a implementação.
- Executar as verificações afetadas; para marcos de integração, compilar `shared` e API, rodar `npm run lint`, `npm run typecheck`, `npm test` e exportar o client web. Documentar se os tipos gerados locais do Expo precisarem de regeneração.
- Em UI, verificar telas renderizadas, foco, estados e tecnologia assistiva; em AR/sensores, exigir aparelho físico e registrar build/dispositivo/condições.
- Para cada etapa, registrar: commit, cenário, comando/ambiente, resultado, evidência, limitações e revisor. No ensaio de campo, associar também a versão da rede.
- Nesta branch, preservar a alteração local já existente em `docs/publicacao-render-neon.md`; não misturá-la automaticamente a commits da navegação.

## 8. Ordem de entrega e pontos de revisão

| Marco | Etapas | Demonstração esperada |
| --- | --- | --- |
| M1 — Regras e base | 0–2 | Necessidades viram critérios; rede sintética consistente e administrável |
| M2 — Cálculo confiável | 3 | Usuário comum obtém caminho compatível e distância; situações impossíveis têm explicação |
| M3 — Uso por mapa/texto | 4–7 | Percurso real planejado, comparado e acompanhado com alternativa sem câmera |
| M4 — Integração e necessidades avançadas | 8–9 | Mesma sessão em AR e regras acumuladas aplicadas conforme o escopo |
| M5 — Piloto e entrega | 10–11 | Uso presencial documentado, versão revisável e expansão preparada |

**Primeiro pacote de trabalho após revisão do plano:** concluir a etapa 0 e escrever a matriz de regras e cenários da etapa 1. Em seguida, implementar contratos/política testáveis e persistência, antes de ampliar a interface ou a cena AR. A aprovação para implementar seguirá o `AGENTS.MD`; este documento não declara autorização de merge ou publicação.

## 9. Referências e pendências de decisão

Referências internas: [`AGENTS.MD`](AGENTS.MD), [planejamento existente](docs/planejamento-trello-upx8.md), [catálogo](docs/catalogo-locais-upx8.md) e [relatório de acessibilidade](docs/verificacao-acessibilidade-upx8.md). São históricos de implementação e planejamento; revalidar achados antigos contra a versão corrente.

Referências primárias consultadas para orientar a validação:

- [W3C — WCAG 2.2](https://www.w3.org/TR/WCAG22/): critérios de acessibilidade web; a meta AA não equivale à aprovação global do produto por passar alguns testes.
- [W3C — Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum): o mínimo AA web de 24 CSS px possui condições/exceções; a meta própria do projeto de 44 × 44 permanece distinta.
- [Google — ARCore Geospatial](https://developers.google.com/ar/develop/geospatial): sensores, GPS e VPS participam do posicionamento; confirmar suporte e condições do aparelho/ambiente antes de usar a pose.
- [Google — GeospatialPose](https://developers.google.com/ar/reference/java/com/google/ar/core/GeospatialPose): interpretar incerteza horizontal e de orientação conforme a API, sem prometer precisão fixa. A documentação nativa descreve a acurácia horizontal com probabilidade de 68%; conferir o significado dos valores expostos pela versão do Viro usada, sem assumir os 95% mencionados em comentário antigo do código.

Limites físicos aplicáveis devem ser conferidos nas fontes normativas integrais disponíveis à equipe e associados à matriz; este plano não preenche números de inclinação/largura por memória nem atesta conformidade normativa.

Decisões ainda necessárias na etapa 0: acessos de chegada e geometria dos percursos do recorte confirmado, participantes e necessidades prioritárias, responsáveis pelo levantamento e conferência, acesso às plantas/medições e aparelho(s) de teste. Destinos internos e pavimentos de salas ficam para expansão posterior. Datas e responsáveis individuais serão definidos com a equipe; não há atribuição ou cronograma presumido.
