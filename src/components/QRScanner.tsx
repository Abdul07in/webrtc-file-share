import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { X, Camera, CameraOff } from 'lucide-react';

interface QRScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

export function QRScanner({ onScan, onClose }: QRScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;

    const startScanner = async () => {
      try {
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            // Extract PIN from QR data (format: p2p:123456)
            const match = decodedText.match(/p2p:(\d{6})/);
            if (match) {
              onScan(match[1]);
            } else if (/^\d{6}$/.test(decodedText)) {
              // Also accept plain 6-digit PIN
              onScan(decodedText);
            }
          },
          () => {} // Ignore scan failures
        );
        setIsStarting(false);
      } catch (err: any) {
        console.error('Failed to start scanner:', err);
        setError(err?.message || 'Camera access denied');
        setIsStarting(false);
      }
    };

    startScanner();

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Scan QR Code</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {error ? (
          <div className="glass rounded-2xl p-8 text-center">
            <CameraOff className="w-12 h-12 mx-auto mb-4 text-destructive" />
            <p className="text-foreground mb-2">Camera Error</p>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button onClick={onClose} variant="secondary">
              Close
            </Button>
          </div>
        ) : (
          <div className="relative">
            <div
              id="qr-reader"
              ref={containerRef}
              className="rounded-2xl overflow-hidden bg-black"
            />
            {isStarting && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl">
                <div className="text-center">
                  <Camera className="w-8 h-8 mx-auto mb-2 text-primary animate-pulse" />
                  <p className="text-sm text-white">Starting camera...</p>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center mt-4">
          Point your camera at a QR code to connect
        </p>
      </div>
    </div>
  );
}
