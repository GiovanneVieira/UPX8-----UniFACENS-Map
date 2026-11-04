/**
 * Dados acadêmicos MOCKADOS — espelho estrutural do app oficial UniFacens
 * (liga.app.facens), extraído por mapeamento de acessibilidade do dispositivo.
 *
 * NÃO há integração com a API acadêmica da faculdade: estes dados existem
 * para reproduzir a estrutura de telas (Aulas/Notas/Faltas/Carteirinha).
 * As salas usadas (C36, D27...) correspondem a blocos reais do campus para
 * exercitar a integração "Aula → Campus/AR".
 */

export interface ClassSlot {
  id: string;
  day: WeekDay;
  start: string;
  end: string;
  discipline: string;
  teacher: string;
  room: string;
}

export type WeekDay = 'Seg' | 'Ter' | 'Qua' | 'Qui' | 'Sex' | 'Sab';

export const WEEK_DAYS: WeekDay[] = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

export const MOCK_SCHEDULE: ClassSlot[] = [
  { id: 'm1', day: 'Seg', start: '19:00', end: '19:50', discipline: 'Eletrônica Analógica', teacher: 'Rafael Paz', room: 'C36' },
  { id: 'm2', day: 'Seg', start: '21:00', end: '21:50', discipline: 'Eletrônica Analógica', teacher: 'Rafael Paz', room: 'D27 - Lab de Eletrônica de Potência' },
  { id: 'm3', day: 'Ter', start: '19:00', end: '19:50', discipline: 'Arquitetura de Computadores', teacher: 'Ana Souza', room: 'C12' },
  { id: 'm4', day: 'Ter', start: '21:00', end: '21:50', discipline: 'Arquitetura de Computadores', teacher: 'Ana Souza', room: 'C12' },
  { id: 'm5', day: 'Qua', start: '19:00', end: '19:50', discipline: 'Cálculo Numérico', teacher: 'Marcos Lima', room: 'B08' },
  { id: 'm5b', day: 'Qua', start: '21:00', end: '21:50', discipline: 'Cálculo Numérico', teacher: 'Marcos Lima', room: 'B08' },
  { id: 'm5c', day: 'Qua', start: '21:00', end: '21:50', discipline: 'Banco de Dados', teacher: 'Rafael Paz', room: 'D27 - Lab de Eletrônica de Potência' },
  { id: 'm6', day: 'Qui', start: '19:00', end: '19:50', discipline: 'Banco de Dados', teacher: 'Rafael Paz', room: 'C36' },
  { id: 'm7', day: 'Qui', start: '21:00', end: '21:50', discipline: 'Banco de Dados', teacher: 'Rafael Paz', room: 'D27 - Lab de Eletrônica de Potência' },
  { id: 'm8', day: 'Sex', start: '19:00', end: '19:50', discipline: 'Engenharia de Software', teacher: 'Ana Souza', room: 'C12' },
];

export interface ClassTask {
  id: string;
  date: string; // ISO
  discipline: string;
  title: string; // ex.: "Entrega EXP8"
}

/** Tarefas por disciplina (timeline do "Detalhes da Aula"). */
export const MOCK_TASKS: ClassTask[] = [
  { id: 't1', date: '2026-11-11', discipline: 'Eletrônica Analógica', title: 'Entrega EXP9' },
  { id: 't2', date: '2026-11-04', discipline: 'Eletrônica Analógica', title: 'Entrega EXP8' },
  { id: 't3', date: '2026-10-28', discipline: 'Eletrônica Analógica', title: 'Entrega EXP7' },
  { id: 't4', date: '2026-10-21', discipline: 'Eletrônica Analógica', title: 'Entrega EXP6' },
  { id: 't5', date: '2026-11-06', discipline: 'Banco de Dados', title: 'Modelagem ER — entrega' },
  { id: 't6', date: '2026-10-30', discipline: 'Banco de Dados', title: 'Normalização — quiz' },
];

