# Implementation Plan v3 — Fidelidade total + Performance (A8+)

> Diagnóstico completo do app oficial (drill-downs + drawer + detalhes) + auditoria do nosso.

---

## 🔍 Descobertas da exploração (oficial)

| Área | Descoberta |
|------|-----------|
| **Detalhes da Aula** (`drill-down central`) | Tela alcançada do carrossel da Home, dos cards de Aulas E das disciplinas de Notas/Faltas. Contém: disciplina + professor completo + dia/horário + **salas expandíveis** ("C36, D27-Lab..., Expanded") + **Turma** (CP602TIN1) + **Faltas n/total** (navegável) + **Notas AC1/AC2/...** + **timeline de Tarefas** agrupadas por data ("Tarefa" azul, 04/11/2026, "Entrega EXP8") |
| **Drawer** | Header com avatar + nome + curso; Carteirinha; **Botão de Emergência** → bottom sheet (dropdown motivo + campo "Digite a sua localização" + "Enviar solicitação de ajuda"); Notificações; Configurações (**Aparência / Atualizações / Segurança / Idioma**); Ajuda; Reportar um problema; Desconectar; **versão 4.0.19-b122 no rodapé** |
| **Header da Home** | Hambúrguer (esq) + sino com badge (dir) |

## 🔍 Auditoria de performance (nosso app)

| Problema | Causa raiz |
|----------|-----------|
| **Maps trava/pula** | `region` CONTROLADO no `MapView`: a cada re-render (cada tecla digitada na busca!) o mapa voa para a região. Correto: `initialRegion` + `animateCamera` via ref apenas quando `selectedPlace` muda |
| Lista de locais sem reciclagem | `ScrollView` + `map()` renderiza TODOS os cards |
| Re-renders em cascata | `CampusMap` sem `React.memo` — qualquer estado do explorer re-cria markers |

## 📋 Fases

**B1 — Sidebar/Drawer completo (Home)**
- Header da Home com hambúrguer + sino (badge)
- Drawer lateral (overlay): avatar+nome+curso, Carteirinha, Botão de Emergência (bottom sheet: motivo + localização + enviar — mock), Notificações (lista mock), Configurações (Aparência = **tema claro/escuro REAL** via useTheme, Atualizações/Segurança/Idioma placeholders), Ajuda (FAQ mock), Reportar (form mock), Desconectar (=signOut), versão do app no rodapé
- Rotas empilhadas: /notificacoes /configuracoes /ajuda /reportar

**B2 — Detalhes da Aula (hub de disciplina)**
- Rota /aula-detalhe: header + card (disciplina, professor, dia/hora, salas expandíveis) + Turma + Faltas (link) + Notas (AC1..Média) + Tarefas (timeline por data)
- Entradas: carrossel Home, cards de Aulas, disciplinas em Notas/Faltas
- Mocks: `tasks[]` por disciplina + turma

**B3 — Períodos históricos**
- Mocks: 2024/2 → 2026/2 (5 períodos, dados fictícios coerentes) em Notas E Faltas

**B4 — Limpeza**
- Remover o badge "Modo leitura" do AR (esconde o botão e pronto, sem feedback)

**B5 — Performance**
- Maps: `initialRegion` fixo + `animateCamera` via ref no select; `React.memo(CampusMap)`
- Lista de locais: `FlatList` virtualizada + `memo(PlaceCard)`

**B6 — Validação device + AGENTS.md §14 (mapa completo de referência)**
