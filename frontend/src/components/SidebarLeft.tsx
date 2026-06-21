import React from 'react';
import { 
  Database, MessageSquare, BookOpen, Settings, ChevronLeft, ChevronRight, Plus, Trash2
} from 'lucide-react';

interface SidebarLeftProps {
  activeView: 'chat' | 'studio' | 'schema';
  setActiveView: (view: 'chat' | 'studio' | 'schema') => void;
  chats: any[];
  activeChatId: string;
  setActiveChatId: (id: string) => void;
  onCreateChat: () => void;
  onDeleteChat: (id: string) => void;
  toggleRightSidebar: () => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

export default function SidebarLeft({
  activeView,
  setActiveView,
  chats,
  activeChatId,
  setActiveChatId,
  onCreateChat,
  onDeleteChat,
  toggleRightSidebar,
  isCollapsed,
  setIsCollapsed
}: SidebarLeftProps) {

  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center justify-between border-r bg-slate-50 py-4 w-12 h-screen select-none transition-all duration-300 shrink-0">
        <div className="flex flex-col items-center gap-6 w-full">
          <button 
            onClick={() => setIsCollapsed(false)}
            className="p-1.5 rounded hover:bg-slate-200 text-slate-500"
            title="Expand Sidebar"
          >
            <ChevronRight size={18} />
          </button>
          
          <div className="h-px bg-slate-200 w-8" />

          <button 
            onClick={() => { setActiveView('chat'); }}
            className={`p-2 rounded transition-colors ${activeView === 'chat' ? 'bg-slate-200 text-slate-900 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}
            title="Chats"
          >
            <MessageSquare size={20} />
          </button>

          <button 
            onClick={() => { setActiveView('studio'); }}
            className={`p-2 rounded transition-colors ${activeView === 'studio' ? 'bg-slate-200 text-slate-900 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}
            title="Knowledge Studio"
          >
            <Database size={20} />
          </button>

          <button 
            onClick={() => { setActiveView('schema'); }}
            className={`p-2 rounded transition-colors ${activeView === 'schema' ? 'bg-slate-200 text-slate-900 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}
            title="Schema & Playbooks"
          >
            <BookOpen size={20} />
          </button>
        </div>

        <button 
          onClick={toggleRightSidebar}
          className="p-2 rounded hover:bg-slate-200 text-slate-600"
          title="Settings"
        >
          <Settings size={20} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-between border-r bg-slate-50 w-64 h-screen select-none transition-all duration-300 relative shrink-0">
      <div className="flex flex-col overflow-y-auto flex-1 p-4 gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">SlothQuery</h1>
          <button 
            onClick={() => setIsCollapsed(true)}
            className="p-1 rounded hover:bg-slate-200 text-slate-500"
            title="Collapse Sidebar"
          >
            <ChevronLeft size={16} />
          </button>
        </div>

        <div className="h-px bg-slate-200 my-1" />

        {/* Navigation Tabs */}
        <div className="flex flex-col gap-1">
          <button 
            onClick={() => setActiveView('chat')}
            className={`flex items-center gap-2.5 px-3 py-2 text-sm rounded transition-colors ${activeView === 'chat' ? 'bg-slate-200 text-slate-900 font-semibold' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            <MessageSquare size={16} />
            Chats
          </button>
          <button 
            onClick={() => setActiveView('studio')}
            className={`flex items-center gap-2.5 px-3 py-2 text-sm rounded transition-colors ${activeView === 'studio' ? 'bg-slate-200 text-slate-900 font-semibold' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            <Database size={16} />
            Knowledge Studio
          </button>
          <button 
            onClick={() => setActiveView('schema')}
            className={`flex items-center gap-2.5 px-3 py-2 text-sm rounded transition-colors ${activeView === 'schema' ? 'bg-slate-200 text-slate-900 font-semibold' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            <BookOpen size={16} />
            Schema Explorer
          </button>
        </div>

        <div className="h-px bg-slate-200 my-1" />

        {/* Chats Section - Active only if view is 'chat' */}
        {activeView === 'chat' && (
          <div className="flex flex-col gap-2 overflow-y-auto max-h-[40vh]">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Recent Chats</span>
              <button 
                onClick={onCreateChat}
                className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 px-1 py-0.5 rounded hover:bg-slate-200 font-semibold"
              >
                <Plus size={12} /> New
              </button>
            </div>
            
            {chats.length === 0 ? (
              <div className="text-xs text-slate-400 italic px-2 py-4 text-center">No chats created yet.</div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {chats.map(c => (
                  <div 
                    key={c.id} 
                    className={`group flex items-center justify-between px-2.5 py-2 text-sm rounded cursor-pointer transition-colors ${activeChatId === c.id ? 'bg-slate-200 text-slate-900 font-semibold shadow-subtle' : 'text-slate-600 hover:bg-slate-100'}`}
                    onClick={() => setActiveChatId(c.id)}
                  >
                    <span className="truncate flex-1 pr-2">{c.title || 'New Chat'}</span>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteChat(c.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-300 rounded text-slate-500 hover:text-slate-800 transition-opacity"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Settings Footer */}
      <div className="p-4 border-t bg-slate-100/50">
        <button 
          onClick={toggleRightSidebar}
          className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-600 hover:bg-slate-200 hover:text-slate-900 rounded transition-colors font-medium"
        >
          <Settings size={16} />
          Settings & Configurations
        </button>
      </div>
    </div>
  );
}
