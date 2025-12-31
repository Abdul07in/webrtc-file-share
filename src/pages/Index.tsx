import { useState } from 'react';
import { ConnectionPanel } from '@/components/ConnectionPanel';
import { TransferPanel } from '@/components/TransferPanel';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Shield, Zap, Wifi } from 'lucide-react';

const Index = () => {
  const [isConnected, setIsConnected] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col transition-colors duration-500 ease-out">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-glow-pulse will-change-transform" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-glow-pulse will-change-transform" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl will-change-transform" />
        {/* Animated particles */}
        <div className="absolute top-20 right-20 w-2 h-2 bg-primary/40 rounded-full animate-float will-change-transform" style={{ animationDuration: '3s' }} />
        <div className="absolute top-40 left-1/4 w-3 h-3 bg-accent-foreground/30 rounded-full animate-float will-change-transform" style={{ animationDuration: '4s', animationDelay: '0.5s' }} />
        <div className="absolute bottom-32 right-1/3 w-2 h-2 bg-primary/50 rounded-full animate-float will-change-transform" style={{ animationDuration: '3.5s', animationDelay: '1s' }} />
      </div>

      {/* Header */}
      <header className="relative z-10 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent-foreground flex items-center justify-center shadow-lg transition-transform duration-300 ease-out group-hover:scale-110 group-hover:rotate-3">
              <Shield className="w-6 h-6 text-primary-foreground transition-transform duration-300 ease-out" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight transition-colors duration-300">
                Secure Share
              </h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1 transition-colors duration-300">
                <Zap className="w-3 h-3" /> Fast & Fun P2P File Sharing
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 pb-8">
        {!isConnected ? (
          <ConnectionPanel onConnected={() => setIsConnected(true)} />
        ) : (
          <TransferPanel onDisconnect={() => setIsConnected(false)} />
        )}
      </main>

      {/* WiFi Disclaimer */}
      <div className="relative z-10 px-6 pb-2">
        <div className="glass rounded-xl p-3 max-w-md mx-auto flex items-center gap-3 border border-warning/30 bg-warning/5">
          <div className="w-8 h-8 rounded-lg bg-warning/20 flex items-center justify-center flex-shrink-0">
            <Wifi className="w-4 h-4 text-warning" />
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Important:</span> Both devices must be connected to the <span className="text-warning font-medium">same WiFi network</span> for file sharing to work.
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 p-4 text-center">
        <p className="text-xs text-muted-foreground">
          Files are transferred directly between devices using WebRTC.
          <br />
          No data is stored on any server. 🔒
        </p>
      </footer>
    </div>
  );
};

export default Index;
