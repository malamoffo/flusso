import { create } from 'zustand';
import { Article } from '../types';
import { parseDurationToSeconds } from '../lib/utils';

interface AudioState {
  // Data
  currentTrack: Article | null;
  isPlaying: boolean;
  isBuffering: boolean;
  progress: number;
  duration: number;
  playbackRate: number;

  // External Collections
  queue: Article[];
  recentPodcasts: Article[];
  favoritePodcasts: Article[];

  // Audio Backend
  audioElement: HTMLAudioElement | null;
  lastSavedProgress: number;

  // Callbacks
  updateArticleProgress: ((trackId: string, progress: number) => void) | null;

  // Actions
  initAudio: () => void;
  play: (track: Article) => void;
  pause: () => void;
  toggle: () => void;
  seek: (time: number) => void;
  stop: () => void;
  setPlaybackRate: (rate: number) => void;
  playNext: () => void;
  playPrevious: () => void;
  setUpdateArticleProgress: (fn: (trackId: string, progress: number) => void) => void;

  setCollections: (collections: { queue: Article[]; recentPodcasts: Article[]; favoritePodcasts: Article[] }) => void;

  // Private internally used by event listeners
  _handleEnded: () => void;
}

export const useAudioStore = create<AudioState>()((set, get) => ({
  currentTrack: null,
  isPlaying: false,
  isBuffering: false,
  progress: 0,
  duration: 0,
  playbackRate: 1.0,
  
  queue: [],
  recentPodcasts: [],
  favoritePodcasts: [],

  audioElement: null,
  lastSavedProgress: 0,
  updateArticleProgress: null,

  setUpdateArticleProgress: (fn) => set({ updateArticleProgress: fn }),
  setCollections: (collections) => set(collections),

  initAudio: () => {
    if (get().audioElement) return;

    const audio = new Audio();
    // Native platforms handle their own sessions
    audio.addEventListener('timeupdate', () => {
      set({ progress: audio.currentTime, isBuffering: false });
    });

    audio.addEventListener('loadedmetadata', () => {
      set({ duration: audio.duration });
    });

    audio.addEventListener('waiting', () => {
      set({ isBuffering: true });
    });

    audio.addEventListener('playing', () => {
      set({ isBuffering: false });
    });

    audio.addEventListener('ended', () => {
      set({ isPlaying: false, isBuffering: false, progress: 0 });
      get()._handleEnded();
    });

    audio.addEventListener('error', (e: any) => {
      if (e?.name === 'AbortError') return;
      console.error("Audio error:", e);
      set({ isPlaying: false, isBuffering: false });
    });

    set({ audioElement: audio });
  },

  play: (track: Article) => {
    const state = get();
    const audio = state.audioElement;
    if (!audio) return;

    if (state.currentTrack?.id !== track.id) {
      const safeMediaUrl = track.mediaUrl || '';
      audio.src = safeMediaUrl;
      audio.load();
      audio.playbackRate = state.playbackRate;

      let startProgress = 0;
      if (track.progress && track.progress > 0) {
        const resumeTime = track.progress * (track.duration ? parseDurationToSeconds(track.duration) : 0);
        if (resumeTime > 0) {
          audio.currentTime = resumeTime;
          startProgress = track.progress;
          set({ progress: resumeTime });
        }
      }
      
      set({ currentTrack: track, lastSavedProgress: startProgress });
    }

    set({ isBuffering: true });
    audio.play().then(() => {
      set({ isPlaying: true, isBuffering: false });
    }).catch(err => {
      if (err.name !== 'AbortError') console.error("Playback failed:", err);
      set({ isBuffering: false });
    });
  },

  pause: () => {
    const { audioElement, currentTrack, progress, duration, updateArticleProgress } = get();
    if (!audioElement) return;

    audioElement.pause();
    set({ isPlaying: false });

    if (currentTrack && duration > 0 && updateArticleProgress) {
      const currentProgress = progress / duration;
      updateArticleProgress(currentTrack.id, currentProgress);
      set({ lastSavedProgress: currentProgress });
    }
  },

  toggle: () => {
    const { isPlaying, currentTrack } = get();
    if (isPlaying) get().pause();
    else if (currentTrack) get().play(currentTrack);
  },

  seek: (time: number) => {
    const { audioElement, currentTrack, duration, updateArticleProgress } = get();
    if (!audioElement) return;
    
    audioElement.currentTime = time;
    set({ progress: time });

    if (currentTrack && duration > 0 && updateArticleProgress) {
      const currentProgress = time / duration;
      updateArticleProgress(currentTrack.id, currentProgress);
      set({ lastSavedProgress: currentProgress });
    }
  },

  stop: () => {
    const { audioElement, currentTrack, progress, duration, updateArticleProgress } = get();
    if (!audioElement) return;

    if (currentTrack && duration > 0 && updateArticleProgress) {
      const currentProgress = progress / duration;
      updateArticleProgress(currentTrack.id, currentProgress);
    }

    audioElement.pause();
    audioElement.currentTime = 0;
    set({ isPlaying: false, currentTrack: null, progress: 0 });
  },

  setPlaybackRate: (rate: number) => {
    const { audioElement } = get();
    if (audioElement) {
      audioElement.playbackRate = rate;
      set({ playbackRate: rate });
    }
  },

  playNext: () => {
    const { currentTrack, queue, recentPodcasts, favoritePodcasts, play } = get();
    if (!currentTrack) return;
    
    let currentList = queue;
    let currentIndex = currentList.findIndex(a => a.id === currentTrack.id);
    
    if (currentIndex === -1) {
      currentList = recentPodcasts;
      currentIndex = currentList.findIndex(a => a.id === currentTrack.id);
    }

    if (currentIndex === -1) {
      currentList = favoritePodcasts;
      currentIndex = currentList.findIndex(a => a.id === currentTrack.id);
    }
    
    if (currentIndex !== -1 && currentIndex < currentList.length - 1) {
      play(currentList[currentIndex + 1]);
    }
  },

  playPrevious: () => {
    const { currentTrack, progress, queue, recentPodcasts, favoritePodcasts, play, seek } = get();
    if (!currentTrack) return;
    
    if (progress > 5) {
      seek(0);
      return;
    }

    let currentList = queue;
    let currentIndex = currentList.findIndex(a => a.id === currentTrack.id);
    
    if (currentIndex === -1) {
      currentList = recentPodcasts;
      currentIndex = currentList.findIndex(a => a.id === currentTrack.id);
    }

    if (currentIndex === -1) {
      currentList = favoritePodcasts;
      currentIndex = currentList.findIndex(a => a.id === currentTrack.id);
    }
    
    if (currentIndex > 0) {
      play(currentList[currentIndex - 1]);
    } else {
      seek(0);
    }
  },

  _handleEnded: () => {
    const { currentTrack, playNext, updateArticleProgress } = get();
    if (currentTrack && updateArticleProgress) {
      updateArticleProgress(currentTrack.id, 0);
    }
    playNext();
  }
}));
