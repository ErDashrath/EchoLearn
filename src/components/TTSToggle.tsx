import { ttsService } from '../lib/tts-service';

interface TTSToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export function TTSToggle({ enabled, onToggle }: TTSToggleProps) {
  const handleToggle = () => {
    const newState = !enabled;
    ttsService.setEnabled(newState);
    onToggle(newState);
  };

  return (
    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg border">
      <div className="flex items-center">
        <input
          type="checkbox"
          id="tts-toggle"
          checked={enabled}
          onChange={handleToggle}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
        />
        <label htmlFor="tts-toggle" className="ml-2 text-sm font-medium text-gray-700">
          Voice Output
        </label>
      </div>
      <div className="flex items-center text-gray-500">
        {enabled ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 14.142M9 12a3 3 0 006 0 3 3 0 00-6 0z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
        )}
      </div>
      <span className="text-xs text-gray-500">
        {enabled ? 'AI responses will be spoken aloud' : 'Voice output disabled'}
      </span>
    </div>
  );
}
