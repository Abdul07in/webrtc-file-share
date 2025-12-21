import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { FileDropZone } from './FileDropZone';
import { TransferList } from './TransferList';
import { webrtc, FileTransfer } from '@/lib/webrtc';
import { Wifi, WifiOff, X } from 'lucide-react';
import { toast } from 'sonner';

interface TransferPanelProps {
  onDisconnect: () => void;
}

export function TransferPanel({ onDisconnect }: TransferPanelProps) {
  const [sendingFiles, setSendingFiles] = useState<FileTransfer[]>([]);
  const [receivingFiles, setReceivingFiles] = useState<FileTransfer[]>([]);
  const [isConnected, setIsConnected] = useState(true);

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
      // Check if it's a file we're sending or receiving
      // If file has data, it's receiving
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
        toast.success(`Sent ${file.name}`);
      } catch (error) {
        console.error('Failed to send file:', error);
        toast.error(`Failed to send ${file.name}`);
      }
    }
  }, []);

  const handleDisconnect = () => {
    webrtc.disconnect();
    onDisconnect();
  };

  return (
    <div className="glass rounded-2xl p-6 max-w-2xl w-full mx-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {isConnected ? (
            <div className="flex items-center gap-2 text-success">
              <Wifi className="w-5 h-5" />
              <span className="text-sm font-medium">Connected</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-destructive">
              <WifiOff className="w-5 h-5" />
              <span className="text-sm font-medium">Disconnected</span>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDisconnect}
          className="text-muted-foreground hover:text-destructive"
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
