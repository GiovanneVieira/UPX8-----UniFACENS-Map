import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type StyleProp,
  type TextLayoutEvent,
  type TextStyle,
} from 'react-native';

/**
 * MARQUEE CONTÍNUO SEAMLESS (2026-11-11, v9 — efeito LED/ticker): a string
 * anda SEMPRE na mesma direção (→) e, quando o final chega, o próprio
 * INÍCIO entra em seguida — loop infinito sem emenda visível.
 *
 * Truque clássico: renderizar DUAS cópias lado a lado ("A SEP A SEP") e
 * animar translateX de 0 a −largura_de_um_período (1 cópia + separador)
 * em Animated.loop — ao resetar, a 2ª cópia ocupa exatamente a posição
 * onde a 1ª começava: o salto é imperceptível, o movimento é perpétuo.
 *
 * ⚠️ Trilha de lições de device (v2→v8, provas por dump de a11y + sonda
 * de pixels): frame de Text restrito é CLAMPADO no Android (onLayout mente);
 * `lines[].text` não é populado mas `lines[].width` É — com width explícita
 * generosa o frame contém a linha inteira e a medida é real; distância por
 * estimativa superestima (v7: texto saía inteiro da janela). Aqui toda
 * distância vem de `lines[0].width` medido; estimativa só dimensiona o
 * frame generoso (superestimar é inofensivo). Texto que cabe: estático.
 */
interface ARTickerTextProps {
  text: string;
  style?: StyleProp<TextStyle>;
  /** Piso da janela (px): textos que mudam de comprimento a cada tick
   *  (±3m→±4m) não pulsam a largura da pill. Vive no CLIP — nunca como
   *  spacer irmão (rouba o espaço do clip flexível). */
  minWidth?: number;
}

/** Separador entre cópias (respiro visual no loop). */
const SEP = '   ';
/** Ritmo da rolagem (ms por px) ≈ 42px/s — "um pouco mais lento" (v9.1). */
const MS_PER_PX = 24;
/**
 * Frame do texto animado — largura CONSTANTE (v9.7): recalculá-la por
 * estimativa a cada mudança de texto (o status muda a 1Hz com o
 * percentual) fazia a largura do clip flutuar → a row inteira se
 * redistribuía a cada tick → a badge vizinha "mudava de tamanho do nada"
 * (lição de device 2026-11-11). 1400 px comporta qualquer string de
 * status em qualquer densidade; a janela real continua sendo o clip.
 */
const GENEROUS_FRAME_W = 1400;

