import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../hooks/use-auth';
import { AuthModal } from './auth-modal';

/**
 * Painel de conta: entrada para login/logout e indicação de permissão.
 * Substitui o antigo TeamAccessPanel (código de equipe estático).
 */
export function AuthPanel() {
  const { authenticated, isAdmin, user, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <View className="flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text className="text-sm font-semibold text-white">
            {authenticated ? `Conta: ${user?.name}` : 'Entre com sua conta'}
          </Text>
          <Text className="mt-0.5 text-xs text-slate-400">
            {authenticated
              ? isAdmin
                ? 'Acesso de administrador: edição e exclusão liberadas.'
                : 'Conta comum: consulta e contribuição. A edição é exclusiva da equipe.'
              : 'Crie uma conta ou entre para contribuir com o campus.'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => (authenticated ? void signOut() : setOpen(true))}
          className="min-h-[44px] justify-center rounded-xl bg-blue-700 px-4 active:opacity-80"
        >
          <Text className="font-semibold text-white">
            {authenticated ? 'Sair' : 'Entrar'}
          </Text>
        </Pressable>
      </View>
      {open ? <AuthModal onClose={() => setOpen(false)} /> : null}
    </View>
  );
}
