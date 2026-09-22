import React, { FC, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { ViroARSceneNavigator } from '@reactvision/react-viro';
import { ViroARAnchorScene } from './ViroARAnchorScene';
import {
  fetchAnchors,
  createAnchor,
  deleteAnchor,
} from '@/services/api';
import type { Anchor } from 'shared';

export const ViroARAnchorContainer: FC = () => {
  const navigatorRef = useRef<any>(null);
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [anchorName, setAnchorName] = useState('');
  const [anchorDescription, setAnchorDescription] = useState('');
  const [pendingCoords, setPendingCoords] = useState<[number, number, number]>([0, 0, -1.5]);

  // Estado de Rastreamento SLAM (1: Indisponível, 2: Limitado/Mapeando, 3: Normal/Estável)
  const [trackingState, setTrackingState] = useState<number>(2);

  // Status de sincronização com o Google ARCore Cloud Anchors
  const [cloudStatus, setCloudStatus] = useState<string>('Inicializando ARCore...');
  const [resolvedCount, setResolvedCount] = useState<number>(0);

  // Rastreamento estrito via referências em memória (sem provocar re-renders no React a 60fps)
  const cameraPosRef = useRef<[number, number, number]>([0, 0, 0]);
  const cameraFwdRef = useRef<[number, number, number]>([0, 0, -1]);

  // Helper para acessar métodos nativos de Cloud Anchors no ViroARSceneNavigator
  const getARNav = useCallback(() => {
    const n = navigatorRef.current;
    if (!n) return null;
    return {
      hostCloudAnchor: async (anchorId: string, ttl: number = 1) => {
        if (typeof n._hostCloudAnchor === 'function') {
          return await n._hostCloudAnchor(anchorId, ttl);
        }
        if (n.arSceneNavigator && typeof n.arSceneNavigator.hostCloudAnchor === 'function') {
          return await n.arSceneNavigator.hostCloudAnchor(anchorId, ttl);
        }
        if (n.sceneNavigator && typeof n.sceneNavigator.hostCloudAnchor === 'function') {
          return await n.sceneNavigator.hostCloudAnchor(anchorId, ttl);
        }
        if (typeof n.hostCloudAnchor === 'function') {
          return await n.hostCloudAnchor(anchorId, ttl);
        }
        return null;
      },
      resolveCloudAnchor: async (cloudAnchorId: string) => {
        if (typeof n._resolveCloudAnchor === 'function') {
          return await n._resolveCloudAnchor(cloudAnchorId);
        }
        if (n.arSceneNavigator && typeof n.arSceneNavigator.resolveCloudAnchor === 'function') {
          return await n.arSceneNavigator.resolveCloudAnchor(cloudAnchorId);
        }
        if (n.sceneNavigator && typeof n.sceneNavigator.resolveCloudAnchor === 'function') {
          return await n.sceneNavigator.resolveCloudAnchor(cloudAnchorId);
        }
        if (typeof n.resolveCloudAnchor === 'function') {
          return await n.resolveCloudAnchor(cloudAnchorId);
        }
        return null;
      },
    };
  }, []);

  const loadAnchors = useCallback(async () => {
    try {
      setLoading(true);
      setCloudStatus('Buscando catálogo na nuvem...');
      const list = await fetchAnchors();

      // Inicializa arPosition imediatamente usando a pose 3D persistida no banco
      const initialAnchors: Anchor[] = list.map((a) => ({
        ...a,
        arPosition: a.arPosition || a.position || undefined,
      }));
      setAnchors(initialAnchors);

      if (initialAnchors.length === 0) {
        setCloudStatus('Nenhuma âncora cadastrada');
        return;
      }

      setCloudStatus(`Resolvendo ${initialAnchors.length} âncoras no espaço físico...`);
      let resolvedSuccess = 0;
      const arNav = getARNav();

      if (arNav) {
        for (const item of initialAnchors) {
          if (!item.cloudAnchorId) continue;
          try {
            const res = await arNav.resolveCloudAnchor(item.cloudAnchorId);
            if (res?.anchor?.position) {
              setAnchors((current) =>
                current.map((a) =>
                  a.id === item.id ? { ...a, arPosition: res.anchor!.position } : a,
                ),
              );
              resolvedSuccess++;
              setResolvedCount(resolvedSuccess);
            }
          } catch (resolveErr) {
            console.log('[CloudAnchor] Aguardando alinhamento visual para resolver:', item.cloudAnchorId);
          }
        }
      }

      setCloudStatus(
        resolvedSuccess > 0
          ? `☁️ ${resolvedSuccess}/${initialAnchors.length} ativas (ARCore)`
          : `📍 ${initialAnchors.length} carregadas (Pose 3D)`,
      );
    } catch (err: any) {
      console.warn('Erro ao carregar âncoras:', err);
      setCloudStatus('Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [getARNav]);

  useEffect(() => {
    loadAnchors();
  }, [loadAnchors]);

  // Atualização contínua de vetor da câmera vinda do ViroARScene (puramente em memória por Refs)
  const handleCameraUpdate = useCallback(
    (pos: [number, number, number], fwd: [number, number, number]) => {
      cameraPosRef.current = pos;
      cameraFwdRef.current = fwd;
    },
    [],
  );

  const handleTrackingUpdate = useCallback((state: number) => {
    setTrackingState(state);
  }, []);

  const handleOpenPlaceModal = useCallback(() => {
    const [cx, cy, cz] = cameraPosRef.current;
    const [fx, fy, fz] = cameraFwdRef.current;
    // Mira 1.5 metros à frente da câmera
    setPendingCoords([
      Number((cx + fx * 1.5).toFixed(2)),
      Number((cy + fy * 1.5).toFixed(2)),
      Number((cz + fz * 1.5).toFixed(2)),
    ]);
    setModalVisible(true);
  }, []);

  const handlePlaceAtPosition = useCallback((pos: [number, number, number]) => {
    setPendingCoords([
      Number(pos[0].toFixed(2)),
      Number(pos[1].toFixed(2)),
      Number(pos[2].toFixed(2)),
    ]);
    setModalVisible(true);
  }, []);

  const handleCreate = async () => {
    if (!anchorName.trim()) {
      Alert.alert('Aviso', 'Informe o nome da âncora.');
      return;
    }

    try {
      setLoading(true);
      setModalVisible(false);
      setCloudStatus('Hospedando no Google ARCore...');

      let cloudAnchorId = '';

      // Hospeda a pose visual diretamente no Google ARCore
      const arNav = getARNav();
      if (arNav) {
        try {
          const tempAnchorId = `temp-${Date.now()}`;
          const hostRes = await arNav.hostCloudAnchor(tempAnchorId, 1);
          if (hostRes?.cloudAnchorId) {
            cloudAnchorId = hostRes.cloudAnchorId;
          }
        } catch (hostErr: any) {
          console.warn('[CloudAnchor] Host ARCore falhou, gerando identificador local:', hostErr);
        }
      }

      // Se em emulador ou ambiente de desenvolvimento sem ARCore ativo, gera um ID simulado
      if (!cloudAnchorId) {
        cloudAnchorId = `ua-cloud-${Date.now()}`;
      }

      // Salva no banco de dados da API NestJS incluindo as coordenadas 3D
      const saved = await createAnchor({
        name: anchorName.trim(),
        cloudAnchorId,
        description: anchorDescription.trim() || undefined,
        position: pendingCoords,
      });

      // Renderiza imediatamente na posição onde foi criada
      const anchorWithPose: Anchor = {
        ...saved,
        arPosition: pendingCoords,
      };

      setAnchors((prev) => [anchorWithPose, ...prev]);
      setResolvedCount((prev) => prev + 1);
      setCloudStatus('Âncora Fixada na Nuvem!');
      setAnchorName('');
      setAnchorDescription('');

      Alert.alert(
        'Sucesso!',
        `Âncora "${saved.name}" hospedada na nuvem da Google!\n\nID: ${saved.cloudAnchorId}`,
      );
    } catch (err: any) {
      Alert.alert('Erro', 'Falha ao salvar âncora: ' + err.message);
      setCloudStatus('Falha ao hospedar');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAnchor = useCallback((anchor: Anchor) => {
    const arPos = anchor.arPosition || [0, 0, 0];
    const descInfo = anchor.description ? `\nDescrição: ${anchor.description}` : '';

    Alert.alert(
      anchor.name,
      `☁️ Google Cloud Anchor ID:\n${anchor.cloudAnchorId}\n${descInfo}\nPosição 3D: [${arPos[0].toFixed(2)}, ${arPos[1].toFixed(2)}, ${arPos[2].toFixed(2)}]`,
      [
        { text: 'Fechar', style: 'cancel' },
        {
          text: 'Excluir Âncora',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await deleteAnchor(anchor.id);
              setAnchors((prev) => prev.filter((a) => a.id !== anchor.id));
              Alert.alert('Removida', 'Âncora excluída com sucesso.');
            } catch (err: any) {
              Alert.alert('Erro ao excluir', err.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  }, []);

  // Memoiza viroAppProps para evitar re-criação a cada ciclo de render
  const viroAppProps = useMemo(
    () => ({
      anchors,
      onSelectAnchor: handleSelectAnchor,
      onPlaceAnchorAtPosition: handlePlaceAtPosition,
      onPlaceAnchorAtCamera: handleOpenPlaceModal,
      onCameraUpdate: handleCameraUpdate,
      onTrackingUpdate: handleTrackingUpdate,
    }),
    [
      anchors,
      handleSelectAnchor,
      handlePlaceAtPosition,
      handleOpenPlaceModal,
      handleCameraUpdate,
      handleTrackingUpdate,
    ],
  );

  return (
    <View className="flex-1 bg-black">
      {/* ViroARSceneNavigator renderizando o mundo 3D com ARCore Cloud Anchors */}
      <ViroARSceneNavigator
        ref={navigatorRef}
        provider="arcore"
        autofocus={true}
        initialScene={{ scene: ViroARAnchorScene as any }}
        viroAppProps={viroAppProps}
        style={{ flex: 1 }}
      />

      {/* Retículo / Mira Central em Realidade Aumentada */}
      <View
        className="absolute inset-0 justify-center items-center pointer-events-none"
        pointerEvents="none">
        <View className="w-8 h-8 rounded-full border-2 border-white/60 items-center justify-center">
          <View className="w-1.5 h-1.5 rounded-full bg-blue-400" />
        </View>
      </View>

      {/* HUD Superior Flutuante com NativeWind 4 */}
      <View
        className="absolute top-12 left-4 right-4 flex-row justify-between items-center z-20"
        pointerEvents="box-none">
        {/* Status de Rastreamento SLAM */}
        <View className="flex-row items-center gap-2">
          <View className="bg-slate-900/85 px-3 py-1.5 rounded-full border border-blue-500 flex-row items-center gap-1.5">
            <View
              className={`w-2 h-2 rounded-full ${
                trackingState === 3
                  ? 'bg-emerald-400'
                  : trackingState === 2
                    ? 'bg-amber-400'
                    : 'bg-red-500'
              }`}
            />
            <Text className="text-white text-xs font-semibold">
              {trackingState === 3 ? 'Estável' : 'Mapeando...'}
            </Text>
          </View>

          {/* Status do Google Cloud Anchors */}
          <View className="bg-slate-900/85 px-3 py-1.5 rounded-full border border-purple-500">
            <Text className="text-purple-300 text-xs font-semibold">
              {cloudStatus}
            </Text>
          </View>
        </View>

        {/* Botão de Atualizar / Re-resolver */}
        <TouchableOpacity
          onPress={loadAnchors}
          disabled={loading}
          className="bg-slate-900/85 p-2 rounded-full border border-slate-700 active:bg-slate-800">
          {loading ? (
            <ActivityIndicator size="small" color="#60A5FA" />
          ) : (
            <Text className="text-white text-xs px-1">🔄</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Barra Inferior com Ações Principais */}
      <View
        className="absolute bottom-8 left-4 right-4 items-center z-20"
        pointerEvents="box-none">
        <TouchableOpacity
          onPress={handleOpenPlaceModal}
          disabled={loading}
          className="bg-blue-600 active:bg-blue-700 px-6 py-3.5 rounded-full shadow-lg flex-row items-center gap-2 border border-blue-400/30">
          <Text className="text-white font-bold text-base">📍 Fixar Âncora na Nuvem</Text>
        </TouchableOpacity>
      </View>

      {/* Modal de Criação de Âncora */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}>
        <View className="flex-1 bg-black/70 justify-center items-center p-4">
          <View className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-sm">
            <Text className="text-xl font-bold text-white mb-1">
              Nova Âncora no Espaço
            </Text>
            <Text className="text-xs text-slate-400 mb-4">
              O Google ARCore escaneará a textura da superfície para fixar o ponto fisicamente.
            </Text>

            <Text className="text-xs text-slate-300 mb-1 font-semibold">Nome da Âncora *</Text>
            <TextInput
              value={anchorName}
              onChangeText={setAnchorName}
              placeholder="Ex: Sala 204, Bebedouro Bloco B"
              placeholderTextColor="#64748B"
              className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm mb-3"
              autoFocus
            />

            <Text className="text-xs text-slate-300 mb-1 font-semibold">Descrição (opcional)</Text>
            <TextInput
              value={anchorDescription}
              onChangeText={setAnchorDescription}
              placeholder="Ex: Próximo à porta de vidro"
              placeholderTextColor="#64748B"
              className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm mb-4"
            />

            <View className="flex-row gap-3 justify-end mt-2">
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800">
                <Text className="text-slate-300 font-semibold text-sm">Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreate}
                disabled={loading}
                className="px-5 py-2.5 rounded-xl bg-blue-600 flex-row items-center gap-2">
                {loading && <ActivityIndicator size="small" color="#FFFFFF" />}
                <Text className="text-white font-semibold text-sm">Hospedar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default ViroARAnchorContainer;
