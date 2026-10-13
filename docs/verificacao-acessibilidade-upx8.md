# Verificação de acessibilidade — plano e sistema UniFACENS-Map

Data: 07/10/2026. Base: pesquisa normativa enviada pelo usuário, `planejamento-trello-upx8.md` e código local. Conferência de edições/fontes públicas da ABNT, texto consolidado da LBI, WCAG 2.2 e documentação de acessibilidade do React Native.

## 1. Resultado e alcance

**A cobertura inicial do plano era parcial e a conformidade do sistema não está demonstrada.** O plano previa rotas e validação digital, mas não vinculava todas as normas fornecidas a requisitos mensuráveis. Esta revisão complementou os critérios dos cards existentes; não implementou as correções no aplicativo.

Foi realizada análise estática e cálculo de contraste dos pares de cores definidos no código. Não há `node_modules` instalado na raiz; não foi iniciada a aplicação, inspecionada sua árvore de acessibilidade renderizada nem executado teste com TalkBack/VoiceOver, teclado, aparelho físico ou levantamento presencial. A ausência de props explícitas não comprova, sozinha, falha do leitor de tela: React Native pode inferir informações de componentes nativos.

A pesquisa enviada resume as normas ABNT. A conferência pública realizada nesta revisão cobre metadados e escopos, não todos os requisitos do texto integral. Não foram inventados números de cláusulas, limites de inclinação/largura ou um parecer de conformidade legal. Para concluir a matriz por cláusula, a equipe precisa consultar as versões integrais por seu acesso institucional ou outra fonte autorizada.

## 2. Referências e ajustes identificados

