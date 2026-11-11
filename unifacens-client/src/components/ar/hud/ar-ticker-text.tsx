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
 * Texto AUTO-SCROLLING MARQUEE (2026-11-11, v5 — efeito nomeado pelo
 * usuário): o texto rola CONTINUAMENTE numa direção só, revelando a
 * string inteira ao passar — entra caractere pelo fim, sai pelo início —
 * até o final ficar visível, e RECOMEÇA do início (reset, loop).
 *
 * Ciclo: prefixo estático com "…" → auto-scroll contínuo até o fim da
 * string → pausa curta → reset ao prefixo → repete.
 *
 * ⚠️ Lições v2/v3 (device): (a) Text com numberOfLines=1 dentro de pai
 * restrito tem o frame CLAMPEADO à largura do pai no Android — onLayout
 * dele reporta a largura LIMITADA, não a natural (v3: overflow ≈ 0 sempre
 * → estático eterno); (b) ciclo >4s nunca completava com status mudando
 * a ~1Hz (v2). A detecção de truncamento usa DUAS fontes independentes:
 *
 *   1. onTextLayout do ESTÁTICO — `lines[0].text` com "…" no fim é prova
 *      irrefutável de overflow; charWidth médio = lines[0].width/chars
 *      estima a distância do scroll.
 *   2. onLayout do DESLIZANTE ABSOLUTO (fora do fluxo, sem clamp) —
 *      largura natural exata, quando o Yoga a reporta.
 *
 * Texto que cabe: estático, sem animação.
 */
interface ARTickerTextProps {
  text: string;
  style?: StyleProp<TextStyle>;
  /** Pausa no início (prefixo + "…") e no fim da string (ms). */
  holdStartMs?: number;
  holdEndMs?: number;
}

export const ARTickerText: React.FC<ARTickerTextProps> = ({
  text,
  style,
  holdStartMs = 900,
  holdEndMs = 1000,
}) => {
  const [containerW, setContainerW] = useState(0);
  /** Largura natural do texto completo (do absoluto, quando reportada). */
  const [naturalW, setNaturalW] = useState(0);
  /** Linha renderizada do estático (largura + chars visíveis). */
  const [line, setLine] = useState<{ width: number; chars: number; truncated: boolean } | null>(
    null,
  );
  const [sliding, setSliding] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleStaticTextLayout = (e: TextLayoutEvent) => {
    const l = e.nativeEvent.lines[0];
    if (!l) return;
    const visibleText = l.text ?? '';
    const truncated =
      visibleText.endsWith('…') ||
      visibleText.endsWith('...') ||
      (visibleText.length > 0 && visibleText.length < text.length);
    setLine({
      width: l.width,
      chars: visibleText.replace(/[….]{1,3}$/, '').length || visibleText.length,
      truncated,
    });
  };

  // Distância do deslize: fonte precisa (absoluto natural) > estimativa
  // (charWidth do estático truncado) > sem animação.
  let overflow = 0;
  if (containerW > 0 && naturalW > containerW + 4) {
    overflow = naturalW - containerW;
  } else if (containerW > 0 && line?.truncated && line.chars > 0) {
    const charW = line.width / Math.max(1, line.chars);
    overflow = Math.max(0, text.length - line.chars) * charW;
  }
  const hasOverflow = overflow > 4;

  useEffect(() => {
    cancelledRef.current = false;
    if (!hasOverflow) {
      translateX.setValue(0);
      setSliding(false);
      return;
    }
    if (__DEV__) {
      console.log(
        `[Ticker] overflow=${overflow.toFixed(0)}px (natural=${naturalW.toFixed(0)} pill=${containerW.toFixed(0)} trunc=${line?.truncated ? 1 : 0}) — "${text.slice(0, 14)}…"`,
      );
    }

    const distance = overflow + 14;
    const duration = Math.max(900, distance * 32); // ~32ms/px
    // Velocidade CONSTANTE — assinatura do auto-scroll marquee.
    const easing = Easing.linear;

    const clearTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    const slideTo = (toValue: number, onDone: () => void) => {
      Animated.timing(translateX, { toValue, duration, easing, useNativeDriver: true }).start(
        ({ finished }) => {
          if (!finished || cancelledRef.current) return;
          onDone();
        },
      );
    };
    const runCycle = () => {
      if (cancelledRef.current) return;
      // 1. Pausa inicial: estático (prefixo + "…").
      setSliding(false);
      translateX.setValue(0);
      timerRef.current = setTimeout(() => {
        if (cancelledRef.current) return;
        // 2. AUTO-SCROLL contínuo: o texto rola numa direção só até o
        //    final da string ficar visível (a string INTEIRA passa pela
        //    janela — entra char pelo fim, sai pelo início).
        setSliding(true);
        slideTo(-distance, () => {
          // 3. Pausa com o fim visível → reset ao prefixo → loop.
          timerRef.current = setTimeout(() => {
            if (cancelledRef.current) return;
            runCycle();
          }, holdEndMs);
        });
      }, holdStartMs);
    };
    runCycle();

    return () => {
      cancelledRef.current = true;
      clearTimer();
      translateX.stopAnimation();
      translateX.setValue(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, hasOverflow, overflow, containerW, naturalW, holdStartMs, holdEndMs, translateX]);

  return (
    <View style={styles.clip} onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}>
      {/* ESTÁTICO — na árvore (define altura) com ellipsis nativo; fonte 1
          de detecção via onTextLayout. Invisível durante o deslize. */}
      <Text
        style={[style, { opacity: sliding ? 0 : 1 }]}
        numberOfLines={1}
        ellipsizeMode="tail"
        onTextLayout={handleStaticTextLayout}>
        {text}
      </Text>

      {/* DESLIZANTE — ABSOLUTO (fora do fluxo: sem clamp de largura no
          Android), mede a largura natural (fonte 2) e anima translateX. */}
      <Animated.Text
        style={[
          style,
          styles.slidingText,
          { opacity: sliding ? 1 : 0, transform: [{ translateX }] },
        ]}
        onLayout={(e) => setNaturalW(e.nativeEvent.layout.width)}
        numberOfLines={1}
        accessibilityElementsHidden={!sliding}
        importantForAccessibility={sliding ? 'yes' : 'no-hide-descendants'}>
        {text}
      </Animated.Text>
    </View>
  );
};

const styles = StyleSheet.create({
  /** Clip da janela — encolhe dentro da pill e clipa o deslizante. */
  clip: {
    flexShrink: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  /** Absoluto: fora do fluxo → frame NÃO é clampeado pela largura do pai
      (frame wrap-content) → onLayout reporta a largura natural do texto. */
  slidingText: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
