import { useState } from 'react';
import { ConnectionPanel } from '@/components/ConnectionPanel';
import { TransferPanel } from '@/components/TransferPanel';
import { Share2 } from 'lucide-react';

const Index = () => {
  const [isConnected, setIsConnected] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-glow-pulse" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-glow-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Share2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              P2P Transfer
            </h1>
            <p className="text-xs text-muted-foreground">
              Secure peer-to-peer file sharing
            </p>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 pb-12">
        {!isConnected ? (
          <ConnectionPanel onConnected={() => setIsConnected(true)} />
        ) : (
          <TransferPanel onDisconnect={() => setIsConnected(false)} />
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 p-6 text-center">
        <p className="text-xs text-muted-foreground">
          Files are transferred directly between devices using WebRTC.
          <br />
          No data is stored on any server.
        </p>
      </footer>
    </div>
  );
};

export default Index;