/** Turma por disciplina (campo "Turma" do Detalhes da Aula). */
export const MOCK_CLASS_GROUP: Record<string, string> = {
  'Eletrônica Analógica': 'CP602TIN1',
  'Banco de Dados': 'CP502TIN2',
  'Cálculo Numérico': 'CP502TIN1',
  'Arquitetura de Computadores': 'CP402TIN1',
  'Engenharia de Software': 'CP402TIN3',
};

export interface GradeSubject {
  id: string;
  discipline: string;
  /** Avaliações do período letivo (AC1/AC2/AF/Sub/AG) — null = não lançada. */
  ac1: number | null;
  ac2: number | null;
  af: number | null;
  sub: number | null;
  ag: number | null;
  /** Média final — null enquanto incompleta. */
  media: number | null;
}

/** Histórico completo de períodos letivos (estrutura da tela de Notas). */
export const MOCK_GRADES: Record<string, GradeSubject[]> = {
  '2024/01': [
    { id: 'h0a', discipline: 'Introdução à Engenharia', ac1: 8.0, ac2: 9.0, af: 8.0, sub: null, ag: 9.0, media: 8.5 },
    { id: 'h0b', discipline: 'Geometria Analítica', ac1: 7.0, ac2: 6.5, af: 7.5, sub: null, ag: null, media: 7.0 },
  ],
  '2024/02': [
    { id: 'h1', discipline: 'Cálculo I', ac1: 6.5, ac2: 7.0, af: 6.0, sub: null, ag: 7.5, media: 6.8 },
    { id: 'h2', discipline: 'Programação Estruturada', ac1: 8.0, ac2: 9.0, af: 8.5, sub: null, ag: 9.5, media: 8.8 },
    { id: 'h3', discipline: 'Física I', ac1: 5.5, ac2: 6.0, af: 7.0, sub: 6.5, ag: null, media: 6.3 },
  ],
  '2025/01': [
    { id: 'h4', discipline: 'Cálculo II', ac1: 7.0, ac2: 6.5, af: 7.5, sub: null, ag: null, media: 7.0 },
    { id: 'h5', discipline: 'Estruturas de Dados', ac1: 9.0, ac2: 8.5, af: 9.0, sub: null, ag: 9.0, media: 8.9 },
    { id: 'h6', discipline: 'Circuitos Elétricos', ac1: 6.0, ac2: 7.0, af: 5.5, sub: 6.5, ag: null, media: 6.2 },
    { id: 'h7', discipline: 'Álgebra Linear', ac1: 8.0, ac2: 7.5, af: 8.0, sub: null, ag: null, media: 7.8 },
  ],
  '2025/02': [
    { id: 'h8', discipline: 'Sistemas Digitais', ac1: 7.5, ac2: 8.0, af: 7.0, sub: null, ag: 8.5, media: 7.8 },
    { id: 'h9', discipline: 'Matemática Discreta', ac1: 6.5, ac2: 6.0, af: 7.5, sub: null, ag: null, media: 6.7 },
    { id: 'h10', discipline: 'Programação Orientada a Objetos', ac1: 9.5, ac2: 9.0, af: 10, sub: null, ag: 9.5, media: 9.5 },
  ],
  '2026/01': [
    { id: 'h11', discipline: 'Arquitetura de Computadores', ac1: 10, ac2: null, af: null, sub: null, ag: null, media: null },
    { id: 'h12', discipline: 'Sinais e Sistemas', ac1: 7.0, ac2: null, af: null, sub: null, ag: null, media: null },
    { id: 'h13', discipline: 'Engenharia de Software', ac1: 9.0, ac2: null, af: null, sub: null, ag: null, media: null },
  ],
  '2026/02': [
    { id: 'g1', discipline: 'Eletrônica Analógica', ac1: 7.75, ac2: null, af: null, sub: null, ag: null, media: null },
    { id: 'g2', discipline: 'DevOps e QA', ac1: 10, ac2: null, af: null, sub: null, ag: null, media: null },
    { id: 'g3', discipline: 'Reconhecimento de Padrões', ac1: 10, ac2: null, af: null, sub: null, ag: null, media: null },
    { id: 'g4', discipline: 'UPX – Realidade Aumentada', ac1: 8.06, ac2: null, af: null, sub: null, ag: null, media: null },
  ],
};

