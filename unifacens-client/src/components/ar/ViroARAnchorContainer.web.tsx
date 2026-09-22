import React, { FC, useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native';
import { fetchAnchors, deleteAnchor } from '@/services/api';
import type { Anchor } from 'shared';

export const ViroARAnchorContainer: FC = () => {
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [loading, setLoading] = useState(false);

  const loadAnchors = useCallback(async () => {
    try {
      setLoading(true);
      const list = await fetchAnchors();
      setAnchors(list);
    } catch (err) {
      console.warn('Erro ao carregar âncoras na web:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnchors();
  }, [loadAnchors]);

  const handleDelete = async (id: string) => {
    try {
      setLoading(true);
      await deleteAnchor(id);
      setAnchors((prev) => prev.filter((a) => a.id !== id));
    } catch (err: any) {
      alert('Erro ao excluir âncora: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#020617', padding: 24, justifyContent: 'center', alignItems: 'center' }}>
      <View style={{ maxWidth: 640, width: '100%', backgroundColor: '#0f172a', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#1e293b' }}>
        <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#ffffff', marginBottom: 8 }}>
          UniFACENS Map • Google Cloud Anchors
        </Text>
        <Text style={{ fontSize: 14, color: '#94a3b8', marginBottom: 20, lineHeight: 20 }}>
          O sistema de fixação espacial utiliza o <Text style={{ color: '#a855f7', fontWeight: '600' }}>Google ARCore Cloud Anchors</Text> para ancoragem milimétrica por visão computacional (SLAM).
          Aponte a câmera do seu celular Android ou iOS através do aplicativo nativo compilado para visualizar e criar âncoras no espaço real.
        </Text>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#e2e8f0' }}>
            Âncoras Cadastradas no Catálogo ({anchors.length})
          </Text>
          <TouchableOpacity
            onPress={loadAnchors}
            disabled={loading}
            style={{ backgroundColor: '#2563eb', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
            {loading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '600' }}>Recarregar</Text>
            )}
          </TouchableOpacity>
        </View>

        {anchors.length === 0 ? (
          <View style={{ padding: 20, backgroundColor: '#020617', borderRadius: 8, alignItems: 'center' }}>
            <Text style={{ color: '#64748b', fontSize: 13 }}>Nenhuma âncora cadastrada ainda.</Text>
          </View>
        ) : (
          <FlatList
            data={anchors}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View
                style={{
                  backgroundColor: '#020617',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 10,
                  borderWidth: 1,
                  borderColor: '#1e293b',
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 14 }}>
                    ☁️ {item.name}
                  </Text>
                  {item.description ? (
                    <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>
                      {item.description}
                    </Text>
                  ) : null}
                  <Text style={{ color: '#a855f7', fontSize: 11, fontFamily: 'monospace', marginTop: 4 }}>
                    ID: {item.cloudAnchorId}
                  </Text>
                  {item.position ? (
                    <Text style={{ color: '#38bdf8', fontSize: 11, fontFamily: 'monospace', marginTop: 2 }}>
                      Pos: [{item.position[0].toFixed(2)}, {item.position[1].toFixed(2)}, {item.position[2].toFixed(2)}]
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => handleDelete(item.id)}
                  style={{ backgroundColor: '#dc2626', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}>
                  <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '600' }}>Excluir</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </View>
    </View>
  );
};

export default ViroARAnchorContainer;
