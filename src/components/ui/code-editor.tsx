import { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { useSettingsStore } from '@/stores/settings';

const lightTheme = EditorView.theme(
  {
    '&': { backgroundColor: '#ffffff', color: '#131722', height: '100%' },
    '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
    '.cm-gutters': { backgroundColor: '#ffffff', color: '#b6bcc9', border: 'none' },
    '.cm-activeLine': { backgroundColor: '#f4f6fb' },
    '.cm-activeLineGutter': { backgroundColor: '#f4f6fb' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: '#d6e4ff' },
    '.cm-cursor': { borderLeftColor: '#2962ff' },
  },
  { dark: false },
);

const darkTheme = EditorView.theme(
  {
    '&': { backgroundColor: 'var(--chart-bg)', color: 'var(--foreground)', height: '100%' },
    '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
    '.cm-gutters': { backgroundColor: 'var(--chart-bg)', color: '#5c6370', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.035)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(255,255,255,0.035)' },
  },
  { dark: true },
);

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export function CodeEditor({ value, onChange, readOnly = false }: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const theme = useSettingsStore((state) => state.theme);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!hostRef.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        javascript(),
        theme === 'light' ? lightTheme : oneDark,
        darkTheme,
        EditorView.lineWrapping,
        EditorState.readOnly.of(readOnly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The editor is rebuilt only when the theme switches; cursor position is not critical here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return <div ref={hostRef} className="h-full min-h-0 overflow-hidden text-[12px]" />;
}
