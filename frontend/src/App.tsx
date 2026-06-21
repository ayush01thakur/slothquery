import React, { useState, useEffect } from 'react';
import axios from 'axios';
import SidebarLeft from './components/SidebarLeft';
import SidebarRight from './components/SidebarRight';
import ChatFeed from './components/ChatFeed';
import KnowledgeStudio from './components/KnowledgeStudio';
import SchemaExplorer from './components/SchemaExplorer';
import { AlertCircle } from 'lucide-react';

const API_BASE = 'http://127.0.0.1:8000/api';

export default function App() {
  const [activeView, setActiveView] = useState<'chat' | 'studio' | 'schema'>('chat');
  const [vaults, setVaults] = useState<any[]>([]);
  const [activeVaultId, setActiveVaultId] = useState<string>('');
  
  const [chats, setChats] = useState<any[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  
  const [providers, setProviders] = useState<any[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string>('');
  
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const [isReindexing, setIsReindexing] = useState(false);
  const [activeDialect, setActiveDialect] = useState<string>('snowflake');
  const [isInitialLoading, setIsInitialLoading] = useState(true); // true until first successful backend connect

  // Fetch all metadata on mount — with retry if backend isn't ready yet
  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 8;
    const retryDelay = 1500;

    const tryFetch = async () => {
      try {
        await fetchInitialData();
        setIsInitialLoading(false); // backend responded — done loading
      } catch (err) {
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(tryFetch, retryDelay);
        } else {
          setIsInitialLoading(false); // give up retrying, show real state
          console.error('Backend did not become ready after max retries.');
        }
      }
    };
    tryFetch();
  }, []);

  const fetchInitialData = async () => {
    // 1. Fetch vaults
    const vRes = await axios.get(`${API_BASE}/vaults`);
    setVaults(vRes.data);
    if (vRes.data.length > 0) {
      setActiveVaultId(vRes.data[0].id);
    } else {
      const seedRes = await axios.post(`${API_BASE}/vaults`, {
        name: 'Primary Vault',
        description: 'Default SlothQuery intelligence vault'
      });
      setVaults([seedRes.data]);
      setActiveVaultId(seedRes.data.id);
    }

    // 2. Fetch providers
    const pRes = await axios.get(`${API_BASE}/providers`);
    setProviders(pRes.data);
    const activeP = pRes.data.find((p: any) => p.is_active);
    if (activeP) {
      setActiveProviderId(activeP.id);
    }

    // 3. Fetch chats
    const cRes = await axios.get(`${API_BASE}/chats`);
    
    // ALWAYS start app on a new chat session as per user requirements.
    // Reuse an existing empty chat to avoid cluttering on page refreshes.
    const existingEmptyChat = cRes.data.find((c: any) => !c.messages || c.messages.length === 0);
    if (existingEmptyChat) {
      setChats(cRes.data);
      setActiveChatId(existingEmptyChat.id);
    } else {
      const newChatRes = await axios.post(`${API_BASE}/chats`);
      setChats([newChatRes.data, ...cRes.data]);
      setActiveChatId(newChatRes.data.id);
    }
  };

  // Fetch messages when active chat changes
  useEffect(() => {
    if (activeChatId) {
      fetchChatMessages(activeChatId);
    } else {
      setChatMessages([]);
    }
  }, [activeChatId]);

  const fetchChatMessages = async (chatId: string) => {
    try {
      const res = await axios.get(`${API_BASE}/chats/${chatId}`);
      setChatMessages(res.data.messages || []);
    } catch (err) {
      console.error('Failed to fetch chat messages:', err);
    }
  };

  // Chats Handlers
  const handleCreateChat = async () => {
    try {
      const res = await axios.post(`${API_BASE}/chats`);
      setChats([res.data, ...chats]);
      setActiveChatId(res.data.id);
      setActiveView('chat');
      setIsRightSidebarOpen(false); // auto-collapse right sidebar
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteChat = async (id: string) => {
    try {
      await axios.delete(`${API_BASE}/chats/${id}`);
      const nextChats = chats.filter(c => c.id !== id);
      setChats(nextChats);
      if (activeChatId === id) {
        if (nextChats.length > 0) {
          setActiveChatId(nextChats[0].id);
        } else {
          setActiveChatId('');
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!activeChatId) return;
    
    const currentChat = chats.find(c => c.id === activeChatId);
    const activeVaultIds = (currentChat && currentChat.vault_ids) ? currentChat.vault_ids : vaults.map(v => v.id);
    
    const tempUserMsg = {
      id: Math.random().toString(),
      role: 'user',
      content,
      created_at: new Date().toISOString()
    };
    setChatMessages(prev => [...prev, tempUserMsg]);
    setIsChatLoading(true);

    try {
      await axios.post(`${API_BASE}/chats/${activeChatId}/messages`, {
        message: `${content} (Use dialect: ${activeDialect})`,
        vault_ids: activeVaultIds
      });
      
      // Refresh chat list to update titles if it was auto-named
      const cRes = await axios.get(`${API_BASE}/chats`);
      setChats(cRes.data);
      
      await fetchChatMessages(activeChatId);
    } catch (err: any) {
      console.error(err);
      
      // Re-fetch chat list to update titles if it was auto-named on the user message before failure
      try {
        const cRes = await axios.get(`${API_BASE}/chats`);
        setChats(cRes.data);
      } catch (fetchErr) {
        console.error('Failed to refresh chats after error:', fetchErr);
      }

      setChatMessages(prev => [...prev, {
        id: Math.random().toString(),
        role: 'assistant',
        content: `Error: ${err.response?.data?.detail || 'Failed to get response from LLM provider.'}`
      }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleUpdateChatVaults = async (chatId: string, vaultIds: string[]) => {
    try {
      const res = await axios.put(`${API_BASE}/chats/${chatId}`, {
        vault_ids: vaultIds
      });
      setChats(chats.map(c => c.id === chatId ? res.data : c));
    } catch (err) {
      console.error('Failed to update chat vaults:', err);
    }
  };

  // Vaults Handlers
  const handleCreateVault = async (name: string, description: string) => {
    try {
      const res = await axios.post(`${API_BASE}/vaults`, { name, description });
      const updatedVaults = [...vaults, res.data];
      setVaults(updatedVaults);
      setActiveVaultId(res.data.id);
      return res.data;
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const handleDeleteVault = async (vaultId: string) => {
    try {
      await axios.delete(`${API_BASE}/vaults/${vaultId}`);
      const remaining = vaults.filter(v => v.id !== vaultId);

      if (remaining.length > 0) {
        setVaults(remaining);
        // If the deleted vault was active, switch to another
        if (activeVaultId === vaultId) {
          setActiveVaultId(remaining[0].id);
        }
      } else {
        // No vaults left — seed a new default vault
        const seedRes = await axios.post(`${API_BASE}/vaults`, {
          name: 'Primary Vault',
          description: 'Default SlothQuery intelligence vault'
        });
        setVaults([seedRes.data]);
        setActiveVaultId(seedRes.data.id);
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  };


  const handleSetActiveVaultId = (id: string) => {
    setActiveVaultId(id);
    setIsRightSidebarOpen(false); // auto-collapse right sidebar
  };

  const handleSetActiveView = (view: 'chat' | 'studio' | 'schema') => {
    setActiveView(view);
    setIsRightSidebarOpen(false); // auto-collapse right sidebar
  };

  // Providers Handlers
  const handleAddProvider = async (provPayload: any) => {
    try {
      const res = await axios.post(`${API_BASE}/providers`, provPayload);
      const updatedProviders = [...providers, res.data];
      setProviders(updatedProviders);
      setActiveProviderId(res.data.id);
      
      // Refresh provider list to sync active markers
      const listRes = await axios.get(`${API_BASE}/providers`);
      setProviders(listRes.data);
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const handleSetActiveProvider = async (id: string) => {
    try {
      await axios.put(`${API_BASE}/providers/${id}/active`);
      setActiveProviderId(id);
      const listRes = await axios.get(`${API_BASE}/providers`);
      setProviders(listRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteProvider = async (id: string) => {
    try {
      await axios.delete(`${API_BASE}/providers/${id}`);
      setProviders(providers.filter(p => p.id !== id));
      if (activeProviderId === id) {
        setActiveProviderId('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReindex = async () => {
    setIsReindexing(true);
    try {
      await axios.post(`${API_BASE}/reindex`);
      alert('Local semantic search vector store rebuilt successfully!');
    } catch (err) {
      console.error(err);
      alert('Reindexing failed.');
    } finally {
      setIsReindexing(false);
    }
  };

  const hasActiveProvider = providers.some(p => p.is_active);

  return (
    <div className="flex h-screen w-screen bg-background overflow-hidden relative font-sans antialiased text-slate-900">
      
      {/* Subtle Grey Overlay / Backdrop Blur when Right Sidebar is open */}
      {isRightSidebarOpen && (
        <div 
          className="fixed inset-0 z-30 bg-slate-900/10 backdrop-blur-[2px] transition-all duration-300" 
          onClick={() => setIsRightSidebarOpen(false)}
        />
      )}

      {/* Sidebar Left */}
      <SidebarLeft
        activeView={activeView}
        setActiveView={handleSetActiveView}
        chats={chats}
        activeChatId={activeChatId}
        setActiveChatId={setActiveChatId}
        onCreateChat={handleCreateChat}
        onDeleteChat={handleDeleteChat}
        toggleRightSidebar={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
        isCollapsed={isLeftSidebarCollapsed}
        setIsCollapsed={setIsLeftSidebarCollapsed}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        
        {/* Warning Banner: Loading state, No provider, or backend down */}
        {isInitialLoading ? (
          <div className="bg-blue-50 border-b border-blue-200/80 px-6 py-2.5 flex items-center gap-2.5 text-blue-800 text-xs shadow-subtle select-none">
            <AlertCircle size={14} className="text-blue-500 shrink-0 animate-pulse" />
            <div className="flex-1">
              <span className="font-bold">Connecting to backend...</span> Loading your saved configuration.
            </div>
          </div>
        ) : !hasActiveProvider ? (
          <div className="bg-amber-50 border-b border-amber-200/80 px-6 py-2.5 flex items-center gap-2.5 text-amber-800 text-xs shadow-subtle select-none">
            <AlertCircle size={14} className="text-amber-600 shrink-0" />
            <div className="flex-1">
              <span className="font-bold">No active LLM provider configured.</span> SlothQuery requires a provider to generate SQL logic. Click Settings to add one.
            </div>
            <button 
              onClick={() => setIsRightSidebarOpen(true)}
              className="px-2.5 py-1 bg-amber-600 text-white rounded text-[10px] font-semibold hover:bg-amber-700 shadow-subtle transition-colors"
            >
              Configure
            </button>
          </div>
        ) : null}

        {/* View Switcher Router */}
        {activeView === 'chat' && (
          <ChatFeed
            chat={chats.find(c => c.id === activeChatId)}
            messages={chatMessages}
            onSendMessage={handleSendMessage}
            isLoading={isChatLoading}
            activeDialect={activeDialect}
            setActiveDialect={setActiveDialect}
            vaults={vaults}
            onUpdateChatVaults={handleUpdateChatVaults}
          />
        )}

        {activeView === 'studio' && (
          <KnowledgeStudio 
            vaultId={activeVaultId} 
            vaults={vaults}
            onCreateVault={handleCreateVault}
            onDeleteVault={handleDeleteVault}
          />
        )}

        {activeView === 'schema' && (
          <SchemaExplorer vaultId={activeVaultId} />
        )}
      </div>

      {/* Sidebar Right */}
      <SidebarRight
        isOpen={isRightSidebarOpen}
        onClose={() => setIsRightSidebarOpen(false)}
        providers={providers}
        activeProviderId={activeProviderId}
        onAddProvider={handleAddProvider}
        onSetActiveProvider={handleSetActiveProvider}
        onDeleteProvider={handleDeleteProvider}
        onReindex={handleReindex}
        isReindexing={isReindexing}
      />
    </div>
  );
}
