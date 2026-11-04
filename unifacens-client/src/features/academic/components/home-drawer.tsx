import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/hooks/use-auth';

const APP_VERSION = '1.0.0-dev';

interface DrawerProps {
  visible: boolean;
  onClose: () => void;
}

/** Bottom sheet do Botão de Emergência (espelho oficial: motivo + localização). */
function EmergencySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/70" onPress={onClose}>
        <Pressable className="gap-4 rounded-t-3xl bg-neutral-900 px-6 pb-8 pt-6" onPress={(e) => e.stopPropagation()}>
          <Text className="text-lg font-bold text-white">
            Confirme o envio de sua localização e mensagem de emergência
          </Text>
          <Text className="text-sm text-neutral-400">Nos ajude a te localizar</Text>
          <Pressable className="flex-row items-center justify-between rounded-2xl bg-neutral-800 px-4 py-4">
            <Text className="text-sm text-neutral-300">Selecione o motivo</Text>
            <Ionicons name="chevron-down" size={16} color="#8F8F8F" />
          </Pressable>
          <Pressable className="min-h-[48px] justify-center rounded-2xl bg-neutral-800 px-4">
            <Text className="text-sm text-neutral-500">Digite a sua localização</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            className="min-h-[48px] items-center justify-center rounded-full bg-rose-600 active:opacity-80">
            <Text className="font-semibold text-white">Enviar solicitação de ajuda</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onClose} className="self-center py-2">
            <Text className="text-sm text-neutral-400">Cancelar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Sidebar (drawer) da Home — fidelidade ao app oficial: perfil com avatar,
 * Carteirinha, Botão de Emergência (bottom sheet), Notificações,
 * Configurações, Ajuda, Reportar um problema, Desconectar e versão no
 * rodapé. Itens institucionais navegáveis; dados de demonstração.
 */
export function HomeDrawer({ visible, onClose }: DrawerProps) {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const [emergencyVisible, setEmergencyVisible] = useState(false);

  if (!visible) return null;

  const items: Array<{
    key: string;
    icon: string;
    label: string;
    danger?: boolean;
    onPress: () => void;
  }> = [
    {
      key: 'carteirinha',
      icon: 'card-outline',
      label: 'Carteirinha de identidade UniFacens',
      onPress: () => {
        onClose();
        router.push('/carteirinha');
      },
    },
    {
      key: 'emergencia',
      icon: 'warning-outline',
      label: 'Botão de Emergência',
      danger: true,
      onPress: () => {
        onClose();
        setEmergencyVisible(true);
      },
    },
    {
      key: 'notificacoes',
      icon: 'notifications-outline',
      label: 'Notificações',
      onPress: () => {
        onClose();
        router.push('/notificacoes');
      },
    },
    {
      key: 'configuracoes',
      icon: 'settings-outline',
      label: 'Configurações',
      onPress: () => {
        onClose();
        router.push('/configuracoes');
      },
    },
    {
      key: 'ajuda',
      icon: 'help-circle-outline',
      label: 'Ajuda',
      onPress: () => {
        onClose();
        router.push('/ajuda');
      },
    },
    {
      key: 'reportar',
      icon: 'bug-outline',
      label: 'Reportar um problema',
      onPress: () => {
        onClose();
        router.push('/reportar');
      },
    },
    {
      key: 'desconectar',
      icon: 'log-out-outline',
      label: 'Desconectar',
      onPress: () => void signOut(),
    },
  ];

  return (
    <>
      <Modal visible transparent animationType="slide" onRequestClose={onClose}>
        <View className="flex-1 bg-black/60">
          <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Fechar menu" />
          <View className="max-h-[88%] rounded-t-3xl bg-neutral-950" style={{ paddingBottom: insets.bottom + 8 }}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View className="gap-1 px-6 pb-2 pt-6">
                <Text className="text-2xl font-bold text-white">Menu</Text>
              </View>

              {/* Perfil: avatar + nome + curso (espelho oficial) */}
              <View className="flex-row items-center gap-4 px-6 py-4">
                <View className="h-14 w-14 items-center justify-center rounded-full bg-neutral-800">
                  <Ionicons name="person" size={26} color="#D4D4D4" />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text className="text-base font-bold text-white">{user?.name ?? '—'}</Text>
                  <Text className="text-sm text-neutral-400">
                    {user?.role === 'admin' ? 'Equipe UniFACENS Map' : 'Engenharia de Computação'}
                  </Text>
                </View>
              </View>

              {/* Itens do menu */}
              <View className="pb-4">
                {items.map((item) => (
                  <Pressable
                    key={item.key}
                    accessibilityRole="button"
                    onPress={item.onPress}
                    className={`min-h-[64px] flex-row items-center gap-4 px-6 active:bg-neutral-900 ${
                      item.key === 'emergencia' ? 'mx-4 my-1 rounded-2xl bg-rose-950/60' : ''
                    }`}>
                    <Ionicons
                      name={item.icon as keyof typeof Ionicons.glyphMap}
                      size={22}
                      color={item.danger ? '#FDA4AF' : '#A3A3A3'}
                    />
                    <Text
                      className={`flex-1 text-[15px] ${
                        item.danger ? 'font-semibold text-rose-200' : 'text-neutral-200'
                      }`}>
                      {item.label}
                    </Text>
                    {!item.danger ? (
                      <Ionicons name="chevron-forward" size={16} color="#404040" />
                    ) : null}
                  </Pressable>
                ))}
              </View>

              {/* Versão no rodapé (espelho oficial) */}
              <View className="items-center py-3">
                <Text className="text-xs text-neutral-600">{APP_VERSION}</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <EmergencySheet
        visible={emergencyVisible}
        onClose={() => setEmergencyVisible(false)}
      />
    </>
  );
}
