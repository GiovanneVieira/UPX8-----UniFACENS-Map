import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { SymbolView } from 'expo-symbols';
import { Pressable, useColorScheme, View, StyleSheet } from 'react-native';

import { ExternalLink } from './external-link';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton>AR Anchors</TabButton>
          </TabTrigger>
          <TabTrigger name="explore" href="/explore" asChild>
            <TabButton>Explore</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type={isFocused ? 'backgroundSelected' : 'backgroundElement'}
        style={[styles.tabButtonView, isFocused && styles.tabButtonActive]}>
        <ThemedText type="smallBold" style={isFocused ? styles.activeText : styles.inactiveText}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <View {...props} style={styles.tabListContainer}>
      <View style={styles.innerContainer}>
        <ThemedText type="smallBold" style={styles.brandText}>
          🗺️ UniFACENS Map
        </ThemedText>

        {props.children}

        <ExternalLink href="https://docs.expo.dev" asChild>
          <Pressable style={styles.externalPressable}>
            <ThemedText type="link" style={{ color: '#38BDF8', fontSize: 12 }}>Docs</ThemedText>
            <SymbolView
              tintColor="#38BDF8"
              name={{ ios: 'arrow.up.right.square', web: 'link' }}
              size={12}
            />
          </Pressable>
        </ExternalLink>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    zIndex: 100,
  },
  innerContainer: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    maxWidth: 600,
    width: '100%',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
  },
  brandText: {
    color: '#F8FAFC',
    marginRight: 'auto',
    fontSize: 13,
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#0F172A',
  },
  tabButtonActive: {
    backgroundColor: '#3B82F6',
  },
  activeText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  inactiveText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  externalPressable: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    marginLeft: Spacing.two,
  },
});
