import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Link2, Loader2, Copy, CheckCircle2, Shield, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import { webrtc } from '@/lib/webrtc';
import { supabase } from '@/integrations/supabase/client';
import { QRCodeSVG } from 'qrcode.react';

interface ConnectionPanelProps {
  onConnected: () => void;
}

type ConnectionMode = 'idle' | 'creating' | 'waiting' | 'joining' | 'connecting';

function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function ConnectionPanel({ onConnected }: ConnectionPanelProps) {
  const [mode, setMode] = useState<ConnectionMode>('idle');
  const [pin, setPin] = useState('');
  const [myPin, setMyPin] = useState('');
  const [myPublicKey, setMyPublicKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(true);

  const handleCreateRoom = async () => {
    setMode('creating');
    try {
      const newPin = generatePin();
      const { offer, publicKey } = await webrtc.createOffer();
      
      const { error } = await supabase
        .from('rooms')
        .insert({ pin: newPin, offer: offer, public_key: publicKey });
      
      if (error) throw error;
      
      setMyPin(newPin);
      setMyPublicKey(publicKey);
      setMode('waiting');
      
      webrtc.onMessage((msg) => {
        if (msg.type === 'channelOpen') {
          toast.success('Connected with E2E encryption!');
          onConnected();
        }
      });
    } catch (error) {
      console.error('Failed to create room:', error);
      toast.error('Failed to create room');
      setMode('idle');
    }
  };

  // Listen for answer updates when waiting
  useEffect(() => {
    if (mode !== 'waiting' || !myPin) return;

    const channel = supabase
      .channel('room-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `pin=eq.${myPin}`,
        },
        async (payload) => {
          const { answer, peer_public_key } = payload.new as any;
          if (answer && peer_public_key) {
            try {
              await webrtc.handleAnswer(answer, peer_public_key);
            } catch (error) {
              console.error('Failed to handle answer:', error);
              toast.error('Connection failed');
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [mode, myPin]);

  const handleJoinRoom = async () => {
    if (pin.length !== 6) {
      toast.error('Please enter a 6-digit PIN');
      return;
    }

    setMode('joining');
    try {
      const { data: room, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('pin', pin)
        .maybeSingle();

      if (error) throw error;
      if (!room) {
        toast.error('Room not found');
        setMode('idle');
        return;
      }

      setMode('connecting');
      const { answer, publicKey } = await webrtc.handleOffer(room.offer, (room as any).public_key);
      
      await supabase
        .from('rooms')
        .update({ answer: answer, peer_public_key: publicKey })
        .eq('pin', pin);

      webrtc.onMessage((msg) => {
        if (msg.type === 'channelOpen') {
          toast.success('Connected with E2E encryption!');
          onConnected();
        }
      });
    } catch (error) {
      console.error('Failed to join:', error);
      toast.error('Failed to join room');
      setMode('idle');
    }
  };

  const copyPin = () => {
    navigator.clipboard.writeText(myPin);
    setCopied(true);
    toast.success('PIN copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate QR code data (PIN only for simplicity)
  const qrData = `p2p:${myPin}`;

  if (mode === 'idle') {
    return (
      <div className="glass rounded-2xl p-8 max-w-md w-full mx-4">
        <h2 className="text-2xl font-semibold text-foreground mb-2 text-center">
          Start Transfer
        </h2>
        <div className="flex items-center justify-center gap-2 mb-6">
          <Shield className="w-4 h-4 text-success" />
          <span className="text-sm text-muted-foreground">End-to-end encrypted</span>
        </div>
        <div className="space-y-6">
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
              <span className="px-4 bg-card text-muted-foreground">or join with PIN</span>
            </div>
          </div>
          
          <div className="flex flex-col items-center gap-4">
            <InputOTP
              maxLength={6}
              value={pin}
              onChange={setPin}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
            
            <Button
              onClick={handleJoinRoom}
              variant="secondary"
              className="w-full h-12"
              disabled={pin.length !== 6}
            >
              Join Room
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'creating' || mode === 'joining') {
    return (
      <div className="glass rounded-2xl p-8 max-w-md w-full mx-4 text-center">
        <Loader2 className="w-12 h-12 mx-auto mb-4 text-primary animate-spin" />
        <p className="text-foreground">
          {mode === 'creating' ? 'Creating secure room...' : 'Joining room...'}
        </p>
      </div>
    );
  }

  if (mode === 'waiting') {
    return (
      <div className="glass rounded-2xl p-8 max-w-md w-full mx-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-success" />
          <span className="text-sm text-success font-medium">E2E Encryption Ready</span>
        </div>
        
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Share to Connect
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Scan QR or enter PIN to connect
        </p>
        
        {/* QR Code Toggle */}
        <div className="flex justify-center gap-2 mb-4">
          <Button
            variant={showQR ? "default" : "outline"}
            size="sm"
            onClick={() => setShowQR(true)}
          >
            <QrCode className="w-4 h-4 mr-1" />
            QR Code
          </Button>
          <Button
            variant={!showQR ? "default" : "outline"}
            size="sm"
            onClick={() => setShowQR(false)}
          >
            PIN
          </Button>
        </div>
        
        {showQR ? (
          <div className="bg-white p-4 rounded-xl inline-block mb-4">
            <QRCodeSVG 
              value={qrData} 
              size={180}
              level="M"
              includeMargin={false}
            />
          </div>
        ) : (
          <div 
            onClick={copyPin}
            className="inline-flex items-center gap-3 bg-secondary/50 rounded-xl px-6 py-4 cursor-pointer hover:bg-secondary/70 transition-colors mb-4"
          >
            <span className="text-4xl font-mono font-bold text-primary tracking-widest">
              {myPin}
            </span>
            {copied ? (
              <CheckCircle2 className="w-6 h-6 text-green-500" />
            ) : (
              <Copy className="w-6 h-6 text-muted-foreground" />
            )}
          </div>
        )}
        
        <p className="text-xs text-muted-foreground mb-4">
          PIN: <span className="font-mono font-semibold">{myPin}</span>
        </p>
        
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Waiting for peer...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-8 max-w-md w-full mx-4 text-center">
      <Loader2 className="w-12 h-12 mx-auto mb-4 text-primary animate-spin" />
      <p className="text-foreground">Establishing secure connection...</p>
    </div>
  );
}
