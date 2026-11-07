import React, { FC } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NavInstruction } from '@/features/ar/hooks/use-ar-navigation';

interface NavInstructionHudProps {
  /** Próxima manobra. */
  instruction: NavInstruction;
  /** Metros até a manobra. */
  metersToTurn: number;
  /** Bearing verdadeiro do usuário para ~5m à frente no caminho. */
  headingToPathDeg: number | null;
  /** Heading verdadeiro atual do celular (bússola compensada). */
  userHeadingDeg: number;
}

/** Rotação relativa (deg) do ícone-compasso: para onde virar em relação ao nariz. */
function relativeBearing(target: number, current: number): number {
  return ((target - current + 540) % 360) - 180;
}

/** Rotação do ícone de manobra (arrow-up como base). */
function instructionRotation(instruction: NavInstruction): number {
  switch (instruction) {
    case 'left':
      return -90;
    case 'right':
      return 90;
    case 'arrive':
      return 0;
    default:
      return 0;
  }
}

/**
 * Chip de instrução de navegação (sessão viva): manobra seguinte + metros +
 * seta-compasso girando (bearing do caminho − heading do celular).
 * StyleSheet.create PURO — hospedado no container AR (AGENTS.MD §6).
 */
export const NavInstructionHud: FC<NavInstructionHudProps> = ({
  instruction,
  metersToTurn,
  headingToPathDeg,
  userHeadingDeg,
}) => {
  const isArrive = instruction === 'arrive';
  const compassRotation =
    headingToPathDeg !== null ? relativeBearing(headingToPathDeg, userHeadingDeg) : 0;

  return (
    <View style={styles.chip} pointerEvents="none">
      {/* Seta-compasso: aponta a direção do caminho relativa ao nariz do usuário */}
      {headingToPathDeg !== null ? (
        <View style={styles.compassWrap}>
          <Ionicons
            name="navigate"
            size={18}
            color="#60A5FA"
            style={{ transform: [{ rotate: `${compassRotation.toFixed(0)}deg` }] }}
          />
        </View>
      ) : null}

      {/* Manobra seguinte: seta para cima rotacionada (esq/dir) ou bandeira */}
      <View style={styles.maneuverWrap}>
        <Ionicons
          name={isArrive ? 'flag' : 'arrow-up'}
          size={22}
          color="#FFFFFF"
          style={
            isArrive ? undefined : { transform: [{ rotate: `${instructionRotation(instruction)}deg` }] }
          }
        />
      </View>

      <Text style={styles.text}>
        {isArrive ? 'Destino à frente' : `${metersToTurn} m`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(30, 58, 138, 0.92)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  compassWrap: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  maneuverWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(59, 130, 246, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#DBEAFE',
    fontSize: 14,
    fontWeight: '700',
  },
});
