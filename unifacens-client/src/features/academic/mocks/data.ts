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

/** Estrutura idêntica à tela de Notas do app oficial (colunas segmentadas). */
export const MOCK_GRADES: Record<string, GradeSubject[]> = {
  '2026/2': [
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
  '2026/2': [
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
