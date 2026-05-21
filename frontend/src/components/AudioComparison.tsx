import { Volume2 } from "lucide-react";

interface Props {
  originalUrl: string;
}

export default function AudioComparison({ originalUrl }: Props) {
  return (
    <div className="bg-dark-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
        <Volume2 className="w-4 h-4" />
        Original Audio
      </div>
      <audio controls className="w-full" src={originalUrl}>
        Your browser does not support the audio element.
      </audio>
    </div>
  );
}
