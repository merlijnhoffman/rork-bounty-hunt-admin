import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { Key, RefreshCw, Copy, Share2, AlertTriangle } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { generateBountyAccessCode } from '@/types';

type SaveMode = 'idle' | 'saving' | 'saved';

/**
 * Shared editor for an event's bounty_access_code.
 *
 * - `embedded` mode (default): used inside create/edit event forms. No
 *   standalone save button — the parent persists the code together with the
 *   rest of the form. Changes bubble up via `onChange`.
 * - `standalone` mode: used on the event detail screen. Shows a SAVE CODE
 *   button that persists the code immediately via `onPersist`.
 */
export function BountyAccessCodeEditor({
  value,
  city,
  onChange,
  onPersist,
  mode = 'embedded',
  accentColor = Colors.cyan,
  warnWhenLive = false,
  isLive = false,
}: {
  value: string;
  city: string;
  onChange?: (code: string) => void;
  onPersist?: (code: string) => Promise<void>;
  mode?: 'embedded' | 'standalone';
  accentColor?: string;
  warnWhenLive?: boolean;
  isLive?: boolean;
}) {
  const [localCode, setLocalCode] = useState<string>(value);
  const [saveMode, setSaveMode] = useState<SaveMode>('idle');
  const [copied, setCopied] = useState<boolean>(false);

  // Keep local buffer in sync when the parent value changes (e.g. after load).
  React.useEffect(() => {
    setLocalCode(value);
    setSaveMode('idle');
  }, [value]);

  const report = (next: string) => {
    setLocalCode(next);
    onChange?.(next);
  };

  const dirty = localCode.trim() !== (value ?? '').trim();

  const handleGenerate = () => {
    report(generateBountyAccessCode(city));
    setSaveMode('idle');
  };

  const handleSave = async () => {
    if (!dirty || !onPersist) return;
    setSaveMode('saving');
    try {
      await onPersist(localCode.trim());
      setSaveMode('saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveMode('idle');
      Alert.alert('Save failed', msg);
    }
  };

  const handleCopy = async () => {
    const code = localCode.trim();
    if (!code) return;
    try {
      await Clipboard.setStringAsync(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      if (__DEV__) console.warn('[BountyCode] Copy failed:', err);
      Alert.alert('Error', 'Could not copy to clipboard.');
    }
  };

  const handleShare = async () => {
    const code = localCode.trim();
    if (!code) return;
    try {
      // Always stage on clipboard so the admin can paste it anywhere.
      await Clipboard.setStringAsync(code);
      if (await Sharing.isAvailableAsync()) {
        // expo-sharing needs a file URI; for plain text we rely on the
        // clipboard copy plus a confirmation alert below.
        Alert.alert(
          'Code copied',
          'The access code is on your clipboard. Paste it into Messages, Mail, or any app to send it to the bounty person.',
        );
      } else {
        Alert.alert('Copied', 'Code copied to clipboard.');
      }
    } catch (err) {
      if (__DEV__) console.warn('[BountyCode] Share failed:', err);
      try {
        await Clipboard.setStringAsync(code);
        Alert.alert('Copied', 'Code copied to clipboard.');
      } catch {
        Alert.alert('Error', 'Could not share or copy the code.');
      }
    }
  };

  const showLiveWarning = warnWhenLive && isLive && !localCode.trim();

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Key size={14} color={accentColor} />
        <Text style={styles.title}>BOUNTY ACCESS CODE</Text>
      </View>
      <Text style={styles.hint}>
        The bounty person enters this code in their app to start broadcasting
        their live GPS position. Share it privately.
      </Text>

      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, { borderColor: `${accentColor}40` }]}
          value={localCode}
          onChangeText={report}
          placeholder="e.g. BOUNTY-AMSTERDAM-7F3K9"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[styles.genBtn, { borderColor: accentColor }]}
          onPress={handleGenerate}
          activeOpacity={0.7}
          hitSlop={8}
          accessibilityLabel="Generate bounty access code"
        >
          <RefreshCw size={16} color={accentColor} />
        </TouchableOpacity>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.minorBtn, !localCode.trim() && styles.minorBtnDisabled]}
          onPress={handleCopy}
          activeOpacity={0.7}
          disabled={!localCode.trim()}
        >
          <Copy size={14} color={localCode.trim() ? Colors.textSecondary : Colors.textMuted} />
          <Text
            style={[
              styles.minorBtnText,
              { color: copied ? accentColor : localCode.trim() ? Colors.textSecondary : Colors.textMuted },
            ]}
          >
            {copied ? 'COPIED' : 'COPY'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.minorBtn, !localCode.trim() && styles.minorBtnDisabled]}
          onPress={handleShare}
          activeOpacity={0.7}
          disabled={!localCode.trim()}
        >
          <Share2 size={14} color={localCode.trim() ? Colors.textSecondary : Colors.textMuted} />
          <Text style={[styles.minorBtnText, !localCode.trim() && { color: Colors.textMuted }]}>
            SHARE
          </Text>
        </TouchableOpacity>

        {mode === 'standalone' && onPersist && (
          <TouchableOpacity
            style={[
              styles.saveBtn,
              { backgroundColor: accentColor },
              (!dirty || saveMode === 'saving') && styles.saveBtnDisabled,
            ]}
            onPress={() => void handleSave()}
            activeOpacity={0.7}
            disabled={!dirty || saveMode === 'saving'}
          >
            {saveMode === 'saving' ? (
              <ActivityIndicator size="small" color={Colors.bg} />
            ) : (
              <Text style={styles.saveBtnText}>
                {saveMode === 'saved' && !dirty ? 'SAVED' : 'SAVE CODE'}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {showLiveWarning && (
        <View style={styles.warningRow}>
          <AlertTriangle size={12} color={Colors.amber} />
          <Text style={styles.warningText}>
            No code set — the bounty person can&apos;t broadcast for this live event.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 14,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 11,
    color: Colors.cyan,
    letterSpacing: 1.5,
    fontWeight: '700' as const,
  },
  hint: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.white,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 0.5,
  },
  genBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cyan,
    backgroundColor: Colors.cyanDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  minorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
  },
  minorBtnDisabled: {
    opacity: 0.5,
  },
  minorBtnText: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1,
    color: Colors.textSecondary,
  },
  saveBtn: {
    marginLeft: 'auto',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 96,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: Colors.bg,
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 1.2,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.amberDim,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 11,
    color: Colors.amber,
    lineHeight: 15,
  },
});
