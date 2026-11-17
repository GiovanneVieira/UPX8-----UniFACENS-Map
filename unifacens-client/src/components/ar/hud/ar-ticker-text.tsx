import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextLayoutEvent,
  type TextStyle,
} from 'react-native';

/**
 * MARQUEE CONTÍNUO SEAMLESS (v10, 2026-11-12): a string anda sempre na
 * mesma direção (→) e, chegando ao final, o próprio INÍCIO entra em seguida
 * — loop infinito sem emenda visível.
 *
 * Truque: DUAS+ cópias lado a lado ("A SEP A SEP…") e translateX de 0 a
 * −largura_de_um_período (1 cópia + separador), segmento a segmento com
 * completion callback — ao resetar, a cópia seguinte ocupa exatamente a
 * posição onde a primeira começava.
 *
 * ⚠️ Trilha de lições de device (v2→v10, provas por dump de a11y):
 * - Frame de Text restrito é CLAMPADO no Android (onLayout mente);
 *   `lines[].text` não é populado mas `lines[].width` É — com width explícita
 *   generosa o frame contém a linha inteira e a medida é real. Toda distância
 *   vem de `lines[0].width` medido; estimativa não participa mais.
 * - v9.9 (2026-11-12, "marquee parado"): o loop NÃO depende de `period` —
 *   texto com percentual muda a 1Hz e reiniciar o Animated.loop a cada tick
 *   cravava o texto no início. Segmento-a-segmento absorve mudanças no
 *   PRÓXIMO ciclo.
 * - v9.9.2/v10 (2026-11-12, "badges invertidas"/"espaço de sobra"): o texto
 *   em movimento usa width generosa (anti-clamp) e vive FORA DO FLUXO
 *   (absolute + phantom de altura) — no fluxo, essa largura infla o
 *   intrínseco da pill; e flexGrow no clip SÓ via prop `fill` (pill com
 *   flex:1): flexGrow incondicional + maxWidth percentual fazia o Yoga
 *   resolver o filho pelo MÁXIMO disponível — a badge de origem crescia até
 *   o próprio teto com o texto pequeno dentro.
 * - Gate com HISTERESE (ativa com +8px de excesso, desativa com −8px de
 *   folga): texto que respira (±9m→±10m) não oscila o modo. Texto que cabe:
 *   estático — nada rola, nada pulsa.
 */
interface ARTickerTextProps {
  text: string;
  style?: StyleProp<TextStyle>;
  /** Piso da janela (dp) — anti-flicker para textos que mudam de comprimento
   *  (±3m→±4m). Vive no CLIP — nunca como spacer irmão (rouba o espaço). */
  minWidth?: number;
  /** Janela elástica: o clip estica na largura da pill hospedeira — usar
   *  SOMENTE em pills com flex:1 (ex.: badge de status/log do HUD). */
  fill?: boolean;
}

/** Separador entre cópias (respiro visual no loop). */
const SEP = '   ';
/** Ritmo da rolagem (ms por px) ≈ 42px/s. */
const MS_PER_PX = 24;
/**
 * Frame do texto animado — largura CONSTANTE e generosa: contém a linha sem
 * clamp (lições Android) em qualquer densidade. Como o texto animado é
 * absolute (fora do fluxo), esta largura NÃO participa da medida da pill.
 */
const GENEROUS_FRAME_W = 1400;
/** Histerese do gate (px): margens de ativação/desativação. */
const GATE_ON = 8;
const GATE_OFF = 8;

