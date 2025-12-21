import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Link2, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { webrtc } from '@/lib/webrtc';

interface ConnectionPanelProps {
  onConnected: () => void;
}

type ConnectionMode = 'idle' | 'creating' | 'joining' | 'waiting' | 'connecting';

export function ConnectionPanel({ onConnected }: ConnectionPanelProps) {
  const [mode, setMode] = useState<ConnectionMode>('idle');
  const [offer, setOffer] = useState('');
  const [answer, setAnswer] = useState('');
  const [peerCode, setPeerCode] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCreateRoom = async () => {
    setMode('creating');
    try {
      const offerCode = await webrtc.createOffer();
      setOffer(offerCode);
      setMode('waiting');
      
      webrtc.onMessage((msg) => {
        if (msg.type === 'channelOpen') {
          toast.success('Peer connected!');
          onConnected();
        }
      });
    } catch (error) {
      console.error('Failed to create offer:', error);
      toast.error('Failed to create room');
      setMode('idle');
    }
  };

  const handleJoinRoom = async () => {
    if (!peerCode.trim()) {
      toast.error('Please enter a connection code');
      return;
    }

    setMode('connecting');
    try {
      const answerCode = await webrtc.handleOffer(peerCode);
      setAnswer(answerCode);
      
      webrtc.onMessage((msg) => {
        if (msg.type === 'channelOpen') {
          toast.success('Connected to peer!');
          onConnected();
        }
      });
    } catch (error) {
      console.error('Failed to join:', error);
      toast.error('Invalid connection code');
      setMode('idle');
    }
  };

  const handleAcceptAnswer = async () => {
    if (!peerCode.trim()) {
      toast.error('Please enter the answer code');
      return;
    }

    try {
      await webrtc.handleAnswer(peerCode);
    } catch (error) {
      console.error('Failed to accept answer:', error);
      toast.error('Invalid answer code');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  if (mode === 'idle') {
    return (
      <div className="glass rounded-2xl p-8 max-w-md w-full mx-4">
        <h2 className="text-2xl font-semibold text-foreground mb-6 text-center">
          Start Transfer
        </h2>
        <div className="space-y-4">
          <Button
            onClick={handleCreateRoom}
            className="w-full h-14 text-lg bg-primary hover:bg-primary/90 text-primary-foreground glow-primary transition-all"
          >
            <Link2 className="w-5 h-5 mr-2" />
            Create Room
          </Button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-card text-muted-foreground">or</span>
            </div>
          </div>
          <div className="space-y-3">
            <Input
              placeholder="Enter connection code..."
              value={peerCode}
              onChange={(e) => setPeerCode(e.target.value)}
              className="h-14 bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground font-mono text-sm"
            />
            <Button
              onClick={handleJoinRoom}
              variant="secondary"
              className="w-full h-14 text-lg"
              disabled={!peerCode.trim()}
            >
              Join Room
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'creating') {
    return (
      <div className="glass rounded-2xl p-8 max-w-md w-full mx-4 text-center">
        <Loader2 className="w-12 h-12 mx-auto mb-4 text-primary animate-spin" />
        <p className="text-foreground">Creating room...</p>
      </div>
    );
  }

  if (mode === 'waiting') {
    return (
      <div className="glass rounded-2xl p-8 max-w-lg w-full mx-4">
        <h2 className="text-xl font-semibold text-foreground mb-4">
          Share this code with your peer
        </h2>
        <div className="relative">
          <div className="bg-secondary/50 rounded-lg p-4 pr-12 font-mono text-xs text-foreground break-all max-h-32 overflow-y-auto">
            {offer}
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="absolute top-2 right-2"
            onClick={() => copyToClipboard(offer)}
          >
            {copied ? (
              <CheckCircle2 className="w-4 h-4 text-success" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </Button>
        </div>
        <div className="mt-6 space-y-3">
          <p className="text-sm text-muted-foreground">
            Paste the answer code from your peer:
          </p>
          <Input
            placeholder="Answer code..."
            value={peerCode}
            onChange={(e) => setPeerCode(e.target.value)}
            className="bg-secondary/50 border-border font-mono text-sm"
          />
          <Button
            onClick={handleAcceptAnswer}
            className="w-full bg-primary hover:bg-primary/90"
            disabled={!peerCode.trim()}
          >
            Connect
          </Button>
        </div>
      </div>
    );
  }

  if (mode === 'connecting' && answer) {
    return (
      <div className="glass rounded-2xl p-8 max-w-lg w-full mx-4">
        <h2 className="text-xl font-semibold text-foreground mb-4">
          Send this answer code back
        </h2>
        <div className="relative">
          <div className="bg-secondary/50 rounded-lg p-4 pr-12 font-mono text-xs text-foreground break-all max-h-32 overflow-y-auto">
            {answer}
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="absolute top-2 right-2"
            onClick={() => copyToClipboard(answer)}
          >
            {copied ? (
              <CheckCircle2 className="w-4 h-4 text-success" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </Button>
        </div>
        <div className="mt-4 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Waiting for connection...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-8 max-w-md w-full mx-4 text-center">
      <Loader2 className="w-12 h-12 mx-auto mb-4 text-primary animate-spin" />
      <p className="text-foreground">Connecting...</p>
    </div>
  );
}
