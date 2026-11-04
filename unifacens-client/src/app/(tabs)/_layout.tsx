import AppTabs from '@/components/app-tabs';

/**
 * Grupo de abas raiz (Início | Campus | Realidade Aumentada).
 * O AuthGate no _layout garante que este grupo só monta autenticado.
 */
export default function TabsLayout() {
  return <AppTabs />;
}
