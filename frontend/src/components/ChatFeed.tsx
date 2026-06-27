import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Terminal, Copy, Check, Plus, Folder, Tag, Layers, Globe } from 'lucide-react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import logoImg from '../logo.png';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 border border-red-200 bg-red-50 text-red-800 rounded-lg text-xs font-mono max-w-full overflow-auto">
          <p className="font-bold mb-1">Markdown Render Error:</p>
          <pre className="whitespace-pre-wrap">{this.state.error?.stack || this.state.error?.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

interface ChatFeedProps {
  chat: any;
  messages: any[];
  onSendMessage: (msg: string) => void;
  isLoading: boolean;
  activeDialect: string;
  setActiveDialect: (dialect: string) => void;
  vaults: any[];
  onUpdateChatVaults: (chatId: string, vaultIds: string[]) => void;
}

export default function ChatFeed({
  chat,
  messages,
  onSendMessage,
  isLoading,
  activeDialect,
  setActiveDialect,
  vaults,
  onUpdateChatVaults
}: ChatFeedProps) {
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showPopover, setShowPopover] = useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const newChatTextareaRef = useRef<HTMLTextAreaElement>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = newChatTextareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${input.trim() ? Math.max(28, Math.min(150, ta.scrollHeight)) : 28}px`;
    }
  }, [input, chat]);

  useEffect(() => {
    const ta = chatTextareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${input.trim() ? Math.max(28, Math.min(150, ta.scrollHeight)) : 28}px`;
    }
  }, [input, chat]);

  // Fetch unique tags in the active vault(s)
  useEffect(() => {
    const fetchTags = async () => {
      const activeVaultIds = chat?.vault_ids || [];
      if (activeVaultIds.length === 0) {
        setAvailableTags([]);
        return;
      }
      try {
        const tagsSet = new Set<string>();
        await Promise.all(activeVaultIds.map(async (vId: string) => {
          const res = await axios.get(`http://127.0.0.1:8000/api/queries?vault_id=${vId}`);
          res.data.forEach((q: any) => {
            if (q.tags) {
              q.tags.split(',').forEach((t: string) => {
                const cleaned = t.trim();
                if (cleaned) tagsSet.add(cleaned);
              });
            }
          });
        }));
        setAvailableTags(Array.from(tagsSet));
      } catch (err) {
        console.error('Failed to load tags:', err);
      }
    };
    fetchTags();
  }, [chat?.vault_ids, vaults]);

  // Click outside listener for the popover
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setShowPopover(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    // Inject selected tags into the message if any are active
    let finalMessage = input;
    if (selectedTags.length > 0) {
      finalMessage += `\n[Context Tags: ${selectedTags.join(', ')}]`;
    }
    
    onSendMessage(finalMessage);
    setInput('');
    setSelectedTags([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleTagToggle = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const renderMessageContent = (text: string, msgId: string) => {
    if (!text) return null;

    let cleaned = text;
    if (cleaned.includes('[Context Tags:')) {
      cleaned = cleaned.split('[Context Tags:')[0].trim();
    }

    return (
      <div className="text-sm text-slate-800 leading-relaxed break-words">
        <ErrorBoundary>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({node, ...props}) => <h1 className="text-xl font-bold mt-5 mb-3 text-slate-900" {...props} />,
              h2: ({node, ...props}) => <h2 className="text-lg font-bold mt-4 mb-2 text-slate-900" {...props} />,
              h3: ({node, ...props}) => <h3 className="text-md font-bold mt-3 mb-2 text-slate-900" {...props} />,
              p: ({node, ...props}) => <p className="mb-3 last:mb-0" {...props} />,
              ul: ({node, ...props}) => <ul className="list-disc list-outside ml-5 mb-3 space-y-1" {...props} />,
              ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-5 mb-3 space-y-1" {...props} />,
              li: ({node, ...props}) => <li className="pl-1" {...props} />,
              strong: ({node, ...props}) => <strong className="font-semibold text-slate-900" {...props} />,
              em: ({node, ...props}) => <em className="italic text-slate-700" {...props} />,
              a: ({node, ...props}) => <a className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
              table: ({node, ...props}) => (
                <div className="overflow-x-auto my-4 border border-slate-200 rounded-lg shadow-sm">
                  <table className="w-full text-left border-collapse text-sm" {...props} />
                </div>
              ),
              thead: ({node, ...props}) => <thead className="bg-slate-50 border-b border-slate-200" {...props} />,
              th: ({node, ...props}) => <th className="px-4 py-2 font-semibold text-slate-700" {...props} />,
              td: ({node, ...props}) => <td className="px-4 py-2 border-t border-slate-100 text-slate-600" {...props} />,
              code: ({node, className, children, ...props}: any) => {
                const match = /language-(\w+)/.exec(className || '');
                const isInline = !match && !String(children).includes('\n');
                
                if (!isInline) {
                  const lang = match ? match[1] : '';
                  const codeString = String(children).replace(/\n$/, '');
                  const codeId = `${msgId}-${codeString.length}`;
                  
                  return (
                    <div className="my-4 rounded-lg overflow-hidden shadow-subtle bg-slate-900 border border-slate-800">
                      <div className="flex items-center justify-between px-3 py-2 bg-slate-800/80 border-b border-slate-700/60 text-[10px] uppercase tracking-wider text-slate-400 font-sans font-bold select-none">
                        <span className="flex items-center gap-1.5">
                          <Terminal size={12} className="text-blue-400" />
                          {lang || (activeDialect ? activeDialect.toUpperCase() : 'SQL')}
                        </span>
                        <button onClick={() => handleCopyCode(codeString, codeId)} className="flex items-center gap-1 hover:text-white transition-colors">
                          {copiedId === codeId
                            ? <><Check size={12} className="text-emerald-400" />Copied</>
                            : <><Copy size={12} />Copy</>}
                        </button>
                      </div>
                      <div className="p-4 overflow-x-auto leading-relaxed text-slate-100 font-mono text-[13px]">
                        <code className={className} {...props}>{children}</code>
                      </div>
                    </div>
                  );
                }
                
                return (
                  <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-[12px] font-mono border border-slate-200" {...props}>
                    {children}
                  </code>
                );
              }
            }}
          >
            {cleaned}
          </ReactMarkdown>
        </ErrorBoundary>
      </div>
    );
  };

  if (!chat) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 bg-white p-6 select-none">
        <div className="text-center max-w-md flex flex-col items-center gap-4">
          <div className="p-4 bg-slate-100 rounded-full text-slate-600">
            <Layers size={32} />
          </div>
          <h2 className="text-lg font-bold text-slate-800 tracking-tight">Select or Start a Chat</h2>
          <p className="text-xs text-slate-500 leading-normal">
            Choose a thread from the left sidebar or start a new thread to interact with the analytics intelligence.
          </p>
        </div>
      </div>
    );
  }

  const isNewChat = messages.length === 0;

  return (
    <div className="flex flex-col flex-1 bg-white h-full overflow-hidden">
      
      {/* Top Header */}
      <div className="flex items-center justify-between border-b px-6 py-3 bg-white select-none">
        <div className="flex flex-col">
          <span className="text-sm font-bold text-slate-800 truncate max-w-xs">{chat.title || 'New Chat'}</span>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Analyst Playground</span>
        </div>
        
        {/* Active Dialect Info Badge */}
        <div className="flex items-center gap-2 border px-2 py-1 rounded bg-slate-50 border-slate-200">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
            <Globe size={11} className="text-blue-500" /> Dialect:
          </span>
          <span className="text-[10px] text-slate-800 font-bold uppercase tracking-wider">{activeDialect}</span>
        </div>
      </div>

      {/* Messages Feed or Central Welcome Panel */}
      <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col bg-white">
        {isNewChat ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center max-w-2xl mx-auto w-full select-none py-10">
            <div className="w-16 h-16 flex items-center justify-center bg-white border border-slate-200/80 rounded-2xl mb-4 shadow-subtle overflow-hidden select-none p-2">
              <img src={logoImg} alt="SlothQuery Logo" className="w-full h-full object-contain" />
            </div>
            <h2 className="text-3xl font-semibold text-slate-900 tracking-tight">SlothQuery</h2>
            <p className="text-sm text-slate-500 max-w-md mt-3 leading-relaxed">
              Not every sloth is slow... This sloth is faster when it comes to doing your slow SQL writing and business logic understanding job.
            </p>
            
            <div className="w-full max-w-2xl mt-8">
              <form onSubmit={handleSubmit} className="flex flex-col gap-2 relative border border-slate-200 shadow-md rounded-full bg-white py-1 pl-3 pr-1 focus-within:ring-1 focus-within:ring-slate-400 focus-within:border-slate-400 transition-shadow">
                <div className="flex items-center gap-2">
                  
                  {/* Plus Options Trigger */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowPopover(!showPopover)}
                      className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 transition-colors"
                      title="Vaults, Tags & Dialect Filters"
                    >
                      <Plus size={16} />
                    </button>
                    
                    {/* Popover Options Menu */}
                    {showPopover && (
                      <div ref={popoverRef} className="absolute left-0 bottom-full mb-2 z-50 bg-white border border-slate-200 rounded-xl shadow-lg p-3 w-56 flex flex-col gap-3">
                        {/* Vaults Multi-Selector */}
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <Folder size={10} /> Active Vaults
                          </label>
                          <div className="max-h-24 overflow-y-auto border rounded p-1.5 flex flex-col gap-1 bg-slate-50">
                            {vaults.length === 0 ? (
                              <span className="text-[9px] text-slate-400 italic p-1">No vaults available</span>
                            ) : (
                              vaults.map(v => {
                                const isChecked = (chat?.vault_ids || []).includes(v.id);
                                return (
                                  <label key={v.id} className="flex items-center gap-1.5 text-[10px] text-slate-600 hover:text-slate-900 cursor-pointer p-0.5">
                                    <input 
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        const currentIds = chat?.vault_ids || [];
                                        let nextIds;
                                        if (isChecked) {
                                          nextIds = currentIds.filter((id: string) => id !== v.id);
                                        } else {
                                          nextIds = [...currentIds, v.id];
                                        }
                                        onUpdateChatVaults(chat.id, nextIds);
                                      }}
                                      className="rounded border-slate-300"
                                    />
                                    <span className="truncate">{v.name}</span>
                                  </label>
                                );
                              })
                            )}
                          </div>
                        </div>
                        
                        {/* Dialect Selector */}
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <Globe size={10} /> Dialect
                          </label>
                          <select 
                            value={activeDialect} 
                            onChange={(e) => setActiveDialect(e.target.value)}
                            className="text-xs border rounded p-1 bg-white focus:outline-none"
                          >
                            <option value="snowflake">Snowflake</option>
                            <option value="bigquery">BigQuery</option>
                            <option value="postgresql">PostgreSQL</option>
                            <option value="trino">Trino</option>
                            <option value="redshift">Redshift</option>
                          </select>
                        </div>

                        {/* Tag Filters */}
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <Tag size={10} /> Filter Tags
                          </label>
                          <div className="max-h-24 overflow-y-auto border rounded p-1 flex flex-col gap-1">
                            {availableTags.length === 0 ? (
                              <span className="text-[9px] text-slate-400 italic p-1">No tags in vault</span>
                            ) : (
                              availableTags.map(t => (
                                <label key={t} className="flex items-center gap-1.5 text-[10px] text-slate-600 hover:text-slate-900 cursor-pointer p-0.5">
                                  <input 
                                    type="checkbox"
                                    checked={selectedTags.includes(t)}
                                    onChange={() => handleTagToggle(t)}
                                    className="rounded border-slate-300"
                                  />
                                  <span className="truncate">{t}</span>
                                </label>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Growing Textarea */}
                  <textarea
                    ref={newChatTextareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isLoading}
                    data-gramm="false"
                    data-gramm_editor="false"
                    data-enable-grammarly="false"
                    placeholder="Does client or you need that data again? let's begin querying it..."
                    className="flex-1 text-sm border-none bg-transparent py-1 px-2 placeholder:italic focus:outline-none resize-none disabled:bg-transparent min-h-[28px] max-h-[150px] leading-5 text-slate-800 overflow-y-auto"
                    style={{ height: '28px' }}
                  />

                  {/* Rounded Send Button */}
                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className="bg-blue-600 hover:bg-blue-700 text-white w-10 h-10 rounded-full shadow-subtle transition-colors disabled:opacity-30 shrink-0 flex items-center justify-center"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </form>
              
              {/* Selected Context Tags Pill Display */}
              {selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 justify-center mt-2.5">
                  {selectedTags.map(tag => (
                    <span key={tag} className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                      <Tag size={8} /> {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Centered Chat Thread Container */
          <div className="max-w-3xl mx-auto w-full flex flex-col gap-5 py-4 pb-6">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col min-w-0 rounded-2xl p-4 shadow-subtle border leading-normal ${
                  m.role === 'user'
                    ? 'self-end w-fit max-w-[75%] bg-slate-50 border-slate-200/80 rounded-tr-none'
                    : 'self-start w-full max-w-[88%] bg-white border-slate-100 rounded-tl-none'
                }`}
              >
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 select-none">
                  {m.role === 'user' ? 'You' : 'SlothQuery'}
                </span>
                <div className="flex flex-col gap-1">
                  {renderMessageContent(m.content, m.id)}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="self-start flex flex-col max-w-[85%] bg-white border border-slate-100 rounded-2xl rounded-tl-none p-4 shadow-subtle">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">SlothQuery</span>
                <div className="flex gap-1.5 items-center py-1.5 px-1">
                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input box at the bottom if chat has started */}
      {!isNewChat && (
        <div className="px-6 pb-6 pt-2 w-full bg-transparent">
          <div className="max-w-3xl mx-auto w-full relative">
            <form onSubmit={handleSubmit} className="flex flex-col gap-2 relative border border-slate-200 shadow-md rounded-full bg-white py-1 pl-3 pr-1 focus-within:ring-1 focus-within:ring-slate-400 focus-within:border-slate-400 transition-shadow">
              <div className="flex items-center gap-2">
                
                {/* Plus Options Trigger */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowPopover(!showPopover)}
                    className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                  
                  {/* Popover Options Menu */}
                  {showPopover && (
                    <div ref={popoverRef} className="absolute left-0 bottom-full mb-2 z-50 bg-white border border-slate-200 rounded-xl shadow-lg p-3 w-56 flex flex-col gap-3">
                      {/* Vaults Multi-Selector */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                          <Folder size={10} /> Active Vaults
                        </label>
                        <div className="max-h-24 overflow-y-auto border rounded p-1.5 flex flex-col gap-1 bg-slate-50">
                          {vaults.length === 0 ? (
                            <span className="text-[9px] text-slate-400 italic p-1">No vaults available</span>
                          ) : (
                            vaults.map(v => {
                              const isChecked = (chat?.vault_ids || []).includes(v.id);
                              return (
                                <label key={v.id} className="flex items-center gap-1.5 text-[10px] text-slate-600 hover:text-slate-900 cursor-pointer p-0.5">
                                  <input 
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      const currentIds = chat?.vault_ids || [];
                                      let nextIds;
                                      if (isChecked) {
                                        nextIds = currentIds.filter((id: string) => id !== v.id);
                                      } else {
                                        nextIds = [...currentIds, v.id];
                                      }
                                      onUpdateChatVaults(chat.id, nextIds);
                                    }}
                                    className="rounded border-slate-300"
                                  />
                                  <span className="truncate">{v.name}</span>
                                </label>
                              );
                            })
                          )}
                        </div>
                      </div>
                      
                      {/* Dialect Selector */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                          <Globe size={10} /> Dialect
                        </label>
                        <select 
                          value={activeDialect} 
                          onChange={(e) => setActiveDialect(e.target.value)}
                          className="text-xs border rounded p-1 bg-white focus:outline-none"
                        >
                          <option value="snowflake">Snowflake</option>
                          <option value="bigquery">BigQuery</option>
                          <option value="postgresql">PostgreSQL</option>
                          <option value="trino">Trino</option>
                          <option value="redshift">Redshift</option>
                        </select>
                      </div>
 
                      {/* Tag Filters */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                          <Tag size={10} /> Filter Tags
                        </label>
                        <div className="max-h-24 overflow-y-auto border rounded p-1 flex flex-col gap-1">
                          {availableTags.length === 0 ? (
                            <span className="text-[9px] text-slate-400 italic p-1">No tags in vault</span>
                          ) : (
                            availableTags.map(t => (
                              <label key={t} className="flex items-center gap-1.5 text-[10px] text-slate-600 hover:text-slate-900 cursor-pointer p-0.5">
                                <input 
                                  type="checkbox"
                                  checked={selectedTags.includes(t)}
                                  onChange={() => handleTagToggle(t)}
                                  className="rounded border-slate-300"
                                />
                                <span className="truncate">{t}</span>
                              </label>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
 
                {/* Growing Textarea */}
                <textarea
                  ref={chatTextareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading}
                  data-gramm="false"
                  data-gramm_editor="false"
                  data-enable-grammarly="false"
                  placeholder="Does client or you need that data again? let's begin querying it..."
                  className="flex-1 text-sm border-none bg-transparent py-1 px-2 placeholder:italic focus:outline-none resize-none disabled:bg-transparent min-h-[28px] max-h-[150px] leading-5 text-slate-800 overflow-y-auto"
                  style={{ height: '28px' }}
                />

                {/* Rounded Send Button */}
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white w-10 h-10 rounded-full shadow-subtle transition-colors disabled:opacity-30 shrink-0 flex items-center justify-center"
                >
                  <Send size={18} />
                </button>
              </div>
            </form>
            
            {/* Selected Context Tags Pill Display */}
            {selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedTags.map(tag => (
                  <span key={tag} className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                    <Tag size={8} /> {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
