import { FileTransfer } from '@/lib/webrtc';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { File, Download, CheckCircle2, Loader2, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TransferListProps {
  transfers: FileTransfer[];
  direction: 'sending' | 'receiving';
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function TransferList({ transfers, direction }: TransferListProps) {
  if (transfers.length === 0) return null;

  const handleDownload = (transfer: FileTransfer) => {
    if (transfer.data) {
      const url = URL.createObjectURL(transfer.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = transfer.name;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {direction === 'sending' ? (
          <ArrowUpCircle className="w-4 h-4" />
        ) : (
          <ArrowDownCircle className="w-4 h-4" />
        )}
        <span>{direction === 'sending' ? 'Sending' : 'Receiving'}</span>
      </div>
      {transfers.map((transfer) => (
        <div
          key={transfer.id}
          className="glass rounded-xl p-4 flex items-center gap-4"
        >
          <div className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
            transfer.status === 'completed' ? "bg-success/20" : "bg-secondary"
          )}>
            {transfer.status === 'completed' ? (
              <CheckCircle2 className="w-5 h-5 text-success" />
            ) : transfer.status === 'transferring' ? (
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            ) : (
              <File className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {transfer.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(transfer.size)}
            </p>
            {transfer.status === 'transferring' && (
              <Progress value={transfer.progress} className="mt-2 h-1" />
            )}
          </div>
          {transfer.status === 'completed' && direction === 'receiving' && transfer.data && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => handleDownload(transfer)}
              className="shrink-0"
            >
              <Download className="w-4 h-4" />
            </Button>
          )}
          {transfer.status === 'transferring' && (
            <span className="text-xs text-primary font-mono">
              {transfer.progress}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
