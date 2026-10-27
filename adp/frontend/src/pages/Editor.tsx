import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import MonacoEditor from '@monaco-editor/react';
import {
  Save, X, Plus, FolderOpen, Search, AlertCircle, CheckCircle, Maximize2, Minimize2,
} from 'lucide-react';
import { filesApi, serversApi } from '../lib/api';
import { useStore } from '../lib/store';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface Tab {
  id: string;
  projectId: string;
  filePath: string;
  name: string;
  content: string;
  savedContent: string;
  loading: boolean;
}

interface Project { id: string; name: string; }

function extLang(name: string): string {
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', php: 'php', html: 'html', css: 'css', json: 'json',
    md: 'markdown', yaml: 'yaml', yml: 'yaml', sh: 'shell', sql: 'sql',
    env: 'plaintext', txt: 'plaintext', toml: 'toml',
  };
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return map[ext] || 'plaintext';
}

export default function Editor() {
  const [params] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(params.get('project') || '');
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [searchPath, setSearchPath] = useState('');
  const [searching, setSearching] = useState(false);
  const { theme } = useStore();
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    serversApi.list().then((r) => setProjects(r.data));
  }, []);

  const openFile = useCallback(async (pid: string, filePath: string) => {
    const existing = tabs.find((t) => t.projectId === pid && t.filePath === filePath);
    if (existing) { setActiveTab(existing.id); return; }

    const id = `${pid}::${filePath}`;
    const name = filePath.split('/').pop() || filePath;
    const tab: Tab = { id, projectId: pid, filePath, name, content: '', savedContent: '', loading: true };
    setTabs((prev) => [...prev, tab]);
    setActiveTab(id);

    try {
      const res = await filesApi.read(pid, filePath);
      setTabs((prev) => prev.map((t) =>
        t.id === id ? { ...t, content: res.data.content, savedContent: res.data.content, loading: false } : t
      ));
    } catch {
      setTabs((prev) => prev.filter((t) => t.id !== id));
      toast.error('Cannot open file');
    }
  }, [tabs]);

  const handleSearchOpen = async () => {
    if (!projectId || !searchPath.trim()) return;
    setSearching(true);
    await openFile(projectId, searchPath.startsWith('/') ? searchPath : `/${searchPath}`);
    setSearching(false);
    setSearchPath('');
  };

  const saveTab = useCallback(async (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab || tab.content === tab.savedContent) return;
    try {
      await filesApi.write(tab.projectId, tab.filePath, tab.content);
      setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, savedContent: t.content } : t));
      toast.success('Saved');
    } catch { toast.error('Save failed'); }
  }, [tabs]);

  const closeTab = useCallback((tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (tab && tab.content !== tab.savedContent) {
      if (!confirm('Unsaved changes. Close anyway?')) return;
    }
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
    if (activeTab === tabId) {
      const remaining = tabs.filter((t) => t.id !== tabId);
      setActiveTab(remaining[remaining.length - 1]?.id || null);
    }
  }, [tabs, activeTab]);

  const handleChange = useCallback((value: string | undefined, tabId: string) => {
    setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, content: value || '' } : t));
  }, []);

  // Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (activeTab) saveTab(activeTab);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [activeTab, saveTab]);

  const currentTab = tabs.find((t) => t.id === activeTab);
  const isDirty = currentTab && currentTab.content !== currentTab.savedContent;

  return (
    <div className={clsx('flex flex-col bg-[var(--bg)]', fullscreen ? 'fixed inset-0 z-50' : 'h-full')}>
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--surface)] flex-wrap">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text)] max-w-[160px]"
        >
          <option value="">Project...</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <div className="flex items-center gap-1 flex-1 min-w-0 max-w-xs">
          <input
            value={searchPath}
            onChange={(e) => setSearchPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearchOpen()}
            className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text)] flex-1 min-w-0"
            placeholder="/src/index.ts"
          />
          <button onClick={handleSearchOpen} disabled={searching} className="icon-btn p-1">
            <FolderOpen size={14} />
          </button>
        </div>

        <div className="ml-auto flex items-center gap-1">
          {currentTab && (
            <button
              onClick={() => saveTab(activeTab!)}
              disabled={!isDirty}
              className={clsx('flex items-center gap-1 px-2 py-1 rounded text-xs', isDirty ? 'text-accent-400 hover:bg-accent-500/10' : 'text-[var(--text-muted)] opacity-40')}
            >
              <Save size={13} /> Save
            </button>
          )}
          <button onClick={() => setFullscreen(!fullscreen)} className="icon-btn p-1">
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* Tabs */}
      {tabs.length > 0 && (
        <div className="flex items-center border-b border-[var(--border)] bg-[var(--surface)] overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center gap-2 px-3 py-2 text-xs cursor-pointer flex-shrink-0 border-r border-[var(--border)]',
                activeTab === tab.id
                  ? 'bg-[var(--bg)] text-[var(--text)] border-b-2 border-b-accent-500'
                  : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'
              )}
            >
              {tab.content !== tab.savedContent && (
                <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
              )}
              <span className="max-w-[120px] truncate">{tab.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                className="hover:text-[var(--text)] ml-1"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        {!currentTab ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--text-muted)]">
            <Search size={40} className="opacity-20" />
            <p className="text-sm">Open a file to start editing</p>
            <p className="text-xs opacity-60">Type a path above and press Enter</p>
          </div>
        ) : currentTab.loading ? (
          <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
            Loading...
          </div>
        ) : (
          <MonacoEditor
            height="100%"
            language={extLang(currentTab.name)}
            value={currentTab.content}
            theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
            onChange={(v) => handleChange(v, currentTab.id)}
            options={{
              fontSize: 13,
              fontFamily: '"JetBrains Mono", Menlo, monospace',
              minimap: { enabled: window.innerWidth > 768 },
              lineNumbers: 'on',
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              tabSize: 2,
              renderWhitespace: 'selection',
              smoothScrolling: true,
              cursorBlinking: 'phase',
              padding: { top: 8 },
            }}
          />
        )}
      </div>

      {/* Status bar */}
      {currentTab && (
        <div className="flex items-center gap-3 px-3 py-1 bg-[var(--surface)] border-t border-[var(--border)] text-xs text-[var(--text-muted)]">
          {isDirty
            ? <span className="flex items-center gap-1 text-amber-400"><AlertCircle size={11} /> Unsaved</span>
            : <span className="flex items-center gap-1 text-emerald-400"><CheckCircle size={11} /> Saved</span>
          }
          <span className="ml-auto">{extLang(currentTab.name)}</span>
          <span>{currentTab.filePath}</span>
        </div>
      )}
    </div>
  );
}
