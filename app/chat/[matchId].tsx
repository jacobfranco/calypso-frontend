import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth';
import { sendDirectMessage, fetchDirectMessages, DirectMessage } from '@/lib/api';
import { useThemeColor } from '@/hooks/use-theme-color';

function formatTime(epochMillis: number): string {
  if (!epochMillis) return '';
  try {
    return new Date(epochMillis).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function ChatScreen() {
  const { matchId, name, avatar } = useLocalSearchParams<{
    matchId: string;
    name?: string;
    avatar?: string;
  }>();
  const { account, token } = useAuth();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const cardBorder = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.10)', dark: 'rgba(255, 255, 255, 0.14)' },
    'icon'
  );
  const cardBg = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.02)', dark: 'rgba(255, 255, 255, 0.04)' },
    'background'
  );
  const muted = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.5)', dark: 'rgba(255, 255, 255, 0.5)' },
    'text'
  );
  const primaryBg = useThemeColor({ light: '#111', dark: '#f1f1f1' }, 'text');
  const primaryText = useThemeColor({ light: '#fff', dark: '#111' }, 'text');
  const inputBorder = useThemeColor(
    { light: 'rgba(0,0,0,0.15)', dark: 'rgba(255,255,255,0.18)' },
    'icon'
  );

  const loadMessages = useCallback(async () => {
    if (!account || !token || !matchId) return;
    try {
      const msgs = await fetchDirectMessages(account.id, token, matchId, 50);
      // API returns newest first; reverse for display
      setMessages([...msgs].reverse());
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, [account, matchId, token]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!loading) {
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
    }
  }, [loading]);

  const handleSend = useCallback(async () => {
    if (!account || !token || !matchId || !input.trim() || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    try {
      const sent = await sendDirectMessage(account.id, token, matchId, text);
      setMessages((prev) => [...prev, sent]);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } catch {
      setInput(text);
    } finally {
      setSending(false);
    }
  }, [account, input, matchId, sending, token]);

  const myId = account?.id ?? '';

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { borderBottomColor: cardBorder }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
          <ThemedText style={styles.backArrow}>‹</ThemedText>
        </Pressable>
        {avatar ? (
          <Image source={{ uri: decodeURIComponent(avatar) }} style={styles.headerAvatar} />
        ) : null}
        <ThemedText type="defaultSemiBold" numberOfLines={1} style={styles.headerName}>
          {name ? decodeURIComponent(name) : 'Chat'}
        </ThemedText>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator />
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="interactive"
          >
            {messages.length === 0 ? (
              <ThemedText style={[styles.emptyText, { color: muted }]}>
                Start the conversation
              </ThemedText>
            ) : null}
            {messages.map((msg) => {
              const mine = msg.senderId === myId;
              return (
                <View
                  key={msg.messageId}
                  style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
                >
                  <View
                    style={[
                      styles.bubbleBody,
                      mine
                        ? { backgroundColor: primaryBg }
                        : { backgroundColor: cardBg, borderColor: cardBorder, borderWidth: 1 },
                    ]}
                  >
                    <ThemedText style={[styles.bubbleText, mine && { color: primaryText }]}>
                      {msg.text}
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.bubbleTime, { color: muted }]}>
                    {formatTime(msg.sentAt)}
                  </ThemedText>
                </View>
              );
            })}
          </ScrollView>
        )}

        <View style={[styles.inputRow, { borderTopColor: cardBorder }]}>
          <TextInput
            style={[styles.input, { borderColor: inputBorder, color: primaryBg === '#111' ? '#111' : '#f1f1f1' }]}
            placeholder="Message…"
            placeholderTextColor={muted}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            multiline
            maxLength={2000}
            editable={!sending}
          />
          <Pressable
            onPress={handleSend}
            disabled={sending || !input.trim()}
            style={({ pressed }) => [
              styles.sendButton,
              { backgroundColor: primaryBg, opacity: pressed || sending || !input.trim() ? 0.5 : 1 },
            ]}
          >
            <ThemedText style={[styles.sendButtonText, { color: primaryText }]}>Send</ThemedText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    gap: 10,
    borderBottomWidth: 1,
  },
  backButton: { paddingRight: 4 },
  backArrow: { fontSize: 28, lineHeight: 30 },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  headerName: { flex: 1, fontSize: 17 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  messageList: {
    padding: 16,
    gap: 8,
    paddingBottom: 12,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
  },
  bubble: { maxWidth: '78%' },
  bubbleMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubbleBody: {
    borderRadius: 18,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTime: { fontSize: 11, marginTop: 3, marginHorizontal: 4 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 14,
    fontSize: 15,
    maxHeight: 120,
  },
  sendButton: {
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 18,
  },
  sendButtonText: { fontWeight: '600', fontSize: 15 },
});
