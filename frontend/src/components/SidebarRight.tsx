import React, { useState } from 'react';
import { X, Plus, Key, Cpu, Shield, RefreshCw, Download, Upload, Trash2, Check, AlertTriangle } from 'lucide-react';
import axios from 'axios';

const getApiKeyLabel = (type: string) => {
  switch (type) {
    case 'openai': return 'OpenAI API Key';
    case 'anthropic': return 'Anthropic API Key';
    case 'google': return 'Google Gemini API Key';
    case 'groq': return 'Groq API Key';
    case 'openrouter': return 'OpenRouter API Key';
    case 'deepseek': return 'DeepSeek API Key';
    default: return 'API Key';
  }
};

const getModelPlaceholder = (type: string) => {
  switch (type) {
    case 'openai': return 'e.g. gpt-4o, gpt-4o-mini';
    case 'anthropic': return 'e.g. claude-3-5-sonnet-20241022';
    case 'google': return 'e.g. gemini-1.5-flash, gemini-1.5-pro';
    case 'groq': return 'e.g. llama-3.3-70b-versatile, mixtral-8x7b-32768';
    case 'openrouter': return 'e.g. google/gemma-2-9b-it:free';
    case 'deepseek': return 'e.g. deepseek-chat';
    default: return 'e.g. model-name';
  }
};

interface SidebarRightProps {
  isOpen: boolean;
  onClose: () => void;
  providers: any[];
  activeProviderId: string;
  onAddProvider: (prov: any) => void;
  onSetActiveProvider: (id: string) => void;
  onDeleteProvider: (id: string) => void;
  onReindex: () => void;
  isReindexing: boolean;
}

