# Relato de percursos — Portaria 1 → Prédio A

- **Registros:** `RELATO-USUARIO-P1-A-001` e complemento `RELATO-USUARIO-P1-A-002`.
- **Data de registro:** 08/11/2026; a data da observação presencial não foi informada.
- **Fonte:** descrição do usuário nesta conversa, em resposta à pergunta sobre P1 → A.
- **Tarefa associada:** `LEV-P1-A` de [percursos.csv](../percursos.csv).
- **Estado:** relatado; medidas, geometria e acessos exatos pendentes.
- **Uso:** inventário de alternativas para levantamento; não é uma rota publicada.
- **Primeiro marco confirmado pelo usuário em 08/11/2026:** chegar ao prédio A, em um ponto de acesso identificado. Salas e circulação interna ficam para expansão posterior; nenhum pavimento de chegada foi definido.

## Descrição original

> São 3 caminhos, 1 envolve uma subida pela calçada, depois uma passarela até o A, outros dois caminho uma escadinha, caminhar pela calçada subir uma rampa e depois uma passarela até o A

## Complemento sobre os caminhos 02 e 03

Relato `RELATO-USUARIO-P1-A-002`, registrado em 08/11/2026:

> Os dois caminhos são parecidos só se separam em uma bifurcação que envolve o próprio predio A mas o andar inferior que é todo aberto e não tem salas de aula

A diferença entre as alternativas foi identificada no relato: há uma bifurcação relacionada ao **andar inferior aberto do prédio A, sem salas de aula**. Esse espaço é uma referência de circulação; não foi informado um número oficial de pavimento, uma porta ou uma sala de destino.

A bifurcação será tratada como ponto de decisão a localizar no levantamento. Não foi informada sua posição em relação à escadinha, rampa ou passarela, qual lado corresponde a cada alternativa ou onde voltam a se encontrar. Não desenhar essas relações por suposição.

## Alternativas identificadas

| ID do relato de alternativa | Sequência descrita/interpretada | Situação |
| --- | --- | --- |
| `REL-P1-A-01` | Calçada em subida → passarela → prédio A | Sequência relatada; acessos, continuidade e medidas pendentes |
| `REL-P1-A-02` | Sequência geral: escadinha → calçada → rampa em subida → passarela → prédio A | Uma das alternativas da bifurcação relacionada ao andar inferior aberto do A; lado e geometria pendentes |
| `REL-P1-A-03` | Sequência geral semelhante à 02 | Outra alternativa dessa bifurcação; lado e geometria pendentes |

O usuário informou três caminhos e esclareceu que 02 e 03 se distinguem por uma bifurcação relacionada ao andar inferior do A. Esses IDs identificam alternativas relatadas, não portas, trechos ou objetos físicos já georreferenciados. A sequência geral foi descrita em conjunto; ainda é necessário localizar a bifurcação dentro dessa sequência.

Não assumir que as passarelas, calçadas, rampas ou escadinhas são as mesmas entre alternativas, nem que são distintas: a identidade e os pontos de encontro ainda precisam ser confirmados. A ordem da tabela segue o relato, sem presumir sequência ou conexão entre os três caminhos.

## Implicações para as necessidades de mobilidade

- **01:** não houve menção a escada, o que não confirma ausência de degraus ou soleiras no percurso completo. A subida precisa de medição de inclinação, comprimento, largura livre, piso e apoios. Compatibilidade permanece desconhecida.
- **02 e 03:** pela interpretação inicial, incluem degraus. Se essa sequência for confirmada, não atendem à restrição "não posso usar escadas". Uma rampa adiante não elimina os degraus anteriores. Não confirmar elegibilidade até esclarecer a descrição e levantar o percurso.
- **Todos:** nenhuma distância, altura, inclinação, largura, piso tátil, corrimão, estado operacional ou necessidade de assistência foi informada. Não há classificação geral de acessibilidade nem comparação de menor esforço.
- **Chegada:** o usuário confirmou que o objetivo inicial é somente chegar ao prédio. O andar inferior aberto é referência da bifurcação; ainda falta identificar o acesso/ponto final reproduzível. Não exigir chegada a sala ou navegação interna para concluir esse marco e não presumir pavimento ou desnível adicional. Validar a ligação até o acesso escolhido, sem usar apenas a proximidade ao centro do prédio como chegada.
- **Volta:** A → P1 não foi descrita; `LEV-A-P1` continua planejada. Não inverter automaticamente o relato como trajeto validado.

## Próximos dados a coletar

1. Localizar a bifurcação relacionada ao andar inferior aberto do A dentro da sequência descrita; identificar os dois ramais e eventual reencontro.
2. Identificar a saída de pedestres da P1, a entrada do A e referências reconhecíveis em cada mudança de direção.
3. Identificar quais recursos e trechos são compartilhados para atribuir um único ID físico por objeto/sentido.
4. Registrar geometrias e medidas de calçadas, degraus, rampas, passarelas e transições de acesso, com fonte e precisão.
5. Conferir obstáculos, funcionamento, apoio e sinalização de cada alternativa e levantar o retorno.

Somente depois da identificação física serão preenchidos [nós](../nos.csv), [trechos](../trechos.csv) e [recursos](../recursos.csv). A separação preserva o relato sem fabricar uma malha a partir de uma descrição ainda incompleta.
