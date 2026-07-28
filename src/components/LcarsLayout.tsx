import React, { useState, useEffect } from 'react';
import { lcarsAudio } from '../utils/lcarsAudio';
import { Volume2, VolumeX, RefreshCw, Search, Sliders, Plus, CheckCheck, Radio } from 'lucide-react';
import { cn } from '../lib/utils';

interface LcarsLayoutProps {
  filter: 'inbox' | 'saved' | 'reddit' | 'radio';
  onFilterChange: (filter: 'inbox' | 'saved' | 'reddit' | 'radio') => void;
  unreadCount: number;
  savedCount: number;
  redditUnreadCount: number;
  onOpenSettings: () => void;
  onOpenAddFeed: () => void;
  onRefresh: () => void;
  onMarkAllRead: () => void;
  isRefreshing: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  children: React.ReactNode;
}

export const LcarsLayout: React.FC<LcarsLayoutProps> = ({
  filter,
  onFilterChange,
  unreadCount,
  savedCount,
  redditUnreadCount,
  onOpenSettings,
  onOpenAddFeed,
  onRefresh,
  onMarkAllRead,
  isRefreshing,
  searchQuery,
  onSearchChange,
  children
}) => {
  const [stardate, setStardate] = useState('79245.2');
  const [audioMuted, setAudioMuted] = useState(lcarsAudio.isMuted());
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    // Dynamic 24th century stardate calculation based on current time
    const updateStardate = () => {
      const now = new Date();
      const year = now.getFullYear();
      const startOfYear = new Date(year, 0, 1).getTime();
      const endOfYear = new Date(year + 1, 0, 1).getTime();
      const progress = (now.getTime() - startOfYear) / (endOfYear - startOfYear);
      const calculatedStardate = ((year - 2323) * 1000 + progress * 1000).toFixed(1);
      setStardate(calculatedStardate);
    };

    updateStardate();
    const interval = setInterval(updateStardate, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleAudioToggle = () => {
    const muted = lcarsAudio.toggleMute();
    setAudioMuted(muted);
  };

  const handleNavClick = (targetFilter: 'inbox' | 'saved' | 'reddit' | 'radio') => {
    lcarsAudio.playChirp();
    onFilterChange(targetFilter);
  };

  const handleRefreshClick = () => {
    lcarsAudio.playSweep();
    onRefresh();
  };

  const handleActionClick = (action: () => void, sound: 'beep' | 'select' | 'alert' | 'ack' = 'beep') => {
    if (sound === 'select') lcarsAudio.playSelect();
    else if (sound === 'alert') lcarsAudio.playAlert();
    else if (sound === 'ack') lcarsAudio.playAcknowledge();
    else lcarsAudio.playBeep();
    action();
  };

  return (
    <div className="min-h-screen bg-black text-[#ff9900] font-sans flex flex-col uppercase tracking-wider select-none overflow-hidden text-xs sm:text-sm">
      {/* LCARS TOP FRAME HEADER */}
      <header className="w-full bg-black pt-2 px-2 sm:px-4 flex flex-col gap-1 z-30">
        <div className="flex items-stretch gap-1.5 h-12 sm:h-14">
          {/* Top-Left Curve / Elbow Cap */}
          <div className="bg-[#ff9900] text-black w-28 sm:w-36 rounded-tl-[28px] sm:rounded-tl-[36px] rounded-bl-sm flex flex-col justify-between p-2 font-bold shrink-0 shadow-[inset_-2px_-2px_0_rgba(0,0,0,0.3)]">
            <span className="text-[10px] sm:text-xs leading-none">LCARS-24701</span>
            <span className="text-xs sm:text-sm font-black text-black">FLUSSO v1.1</span>
          </div>

          {/* Top Horizontal Bar Blocks */}
          <div className="flex-1 bg-black flex items-center gap-1.5 overflow-hidden">
            <div className="h-full bg-[#ffcc99] w-12 sm:w-16 flex items-center justify-center font-bold text-black text-[10px] sm:text-xs shrink-0 rounded-sm">
              01-A
            </div>
            <div className="h-full bg-[#cc99cc] flex-1 min-w-[60px] flex items-center px-3 font-extrabold text-black text-xs sm:text-sm truncate rounded-sm">
              STARDATE {stardate} • FEDERATION DATA NETWORK
            </div>
            <div className="h-full bg-[#99ccff] hidden md:flex items-center px-3 font-bold text-black text-xs rounded-sm">
              SYS STATUS: ONLINE
            </div>

            {/* Audio Toggle Pill */}
            <button
              onClick={handleAudioToggle}
              className={cn(
                "h-full px-3 flex items-center gap-1.5 font-bold text-black text-xs transition-colors rounded-sm shrink-0",
                audioMuted ? "bg-[#cc3333] text-white" : "bg-[#ffaa66]"
              )}
            >
              {audioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span className="hidden sm:inline">{audioMuted ? "AUDIO OFF" : "AUDIO ON"}</span>
            </button>

            {/* Top Right Curved Terminal End */}
            <div className="h-full bg-[#ff9900] w-8 sm:w-12 rounded-tr-[16px] sm:rounded-tr-[24px] rounded-br-sm shrink-0" />
          </div>
        </div>

        {/* Secondary Sub-header line */}
        <div className="flex items-center justify-between text-[10px] sm:text-xs text-[#ffcc99] px-2 py-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[#ff9900]">COMMAND DECK</span>
            <span>//</span>
            <span className="text-[#99ccff] font-bold">
              MODE: {filter.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-[#cc99cc]">UNREAD: {unreadCount}</span>
            <span className="text-[#ffcc66]">SAVED: {savedCount}</span>
            <span className="text-[#99ccff]">REDDIT: {redditUnreadCount}</span>
          </div>
        </div>
      </header>

      {/* MAIN LCARS CONTENT BODY (LEFT PILLAR + MAIN VIEWPORT) */}
      <div className="flex-1 flex gap-2 p-2 sm:p-4 overflow-hidden">
        {/* LEFT LCARS NAVIGATION PILLAR */}
        <aside className="w-28 sm:w-36 flex flex-col gap-1.5 shrink-0">
          {/* Section Divider Block */}
          <div className="bg-[#ff9900] text-black font-extrabold text-[10px] sm:text-xs px-2 py-1 rounded-sm flex items-center justify-between">
            <span>TACTICAL</span>
            <span>47</span>
          </div>

          {/* Navigation Buttons (Pill shaped buttons) */}
          <button
            onClick={() => handleNavClick('inbox')}
            className={cn(
              "w-full h-10 sm:h-11 rounded-l-full rounded-r-sm px-3 flex items-center justify-between font-black text-xs sm:text-sm transition-all text-black",
              filter === 'inbox' ? "bg-[#ff9900] shadow-[0_0_12px_rgba(255,153,0,0.8)]" : "bg-[#ffcc99] hover:bg-[#ffaa66]"
            )}
          >
            <span>01 INBOX</span>
            {unreadCount > 0 && (
              <span className="bg-black text-[#ff9900] text-[10px] px-1.5 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </button>

          <button
            onClick={() => handleNavClick('saved')}
            className={cn(
              "w-full h-10 sm:h-11 rounded-l-full rounded-r-sm px-3 flex items-center justify-between font-black text-xs sm:text-sm transition-all text-black",
              filter === 'saved' ? "bg-[#ffcc00] shadow-[0_0_12px_rgba(255,204,0,0.8)]" : "bg-[#ffcc99] hover:bg-[#ffaa66]"
            )}
          >
            <span>02 SAVED</span>
            {savedCount > 0 && (
              <span className="bg-black text-[#ffcc00] text-[10px] px-1.5 py-0.5 rounded-full">
                {savedCount}
              </span>
            )}
          </button>

          <button
            onClick={() => handleNavClick('reddit')}
            className={cn(
              "w-full h-10 sm:h-11 rounded-l-full rounded-r-sm px-3 flex items-center justify-between font-black text-xs sm:text-sm transition-all text-black",
              filter === 'reddit' ? "bg-[#cc99cc] shadow-[0_0_12px_rgba(204,153,204,0.8)]" : "bg-[#9999cc] hover:bg-[#cc99cc]"
            )}
          >
            <span>03 REDDIT</span>
            {redditUnreadCount > 0 && (
              <span className="bg-black text-[#cc99cc] text-[10px] px-1.5 py-0.5 rounded-full">
                {redditUnreadCount}
              </span>
            )}
          </button>

          <button
            onClick={() => handleNavClick('radio')}
            className={cn(
              "w-full h-10 sm:h-11 rounded-l-full rounded-r-sm px-3 flex items-center justify-between font-black text-xs sm:text-sm transition-all text-black",
              filter === 'radio' ? "bg-[#ff9999] shadow-[0_0_12px_rgba(255,153,153,0.8)]" : "bg-[#ffcc99] hover:bg-[#ffaa66]"
            )}
          >
            <div className="flex items-center gap-1">
              <Radio className="w-3.5 h-3.5 text-black" />
              <span>04 RADIO</span>
            </div>
          </button>

          <div className="h-2 bg-[#336699] rounded-sm my-1" />

          {/* Action Control Pills */}
          <button
            onClick={() => handleActionClick(onOpenAddFeed, 'select')}
            className="w-full h-9 sm:h-10 bg-[#99ccff] hover:bg-[#6699cc] text-black font-black text-xs rounded-l-full rounded-r-sm px-3 flex items-center justify-between"
          >
            <span className="truncate">+ ADD FEED</span>
            <Plus className="w-4 h-4 shrink-0" />
          </button>

          <button
            onClick={handleRefreshClick}
            disabled={isRefreshing}
            className="w-full h-9 sm:h-10 bg-[#ffaa66] hover:bg-[#ff9900] text-black font-black text-xs rounded-l-full rounded-r-sm px-3 flex items-center justify-between disabled:opacity-50"
          >
            <span className="truncate">{isRefreshing ? "SCANNING..." : "REFRESH"}</span>
            <RefreshCw className={cn("w-4 h-4 shrink-0", isRefreshing && "animate-spin")} />
          </button>

          <button
            onClick={() => setShowSearch(!showSearch)}
            className="w-full h-9 sm:h-10 bg-[#cc99cc] hover:bg-[#9966cc] text-black font-black text-xs rounded-l-full rounded-r-sm px-3 flex items-center justify-between"
          >
            <span className="truncate">SEARCH</span>
            <Search className="w-4 h-4 shrink-0" />
          </button>

          <button
            onClick={() => handleActionClick(onMarkAllRead, 'ack')}
            className="w-full h-9 sm:h-10 bg-[#cc3333] hover:bg-[#ff3333] text-white font-black text-xs rounded-l-full rounded-r-sm px-3 flex items-center justify-between"
          >
            <span className="truncate">MARK ALL</span>
            <CheckCheck className="w-4 h-4 shrink-0" />
          </button>

          <div className="flex-1 bg-black min-h-[20px]" />

          {/* Settings Bottom Button */}
          <button
            onClick={() => handleActionClick(onOpenSettings, 'select')}
            className="w-full h-10 sm:h-11 bg-[#ff9900] hover:bg-[#ffcc00] text-black font-black text-xs rounded-l-full rounded-r-sm px-3 flex items-center justify-between mt-auto mb-1"
          >
            <span>SYS CONFIG</span>
            <Sliders className="w-4 h-4 shrink-0" />
          </button>

          {/* Bottom Left Elbow Cap */}
          <div className="h-10 bg-[#ffcc99] rounded-bl-[24px] rounded-tl-sm flex items-center px-3 font-bold text-black text-[10px]">
            LCARS 47-9
          </div>
        </aside>

        {/* RIGHT MAIN DISPLAY PANEL */}
        <main className="flex-1 flex flex-col bg-black border-2 border-[#ff9900] rounded-tl-sm rounded-tr-[24px] rounded-b-[24px] overflow-hidden p-2 sm:p-4 relative">
          {/* Top Panel Header Indicator */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b-2 border-[#ff9900] text-[#ffcc99]">
            <div className="flex items-center gap-2 font-bold text-xs sm:text-sm">
              <span className="bg-[#ff9900] text-black px-2 py-0.5 rounded-sm font-black">
                SECTION {filter.toUpperCase()}
              </span>
              <span className="text-[#99ccff]">
                // DATA BUFFER READY
              </span>
            </div>

            {/* Quick Search Bar toggle inside panel */}
            {showSearch && (
              <div className="flex items-center gap-2 bg-black border border-[#ff9900] rounded-full px-3 py-1">
                <Search className="w-3.5 h-3.5 text-[#ff9900]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="SEARCH DATABASE..."
                  className="bg-transparent text-xs text-[#ffcc99] focus:outline-none placeholder-[#ff9900]/50 border-none p-0 uppercase"
                />
              </div>
            )}
          </div>

          {/* Render Main App Children View */}
          <div className="flex-1 overflow-y-auto relative z-10 lcars-content-viewport">
            {children}
          </div>
        </main>
      </div>

      {/* LCARS FOOTER STATUS BAR */}
      <footer className="bg-black px-2 sm:px-4 py-1.5 border-t border-[#ff9900]/40 flex items-center justify-between text-[10px] text-[#ffcc99] z-20">
        <div className="flex items-center gap-3">
          <span className="text-[#ff9900] font-bold">UNITED FEDERATION OF PLANETS</span>
          <span className="hidden sm:inline">•</span>
          <span className="hidden sm:inline text-[#99ccff]">DECK 01 PRIMARY RECEPTION</span>
        </div>
        <div className="flex items-center gap-2 font-mono">
          <span className="inline-block w-2 h-2 rounded-full bg-[#ff9900] animate-pulse" />
          <span>TRANSMISSION ACTIVE</span>
        </div>
      </footer>
    </div>
  );
};
