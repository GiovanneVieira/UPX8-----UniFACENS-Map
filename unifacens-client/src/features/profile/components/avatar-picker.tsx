import { ActivityIndicator, Alert, Image, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { resolveAssetUrl } from '@/services/api';
import { useAvatarRemoval, useAvatarUpload } from '../hooks/use-avatar';

/**
 * Avatar do perfil — SOMENTE o botão de exibição (foto/fallback + badge de
 * câmera). ⚠️ A folha de opções NÃO vive aqui: overlay `absolute inset-0` é
 * relativo ao PAI no RN — aninhada na row do perfil ela quebrava o layout
 * (lição 2026-11-18, mesma família do sheet de emergência §14 do
 * AGENTS.md). A folha (AvatarOptionsSheet) é renderizada na RAIZ do Modal
 * do drawer, como irmã do conteúdo.
 */
export function AvatarPicker({
  size = 56,
  onOpenOptions,
}: {
  size?: number;
  onOpenOptions: () => void;
}) {
  const { user } = useAuth();
  const upload = useAvatarUpload();
  const busy = upload.isPending;
  const image = user?.image ?? null;

  return (
    <View className="items-center">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Alterar foto de perfil"
        accessibilityState={{ busy }}
        disabled={busy}
        onPress={onOpenOptions}
        className="relative items-center justify-center"
        style={{ width: size, height: size }}>
        <View
          className="items-center justify-center overflow-hidden rounded-full bg-neutral-800"
          style={{ width: size, height: size }}>
          {image ? (
            <Image
              source={{ uri: resolveAssetUrl(image) }}
              style={{ width: size, height: size }}
              accessibilityLabel={`Foto de perfil de ${user?.name ?? 'usuário'}`}
            />
          ) : (
            <Ionicons name="person" size={Math.round(size * 0.46)} color="#D4D4D4" />
          )}
        </View>
        <View
          className="absolute bottom-0 right-0 items-center justify-center rounded-full border-2 border-neutral-950 bg-blue-700"
          style={{ width: Math.max(22, size * 0.36), height: Math.max(22, size * 0.36) }}>
          {busy ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Ionicons name="camera" size={Math.max(12, Math.round(size * 0.2))} color="#ffffff" />
          )}
        </View>
      </Pressable>
    </View>
  );
}

/**
 * Folha de opções de foto (câmera / biblioteca / remover / cancelar).
 * RENDERIZAR NA RAIZ DO MODAL do drawer (overlay cobre o modal inteiro).
 */
export function AvatarOptionsSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const upload = useAvatarUpload();
  const removal = useAvatarRemoval();
  const image = user?.image ?? null;
  if (!visible) return null;

  async function pickAndUpload(
    launch: () => Promise<ImagePicker.ImagePickerResult>,
  ) {
    onClose();
    const result = await launch();
    if (result.canceled) return;
    const asset = result.assets[0];
    upload.mutate(
      {
        uri: asset.uri,
        fileName: asset.fileName ?? 'avatar.jpg',
        mime: asset.mimeType ?? 'image/jpeg',
      },
      {
        onError: (error) =>
          Alert.alert(
            'Foto de perfil',
            error instanceof Error ? error.message : 'Não foi possível salvar a foto.',
          ),
      },
    );
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Câmera', 'Permita o acesso à câmera para tirar sua foto.');
      return;
    }
    void pickAndUpload(() =>
      ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsEditing: true,
        aspect: [1, 1],
      }),
    );
  }

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Biblioteca', 'Permita o acesso às fotos para escolher sua foto.');
      return;
    }
    void pickAndUpload(() =>
      ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsEditing: true,
        aspect: [1, 1],
      }),
    );
  }

  return (
    <View className="absolute inset-0 justify-end">
      <Pressable
        accessibilityLabel="Fechar opções de foto"
        className="absolute inset-0 bg-black/70"
        onPress={onClose}
      />
      <View className="gap-1 rounded-t-3xl bg-neutral-900 px-4 pb-6 pt-4">
        <Text className="px-2 pb-2 text-base font-semibold text-white">
          Foto de perfil
        </Text>
        <OptionRow icon="camera-outline" label="Tirar foto" onPress={() => void takePhoto()} />
        <OptionRow
          icon="images-outline"
          label="Escolher da biblioteca"
          onPress={() => void pickFromLibrary()}
        />
        {image ? (
          <OptionRow
            icon="trash-outline"
            label="Remover foto"
            danger
            onPress={() => {
              onClose();
              removal.mutate(undefined, {
                onError: () => Alert.alert('Foto de perfil', 'Não foi possível remover a foto.'),
              });
            }}
          />
        ) : null}
        <OptionRow icon="close-outline" label="Cancelar" onPress={onClose} />
      </View>
    </View>
  );
}

function OptionRow({
  icon,
  label,
  danger = false,
  onPress,
}: {
  icon: string;
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-[52px] flex-row items-center gap-3 rounded-2xl px-3 active:bg-neutral-800">
      <Ionicons
        name={icon as keyof typeof Ionicons.glyphMap}
        size={22}
        color={danger ? '#FDA4AF' : '#A3A3A3'}
      />
      <Text className={`flex-1 text-[15px] ${danger ? 'text-rose-200' : 'text-neutral-200'}`}>
        {label}
      </Text>
    </Pressable>
  );
}