export default function SidebarRight({
  isOpen,
  onClose,
  providers,
  activeProviderId,
  onAddProvider,
  onSetActiveProvider,
  onDeleteProvider,
  onReindex,
  isReindexing
}: SidebarRightProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Add provider form state
  const [providerType, setProviderType] = useState('openai');
  const [profileName, setProfileName] = useState('');
  const [modelName, setModelName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState('');

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    if (!modelName.trim() || !apiKey.trim()) {
      setTestResult({ success: false, message: 'Model Name and API Key are required to test connection.' });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      await axios.post('http://127.0.0.1:8000/api/providers/test', {
        provider_type: providerType,
        model_name: modelName,
        api_key: apiKey
      });
      setTestResult({ success: true, message: 'Connection successful!' });
    } catch (err: any) {
      setTestResult({ 
        success: false, 
        message: err.response?.data?.detail || 'Connection failed. Check your API key and model name.' 
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmitProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim() || !modelName.trim() || !apiKey.trim()) return;
    setIsSubmitting(true);
    setTestResult(null);
    try {
      await onAddProvider({
        provider_type: providerType,
        profile_name: profileName,
        model_name: modelName,
        api_key: apiKey
      });
      setProfileName('');
      setModelName('');
      setApiKey('');
      setShowAddForm(false);
    } catch (err: any) {
      setTestResult({ 
        success: false, 
        message: err.response?.data?.detail || 'Failed to save provider config.' 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExport = async () => {
    try {
      window.open('http://127.0.0.1:8000/api/export', '_blank');
    } catch (e) {
      console.error("Export failed", e);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMessage('Importing...');
    setImportError('');
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      await axios.post('http://127.0.0.1:8000/api/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      setImportMessage('Imported successfully! Rebuilding vector store...');
      await onReindex();
      setImportMessage('Import completed successfully!');
      setTimeout(() => {
        setImportMessage('');
      }, 4000);
    } catch (err: any) {
      setImportError(err.response?.data?.detail || 'Import failed');
      setImportMessage('');
    }
  };

  return (
    <div className="fixed right-0 top-0 z-40 bg-white border-l shadow-xl w-80 h-screen select-none flex flex-col justify-between transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-bold text-slate-850 text-sm flex items-center gap-1.5 text-slate-800">
          <Cpu size={16} className="text-slate-700" /> Settings & Configs
        </h2>
        <button 
          onClick={onClose}
          className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800"
        >
          <X size={18} />
        </button>
      </div>

      {/* Main Configurations Section */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
        
        {/* LLM Providers Configuration */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              LLM Profiles
            </h3>
            <button
              onClick={() => {
                setShowAddForm(!showAddForm);
                setTestResult(null);
              }}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1 px-1.5 py-0.5 rounded"
            >
              <Plus size={12} /> Add New
            </button>
          </div>

          {/* Add Provider Inline Form */}
          {showAddForm && (
            <form onSubmit={handleSubmitProvider} className="p-3 border rounded-lg bg-slate-50 flex flex-col gap-2.5 shadow-subtle border-slate-200">
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] font-bold text-slate-500">Provider Type</label>
                <select
                  value={providerType}
                  onChange={(e) => setProviderType(e.target.value)}
                  className="text-xs border rounded p-1.5 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google Gemini</option>
                  <option value="groq">Groq</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="deepseek">DeepSeek</option>
                </select>
              </div>

              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] font-bold text-slate-500">Profile Label / Name</label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="e.g. Work OpenRouter"
                  className="text-xs border rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white"
                  required
                />
              </div>

              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] font-bold text-slate-500">Model Name</label>
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder={getModelPlaceholder(providerType)}
                  className="text-xs border rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white font-mono"
                  required
                />
              </div>

              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] font-bold text-slate-500">{getApiKeyLabel(providerType)}</label>
                <div className="relative">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={`Enter ${getApiKeyLabel(providerType)}`}
                    className="text-xs border rounded p-1.5 w-full pr-7 focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white"
                    required
                  />
                  <Key size={11} className="absolute right-2 top-2.5 text-slate-400" />
                </div>
              </div>

              {testResult && (
                <div className={`p-2 rounded text-[10px] flex items-start gap-1.5 leading-normal max-w-full overflow-hidden ${
                  testResult.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                  {testResult.success ? (
                    <Check size={12} className="shrink-0 mt-0.5 text-emerald-600" />
                  ) : (
                    <AlertTriangle size={12} className="shrink-0 mt-0.5 text-rose-600" />
                  )}
                  <span className="break-words break-all font-medium flex-1 min-w-0">{testResult.message}</span>
                </div>
              )}

              <div className="flex justify-end gap-1.5 mt-1 border-t pt-2 border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setTestResult(null);
                  }}
                  className="text-[10px] font-bold px-2.5 py-1.5 border rounded hover:bg-white text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting || isSubmitting}
                  className="text-[10px] font-bold bg-white border border-slate-350 hover:bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded disabled:opacity-50"
                >
                  {isTesting ? 'Testing...' : 'Test Connection'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isTesting}
                  className="text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save & Activate'}
                </button>
              </div>
            </form>
          )}

          {/* Providers List (Scrollable) */}
          <div className="max-h-56 overflow-y-auto flex flex-col gap-1.5 border border-slate-100 p-1 rounded-lg bg-slate-50/50">
            {providers.length === 0 ? (
              <div className="text-xs text-slate-400 italic py-6 text-center">
                No profiles configured yet.
              </div>
            ) : (
              providers.map(p => (
                <div 
                  key={p.id}
                  className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                    p.is_active 
                      ? 'bg-white border-blue-500 font-medium shadow-subtle' 
                      : 'bg-white hover:bg-slate-50 border-slate-200'
                  }`}
                  onClick={() => onSetActiveProvider(p.id)}
                >
                  <div className="flex flex-col gap-0.5 truncate flex-1 pr-2">
                    <span className="truncate text-slate-800 font-semibold">{p.profile_name}</span>
                    <span className="text-[9px] text-slate-500 uppercase tracking-tight font-mono">{p.provider_type} • {p.model_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.is_active && (
                      <span className="text-[9px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Active</span>
                    )}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteProvider(p.id);
                      }}
                      className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="h-px bg-slate-100" />

        {/* Local Vector Indexing */}
        <div className="flex flex-col gap-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Shield size={14} /> Vector Store
          </h3>
          <p className="text-[10px] text-slate-500 leading-normal">
            BGE embeddings (`BAAI/bge-small-en-v1.5`) are generated locally on SQLite modifications. If indices drift, trigger a full rebuild below.
          </p>
          <button
            onClick={onReindex}
            disabled={isReindexing}
            className="flex items-center justify-center gap-2 w-full text-xs border p-2 rounded hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-semibold shadow-subtle disabled:opacity-50"
          >
            <RefreshCw size={12} className={isReindexing ? 'animate-spin' : ''} />
            {isReindexing ? 'Reindexing...' : 'Re-index Knowledge Base'}
          </button>
        </div>

        <div className="h-px bg-slate-100" />

        {/* Data Portability */}
        <div className="flex flex-col gap-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Download size={14} /> Data Management
          </h3>
          <p className="text-[10px] text-slate-500 leading-normal">
            Port your intelligence vaults, queries, and playbooks via `.slothkb` exports. Vector store will automatically rebuild on import.
          </p>
          
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button
              onClick={handleExport}
              className="flex items-center justify-center gap-1.5 border p-2 rounded hover:bg-slate-50 text-xs text-slate-700 hover:text-slate-900 font-semibold shadow-subtle"
            >
              <Download size={12} /> Export KB
            </button>
            <label
              className="flex items-center justify-center gap-1.5 border p-2 rounded hover:bg-slate-50 text-xs text-slate-700 hover:text-slate-900 font-semibold shadow-subtle cursor-pointer"
            >
              <Upload size={12} /> Import KB
              <input 
                type="file" 
                accept=".slothkb"
                onChange={handleImport}
                className="hidden" 
              />
            </label>
          </div>
          {importMessage && <span className="text-[10px] text-emerald-600 font-medium mt-1">{importMessage}</span>}
          {importError && <span className="text-[10px] text-rose-600 font-medium mt-1">{importError}</span>}
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t bg-slate-50 flex items-center justify-center">
        <span className="text-[10px] text-slate-400 tracking-wider font-semibold">SLOTHQUERY v1.0 — LOCAL ONLY</span>
      </div>
    </div>
  );
}