export interface AttendanceSubject {
  id: string;
  discipline: string;
  /** Faltas acumuladas sobre o total de aulas lançadas (barra azul da tela oficial). */
  absences: number;
  total: number;
}

export const MOCK_ATTENDANCE: Record<string, AttendanceSubject[]> = {
  '2024/01': [
    { id: 'ha0a', discipline: 'Introdução à Engenharia', absences: 1, total: 20 },
    { id: 'ha0b', discipline: 'Geometria Analítica', absences: 3, total: 20 },
  ],
  '2024/02': [
    { id: 'ha1', discipline: 'Cálculo I', absences: 6, total: 20 },
    { id: 'ha2', discipline: 'Programação Estruturada', absences: 2, total: 20 },
    { id: 'ha3', discipline: 'Física I', absences: 8, total: 20 },
  ],
  '2025/01': [
    { id: 'ha4', discipline: 'Cálculo II', absences: 4, total: 20 },
    { id: 'ha5', discipline: 'Estruturas de Dados', absences: 0, total: 20 },
    { id: 'ha6', discipline: 'Circuitos Elétricos', absences: 5, total: 18 },
    { id: 'ha7', discipline: 'Álgebra Linear', absences: 3, total: 20 },
  ],
  '2025/02': [
    { id: 'ha8', discipline: 'Sistemas Digitais', absences: 2, total: 20 },
    { id: 'ha9', discipline: 'Matemática Discreta', absences: 6, total: 18 },
    { id: 'ha10', discipline: 'Programação Orientada a Objetos', absences: 0, total: 20 },
  ],
  '2026/01': [
    { id: 'ha11', discipline: 'Arquitetura de Computadores', absences: 0, total: 18 },
    { id: 'ha12', discipline: 'Sinais e Sistemas', absences: 4, total: 20 },
    { id: 'ha13', discipline: 'Engenharia de Software', absences: 2, total: 18 },
  ],
  '2026/02': [
    { id: 'a1', discipline: 'Eletrônica Analógica', absences: 4, total: 20 },
    { id: 'a2', discipline: 'DevOps e QA', absences: 4, total: 18 },
    { id: 'a3', discipline: 'Reconhecimento de Padrões', absences: 0, total: 18 },
    { id: 'a4', discipline: 'UPX – Realidade Aumentada', absences: 8, total: 28 },
  ],
};

export interface ServiceLink {
  id: string;
  title: string;
  subtitle: string;
}

export const MOCK_QUICK_SERVICES: ServiceLink[] = [
  { id: 'carteirinha', title: 'Carteirinha', subtitle: '' },
  { id: 'horas', title: 'Horas comp.', subtitle: '' },
  { id: 'eventos', title: 'Eventos', subtitle: '' },
  { id: 'noticias', title: 'Notícias', subtitle: '' },
];

export const MOCK_ACCESS_SERVICES: ServiceLink[] = [
  { id: 'portal', title: 'Portal Acadêmico', subtitle: 'Secretaria e Tesouraria' },
  { id: 'canvas', title: 'Canvas', subtitle: 'Conteúdo das aulas' },
  { id: 'biblioteca', title: 'Biblioteca', subtitle: 'Livros e artigos' },
  { id: 'labs', title: 'Agendamento de Laboratórios', subtitle: 'Escolha uma data e horário para reservar sua vaga' },
  { id: 'fablab', title: 'FabLAB Facens', subtitle: 'Espaço de fabricação digital para prototipar ideias' },
  { id: 'carreiras', title: 'Facens Carreiras', subtitle: 'Apoio para desenvolvimento da sua carreira' },
  { id: 'extensao', title: 'Cursos de Extensão', subtitle: 'Escolha e evolua na NCursos!' },
];

/** Próxima aula do dia (mock): primeira do dia da semana atual, ou a primeira de amanhã. */
export function nextClassOfToday(): ClassSlot | null {
  const jsDay = new Date().getDay(); // 0=Dom
  const map: Record<number, WeekDay> = { 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sab' };
  const today = map[jsDay];
  if (!today) return MOCK_SCHEDULE[0] ?? null;
  return MOCK_SCHEDULE.find((c) => c.day === today) ?? null;
}
