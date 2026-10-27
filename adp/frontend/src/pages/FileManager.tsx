import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Folder, File, Upload, Download, Plus, Trash2,
  ChevronRight, Home, RefreshCw, Archive, FolderPlus, Edit2,
} from 'lucide-react';
import { filesApi, serversApi } from '../lib/api';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

interface FileItem {
  name: string; type: 'file' | 'directory';
  size: number; mtime: string; path: string;
}

interface Project { id: string; name: string; }

function fmt(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 ** 2).toFixed(1) + ' MB';
}

export default function FileManager() {
  const [params] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(params.get('project') || '');
  const [path, setPath] = useState('/');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showMkdir, setShowMkdir] = useState(false);
  const [newDirName, setNewDirName] = useState('');
  const [renameTarget, setRenameTarget] = useState<FileItem | null>(null);
  const [newName, setNewName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showExtract, setShowExtract] = useState<FileItem | null>(null);
  const [extractDest, setExtractDest] = useState('');
  const [deleteZip, setDeleteZip] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    serversApi.list().then((r) => setProjects(r.data));
  }, []);

  const loadFiles = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setSelected(new Set());
    try {
      const res = await filesApi.list(projectId, path);
      setFiles(res.data);
    } catch { toast.error('Cannot read directory'); }
    finally { setLoading(false); }
  }, [projectId, path]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const navigate = (to: string) => { setPath(to); };

  const breadcrumbs = path.split('/').filter(Boolean);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const fd = new FormData();
    Array.from(e.target.files).forEach((f) => fd.append('files', f));
    try {
      await filesApi.upload(projectId, fd, path);
      toast.success('Upload complete');
      loadFiles();
    } catch { toast.error('Upload failed'); }
    finally { e.target.value = ''; }
  };

  const handleDelete = async () => {
    const paths = Array.from(selected);
    setDeleting(true);
    try {
      const res = await filesApi.delete(projectId, paths);
      const failed = res.data.results.filter((r: Record<string, unknown>) => !r.success);
      if (failed.length) toast.error(`${failed.length} items failed to delete`);
      else toast.success(`${paths.length} items deleted`);
      setDeleteConfirm(false);
      loadFiles();
    } catch { toast.error('Delete failed'); }
    finally { setDeleting(false); }
  };

  const handleMkdir = async () => {
    if (!newDirName.trim()) return;
    try {
      await filesApi.mkdir(projectId, `${path}/${newDirName}`);
      toast.success('Folder created');
      setShowMkdir(false);
      setNewDirName('');
      loadFiles();
    } catch { toast.error('Failed to create folder'); }
  };

  const handleRename = async () => {
    if (!renameTarget || !newName.trim()) return;
    const newPath = renameTarget.path.replace(renameTarget.name, newName);
    try {
      await filesApi.rename(projectId, renameTarget.path, newPath);
      toast.success('Renamed');
      setRenameTarget(null);
      loadFiles();
    } catch { toast.error('Rename failed'); }
  };

  const handleExtract = async () => {
    if (!showExtract) return;
    try {
      await filesApi.extract(projectId, {
        zip_path: showExtract.path,
        dest_path: extractDest || path,
        delete_zip_after: deleteZip,
      });
      toast.success('Extracted');
      setShowExtract(null);
      loadFiles();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Extract failed');
    }
  };

  const toggleSelect = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === files.length) setSelected(new Set());
    else setSelected(new Set(files.map((f) => f.path)));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--surface)] flex-wrap">
        <select
          value={projectId}
          onChange={(e) => { setProjectId(e.target.value); setPath('/'); }}
          className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text)] max-w-[200px]"
        >
          <option value="">Select project...</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        {projectId && (
          <>
            <button onClick={loadFiles} className="icon-btn" title="Refresh"><RefreshCw size={15} /></button>
            <button onClick={() => setShowMkdir(true)} className="icon-btn" title="New folder"><FolderPlus size={15} /></button>
            <button onClick={() => uploadRef.current?.click()} className="icon-btn" title="Upload"><Upload size={15} /></button>
            {selected.size > 0 && (
              <button onClick={() => setDeleteConfirm(true)} className="icon-btn text-red-400" title="Delete selected">
                <Trash2 size={15} />
              </button>
            )}
            <input ref={uploadRef} type="file" multiple className="hidden" onChange={handleUpload} />
          </>
        )}
      </div>

      {/* Breadcrumb */}
      {projectId && (
        <div className="flex items-center gap-1 px-4 py-2 text-xs text-[var(--text-muted)] border-b border-[var(--border)] overflow-x-auto">
          <button onClick={() => navigate('/')} className="hover:text-accent-400"><Home size={13} /></button>
          {breadcrumbs.map((seg, i) => {
            const to = '/' + breadcrumbs.slice(0, i + 1).join('/');
            return (
              <React.Fragment key={to}>
                <ChevronRight size={12} />
                <button onClick={() => navigate(to)} className="hover:text-accent-400 whitespace-nowrap">{seg}</button>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-auto">
        {!projectId ? (
          <div className="flex items-center justify-center h-full text-sm text-[var(--text-muted)]">
            Select a project to browse files
          </div>
        ) : loading ? (
          <div className="p-4 space-y-1">
            {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-10 rounded-lg" />)}
          </div>
        ) : files.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-[var(--text-muted)]">
            Empty directory
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs text-[var(--text-muted)]">
                <th className="text-left px-4 py-2 w-8">
                  <input type="checkbox" className="rounded"
                    checked={selected.size === files.length && files.length > 0}
                    onChange={selectAll} />
                </th>
                <th className="text-left px-2 py-2">Name</th>
                <th className="text-right px-4 py-2 hidden sm:table-cell">Size</th>
                <th className="text-right px-4 py-2 hidden md:table-cell">Modified</th>
                <th className="px-4 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {files.sort((a, b) => {
                if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
                return a.name.localeCompare(b.name);
              }).map((f) => (
                <tr
                  key={f.path}
                  className={`border-b border-[var(--border)] hover:bg-[var(--surface-2)] cursor-pointer ${selected.has(f.path) ? 'bg-accent-500/5' : ''}`}
                  onClick={() => f.type === 'directory' ? navigate(f.path) : toggleSelect(f.path)}
                >
                  <td className="px-4 py-2.5" onClick={(e) => { e.stopPropagation(); toggleSelect(f.path); }}>
                    <input type="checkbox" className="rounded" readOnly checked={selected.has(f.path)} />
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2">
                      {f.type === 'directory'
                        ? <Folder size={15} className="text-amber-400 flex-shrink-0" />
                        : <File size={15} className="text-[var(--text-muted)] flex-shrink-0" />
                      }
                      <span className="truncate">{f.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-[var(--text-muted)] hidden sm:table-cell">
                    {f.type === 'file' ? fmt(f.size) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-[var(--text-muted)] hidden md:table-cell">
                    {format(new Date(f.mtime), 'MMM d, HH:mm')}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                      {f.type === 'file' && (
                        <a
                          href={filesApi.download(projectId, f.path)}
                          className="icon-btn p-1" title="Download"
                        ><Download size={13} /></a>
                      )}
                      {f.name.endsWith('.zip') && (
                        <button className="icon-btn p-1" title="Extract"
                          onClick={() => { setShowExtract(f); setExtractDest(path); }}>
                          <Archive size={13} />
                        </button>
                      )}
                      <button className="icon-btn p-1" title="Rename"
                        onClick={() => { setRenameTarget(f); setNewName(f.name); }}>
                        <Edit2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      <Modal open={showMkdir} onClose={() => setShowMkdir(false)} title="New Folder" size="sm">
        <input autoFocus value={newDirName} onChange={(e) => setNewDirName(e.target.value)}
          className="input w-full mb-4" placeholder="folder-name"
          onKeyDown={(e) => e.key === 'Enter' && handleMkdir()} />
        <div className="flex gap-2 justify-end">
          <button onClick={() => setShowMkdir(false)} className="btn-ghost">Cancel</button>
          <button onClick={handleMkdir} className="btn-primary">Create</button>
        </div>
      </Modal>

      <Modal open={!!renameTarget} onClose={() => setRenameTarget(null)} title="Rename" size="sm">
        <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
          className="input w-full mb-4"
          onKeyDown={(e) => e.key === 'Enter' && handleRename()} />
        <div className="flex gap-2 justify-end">
          <button onClick={() => setRenameTarget(null)} className="btn-ghost">Cancel</button>
          <button onClick={handleRename} className="btn-primary">Rename</button>
        </div>
      </Modal>

      <Modal open={!!showExtract} onClose={() => setShowExtract(null)} title="Extract ZIP" size="sm">
        <div className="space-y-3 mb-4">
          <div>
            <label className="label">Extract to</label>
            <input value={extractDest} onChange={(e) => setExtractDest(e.target.value)}
              className="input w-full" placeholder="/ (project root)" />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={deleteZip} onChange={(e) => setDeleteZip(e.target.checked)} />
            Delete ZIP after extraction
          </label>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={() => setShowExtract(null)} className="btn-ghost">Cancel</button>
          <button onClick={handleExtract} className="btn-primary">Extract</button>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        onConfirm={handleDelete}
        title={`Delete ${selected.size} item${selected.size > 1 ? 's' : ''}`}
        message={`This will permanently delete ${selected.size} selected item${selected.size > 1 ? 's' : ''}.`}
        confirmLabel="Delete"
        danger loading={deleting}
      />
    </div>
  );
}
