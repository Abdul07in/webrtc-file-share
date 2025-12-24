import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { FileDropZone } from './FileDropZone';
import { TransferList } from './TransferList';
import { webrtc, FileTransfer } from '@/lib/webrtc';
import { Wifi, WifiOff, X, Trophy, Zap, Star, Flame } from 'lucide-react';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';

interface TransferPanelProps {
  onDisconnect: () => void;
}

const XP_PER_FILE = 50;
const XP_PER_MB = 10;

const LEVELS = [
  { level: 1, name: 'Newbie Sharer', minXP: 0, icon: Star },
  { level: 2, name: 'File Apprentice', minXP: 100, icon: Zap },
  { level: 3, name: 'Transfer Pro', minXP: 300, icon: Flame },
  { level: 4, name: 'Share Master', minXP: 600, icon: Trophy },
  { level: 5, name: 'P2P Legend', minXP: 1000, icon: Trophy },
];

export function TransferPanel({ onDisconnect }: TransferPanelProps) {
  const [sendingFiles, setSendingFiles] = useState<FileTransfer[]>([]);
  const [receivingFiles, setReceivingFiles] = useState<FileTransfer[]>([]);
  const [isConnected, setIsConnected] = useState(true);
  const [totalXP, setTotalXP] = useState(() => {
    const saved = localStorage.getItem('secureShare_xp');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [filesShared, setFilesShared] = useState(() => {
    const saved = localStorage.getItem('secureShare_filesShared');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [streak, setStreak] = useState(0);

  // Calculate current level
  const currentLevel = useMemo(() => {
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      if (totalXP >= LEVELS[i].minXP) return LEVELS[i];
    }
    return LEVELS[0];
  }, [totalXP]);

  const nextLevel = useMemo(() => {
    const idx = LEVELS.findIndex(l => l.level === currentLevel.level);
    return LEVELS[idx + 1] || null;
  }, [currentLevel]);

  const progressToNextLevel = useMemo(() => {
    if (!nextLevel) return 100;
    const currentMin = currentLevel.minXP;
    const nextMin = nextLevel.minXP;
    return ((totalXP - currentMin) / (nextMin - currentMin)) * 100;
  }, [totalXP, currentLevel, nextLevel]);

  // Save XP and files shared to localStorage
  useEffect(() => {
    localStorage.setItem('secureShare_xp', totalXP.toString());
    localStorage.setItem('secureShare_filesShared', filesShared.toString());
  }, [totalXP, filesShared]);

  useEffect(() => {
    const unsubMessage = webrtc.onMessage((msg) => {
      if (msg.type === 'connectionState') {
        if (msg.state === 'disconnected' || msg.state === 'failed') {
          setIsConnected(false);
          toast.error('Peer disconnected');
        }
      }
      if (msg.type === 'channelClose') {
        setIsConnected(false);
      }
    });

    const unsubFile = webrtc.onFile((file) => {
      if (file.data || !sendingFiles.find(f => f.id === file.id)) {
        setReceivingFiles(prev => {
          const existing = prev.findIndex(f => f.id === file.id);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = file;
            return updated;
          }
          return [...prev, file];
        });
      } else {
        setSendingFiles(prev => {
          const existing = prev.findIndex(f => f.id === file.id);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = file;
            return updated;
          }
          return [...prev, file];
        });
      }
    });

    return () => {
      unsubMessage();
      unsubFile();
    };
  }, [sendingFiles]);

  const addXP = useCallback((fileSize: number) => {
    const mbBonus = Math.floor(fileSize / (1024 * 1024)) * XP_PER_MB;
    const earned = XP_PER_FILE + mbBonus;
    setTotalXP(prev => prev + earned);
    setFilesShared(prev => prev + 1);
    setStreak(prev => prev + 1);
    
    // Show XP toast with animation effect
    toast.success(`+${earned} XP earned!`, {
      icon: <Zap className="w-4 h-4 text-warning" />,
      description: streak >= 2 ? `🔥 ${streak + 1} file streak!` : undefined,
    });
  }, [streak]);

  const handleFilesSelected = useCallback(async (files: File[]) => {
    for (const file of files) {
      try {
        const tempId = crypto.randomUUID();
        setSendingFiles(prev => [...prev, {
          id: tempId,
          name: file.name,
          size: file.size,
          type: file.type,
          progress: 0,
          status: 'pending',
        }]);
        
        await webrtc.sendFile(file);
        addXP(file.size);
        toast.success(`Sent ${file.name}`);
      } catch (error) {
        console.error('Failed to send file:', error);
        toast.error(`Failed to send ${file.name}`);
        setStreak(0);
      }
    }
  }, [addXP]);

  const handleDisconnect = () => {
    webrtc.disconnect();
    onDisconnect();
  };

  const LevelIcon = currentLevel.icon;

  return (
    <div className="glass rounded-2xl p-6 max-w-2xl w-full mx-4">
      {/* Gamification Stats Bar */}
      <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 border border-primary/20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent-foreground flex items-center justify-center shadow-lg">
              <LevelIcon className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-foreground">{currentLevel.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                  Lvl {currentLevel.level}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{totalXP} XP total</p>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 text-sm">
              <Trophy className="w-4 h-4 text-warning" />
              <span className="font-semibold text-foreground">{filesShared}</span>
              <span className="text-muted-foreground">files shared</span>
            </div>
            {streak >= 2 && (
              <div className="flex items-center gap-1 text-xs text-warning mt-1">
                <Flame className="w-3 h-3" />
                <span>{streak} streak!</span>
              </div>
            )}
          </div>
        </div>
        {nextLevel && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Progress to {nextLevel.name}</span>
              <span>{nextLevel.minXP - totalXP} XP to go</span>
            </div>
            <Progress value={progressToNextLevel} className="h-2" />
          </div>
        )}
      </div>

      {/* Connection Status */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {isConnected ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 border border-success/30">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <Wifi className="w-4 h-4 text-success" />
              <span className="text-sm font-medium text-success">Connected</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-destructive/10 border border-destructive/30">
              <WifiOff className="w-4 h-4 text-destructive" />
              <span className="text-sm font-medium text-destructive">Disconnected</span>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDisconnect}
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        >
          <X className="w-4 h-4 mr-1" />
          Disconnect
        </Button>
      </div>

      <FileDropZone
        onFilesSelected={handleFilesSelected}
        disabled={!isConnected}
      />

      <div className="mt-6 space-y-6">
        <TransferList transfers={sendingFiles} direction="sending" />
        <TransferList transfers={receivingFiles} direction="receiving" />
      </div>
    </div>
  );
}
