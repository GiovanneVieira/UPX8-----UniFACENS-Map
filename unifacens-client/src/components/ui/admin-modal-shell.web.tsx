'use client';

import { useEffect, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

/**
 * Shell de modal do painel admin (web): overlay de DOM cru (fixed, z-1000)
 * — fecha ao clicar fora (o overlay É o backdrop clicável) ou com Esc.
 * Cantos arredondados garantidos com overflow-hidden (o conteúdo scrollável
 * nunca "vaza" o border-radius) e scrollbar estilizada pelo CSS global.
 *
 * ⚠️ Não usa o <Modal> do react-native-web: o wrapper nativo dele se
 * comporta de forma inconsistente para clique-fora/Esc (verificado em
 * device 2026-11-11) — overlay próprio é determinístico no web.
 *
 * `dismissable=false` mantém operações destrutivas (ex.: exclusão em
 * andamento) presas até terminarem.
 */
export function AdminModalShell({
  visible,
  onClose,
  children,
  dismissable = true,
  maxWidth = 'max-w-2xl',
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  dismissable?: boolean;
  maxWidth?: string;
}) {
  const requestClose = () => {
    if (dismissable) onClose();
  };

  // Esc fecha — CAPTURE: a fase de captura chega ao window antes de
  // qualquer stopPropagation no document/React Native Web.
  useEffect(() => {
    if (!visible || !dismissable) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () =>
      window.removeEventListener('keydown', onKey, { capture: true });
  }, [visible, dismissable, onClose]);

  if (!visible) return null;

  return (
    <div
      role="presentation"
      // pointerdown: dispara antes de qualquer cancelamento de click
      // feito pela camada RNW no caminho até o handler.
      onPointerDown={requestClose}
      onClick={requestClose}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 p-3 md:p-6"
    >
      <div
        role="dialog"
        aria-modal="true"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        className={`flex max-h-[95%] w-full ${maxWidth}`}
      >
        <View className="max-h-[95%] w-full overflow-hidden rounded-2xl bg-white shadow-2xl">
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 24 }}
          >
            {children}
          </ScrollView>
        </View>
      </div>
    </div>
  );
}
