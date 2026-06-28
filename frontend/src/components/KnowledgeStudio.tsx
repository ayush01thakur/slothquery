import React, { useState, useEffect, useRef } from 'react';
import { Database, Plus, Search, CheckCircle, HelpCircle, Archive, Save, Loader2, PlusCircle, Tag, BookOpen, FileText, Check, Settings, Trash2 } from 'lucide-react';
import axios from 'axios';

interface KnowledgeStudioProps {
  vaultId: string;
  vaults: any[];
  onCreateVault: (name: string, description: string) => Promise<any> | void;
  onDeleteVault: (vaultId: string) => Promise<void>;
}

export default function KnowledgeStudio({ vaultId, vaults, onCreateVault, onDeleteVault }: KnowledgeStudioProps) {
  const [activeTab, setActiveTab] = useState<'queries' | 'playbooks' | 'schemas' | 'notes'>('queries');
  
  // Lists
  const [queries, setQueries] = useState<any[]>([]);
  const [playbooks, setPlaybooks] = useState<any[]>([]);
  
  // Selections
  const [selectedQuery, setSelectedQuery] = useState<any | null>(null);
  const [selectedPlaybook, setSelectedPlaybook] = useState<any | null>(null);
  
  // Filtering & Search
  const [search, setSearch] = useState('');
  const [filterVaultId, setFilterVaultId] = useState(vaultId || '');
  const [filterDialect, setFilterDialect] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  
  // View states
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddPlaybookForm, setShowAddPlaybookForm] = useState(false);

  // Edit query context states
  const [editIntent, setEditIntent] = useState('');
  const [editRules, setEditRules] = useState<string[]>([]);
  const [editEntities, setEditEntities] = useState<string[]>([]);
  const [editTransformations, setEditTransformations] = useState<string[]>([]);
  const [editAmbiguities, setEditAmbiguities] = useState<string[]>([]);
  const [editStatus, setEditStatus] = useState('draft');
  const [isSaving, setIsSaving] = useState(false);

  // Add query form states
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newSql, setNewSql] = useState('');
  const [newComments, setNewComments] = useState('');
  const [newTags, setNewTags] = useState('');
  const [newDialect, setNewDialect] = useState('snowflake');
  const [targetVaultId, setTargetVaultId] = useState(vaultId || '');
  
  // Human-in-the-loop review states
  const [isExtracting, setIsExtracting] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [draftIntent, setDraftIntent] = useState('');
  const [draftRules, setDraftRules] = useState<string[]>([]);
  const [draftEntities, setDraftEntities] = useState<string[]>([]);
  const [draftTransformations, setDraftTransformations] = useState<string[]>([]);
  const [draftAmbiguities, setDraftAmbiguities] = useState<string[]>([]);
  const [isFinalSaving, setIsFinalSaving] = useState(false);

  // Step 2: Playbook push preview states
  const [showPlaybookPushModal, setShowPlaybookPushModal] = useState(false);
  const [playbookPushPreview, setPlaybookPushPreview] = useState<any[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isConfirmingPush, setIsConfirmingPush] = useState(false);
  const [savedVaultId, setSavedVaultId] = useState(''); // vault of the just-saved query
  const [savedContextJson, setSavedContextJson] = useState<any>(null);

  // Playbook Form states (for Rules, Schemas, Notes)
  const [playbookFormType, setPlaybookFormType] = useState<'business_rules' | 'table_schemas' | 'analyst_notes'>('business_rules');
  const [playbookFormName, setPlaybookFormName] = useState('');
  const [playbookFormContent, setPlaybookFormContent] = useState('');
  const [playbookFormId, setPlaybookFormId] = useState(''); // empty if creating new
  const [playbookTargetVaultId, setPlaybookTargetVaultId] = useState(vaultId || '');
  const [isPlaybookSubmitting, setIsPlaybookSubmitting] = useState(false);
  const [playbookAlwaysInclude, setPlaybookAlwaysInclude] = useState(false);

  // Inline Vault Creation state
  const [showNewVaultInline, setShowNewVaultInline] = useState(false);
  const [newVaultName, setNewVaultName] = useState('');
  const [newVaultDesc, setNewVaultDesc] = useState('');
  const [isCreatingVault, setIsCreatingVault] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Click outside listener for Add Asset dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowAddDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (vaultId) {
      setFilterVaultId(vaultId);
      setTargetVaultId(vaultId);
      setPlaybookTargetVaultId(vaultId);
    }
  }, [vaultId]);

  const fetchQueries = async () => {
    if (!filterVaultId) return;
    setIsLoading(true);
    try {
      const res = await axios.get(`http://localhost:8000/api/queries?vault_id=${filterVaultId}`);
      setQueries(res.data);
      if (res.data.length > 0) {
        handleSelectQuery(res.data[0]);
      } else {
        setSelectedQuery(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPlaybooks = async () => {
    if (!filterVaultId) return;
    try {
      const res = await axios.get(`http://localhost:8000/api/playbooks?vault_id=${filterVaultId}`);
      setPlaybooks(res.data);
      selectFirstPlaybookForTab(res.data, activeTab);
    } catch (err) {
      console.error(err);
    }
  };

  const selectFirstPlaybookForTab = (pbs: any[], tab: string) => {
    const typeMap: Record<string, string> = {
      playbooks: 'business_rules',
      schemas: 'table_schemas',
      notes: 'analyst_notes'
    };
    const targetType = typeMap[tab];
    if (targetType) {
      const filtered = pbs.filter(p => p.playbook_type === targetType);
      if (filtered.length > 0) {
        handleSelectPlaybook(filtered[0]);
      } else {
        setSelectedPlaybook(null);
      }
    }
  };

  useEffect(() => {
    if (activeTab === 'queries') {
      fetchQueries();
    } else {
      fetchPlaybooks();
    }
  }, [filterVaultId, activeTab]);

  const handleSelectQuery = (q: any) => {
    setSelectedQuery(q);
    setSelectedPlaybook(null);
    setShowAddForm(false);
    setShowAddPlaybookForm(false);
    
    const ctx = q.context || {};
    setEditIntent(ctx.intent || '');
    setEditRules(ctx.business_rules || []);
    setEditEntities(ctx.schema_entities || []);
    setEditTransformations(ctx.transformations || []);
    setEditAmbiguities(ctx.ambiguities || []);
    setEditStatus(q.approval_status || 'draft');
  };

  const handleSelectPlaybook = (pb: any) => {
    setSelectedPlaybook(pb);
    setSelectedQuery(null);
    setShowAddForm(false);
    setShowAddPlaybookForm(false);
    
    setPlaybookFormId(pb.id);
    setPlaybookFormName(pb.name);
    setPlaybookFormContent(pb.content);
    setPlaybookFormType(pb.playbook_type);
    setPlaybookTargetVaultId(pb.vault_id);
    setPlaybookAlwaysInclude(pb.always_include || false);
  };

  const handleSaveContext = async () => {
    if (!selectedQuery) return;
    setIsSaving(true);
    try {
      const updatedContext = {
        intent: editIntent,
        business_rules: editRules,
        schema_entities: editEntities,
        transformations: editTransformations,
        ambiguities: editAmbiguities
      };
      
      await axios.put(`http://localhost:8000/api/queries/${selectedQuery.id}/context`, {
        context_json: updatedContext,
        approval_status: editStatus
      });
      
      setQueries(queries.map(q => {
        if (q.id === selectedQuery.id) {
          return { ...q, context: updatedContext, approval_status: editStatus };
        }
        return q;
      }));
      
      alert('Knowledge context updated successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to save context.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleInlineVaultCreate = async () => {
    if (!newVaultName.trim()) return;
    setIsCreatingVault(true);
    try {
      const res = await axios.post('http://localhost:8000/api/vaults', {
        name: newVaultName,
        description: newVaultDesc
      });
      await onCreateVault(newVaultName, newVaultDesc);
      
      setTargetVaultId(res.data.id);
      setPlaybookTargetVaultId(res.data.id);
      setFilterVaultId(res.data.id);
      setNewVaultName('');
      setNewVaultDesc('');
      setShowNewVaultInline(false);
      alert('Vault created successfully inline!');
    } catch (err) {
      console.error(err);
      alert('Failed to create vault inline.');
    } finally {
      setIsCreatingVault(false);
    }
  };

  const handleStartExtraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newSql.trim() || !targetVaultId) {
      alert('Title, SQL query and target vault are required.');
      return;
    }
    setIsExtracting(true);
    try {
      const res = await axios.post('http://localhost:8000/api/queries/extract', {
        vault_id: targetVaultId,
        title: newTitle,
        description: newDesc,
        sql_query: newSql,
        sql_comments: newComments,
        tags: newTags,
        dialect: newDialect
      });
      
      const draft = res.data.draft_context || {};
      setDraftIntent(draft.intent || '');
      setDraftRules(draft.business_rules || []);
      setDraftEntities(draft.schema_entities || []);
      setDraftTransformations(draft.transformations || []);
      setDraftAmbiguities(draft.ambiguities || []);
      
      setShowReviewModal(true);
    } catch (err: any) {
      console.error(err);
      alert(`Failed to extract draft context: ${err.response?.data?.detail || err.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleApproveAndSaveQuery = async () => {
    setIsFinalSaving(true);
    try {
      const finalContext = {
        intent: draftIntent,
        business_rules: draftRules,
        schema_entities: draftEntities,
        transformations: draftTransformations,
        ambiguities: draftAmbiguities
      };

      await axios.post('http://localhost:8000/api/queries/with-context', {
        vault_id: targetVaultId,
        title: newTitle,
        description: newDesc,
        sql_query: newSql,
        sql_comments: newComments,
        tags: newTags,
        dialect: newDialect,
        context_json: finalContext
      });

      // Close review modal and move to Step 2: Push to Playbooks?
      setShowReviewModal(false);
      setSavedVaultId(targetVaultId);
      setSavedContextJson(finalContext);
      fetchQueries();

      // Load the playbook push preview
      setIsLoadingPreview(true);
      setShowPlaybookPushModal(true);
      try {
        const previewRes = await axios.post('http://127.0.0.1:8000/api/queries/preview-playbook-push', {
          vault_id: targetVaultId,
          context_json: finalContext
        });
        setPlaybookPushPreview(previewRes.data.preview || []);
      } catch (previewErr: any) {
        console.error('Preview failed:', previewErr);
        setPlaybookPushPreview([]);
        setShowPlaybookPushModal(false);
        alert(`Failed to analyze knowledge base updates: ${previewErr.response?.data?.detail || previewErr.message}`);
      } finally {
        setIsLoadingPreview(false);
      }

      // Reset form
      setNewTitle(''); setNewDesc(''); setNewSql(''); setNewComments(''); setNewTags('');
      setShowAddForm(false);
    } catch (err: any) {
      console.error(err);
      alert(`Failed to save query context: ${err.response?.data?.detail || err.message}`);
    } finally {
      setIsFinalSaving(false);
    }
  };

  const handleConfirmPlaybookPush = async () => {
    setIsConfirmingPush(true);
    try {
      await axios.post('http://127.0.0.1:8000/api/queries/confirm-playbook-push', {
        vault_id: savedVaultId,
        context_json: savedContextJson
      });
      setShowPlaybookPushModal(false);
      setPlaybookPushPreview([]);
      // Refresh playbooks list
      fetchQueries();
    } catch (err: any) {
      console.error('Playbook push failed:', err);
      alert('Could not push to playbooks. You can do it manually from the Rules/Schemas/Notes tabs.');
    } finally {
      setIsConfirmingPush(false);
    }
  };

  const handleSkipPlaybookPush = () => {
    setShowPlaybookPushModal(false);
    setPlaybookPushPreview([]);
  };

  const handleSavePlaybook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playbookFormName.trim() || !playbookFormContent.trim() || !playbookTargetVaultId) {
      alert('Name, Content, and Vault selection are required.');
      return;
    }
    setIsPlaybookSubmitting(true);
    try {
      const payload: any = {
        vault_id: playbookTargetVaultId,
        playbook_type: playbookFormType,
        name: playbookFormName,
        content: playbookFormContent,
        always_include: playbookAlwaysInclude
      };
      if (playbookFormId) {
        payload.id = playbookFormId;
      }
      
      const res = await axios.post('http://127.0.0.1:8000/api/playbooks', payload);
      
      alert(`Asset saved successfully!`);
      setShowAddPlaybookForm(false);
      fetchPlaybooks();
      handleSelectPlaybook(res.data);
    } catch (err) {
      console.error(err);
      alert('Failed to save asset.');
    } finally {
      setIsPlaybookSubmitting(false);
    }
  };

  const handleDeletePlaybook = async () => {
    if (!selectedPlaybook) return;
    if (!window.confirm(`Are you sure you want to delete "${selectedPlaybook.name}"?`)) return;
    try {
      await axios.delete(`http://localhost:8000/api/playbooks/${selectedPlaybook.id}`);
      alert('Asset deleted.');
      setSelectedPlaybook(null);
      fetchPlaybooks();
    } catch (err) {
      console.error(err);
      alert('Failed to delete asset.');
    }
  };

  const handleDeleteQuery = async () => {
    if (!selectedQuery) return;
    const confirmed = window.confirm(
      `Delete "${selectedQuery.title}"?\n\n` +
      `⚠️ Important: Business logic or content derived from this query may still exist in your vault Playbooks (Business Rules, Schemas, Notes).\n\n` +
      `Please review and edit those Playbooks manually after deletion to ensure accurate AI responses.\n\n` +
      `This action cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await axios.delete(`http://localhost:8000/api/queries/${selectedQuery.id}`);
      setSelectedQuery(null);
      fetchQueries();
    } catch (err) {
      console.error(err);
      alert('Failed to delete query.');
    }
  };

  const handleDeleteVault = async () => {
    if (!filterVaultId) return;
    const vault = vaults.find(v => v.id === filterVaultId);
    const vaultName = vault?.name || 'this vault';
    const confirmed = window.confirm(
      `Delete vault "${vaultName}"?\n\n` +
      `⚠️ This will permanently delete:\n` +
      `  • All queries in this vault\n` +
      `  • All query contexts\n` +
      `  • All playbooks (Business Rules, Schemas, Notes)\n` +
      `  • The vault's AI search index\n\n` +
      `Any business logic that was merged from this vault's queries into other areas will NOT be automatically removed.\n\n` +
      `This action cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await onDeleteVault(filterVaultId);
    } catch (err) {
      console.error(err);
      alert('Failed to delete vault.');
    }
  };


  const handleArrayChange = (index: number, val: string, array: string[], setter: (a: string[]) => void) => {
    const next = [...array];
    next[index] = val;
    setter(next);
  };

  const handleAddArrayItem = (array: string[], setter: (a: string[]) => void) => {
    setter([...array, '']);
  };

  const handleRemoveArrayItem = (index: number, array: string[], setter: (a: string[]) => void) => {
    setter(array.filter((_, i) => i !== index));
  };

  const filteredQueries = queries.filter(q => {
    const matchesSearch = 
      q.title.toLowerCase().includes(search.toLowerCase()) ||
      q.sql_query.toLowerCase().includes(search.toLowerCase());
    
    const matchesDialect = 
      filterDialect === 'all' || 
      q.dialect.toLowerCase() === filterDialect.toLowerCase();
      
    return matchesSearch && matchesDialect;
  });

  const getPlaybookTypeFromTab = () => {
    const typeMap: Record<string, string> = {
      playbooks: 'business_rules',
      schemas: 'table_schemas',
      notes: 'analyst_notes'
    };
    return typeMap[activeTab];
  };

  const filteredPlaybooks = playbooks.filter(p => {
    const matchesType = p.playbook_type === getPlaybookTypeFromTab();
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                          p.content.toLowerCase().includes(search.toLowerCase());
    return matchesType && matchesSearch;
  });

  return (
    <div className="flex flex-1 bg-white h-screen overflow-hidden">
      
      {/* Left Panel - list with filters and type tabs */}
      <div className="w-80 border-r flex flex-col h-full bg-slate-50/50">
        
        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 text-[10px] select-none bg-slate-100/40">
          <button
            onClick={() => setActiveTab('queries')}
            className={`flex-1 py-2 text-center border-b-2 font-bold uppercase tracking-wider transition-colors ${activeTab === 'queries' ? 'border-slate-800 text-slate-800 bg-white' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
          >
            Queries
          </button>
          <button
            onClick={() => setActiveTab('playbooks')}
            className={`flex-1 py-2 text-center border-b-2 font-bold uppercase tracking-wider transition-colors ${activeTab === 'playbooks' ? 'border-slate-800 text-slate-800 bg-white' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
            title="Business Rules & Logic Playbooks"
          >
            Rules
          </button>
          <button
            onClick={() => setActiveTab('schemas')}
            className={`flex-1 py-2 text-center border-b-2 font-bold uppercase tracking-wider transition-colors ${activeTab === 'schemas' ? 'border-slate-800 text-slate-800 bg-white' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
            title="Table Schemas & Joins Connections"
          >
            Schemas
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`flex-1 py-2 text-center border-b-2 font-bold uppercase tracking-wider transition-colors ${activeTab === 'notes' ? 'border-slate-800 text-slate-800 bg-white' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
            title="Analyst Knowledge Notes"
          >
            Notes
          </button>
        </div>

        <div className="p-4 border-b flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-850 text-slate-800 text-sm flex items-center gap-1.5">
              <Database size={16} className="text-slate-600" /> Studio Assets
            </h2>
            
            {/* Unified Add Asset Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowAddDropdown(!showAddDropdown)}
                className="text-xs bg-slate-900 text-white font-semibold px-2.5 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-1 shadow-subtle transition-colors"
              >
                <Plus size={14} /> Add Asset
              </button>
              
              {showAddDropdown && (
                <div className="absolute right-0 mt-1.5 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-30 text-xs text-slate-700 font-medium">
                  <button
                    onClick={() => {
                      setShowAddDropdown(false);
                      setShowAddForm(true);
                      setShowAddPlaybookForm(false);
                      setTargetVaultId(filterVaultId);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-1.5 border-b border-slate-100"
                  >
                    <FileText size={12} className="text-blue-500" /> Add Query
                  </button>
                  <button
                    onClick={() => {
                      setShowAddDropdown(false);
                      setShowAddForm(false);
                      setShowAddPlaybookForm(true);
                      setPlaybookFormType('business_rules');
                      setPlaybookFormName('');
                      setPlaybookFormContent('');
                      setPlaybookFormId('');
                      setPlaybookTargetVaultId(filterVaultId);
                      setPlaybookAlwaysInclude(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-1.5"
                  >
                    <BookOpen size={12} className="text-emerald-500" /> Add Business Rule
                  </button>
                  <button
                    onClick={() => {
                      setShowAddDropdown(false);
                      setShowAddForm(false);
                      setShowAddPlaybookForm(true);
                      setPlaybookFormType('table_schemas');
                      setPlaybookFormName('');
                      setPlaybookFormContent('');
                      setPlaybookFormId('');
                      setPlaybookTargetVaultId(filterVaultId);
                      setPlaybookAlwaysInclude(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-1.5"
                  >
                    <Database size={12} className="text-amber-500" /> Add Table Schema
                  </button>
                  <button
                    onClick={() => {
                      setShowAddDropdown(false);
                      setShowAddForm(false);
                      setShowAddPlaybookForm(true);
                      setPlaybookFormType('analyst_notes');
                      setPlaybookFormName('');
                      setPlaybookFormContent('');
                      setPlaybookFormId('');
                      setPlaybookTargetVaultId(filterVaultId);
                      setPlaybookAlwaysInclude(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-1.5"
                  >
                    <HelpCircle size={12} className="text-purple-500" /> Add Analyst Note
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Vault Selector Filter */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Vault:</span>
            <div className="flex gap-1.5 items-center">
              <select
                value={filterVaultId}
                onChange={(e) => setFilterVaultId(e.target.value)}
                className="flex-1 text-xs border rounded bg-white px-2 py-1 text-slate-700 font-semibold focus:outline-none focus:ring-1 focus:ring-slate-400"
              >
                {vaults.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              <button
                onClick={handleDeleteVault}
                title="Delete this vault and all its contents"
                className="shrink-0 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded border border-transparent hover:border-rose-200 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Dialect Filter - only shown for Queries */}
          {activeTab === 'queries' && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Dialect:</span>
              <select
                value={filterDialect}
                onChange={(e) => setFilterDialect(e.target.value)}
                className="w-full text-xs border rounded bg-white px-2 py-1 text-slate-700 font-semibold focus:outline-none focus:ring-1 focus:ring-slate-400"
              >
                <option value="all">All Dialects</option>
                <option value="snowflake">Snowflake</option>
                <option value="bigquery">BigQuery</option>
                <option value="postgresql">PostgreSQL</option>
                <option value="trino">Trino</option>
                <option value="redshift">Redshift</option>
              </select>
            </div>
          )}

          {/* Search Bar */}
          <div className="relative mt-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${activeTab}...`}
              className="w-full text-xs border rounded-lg pl-8 pr-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 shadow-subtle"
            />
            <Search size={13} className="absolute left-2.5 top-2 text-slate-400" />
          </div>
        </div>

        {/* Scrollable Asset List */}
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="animate-spin text-slate-400" size={20} />
            </div>
          ) : activeTab === 'queries' ? (
            filteredQueries.length === 0 ? (
              <div className="text-xs text-slate-400 italic text-center py-10">No matching queries.</div>
            ) : (
              <div className="flex flex-col gap-1">
                {filteredQueries.map(q => (
                  <div
                    key={q.id}
                    onClick={() => handleSelectQuery(q)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors text-xs ${selectedQuery?.id === q.id ? 'bg-white border-slate-400 font-medium shadow-subtle' : 'bg-transparent border-transparent hover:bg-slate-100'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-800 truncate">{q.title}</span>
                      <span className="text-[9px] uppercase font-bold text-slate-500 bg-slate-200/50 px-1.5 py-0.5 rounded tracking-wide">{q.dialect}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 truncate mt-1">{q.description || 'No description'}</p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        q.approval_status === 'approved' ? 'bg-emerald-500' : q.approval_status === 'archived' ? 'bg-slate-400' : 'bg-amber-500'
                      }`} />
                      <span className="text-[9px] text-slate-400 uppercase font-semibold">{q.approval_status || 'draft'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            filteredPlaybooks.length === 0 ? (
              <div className="text-xs text-slate-400 italic text-center py-10">No matching assets.</div>
            ) : (
              <div className="flex flex-col gap-1">
                {filteredPlaybooks.map(p => (
                  <div
                    key={p.id}
                    onClick={() => handleSelectPlaybook(p)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors text-xs ${selectedPlaybook?.id === p.id ? 'bg-white border-slate-400 font-medium shadow-subtle' : 'bg-transparent border-transparent hover:bg-slate-100'}`}
                  >
                    <span className="font-bold text-slate-800 truncate block">{p.name}</span>
                    <p className="text-[10px] text-slate-500 truncate mt-1">{p.content}</p>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Right Panel - display context or form */}
      <div className="flex-1 overflow-y-auto p-6 bg-white">
        
        {/* ADD QUERY FORM */}
        {showAddForm && (
          <div className="max-w-2xl flex flex-col gap-5">
            <div className="border-b pb-3">
              <h3 className="text-base font-bold text-slate-800">Add Query Asset</h3>
              <p className="text-xs text-slate-500 mt-1">Submit an SQL query. The context pipeline will prompt you to review the extracted intelligence before finalizing.</p>
            </div>
            
            <form onSubmit={handleStartExtraction} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Query Title</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Daily active users counts"
                    className="text-xs border rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Target Vault</label>
                  <div className="flex gap-2">
                    <select
                      value={targetVaultId}
                      onChange={(e) => setTargetVaultId(e.target.value)}
                      className="text-xs border rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white flex-1"
                      required
                    >
                      <option value="" disabled>Select Vault...</option>
                      {vaults.map(v => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowNewVaultInline(!showNewVaultInline)}
                      className="text-xs border border-slate-350 hover:bg-slate-50 text-slate-700 px-2.5 py-1.5 rounded font-semibold flex items-center gap-1 shadow-subtle shrink-0"
                    >
                      <PlusCircle size={14} /> Inline Vault
                    </button>
                  </div>
                </div>
              </div>

              {/* Inline Vault Form */}
              {showNewVaultInline && (
                <div className="p-3 border border-blue-100 rounded-lg bg-blue-50/50 flex flex-col gap-3 shadow-subtle">
                  <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Create Vault Inline</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[9px] font-bold text-slate-500">Vault Name</label>
                      <input 
                        type="text"
                        value={newVaultName}
                        onChange={(e) => setNewVaultName(e.target.value)}
                        placeholder="Finance Heuristics"
                        className="text-xs border rounded p-1.5 bg-white focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[9px] font-bold text-slate-500">Description</label>
                      <input 
                        type="text"
                        value={newVaultDesc}
                        onChange={(e) => setNewVaultDesc(e.target.value)}
                        placeholder="Context..."
                        className="text-xs border rounded p-1.5 bg-white focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-1.5 border-t pt-2 border-slate-200/50">
                    <button
                      type="button"
                      onClick={() => setShowNewVaultInline(false)}
                      className="text-[10px] font-bold px-2 py-1 border rounded hover:bg-white text-slate-600 bg-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleInlineVaultCreate}
                      disabled={isCreatingVault}
                      className="text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded disabled:opacity-50"
                    >
                      {isCreatingVault ? 'Creating...' : 'Create Vault'}
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Dialect</label>
                  <select
                    value={newDialect}
                    onChange={(e) => setNewDialect(e.target.value)}
                    className="text-xs border rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white"
                  >
                    <option value="snowflake">Snowflake</option>
                    <option value="bigquery">BigQuery</option>
                    <option value="postgresql">PostgreSQL</option>
                    <option value="trino">Trino</option>
                    <option value="redshift">Redshift</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={newTags}
                    onChange={(e) => setNewTags(e.target.value)}
                    placeholder="e.g. metrics, active_users, reporting"
                    className="text-xs border rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Description</label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="What is this query primarily used for?"
                  className="text-xs border rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Raw SQL Query</label>
                <textarea
                  value={newSql}
                  onChange={(e) => setNewSql(e.target.value)}
                  placeholder="SELECT ..."
                  className="text-xs border rounded p-2 h-36 font-mono resize-none focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Comments & Analyst Notes</label>
                <textarea
                  value={newComments}
                  onChange={(e) => setNewComments(e.target.value)}
                  placeholder="Include any heuristics, join caveats, or specific column filtering..."
                  className="text-xs border rounded p-2 h-20 resize-none focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-xs font-semibold px-4 py-2 border rounded hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isExtracting}
                  className="text-xs font-semibold bg-slate-900 text-white px-4 py-2 rounded hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1.5 shadow-subtle"
                >
                  {isExtracting ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      Extracting Context...
                    </>
                  ) : 'Generate & Review Intelligence'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ADD / EDIT PLAYBOOK FORM (Rules, Schemas, Notes) */}
        {showAddPlaybookForm && (
          <div className="max-w-2xl flex flex-col gap-5">
            <div className="border-b pb-3">
              <h3 className="text-base font-bold text-slate-800">
                {playbookFormId ? 'Edit' : 'Create'}{' '}
                {playbookFormType === 'business_rules' ? 'Business Rule' : playbookFormType === 'table_schemas' ? 'Table Schema' : 'Analyst Note'}
              </h3>
            </div>
            
            <form onSubmit={handleSavePlaybook} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Asset Name / Title</label>
                  <input
                    type="text"
                    value={playbookFormName}
                    onChange={(e) => setPlaybookFormName(e.target.value)}
                    placeholder={playbookFormType === 'table_schemas' ? 'schema.table_name' : 'e.g. ARR Calculation Rule'}
                    className="text-xs border rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Target Vault</label>
                  <select
                    value={playbookTargetVaultId}
                    onChange={(e) => setPlaybookTargetVaultId(e.target.value)}
                    className="text-xs border rounded p-2 focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white"
                    required
                  >
                    <option value="" disabled>Select Vault...</option>
                    {vaults.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Content / Documentation</label>
                <textarea
                  value={playbookFormContent}
                  onChange={(e) => setPlaybookFormContent(e.target.value)}
                  placeholder="Provide definitions, column listings, joins conditions, or analytical insights..."
                  className="text-xs border rounded p-2 h-72 resize-none focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white leading-relaxed text-slate-800"
                  required
                />
              </div>

              <div className="flex items-center gap-2 py-1 select-none">
                <input
                  type="checkbox"
                  id="always_include"
                  checked={playbookAlwaysInclude}
                  onChange={(e) => setPlaybookAlwaysInclude(e.target.checked)}
                  className="rounded border-slate-350 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer bg-white"
                />
                <label htmlFor="always_include" className="text-xs text-slate-650 font-medium cursor-pointer">
                  Always include this asset in the chat retrieval context (disables dynamic requirement filtering)
                </label>
              </div>

              <div className="flex justify-between items-center mt-2">
                <div>
                  {playbookFormId && (
                    <button
                      type="button"
                      onClick={handleDeletePlaybook}
                      className="text-xs font-semibold px-3 py-2 text-rose-600 border border-rose-200 hover:bg-rose-50 rounded flex items-center gap-1"
                    >
                      <Trash2 size={12} />
                      Delete Asset
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddPlaybookForm(false)}
                    className="text-xs font-semibold px-4 py-2 border rounded hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPlaybookSubmitting}
                    className="text-xs font-semibold bg-slate-900 text-white px-4 py-2 rounded hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1 shadow-subtle"
                  >
                    {isPlaybookSubmitting && <Loader2 size={12} className="animate-spin" />}
                    Save Asset
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* QUERY DETAIL PANEL */}
        {selectedQuery && !showAddForm && !showAddPlaybookForm && (
          <div className="max-w-4xl flex flex-col gap-6">
            <div className="flex flex-col gap-3 border-b pb-4">
              <div className="grid grid-cols-10 gap-4 items-start">
                {/* 40% Title Block */}
                <div className="col-span-4 flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-bold text-slate-800 leading-snug">{selectedQuery.title}</h3>
                    <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-200/50 px-2 py-0.5 rounded tracking-wide whitespace-nowrap">{selectedQuery.dialect}</span>
                  </div>
                </div>

                {/* 60% Action Buttons */}
                <div className="col-span-6 flex items-center justify-end gap-2 mt-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider select-none whitespace-nowrap">Status:</span>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="text-xs border rounded bg-white px-2 py-1.5 font-semibold text-slate-700 focus:outline-none shadow-subtle max-w-[200px]"
                  >
                    <option value="draft">Draft (Extracting/Reviewing)</option>
                    <option value="approved">Approved (High Rank)</option>
                    <option value="archived">Archived</option>
                  </select>
                  <button
                    onClick={handleSaveContext}
                    disabled={isSaving}
                    className="text-xs bg-slate-900 text-white font-semibold px-3 py-1.5 rounded hover:bg-slate-800 flex items-center gap-1.5 shadow-subtle disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    Save Context
                  </button>
                  <button
                    onClick={handleDeleteQuery}
                    title="Delete this query"
                    className="text-xs text-rose-600 border border-rose-200 hover:bg-rose-50 font-semibold px-2.5 py-1.5 rounded flex items-center gap-1 transition-colors whitespace-nowrap"
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                </div>
              </div>

              {/* Description underneath (full width) */}
              {selectedQuery.description && (
                <p className="text-xs text-slate-500 leading-relaxed mt-1">{selectedQuery.description}</p>
              )}
            </div>

            {/* SQL Content */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">SQL Query</span>
              <pre className="p-3 bg-slate-900 text-slate-100 font-mono text-xs rounded-xl border overflow-x-auto max-h-48 border-slate-800">
                <code>{selectedQuery.sql_query}</code>
              </pre>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {/* Intent */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Business Intent</span>
                <textarea
                  value={editIntent}
                  onChange={(e) => setEditIntent(e.target.value)}
                  placeholder="Explain why this query is written..."
                  className="text-xs border rounded p-2.5 h-24 resize-none focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white text-slate-800 leading-normal"
                />
              </div>

              {/* Schema Entities */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Schema Entities</span>
                  <button
                    onClick={() => handleAddArrayItem(editEntities, setEditEntities)}
                    className="text-[10px] text-blue-600 hover:text-blue-700 hover:underline font-semibold"
                  >
                    + Add Entity
                  </button>
                </div>
                <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto border p-2 rounded-lg bg-slate-50">
                  {editEntities.map((ent, i) => (
                    <div key={i} className="flex gap-1">
                      <input
                        type="text"
                        value={ent}
                        onChange={(e) => handleArrayChange(i, e.target.value, editEntities, setEditEntities)}
                        placeholder="schema.table_name"
                        className="text-xs border rounded px-2 py-1 flex-1 bg-white focus:outline-none"
                      />
                      <button
                        onClick={() => handleRemoveArrayItem(i, editEntities, setEditEntities)}
                        className="text-slate-400 hover:text-rose-600 text-xs px-1"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {editEntities.length === 0 && <span className="text-[10px] text-slate-400 italic p-1">No schema entities.</span>}
                </div>
              </div>

              {/* Business Rules */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Business Rules</span>
                  <button
                    onClick={() => handleAddArrayItem(editRules, setEditRules)}
                    className="text-[10px] text-blue-600 hover:text-blue-700 hover:underline font-semibold"
                  >
                    + Add Rule
                  </button>
                </div>
                <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto border p-2 rounded-lg bg-slate-50">
                  {editRules.map((rule, i) => (
                    <div key={i} className="flex gap-1">
                      <input
                        type="text"
                        value={rule}
                        onChange={(e) => handleArrayChange(i, e.target.value, editRules, setEditRules)}
                        placeholder="e.g. Filter excludes internal accounts"
                        className="text-xs border rounded px-2 py-1 flex-1 bg-white focus:outline-none"
                      />
                      <button
                        onClick={() => handleRemoveArrayItem(i, editRules, setEditRules)}
                        className="text-slate-400 hover:text-rose-600 text-xs px-1"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {editRules.length === 0 && <span className="text-[10px] text-slate-400 italic p-1">No rules.</span>}
                </div>
              </div>

              {/* Transformations */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Metrics / Logic</span>
                  <button
                    onClick={() => handleAddArrayItem(editTransformations, setEditTransformations)}
                    className="text-[10px] text-blue-600 hover:text-blue-700 hover:underline font-semibold"
                  >
                    + Add Metric
                  </button>
                </div>
                <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto border p-2 rounded-lg bg-slate-50">
                  {editTransformations.map((trans, i) => (
                    <div key={i} className="flex gap-1">
                      <input
                        type="text"
                        value={trans}
                        onChange={(e) => handleArrayChange(i, e.target.value, editTransformations, setEditTransformations)}
                        placeholder="e.g. ARR = MRR * 12"
                        className="text-xs border rounded px-2 py-1 flex-1 bg-white focus:outline-none"
                      />
                      <button
                        onClick={() => handleRemoveArrayItem(i, editTransformations, setEditTransformations)}
                        className="text-slate-400 hover:text-rose-600 text-xs px-1"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {editTransformations.length === 0 && <span className="text-[10px] text-slate-400 italic p-1">No metrics.</span>}
                </div>
              </div>

              {/* Ambiguities */}
              <div className="flex flex-col gap-2 col-span-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ambiguities</span>
                  <button
                    onClick={() => handleAddArrayItem(editAmbiguities, setEditAmbiguities)}
                    className="text-[10px] text-blue-600 hover:text-blue-700 hover:underline font-semibold"
                  >
                    + Add Ambiguity
                  </button>
                </div>
                <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto border p-2 rounded-lg bg-slate-50">
                  {editAmbiguities.map((amb, i) => (
                    <div key={i} className="flex gap-1">
                      <input
                        type="text"
                        value={amb}
                        onChange={(e) => handleArrayChange(i, e.target.value, editAmbiguities, setEditAmbiguities)}
                        placeholder="e.g. Which region code is primary?"
                        className="text-xs border rounded px-2 py-1 flex-1 bg-white focus:outline-none"
                      />
                      <button
                        onClick={() => handleRemoveArrayItem(i, editAmbiguities, setEditAmbiguities)}
                        className="text-slate-400 hover:text-rose-600 text-xs px-1"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {editAmbiguities.length === 0 && <span className="text-[10px] text-slate-400 italic p-1">No ambiguities.</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PLAYBOOK DETAIL PANEL */}
        {selectedPlaybook && !showAddForm && !showAddPlaybookForm && (
          <div className="max-w-4xl flex flex-col gap-6">
            <div className="flex items-start justify-between border-b pb-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-bold text-slate-800">{selectedPlaybook.name}</h3>
                <div className="flex gap-1.5 items-center">
                  <span className="text-[9px] uppercase font-bold text-slate-500 bg-slate-200/50 px-2 py-0.5 rounded tracking-wide w-fit">
                    {selectedPlaybook.playbook_type === 'business_rules' ? 'Business Rule' : selectedPlaybook.playbook_type === 'table_schemas' ? 'Schema Definition' : 'Analyst Note'}
                  </span>
                  <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded tracking-wide w-fit border ${
                    selectedPlaybook.always_include 
                      ? 'text-blue-700 bg-blue-50 border-blue-200/50' 
                      : 'text-slate-600 bg-slate-100 border-slate-200/50'
                  }`}>
                    {selectedPlaybook.always_include ? 'Always Included' : 'Requirement Based'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowAddPlaybookForm(true);
                  setPlaybookFormId(selectedPlaybook.id);
                  setPlaybookFormName(selectedPlaybook.name);
                  setPlaybookFormContent(selectedPlaybook.content);
                  setPlaybookFormType(selectedPlaybook.playbook_type);
                  setPlaybookTargetVaultId(selectedPlaybook.vault_id);
                  setPlaybookAlwaysInclude(selectedPlaybook.always_include || false);
                }}
                className="text-xs border hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded font-semibold flex items-center gap-1.5 shadow-subtle transition-colors"
              >
                <Settings size={12} />
                Edit Asset
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Documentation Content</span>
              <div className="p-4 bg-slate-50 border rounded-xl leading-relaxed text-sm text-slate-800 whitespace-pre-wrap">
                {selectedPlaybook.content}
              </div>
            </div>
          </div>
        )}

        {/* EMPTY STATE */}
        {!selectedQuery && !selectedPlaybook && !showAddForm && !showAddPlaybookForm && (
          <div className="flex flex-col items-center justify-center py-20 text-center select-none h-full max-w-md mx-auto">
            <Database size={32} className="text-slate-350 mb-3" />
            <span className="text-xs text-slate-450 font-medium text-slate-500 leading-normal">Select an asset from the studio list on the left to review/edit, or use the Add Asset menu to add new organizational intelligence.</span>
          </div>
        )}
      </div>

      {/* HUMAN-IN-THE-LOOP REVIEW POPUP MODAL */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border shadow-xl max-w-3xl w-full flex flex-col max-h-[85vh]">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <div className="flex flex-col">
                <span className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5">
                  <CheckCircle size={16} className="text-emerald-500" />
                  Review Draft Intelligence
                </span>
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">Step 1 of 2: Confirm AI-Extracted Context</span>
              </div>
            </div>

            {/* Modal Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
              
              {/* Intent */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Business Intent</label>
                <textarea
                  value={draftIntent}
                  onChange={(e) => setDraftIntent(e.target.value)}
                  placeholder="What business metric or definition does this query serve?"
                  className="text-xs border rounded p-2.5 h-20 resize-none focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white text-slate-800 leading-normal"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Schema Entities */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Table Entities</label>
                    <button
                      type="button"
                      onClick={() => handleAddArrayItem(draftEntities, setDraftEntities)}
                      className="text-[9px] text-blue-600 hover:text-blue-700 font-bold"
                    >
                      + Add
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto border p-2 rounded bg-slate-50/70">
                    {draftEntities.map((ent, i) => (
                      <div key={i} className="flex gap-1">
                        <input
                          type="text"
                          value={ent}
                          onChange={(e) => handleArrayChange(i, e.target.value, draftEntities, setDraftEntities)}
                          placeholder="schema.table"
                          className="text-[11px] border rounded px-2 py-1.5 flex-1 bg-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveArrayItem(i, draftEntities, setDraftEntities)}
                          className="text-slate-400 hover:text-rose-600 text-sm px-1.5"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Business Rules */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Business Rules Applied</label>
                    <button
                      type="button"
                      onClick={() => handleAddArrayItem(draftRules, setDraftRules)}
                      className="text-[9px] text-blue-600 hover:text-blue-700 font-bold"
                    >
                      + Add
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto border p-2 rounded bg-slate-50/70">
                    {draftRules.map((rule, i) => (
                      <div key={i} className="flex gap-1">
                        <input
                          type="text"
                          value={rule}
                          onChange={(e) => handleArrayChange(i, e.target.value, draftRules, setDraftRules)}
                          placeholder="Excludes deactivated accounts"
                          className="text-[11px] border rounded px-2 py-1.5 flex-1 bg-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveArrayItem(i, draftRules, setDraftRules)}
                          className="text-slate-400 hover:text-rose-600 text-sm px-1.5"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Metric Calculations / Transformations */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Calculations & Formulas</label>
                    <button
                      type="button"
                      onClick={() => handleAddArrayItem(draftTransformations, setDraftTransformations)}
                      className="text-[9px] text-blue-600 hover:text-blue-700 font-bold"
                    >
                      + Add
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto border p-2 rounded bg-slate-50/70">
                    {draftTransformations.map((trans, i) => (
                      <div key={i} className="flex gap-1">
                        <input
                          type="text"
                          value={trans}
                          onChange={(e) => handleArrayChange(i, e.target.value, draftTransformations, setDraftTransformations)}
                          placeholder="ARR = Monthly spend * 12"
                          className="text-[11px] border rounded px-2 py-1.5 flex-1 bg-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveArrayItem(i, draftTransformations, setDraftTransformations)}
                          className="text-slate-400 hover:text-rose-600 text-sm px-1.5"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Ambiguities */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ambiguities / Open Questions</label>
                    <button
                      type="button"
                      onClick={() => handleAddArrayItem(draftAmbiguities, setDraftAmbiguities)}
                      className="text-[9px] text-blue-600 hover:text-blue-700 font-bold"
                    >
                      + Add
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto border p-2 rounded bg-slate-50/70">
                    {draftAmbiguities.map((amb, i) => (
                      <div key={i} className="flex gap-1">
                        <input
                          type="text"
                          value={amb}
                          onChange={(e) => handleArrayChange(i, e.target.value, draftAmbiguities, setDraftAmbiguities)}
                          placeholder="Caveats or logic holes"
                          className="text-[11px] border rounded px-2 py-1.5 flex-1 bg-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveArrayItem(i, draftAmbiguities, setDraftAmbiguities)}
                          className="text-slate-400 hover:text-rose-600 text-sm px-1.5"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2.5 px-6 py-4 border-t bg-slate-50 rounded-b-xl select-none">
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="text-xs font-semibold px-4 py-2 border rounded hover:bg-slate-100 bg-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApproveAndSaveQuery}
                disabled={isFinalSaving}
                className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded disabled:opacity-50 flex items-center gap-1.5 shadow-subtle transition-colors"
              >
                {isFinalSaving ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check size={12} />
                    Approve & Save Asset
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2 Modal: Push to Knowledge Base? ── */}
      {showPlaybookPushModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">STEP 2 OF 2 · OPTIONAL</p>
                <h2 className="text-base font-bold text-slate-900">Push to Knowledge Base?</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  The AI has prepared updates to your Rules, Schemas, and Notes. Review below and confirm only if accurate.
                  You can always manage these manually from the respective tabs.
                </p>
              </div>
            </div>

            {/* Preview body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {isLoadingPreview ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
                  <Loader2 size={24} className="animate-spin text-blue-400" />
                  <span className="text-xs">Analyzing what to push to your knowledge base…</span>
                </div>
              ) : playbookPushPreview.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-400">
                  <CheckCircle size={22} className="text-emerald-400" />
                  <span className="text-xs font-medium">Nothing new to push — your knowledge base is already up to date.</span>
                </div>
              ) : (
                playbookPushPreview.map((item: any, idx: number) => {
                  const isCreate = item.action === 'create';
                  const typeLabel = (item.type || 'playbook').replace('_', ' ');
                  const content = isCreate ? item.content : item.new_content;
                  return (
                    <div key={idx} className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="flex items-center gap-2.5 px-3 py-2 bg-slate-50 border-b border-slate-100">
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          isCreate
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {isCreate ? '+ CREATE' : '↑ UPDATE'}
                        </span>
                        <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">{typeLabel}</span>
                        <span className="text-xs font-semibold text-slate-800 truncate">{item.name}</span>
                      </div>
                      <pre className="px-3 py-2.5 text-[11px] text-slate-700 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto font-mono bg-white">
                        {content || '(no content)'}
                      </pre>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center">
              <p className="text-[10px] text-slate-400">
                ⚠ Only new, non-duplicate information will be merged. Existing content is preserved.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSkipPlaybookPush}
                  className="text-xs font-semibold px-4 py-2 border border-slate-200 rounded hover:bg-slate-50 bg-white text-slate-600"
                >
                  Skip for now
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPlaybookPush}
                  disabled={isConfirmingPush || isLoadingPreview || playbookPushPreview.length === 0}
                  className="text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50 flex items-center gap-1.5 shadow-subtle transition-colors"
                >
                  {isConfirmingPush ? (
                    <><Loader2 size={12} className="animate-spin" />Pushing…</>
                  ) : (
                    <><Check size={12} />Confirm & Push to Knowledge Base</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
