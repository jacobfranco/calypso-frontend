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

function ChatAvatar({
  uri,
  name,
  variant = 'message',
}: {
  uri?: string;
  name?: string;
  variant?: 'header' | 'message';
}) {
  const [error, setError] = useState(false);
  const initials = (name ?? '?').trim().slice(0, 2).toUpperCase();
  const avatarStyle = variant === 'header' ? styles.headerAvatar : styles.messageAvatar;
  const initialsStyle =
    variant === 'header' ? styles.headerAvatarInitials : styles.messageAvatarInitials;

  if (error || !uri) {
    return (
      <View style={[avatarStyle, styles.avatarFallback]}>
        <ThemedText style={initialsStyle}>{initials}</ThemedText>
      </View>
    );
  }

  return <Image source={{ uri }} style={avatarStyle} onError={() => setError(true)} />;
}

function formatTime(epochMillis: number): string {
  if (!epochMillis) return '';
  try {
    return new Date(epochMillis).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function normalizeAccountId(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const raw = String(value).trim();
  const accountPart = raw.endsWith('-a') ? raw.slice(0, -2) : raw;
  const normalized = accountPart.replace(/^0+(?=\d)/, '');
  return normalized || accountPart;
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
  const muted = useThemeColor(
    { light: 'rgba(0, 0, 0, 0.5)', dark: 'rgba(255, 255, 255, 0.5)' },
    'text'
  );
  const primaryBg = useThemeColor({ light: '#111', dark: '#f1f1f1' }, 'text');
  const primaryText = useThemeColor({ light: '#fff', dark: '#111' }, 'text');
  const outgoingBubbleBg = useThemeColor({ light: '#0A84FF', dark: '#0A84FF' }, 'tint');
  const outgoingText = '#fff';
  const incomingBubbleBg = useThemeColor(
    { light: '#F1F3F5', dark: '#2A2D31' },
    'background'
  );
  const incomingText = useThemeColor({ light: '#11181C', dark: '#ECEDEE' }, 'text');
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

  const myId = normalizeAccountId(account?.id);
  const matchName = name ? decodeURIComponent(name) : 'Match';
  const matchAvatar = avatar ? decodeURIComponent(avatar) : undefined;
  const myAvatar = account?.avatar_static ?? account?.avatar;
  const myName = account?.name ?? 'You';

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { borderBottomColor: cardBorder }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
          <ThemedText style={styles.backArrow}>‹</ThemedText>
        </Pressable>
        <ChatAvatar uri={matchAvatar} name={matchName} variant="header" />
        <ThemedText type="defaultSemiBold" numberOfLines={1} style={styles.headerName}>
          {matchName}
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
              const mine = normalizeAccountId(msg.senderId) === myId;
              const displayName = mine ? 'You' : matchName;
              return (
                <View
                  key={msg.messageId}
                  style={[styles.messageRow, mine ? styles.messageRowMine : styles.messageRowTheirs]}
                >
                  {!mine ? <ChatAvatar uri={matchAvatar} name={matchName} /> : null}
                  <View style={[styles.messageStack, mine ? styles.stackMine : styles.stackTheirs]}>
                    <ThemedText style={[styles.senderLabel, { color: muted }]}>
                      {displayName}
                    </ThemedText>
                    <View
                      style={[
                        styles.bubbleBody,
                        mine
                          ? { backgroundColor: outgoingBubbleBg }
                          : {
                              backgroundColor: incomingBubbleBg,
                              borderColor: cardBorder,
                              borderWidth: 1,
                            },
                      ]}
                    >
                      <ThemedText
                        style={[
                          styles.bubbleText,
                          { color: mine ? outgoingText : incomingText },
                        ]}
                      >
                        {msg.text}
                      </ThemedText>
                    </View>
                    <ThemedText style={[styles.bubbleTime, { color: muted }]}>
                      {formatTime(msg.sentAt)}
                    </ThemedText>
                  </View>
                  {mine ? <ChatAvatar uri={myAvatar} name={myName} /> : null}
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
    flexShrink: 0,
  },
  headerAvatarInitials: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
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
  messageRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  messageRowMine: { justifyContent: 'flex-end' },
  messageRowTheirs: { justifyContent: 'flex-start' },
  messageStack: {
    maxWidth: '74%',
  },
  stackMine: { alignItems: 'flex-end' },
  stackTheirs: { alignItems: 'flex-start' },
  messageAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.08)',
    flexShrink: 0,
  },
  avatarFallback: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  messageAvatarInitials: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  senderLabel: {
    fontSize: 11,
    lineHeight: 14,
    marginBottom: 3,
    marginHorizontal: 4,
  },
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
