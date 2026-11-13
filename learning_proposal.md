# Identidade dos locais e planejamento por pontos AR

RequestFeedback: true

Data: 13/11/2026. Orientação do usuário confirmada e implementação autorizada nesta conversa.

O usuário cadastrou locais de interesse como pontos AR, com nomes e referências. A tela de planejamento consultava somente os nós de uma rede publicada e restringia destinos a acessos de prédios. Isso ocultava os cadastros AR e levou à interpretação incorreta de que era necessário cadastrar novamente cada local em `places`.

Regra de domínio: o ponto AR já é o local. Pesquisar nome/referências em `anchors`, selecionar pelo UUID `anchorId` e resolver essa identidade para a rede de caminhos. O relacionamento com `places` é opcional para esse fluxo. Uma referência textual identifica o local para a pessoa; a associação técnica usa o ID estável.

Guardrails registrados no AGENTS.md:

- Reaproveitar as âncoras existentes; não exigir um segundo cadastro do local.
- Manter a busca disponível mesmo sem percursos publicados ou sem vínculo à rede.
- Separar a identidade do local dos trechos usados no cálculo e explicar quando o percurso estiver indisponível.
- Não restringir destino à categoria visual nem inferir caminhos de coordenadas/texto.

Verificação: casos de busca por referências/acentos, cálculo por `anchorId` com PostgreSQL real, renomeação, ausência de vínculo, remoção de âncora, integridade da migration e interface com vinte registros sintéticos. Este arquivo documenta o aprendizado; não declara teste nos dados reais cadastrados pelo usuário.
