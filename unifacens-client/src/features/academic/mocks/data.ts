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
  { id: 'm6', day: 'Qui', start: '19:00', end: '19:50', discipline: 'Banco de Dados', teacher: 'Rafael Paz', room: 'C36' },
  { id: 'm7', day: 'Qui', start: '21:00', end: '21:50', discipline: 'Banco de Dados', teacher: 'Rafael Paz', room: 'D27 - Lab de Eletrônica de Potência' },
  { id: 'm8', day: 'Sex', start: '19:00', end: '19:50', discipline: 'Engenharia de Software', teacher: 'Ana Souza', room: 'C12' },
];

export interface GradeSubject {
  id: string;
  discipline: string;
  grades: Array<{ label: string; value: number | null }>;
  average: number | null;
}

export const MOCK_GRADES: Record<string, GradeSubject[]> = {
  '2026/2': [
    {
      id: 'g1',
      discipline: 'Eletrônica Analógica',
      grades: [
        { label: 'P1', value: 7.5 },
        { label: 'P2', value: 8.0 },
        { label: 'Trabalho', value: 9.0 },
      ],
      average: 8.2,
    },
    {
      id: 'g2',
      discipline: 'Arquitetura de Computadores',
      grades: [
        { label: 'P1', value: 6.0 },
        { label: 'P2', value: null },
        { label: 'Trabalho', value: 7.5 },
      ],
      average: null,
    },
  ],
};

export interface AttendanceSubject {
  id: string;
  discipline: string;
  absences: number;
  limit: number;
}

export const MOCK_ATTENDANCE: Record<string, AttendanceSubject[]> = {
  '2026/2': [
    { id: 'a1', discipline: 'Eletrônica Analógica', absences: 2, limit: 12 },
    { id: 'a2', discipline: 'Arquitetura de Computadores', absences: 0, limit: 10 },
    { id: 'a3', discipline: 'Cálculo Numérico', absences: 4, limit: 12 },
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
