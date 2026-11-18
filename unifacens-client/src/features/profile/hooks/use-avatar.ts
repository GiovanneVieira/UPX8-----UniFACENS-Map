import { useMutation } from '@tanstack/react-query';
import { removeUserAvatar, uploadUserAvatar } from '@/services/api';
import { useAuthStore } from '@/stores/use-auth-store';

export interface PendingAvatarPhoto {
  uri: string;
  fileName: string;
  mime: string;
}

function commitImageToStore(image: string | null): void {
  const { jwt, user } = useAuthStore.getState();
  if (!jwt || !user) return;
  useAuthStore.getState().setSession(jwt, { ...user, image });
}

/**
 * Mutations de foto de perfil: envio (câmera/biblioteca) e remoção.
 * No sucesso, o user do store é atualizado in-place — o drawer e a
 * carteirinha reagem na hora (JWT inalterado: image não vai no token).
 */
export function useAvatarUpload() {
  return useMutation({
    mutationFn: (photo: PendingAvatarPhoto) => uploadUserAvatar(photo),
    onSuccess: ({ image }) => commitImageToStore(image),
  });
}

export function useAvatarRemoval() {
  return useMutation({
    mutationFn: () => removeUserAvatar(),
    onSuccess: () => commitImageToStore(null),
  });
}
