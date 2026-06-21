import React, { useState, useEffect } from 'react';
import { BookOpen, Plus, Trash2, Edit2, Save, FileText, ChevronRight, Hash } from 'lucide-react';
import axios from 'axios';

interface SchemaExplorerProps {
  vaultId: string;
}

export default function SchemaExplorer({ vaultId }: SchemaExplorerProps) {
  const [playbooks, setPlaybooks] = useState<any[]>([]);
  const [selectedPb, setSelectedPb] = useState<any | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Edit / Add state
  const [name, setName] = useState('');
  const [pbType, setPbType] = useState('business_rules'); // business_rules | table_schemas | analyst_notes
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchPlaybooks = async () => {
    if (!vaultId) return;
    setIsLoading(true);
    try {
      const res = await axios.get(`http://localhost:8000/api/playbooks?vault_id=${vaultId}`);
      setPlaybooks(res.data);
      if (res.data.length > 0 && !selectedPb) {
        handleSelectPb(res.data[0]);
      } else if (res.data.length === 0) {
        setSelectedPb(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlaybooks();
  }, [vaultId]);

  const handleSelectPb = (pb: any) => {
    setSelectedPb(pb);
    setShowAddForm(false);
    setName(pb.name);
    setPbType(pb.playbook_type);
    setContent(pb.content);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !content.trim()) return;
    setIsSaving(true);
    try {
      const payload: any = {
        vault_id: vaultId,
        playbook_type: pbType,
        name,
        content
      };
      if (selectedPb && !showAddForm) {
        payload.id = selectedPb.id;
      }
      
      const res = await axios.post('http://localhost:8000/api/playbooks', payload);
      alert('Playbook saved successfully!');
      setShowAddForm(false);
      fetchPlaybooks();
      if (!selectedPb || showAddForm) {
        setSelectedPb(res.data);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to save playbook.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this playbook?')) return;
    try {
      await axios.delete(`http://localhost:8000/api/playbooks/${id}`);
      setSelectedPb(null);
      fetchPlaybooks();
    } catch (err) {
      console.error(err);
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch(type) {
      case 'business_rules': return 'bg-indigo-100 text-indigo-700';
      case 'table_schemas': return 'bg-teal-100 text-teal-700';
      case 'analyst_notes': return 'bg-amber-100 text-amber-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getTypeLabel = (type: string) => {
    switch(type) {
      case 'business_rules': return 'Business Rules';
      case 'table_schemas': return 'Table Schema / Metadata';
      case 'analyst_notes': return 'Analyst Notes';
      default: return type;
    }
  };

  return (
    <div className="flex flex-1 bg-white h-screen overflow-hidden">
      
      {/* Left List Pane */}
      <div className="w-80 border-r flex flex-col h-full bg-slate-50/50">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
            <BookOpen size={16} /> Schema & Playbooks
          </h2>
          <button
            onClick={() => {
              setShowAddForm(true);
              setName('');
              setPbType('business_rules');
              setContent('');
            }}
            className="text-xs bg-slate-900 text-white font-semibold px-2 py-1.5 rounded hover:bg-slate-800 flex items-center gap-1 shadow-subtle"
          >
            <Plus size={14} /> New Rules
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="text-center py-10 text-xs text-slate-400">Loading...</div>
          ) : playbooks.length === 0 ? (
            <div className="text-xs text-slate-400 italic text-center py-10">No playbooks configured.</div>
          ) : (
            <div className="flex flex-col gap-1">
              {playbooks.map(pb => (
                <div
                  key={pb.id}
                  onClick={() => handleSelectPb(pb)}
                  className={`p-3 rounded border cursor-pointer transition-colors text-xs flex flex-col gap-1.5 ${selectedPb?.id === pb.id ? 'bg-white border-slate-400 font-medium shadow-subtle' : 'bg-transparent border-transparent hover:bg-slate-100'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-800 truncate">{pb.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(pb.id);
                      }}
                      className="text-slate-400 hover:text-rose-600 transition-colors p-0.5 rounded"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded self-start tracking-wide ${getTypeBadgeColor(pb.playbook_type)}`}>
                    {getTypeLabel(pb.playbook_type)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Content Editor Pane */}
      <div className="flex-1 overflow-y-auto p-6 bg-white">
        {showAddForm || selectedPb ? (
          <form onSubmit={handleSave} className="max-w-3xl flex flex-col gap-4">
            <div className="border-b pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  {showAddForm ? 'Create Rule / Schema doc' : 'Edit Rule / Schema doc'}
                </h3>
                <p className="text-xs text-slate-500">Provide consolidated business heuristics, analyst notes, or schema metadata.</p>
              </div>
              <button
                type="submit"
                disabled={isSaving}
                className="text-xs bg-slate-900 text-white font-semibold px-4 py-2 rounded hover:bg-slate-800 shadow-subtle disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save size={12} />
                Save Playbook
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600">Document Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Finance Table Schemas, MAU Calculation Rule"
                  className="text-xs border rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600">Playbook Type</label>
                <select
                  value={pbType}
                  onChange={(e) => setPbType(e.target.value)}
                  className="text-xs border rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white"
                >
                  <option value="business_rules">Business Rules & playbooks</option>
                  <option value="table_schemas">Table Schemas & Metadata</option>
                  <option value="analyst_notes">Analyst Notes</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">Document Content (Markdown / Text)</label>
              <p className="text-[10px] text-slate-400 mb-1">Clearly define instructions or rules. This content will be injected into the context window for target queries.</p>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="# Business Rules..."
                className="text-xs border rounded p-3 h-96 font-mono resize-none focus:outline-none focus:ring-1 focus:ring-slate-400"
                required
              />
            </div>
          </form>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center select-none">
            <span className="text-xs text-slate-400">Select a document from the left list or create a new rules document.</span>
          </div>
        )}
      </div>

    </div>
  );
}