export const ARTickerText: React.FC<ARTickerTextProps> = ({
  text,
  style,
  minWidth,
}) => {
  const [containerW, setContainerW] = useState(0);
  /** Largura TOTAL medida de "A SEP A SEP" (2 períodos). */
  const [totalW, setTotalW] = useState(0);
  /** Largura do separador (medida) — fecha singleW = período − sep. */
  const [sepW, setSepW] = useState(0);
  /**
   * Estado de animação com HISTERESE (anti-flicker, v9.3): sem ela, um
   * texto na fronteira oscillava o gate a cada tick de pose (±3m→±4m) —
   * pill pulsa entre encolhida (estático) e esticada (frame generoso).
   * A largura de GATE é congelada no momento da ativação (o containerW
   * cresce ao animar — comparar contra ele quebraria a histerese).
   */
  const [animating, setAnimating] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  // Frame generoso de largura CONSTANTE — contém a linha sem clamp e não
  // flutua com o texto (v9.7). As medidas reais vêm dos medidores.
  const generousW = GENEROUS_FRAME_W;

  const period = totalW > 0 ? totalW / 2 : 0;
  const singleW = period - sepW;
  /** Cópia PURA (sem separador) — é ELA que deve caber na janela. ⚠️ v9.4:
   *  o gate usava cópia+sep: o separador (~20px) ativava o modo animação
   *  para textos que cabem → frame generoso → "badge maior que a de
   *  pontos, sem sentido" (lição de device 2026-11-11). */
  const copyW = singleW - sepW;

  /**
   * AUTO-RESET no mount/refresh (v9.5): o Fast Refresh PRESERVA useState
   * entre edições — um `animating=true` zumbi de versão anterior (gate
   * bugado) sobrevivia com gateWRef podre e o gate novo nunca desativava
   * ("badge imensa" persistente). Este effect roda em todo refresh/mount
   * e força re-avaliação limpa (em mount saudável é no-op).
   */
  useEffect(() => {
    setAnimating(false);
  }, []);

  useEffect(() => {
    if (!animating) {
      // LATCH de sessão (v9.8): ativa quando o texto genuinamente não cabe
      // e PERMANECE — o status oscila longo↔curto (hint do resolve entra/
      // sai) e cada alternância de modo mudava a largura da pill
      // ("respiração" — badge nascia grande e encolhia, lição de device
      // 2026-11-11). Uma vez que a sessão tem status longo, a janela fica
      // fixa no espaço da row e o texto é que rola nela.
      if (containerW > 0 && copyW > containerW + 8) setAnimating(true);
    }
  }, [containerW, copyW, animating]);

  const hasOverflow = animating;
  // Visível: 2 cópias SÓ quando anima; estático = 1 cópia natural (a width
  // generosa no estático esticava a pill — "badge gigante", v9.2).
  const visibleContent = hasOverflow ? `${text}${SEP}${text}${SEP}` : text;

  const handleTextLayout = (e: TextLayoutEvent) => {
    const l = e.nativeEvent.lines[0];
    if (l && typeof l.width === 'number' && l.width > 0) setTotalW(l.width);
  };
  const handleSepLayout = (e: TextLayoutEvent) => {
    const l = e.nativeEvent.lines[0];
    if (l && typeof l.width === 'number' && l.width > 0) setSepW(l.width);
  };

  useEffect(() => {
    // Sem overflow (ou sem medidas ainda): estático em x=0.
    if (!hasOverflow) {
      loopRef.current?.stop();
      loopRef.current = null;
      translateX.setValue(0);
      return;
    }
    if (__DEV__) {
      console.log(
        `[Ticker] loop seamless: período=${period.toFixed(0)}px (single=${singleW.toFixed(0)} pill=${containerW.toFixed(0)}) — "${text.slice(0, 14)}…"`,
      );
    }
    // ── LOOP INFINITO: 0 → −período, linear; reset invisível (a 2ª cópia
    //    assume a posição exata da 1ª). Direção única, sempre →.
    const anim = Animated.loop(
      Animated.timing(translateX, {
        toValue: -period,
        duration: Math.max(800, period * MS_PER_PX),
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loopRef.current = anim;
    translateX.setValue(0);
    anim.start();

    return () => {
      anim.stop();
      translateX.setValue(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasOverflow, period, singleW, containerW, translateX]);

  return (
    <View
      style={[
        styles.clip,
        typeof minWidth === 'number' ? { minWidth } : null,
        // Animando: flex 1 — a janela ocupa o espaço que a row
        // disponibiliza (CONSTANTE para a sessão: origem/refresh são
        // fixos) e não depende mais do texto nem do frame generoso.
        animating ? styles.clipAnimating : null,
      ]}
      onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}>
      {/* VISÍVEL — 2 cópias + width generosa SÓ quando anima (o seamless
          precisa da emenda e o frame precisa conter as cópias); estático =
          UMA cópia com largura NATURAL truncável — com width generosa o
          texto curto esticava a pill ("badge gigante", lição v9.2). As
          medidas vêm dos medidores absolutos, não deste texto. */}
      <Animated.Text
        style={[
          style,
          styles.slidingText,
          hasOverflow ? { width: generousW } : null,
          { transform: [{ translateX }] },
        ]}
        numberOfLines={1}
        ellipsizeMode={hasOverflow ? undefined : 'tail'}>
        {visibleContent}
      </Animated.Text>

      {/* MEDIDORES invisíveis (sempre 2 cópias + sep — medidas estáveis
          independente do estado visível): período e separador reais. */}
      <Animated.Text
        style={[style, styles.measure, { width: generousW }]}
        onTextLayout={handleTextLayout}
        numberOfLines={1}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        {`${text}${SEP}${text}${SEP}`}
      </Animated.Text>
      <Animated.Text
        style={[style, styles.measure, { width: generousW }]}
        onTextLayout={handleSepLayout}
        numberOfLines={1}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        {SEP}
      </Animated.Text>
    </View>
  );
};

/** Estimativa — USADA APENAS para dimensionar o frame generoso (nunca a
 *  distância: quem manda é a lines[0].width medida). */

const styles = StyleSheet.create({
  /** Janela — encolhe dentro da pill e clipa o texto além da borda. */
  clip: {
    flexShrink: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  /** Modo animado: largura = espaço disponível da row (flex 1), estável
   *  para a sessão inteira — o texto é que rola dentro dela. */
  clipAnimating: {
    flex: 1,
  },
  /** Texto não estica (a width explícita manda) nem quebra linha. */
  slidingText: {
    alignSelf: 'flex-start',
  },
  /** Medidor absoluto invisível (fora do fluxo, oculto de leitores). */
  measure: {
    position: 'absolute',
    top: 0,
    left: 0,
    opacity: 0,
  },
});