- **NBR 9050:** registrar **ABNT NBR 9050:2020 Versão Corrigida:2021**. O catálogo oficial identifica a incorporação da errata de 2021 e confirmação em 2025. [Registro ABNT](https://www.abntcatalogo.com.br/sebrae/norma.aspx?Q=R0xSeFNpSnIxMU1USVo2d3dhNnA2TDRYZGpWR0htRitnZEd4L29wR3k5cz0%3D).
- **NBR 16537:2024:** edição identificada como em vigor no catálogo; direciona a análise da sinalização tátil física. [Registro ABNT](https://www.abntcatalogo.com.br/sebrae/norma.aspx?Q=b2tvSDRJbWhPeFRjMVlzaVBlajFtbVZVUFVEbE9qS1hqMEw2Y3ZHQ2RyYz0%3D).
- **NBR 15599:2008 e NBR 17060:2022:** listadas como em vigor na coleção pública ABNT consultada por resultado indexado. A abertura da página falhou nesta revisão; a consulta ao texto integral e sua aplicação detalhada continuam pendentes. [Listagem ABNT Coleção](https://www.abntcolecao.com.br/mpf/grid.aspx).
- **Lei 13.146/2015:** usar o texto consolidado. O art. 63 aborda acessibilidade de sítios da internet no âmbito nele definido; não é uma tabela de requisitos de código de app nativo. [LBI — Planalto](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13146.htm#art63).
- **WCAG:** a pesquisa começa citando 2.1 e depois adota 2.2. O plano passa a explicitar meta AA para 2.2 no fluxo web, mantendo a verificação dos requisitos próprios da plataforma móvel. Não basta aprovar apenas os critérios exemplificados neste relatório para declarar conformidade completa. [WCAG 2.2](https://www.w3.org/TR/WCAG22/).
- **Web:** incluir na pesquisa de aplicabilidade a **NBR 17225:2025**, ausente no texto enviado. Há uma versão web no projeto; a referência merece análise própria. [Lançamento pela ABNT](https://abnt.org.br/lancamento-da-abnt-nbr-17225/).

## 3. Matriz de cobertura antes das complementações

| Referência | Cobertura inicial do plano | Evidência no sistema | Complementação realizada |
| --- | --- | --- | --- |
| NBR 9050 | Parcial: recursos/caminhos previstos, mas sem ficha de medidas e referência de verificação | Tabela `anchors` não representa condições físicas de caminhos; não há roteamento | Medidas/evidências e informação desconhecida em levantamento/N01; regras verificáveis N02/N04; campo N14 |
| NBR 16537 | Insuficiente: sinalização tátil não estava detalhada nos cards técnicos | Não há modelo de segmentos táteis ou conexão entre eles | Representar direcional/alerta, continuidade e interrupções no levantamento/N01/N14 |
| NBR 15599 | Parcial: alternativa textual e clareza previstas | Há textos, mas erro web só no console e controle nativo identificado apenas por emoji | N05/N07/N12 com comunicação equivalente, nomes, erros e mensagens de estado |
| NBR 17060 | Parcial: TalkBack previsto, sem requisitos ABNT associados | Controles/formulários principais não expõem associações/semântica explícitas; testes assistivos pendentes | Meta nativa separada de web, matriz por item e checklists N12/N14–N16 |
| LBI | Objetivo de inclusão presente, mas sem rastreabilidade normativa | A finalidade inclusiva não demonstra atendimento jurídico ou acesso efetivo | Registrar aplicabilidade, barreiras e evidências nos requisitos e avaliação; não emitir declaração jurídica |
| WCAG 2.2 | Parcial: faltavam alvo AA explícito, teclado web, campos/erros, foco/modal e anúncio de estados | Há contraste abaixo do limiar em texto normal; outros comportamentos precisam de teste | Critérios objetivos em N12 e evidência exigida na conclusão dos cards |

## 4. Achados verificáveis no código

### A01 — Contraste de texto normal abaixo da referência AA

**Evidência:** `unifacens-client/src/components/ar/ViroARAnchorContainer.web.tsx:67`: texto “Nenhuma âncora cadastrada ainda.” com `#64748b` sobre `#020617`, fonte 13. A relação calculada é **4,239:1**, abaixo de **4,5:1**. O mesmo par aparece nos placeholders do formulário nativo em `ViroARAnchorContainer.native.tsx:379` e `:389`, considerando o fundo `bg-slate-950` definido nesses campos.

O cálculo usa luminância relativa sRGB, soma 0,05 a cada luminância e divide a maior pela menor. Ele verifica os tokens declarados; a cor efetiva do componente nativo precisa ser conferida em aparelho.

| Par declarado | Relação calculada | Comparação com 4,5:1 para texto normal |
| --- | --- | --- |
| `#64748b` / `#020617` | 4,239:1 | Abaixo |
| `#ffffff` / `#2563eb` | 5,169:1 | Acima |
| `#ffffff` / `#dc2626` | 4,829:1 | Acima |
| `#94a3b8` / `#0f172a` | 6,963:1 | Acima |
| `#a855f7` / `#0f172a` | 4,512:1 | Acima, com margem pequena |

**Ação no plano:** N12, corrigir os pares insuficientes e medir também estados e transparência. Esses exemplos não aprovam a paleta inteira. [W3C — contraste mínimo, 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

### A02 — Semântica dos controles e associação dos campos precisam de verificação

**Evidência:** `ViroARAnchorContainer.native.tsx:335–343` contém um controle com texto `🔄`, sem nome descritivo explícito. Os campos em `:374–390` exibem rótulos visuais sem associação explícita ao input. `src/components/ui/form-field.tsx:31–40` também não estabelece essa associação por padrão, embora aceite props adicionais do consumidor. Os botões “Excluir” no catálogo web não incluem o nome do item em um rótulo acessível próprio.

Nos dois containers, na cena AR e no campo compartilhado não foram encontradas atribuições explícitas de props de acessibilidade. Isso é um **risco de implementação**, não prova de que todos os controles sejam invisíveis a leitores de tela: componentes React Native podem inferir nomes a partir do texto filho.

**Ação no plano:** N12, verificar nomes/funções/estados na árvore de acessibilidade, associar rótulos e tornar atualização/exclusão compreensíveis no contexto. [React Native — acessibilidade](https://reactnative.dev/docs/accessibility), [W3C — nome, função e valor, 4.1.2](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html).

### A03 — Estados de erro, vazio e carregamento não são claramente separados na web

**Evidência:** `ViroARAnchorContainer.web.tsx:10–24` registra falha de consulta apenas em `console.warn`; `:65–67` mostra a mensagem de catálogo vazio quando a lista inicial permanece vazia. O usuário pode receber a mesma apresentação durante carregamento e após erro. O formulário nativo e o HUD não têm configuração explícita para anúncio de mudanças relevantes de status.

**Ação no plano:** N05/N07/N12, distinguir erro, carregamento e vazio, com comunicação perceptível e acessível. O anúncio efetivo precisa de teste; não anunciar a pose da câmera continuamente. [W3C — mensagens de estado, 4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).

### A04 — Áreas de toque, foco e texto ampliado não estão comprovados

**Evidência:** controles pequenos com padding e fonte de 11/12 no catálogo web e botão nativo de atualização; não há dimensão mínima explícita nesses controles. O modal nativo usa `autoFocus`, mas não explicita gerenciamento de retorno de foco, exposição modal ou acomodação do teclado. Isso exige inspeção renderizada; não foi declarado tamanho real do alvo com base apenas no código.

**Ação no plano:** N12, medir e testar. A meta do projeto é 44 × 44 unidades lógicas na UI nativa e 44 × 44 CSS px na web. A WCAG 2.2 AA 2.5.8 usa **24 × 24 CSS px com exceções**; não confundir as duas referências nem transportar CSS px diretamente para coordenadas físicas do aparelho. [W3C — tamanho mínimo do alvo](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

### A05 — Ainda não existe o fluxo de navegação acessível para validar

**Evidência:** `unifacens-api/src/db/schema.ts:3` contém somente `anchors`. Não foram encontrados modelo de caminhos, atributos de barreiras/sinalização tátil ou cálculo de rota. A home nativa monta a cena AR e a versão web mostra um catálogo, sem fluxo equivalente de navegação.

**Ação no plano:** levantamentos e N01–N07/N10/N14. Não é possível afirmar atendimento das condições físicas pela API atual. A existência de um ponto chamado “rampa” ou “banheiro acessível” não demonstra que ele e seu acesso atendam aos critérios aplicáveis.

### A06 — Comunicação de sucesso AR não corresponde necessariamente ao serviço

**Evidência:** `ViroARAnchorContainer.native.tsx:188–219`: ID temporário, fallback `ua-cloud-${Date.now()}` e mensagem de âncora fixada na nuvem. Também existe reaproveitamento da posição salva antes de resolução em `:87`.

**Ação no plano:** N08/N09 e comunicação de estados em N12. O usuário deve distinguir demonstração local, hospedagem concluída, busca/resolução e falha. Esse achado é de comportamento/compreensão do sistema; não foi atribuído a uma cláusula ABNT sem consultar o texto integral.

### Aspectos favoráveis, sem aprovação global

- O HUD nativo combina indicador de cor com texto “Estável”/“Mapeando...”; nessa informação, a cor não é o único meio visual.
- O componente compartilhado `form-field.tsx` prevê erro textual, além da borda de erro, e permite receber props extras; sua integração e anúncio precisam de teste.
- Os exemplos medidos de texto branco nos botões azul/vermelho atingem o limiar de contraste de texto normal.
- O plano já previa instruções textuais, origem manual e fallback da AR; essas alternativas ainda precisam ser implementadas e avaliadas.

## 5. Registro de conformidade a preencher pela equipe

Para cada item aplicável, manter: **norma/edição → cláusula ou critério → requisito → card → plataforma/ambiente → método → resultado → evidência → responsável/data**.

Resultados permitidos: **atendido com evidência**, **não atendido**, **pendente de implementação**, **pendente de validação**, **não aplicável com justificativa**. Não preencher “atendido” apenas porque o texto está previsto no plano.

Prioridades: corrigir contraste e semântica no N12; criar a ficha física no levantamento/N01; documentar as regras no N02; verificar erro/estados no N05/N07/N12; comprovar funcionamento no N14 e avaliações N15/N16.

O card de pesquisa normativa pode concluir quando entregar fontes, edições, aplicabilidade, requisitos e instrumentos de verificação revisados. A conformidade do produto depende das implementações e dos testes registrados nos outros cards.

## 6. Evidência adicional do catálogo — 12/10/2026

O cadastro e a edição de locais oferecem coordenadas manuais como alternativa à seleção visual pelo mapa. Cancelamento não altera o registro; falhas de envio preservam os campos e exibem mensagem em português. O seletor de mapa expõe estado expandido na web, e as opções escolhidas de categoria/origem têm nome que comunica a seleção. Os marcadores web têm nome acessível; a lista de locais permanece como alternativa ao mapa.

Foram verificados layout em 360/768/1280 px, ausência de transbordamento horizontal e alvos de pelo menos 44 px nos controles próprios do formulário. O controle de ajuda do rodapé do Google foi ajustado para o mínimo de 24 px, mantendo atribuição e links legais; os controles do fornecedor ainda não são declarados como atendendo à meta de 44 px do projeto.

A auditoria axe-core não encontrou violações nos quatro estados registrados, com Google Maps real, API e PostgreSQL de teste. Ver [evidências e limites](./catalogo-locais-upx8.md). Permanecem pendentes a avaliação manual completa por teclado/leitor de tela, aparelho Android, texto ampliado, AR e as condições físicas do campus. O diagnóstico inicial acima continua como registro histórico de 07/10/2026, sem aprovação global de conformidade.
