import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import t from '../utils/i18n';

interface Props {
  user: any;
}

export default function Feedback({ user }: Props) {
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);

  const sendFeedback = async () => {
    const trimmed = feedbackText.trim();
    if (!trimmed) {
      setFeedbackStatus(t('feedbackEmpty'));
      return;
    }

    setFeedbackSending(true);
    setFeedbackStatus(null);

    try {
      await invoke('send_feedback', {
        feedback: trimmed,
        username: user?.username || 'Anonymous'
      });
      setFeedbackText('');
      setFeedbackStatus(t('feedbackSuccess'));
    } catch (err) {
      console.error('sendFeedback failed', err);
      setFeedbackStatus(`${t('feedbackFailed')}: ${String(err)}`);
    } finally {
      setFeedbackSending(false);
    }
  };

  return (
    <div className="p-6 relative z-20 pointer-events-auto">
      <h2 className="text-white text-2xl font-bold mb-4">{t('feedback')}</h2>
      <div className="bg-[#111] p-6 rounded-lg max-w-3xl">
        <h3 className="text-lg font-semibold text-white mb-2">{t('feedbackTitle')}</h3>
        <p className="text-white/60 text-sm mb-4">{t('feedbackDescription')}</p>
        <textarea
          value={feedbackText}
          onChange={(e) => setFeedbackText(e.target.value)}
          placeholder={t('feedbackPlaceholder')}
          className="w-full p-3 rounded bg-black/40 text-white min-h-[140px] mb-3 resize-vertical"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={sendFeedback}
            disabled={feedbackSending}
            className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
          >
            {feedbackSending ? t('feedbackSending') : t('feedbackSend')}
          </button>
          {feedbackStatus && (
            <div className="text-sm text-white/80">{feedbackStatus}</div>
          )}
        </div>
      </div>
    </div>
  );
}
