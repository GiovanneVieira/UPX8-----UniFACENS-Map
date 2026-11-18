import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { resolveAssetUrl } from '@/services/api';
import { useAvatarRemoval, useAvatarUpload } from '../hooks/use-avatar';

interface AvatarPickerProps {
  /** Diâmetro do avatar em dp (mínimo 44 para área de toque). */
  size?: number;
}

/**
 * Avatar do usuário com troca de foto (câmera ou biblioteca) e remoção.
 *
 * O seletor é um overlay ABSOLUTO — este componente vive dentro do Modal do
 * drawer, e Modais RN aninhados quebram a window (lição §14 do AGENTS.md).
 */
export function AvatarPicker({ size = 56 }: AvatarPickerProps) {
  const { user } = useAuth();
  const upload = useAvatarUpload();
  const removal = useAvatarRemoval();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const busy = upload.isPending || removal.isPending;
  const image = user?.image ?? null;

  const takePhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Câmera', 'Permita o acesso à câmera para tirar sua foto.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    upload.mutate({
      uri: asset.uri,
      fileName: asset.fileName ?? 'avatar.jpg',
      mime: asset.mimeType ?? 'image/jpeg',
    });
  }, [upload]);

  const pickFromLibrary = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Biblioteca', 'Permita o acesso às fotos para escolher sua foto.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    upload.mutate({
      uri: asset.uri,
      fileName: asset.fileName ?? 'avatar.jpg',
      mime: asset.mimeType ?? 'image/jpeg',
    });
  }, [upload]);

  function handleUploadError() {
    Alert.alert(
      'Foto de perfil',
      upload.error instanceof Error
        ? upload.error.message
        : 'Não foi possível salvar a foto. Tente novamente.',
    );
  }

  return (
    <View className="items-center">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Alterar foto de perfil"
        accessibilityState={{ busy }}
        disabled={busy}
        onPress={() => setOptionsOpen(true)}
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

      {upload.isError ? (
        <Pressable accessibilityRole="button" onPress={handleUploadError} className="mt-1">
          <Text className="text-xs text-rose-300">Falha ao salvar — toque para ver detalhes.</Text>
        </Pressable>
      ) : null}

      {optionsOpen ? (
        <View className="absolute inset-0 justify-end">
          <Pressable
            accessibilityLabel="Fechar opções de foto"
            className="absolute inset-0 bg-black/70"
            onPress={() => setOptionsOpen(false)}
          />
          <View className="gap-1 rounded-t-3xl bg-neutral-900 px-4 pb-6 pt-4">
            <Text className="px-2 pb-2 text-base font-semibold text-white">
              Foto de perfil
            </Text>
            <OptionRow
              icon="camera-outline"
              label="Tirar foto"
              onPress={() => {
                setOptionsOpen(false);
                void takePhoto();
              }}
            />
            <OptionRow
              icon="images-outline"
              label="Escolher da biblioteca"
              onPress={() => {
                setOptionsOpen(false);
                void pickFromLibrary();
              }}
            />
            {image ? (
              <OptionRow
                icon="trash-outline"
                label="Remover foto"
                danger
                onPress={() => {
                  setOptionsOpen(false);
                  removal.mutate();
                }}
              />
            ) : null}
            <OptionRow
              icon="close-outline"
              label="Cancelar"
              onPress={() => setOptionsOpen(false)}
            />
          </View>
        </View>
      ) : null}
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