export const ARTickerText: React.FC<ARTickerTextProps> = ({
  text,
  style,
  minWidth,
  fill = false,
}) => {
  const [containerW, setContainerW] = useState(0);
  /** Largura TOTAL medida de "A SEP A SEP" (2 períodos). */
  const [totalW, setTotalW] = useState(0);
  /** Largura do separador (medida) — fecha singleW = período − sep. */
  const [sepW, setSepW] = useState(0);
  /** O texto corrente estoura a janela? (rola o marquee) */
  const [scrolls, setScrolls] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;
  /** Distância do segmento — sempre fresca para o PRÓXIMO ciclo. */
  const periodRef = useRef(0);

  const period = totalW > 0 ? totalW / 2 : 0;
  periodRef.current = period;
  const singleW = period - sepW;
  /** Cópia PURA (sem separador) — é ELA que deve caber na janela (v9.4). */
  const copyW = singleW - sepW;

  // ── GATE com histerese: ativa quando o texto genuinamente não cabe,
  //    desativa quando volta a caber com folga — sem oscilar na fronteira.
  useEffect(() => {
    if (containerW <= 0 || copyW <= 0) return;
    if (!scrolls && copyW > containerW + GATE_ON) setScrolls(true);
    else if (scrolls && copyW < containerW - GATE_OFF) setScrolls(false);
  }, [containerW, copyW, scrolls]);

  // ── CÓPIAS SUFICIENTES para preencher a janela (sem gap no ciclo).
  const periodUnit = Math.max(period, 1);
  const repeats = scrolls
    ? Math.max(2, Math.ceil((containerW + periodUnit) / periodUnit) + 1)
    : 1;
  const visibleContent = scrolls
    ? Array.from({ length: repeats }, () => `${text}${SEP}`).join('')
    : text;

  const handleTextLayout = (e: TextLayoutEvent) => {
    const l = e.nativeEvent.lines[0];
    if (l && typeof l.width === 'number' && l.width > 0) setTotalW(l.width);
  };
  const handleSepLayout = (e: TextLayoutEvent) => {
    const l = e.nativeEvent.lines[0];
    if (l && typeof l.width === 'number' && l.width > 0) setSepW(l.width);
  };

  // ── LOOP POR SEGMENTOS (deps: SÓ `scrolls`): cada segmento completa
  //    inteiro; mudanças de texto/largura são absorvidas no próximo ciclo.
  useEffect(() => {
    if (!scrolls) {
      translateX.setValue(0);
      return;
    }
    let cancelled = false;
    let current: Animated.CompositeAnimation | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const runSegment = () => {
      if (cancelled) return;
      const distance = periodRef.current;
      if (distance <= 0) {
        retryTimer = setTimeout(runSegment, 120);
        return;
      }
      if (__DEV__) {
        console.log(
          `[Ticker] segmento: ${distance.toFixed(0)}px (janela=${containerW.toFixed(0)}) — "${text.slice(0, 14)}…"`,
        );
      }
      translateX.setValue(0);
      current = Animated.timing(translateX, {
        toValue: -distance,
        duration: Math.max(800, distance * MS_PER_PX),
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      });
      current.start(({ finished }) => {
        if (finished && !cancelled) runSegment();
      });
    };
    runSegment();
    return () => {
      cancelled = true;
      current?.stop();
      if (retryTimer) clearTimeout(retryTimer);
      translateX.setValue(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrolls, translateX]);

  return (
    <View
      style={[
        styles.clip,
        fill ? styles.clipFill : null,
        typeof minWidth === 'number' ? { minWidth } : null,
      ]}
      onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}>
      {/* VISÍVEL — quando roda, o texto flutua (absolute): a width generosa
          (anti-clamp) NÃO infla a medida da pill; um phantom de 1 linha
          (mesma fonte) ocupa o fluxo para manter a altura. Estático = fluxo
          natural, truncável. */}
      <Animated.Text
        style={[
          style,
          styles.slidingText,
          scrolls ? styles.slidingTextFloating : null,
          scrolls ? { width: GENEROUS_FRAME_W } : null,
          { transform: [{ translateX }] },
        ]}
        numberOfLines={1}
        ellipsizeMode={scrolls ? undefined : 'tail'}>
        {visibleContent}
      </Animated.Text>
      {scrolls ? <Text style={style}>{' '}</Text> : null}

      {/* MEDIDORES invisíveis (sempre 2 cópias + sep — medidas estáveis
          independente do estado visível): período e separador reais. */}
      <Text
        style={[style, styles.measure, { width: GENEROUS_FRAME_W }]}
        onTextLayout={handleTextLayout}
        numberOfLines={1}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        {`${text}${SEP}${text}${SEP}`}
      </Text>
      <Text
        style={[style, styles.measure, { width: GENEROUS_FRAME_W }]}
        onTextLayout={handleSepLayout}
        numberOfLines={1}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        {SEP}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  /** Janela — encolhe dentro da pill e clipa o texto além da borda. */
  clip: {
    flexShrink: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  /** Pill hospedeira com flex:1 (badge de status): o clip absorve a largura
   *  dela — ⚠️ jamais em pill shrink-to-fit com maxWidth percentual (o Yoga
   *  resolve o filho pelo máximo disponível → pill "com espaço de sobra",
   *  lição de device 2026-11-12). */
  clipFill: {
    flexGrow: 1,
  },
  /** Texto não estica (a width explícita manda) nem quebra linha. */
  slidingText: {
    alignSelf: 'flex-start',
  },
  /** Texto em movimento: fora do fluxo (não infla a largura da pill). */
  slidingTextFloating: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  /** Medidor absoluto invisível (fora do fluxo, oculto de leitores). */
  measure: {
    position: 'absolute',
    top: 0,
    left: 0,
    opacity: 0,
  },
});
