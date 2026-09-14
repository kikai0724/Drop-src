import React, { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import t from '../utils/i18n';

// Vite (and Tauri) don't expose `process.env` in the renderer. Use import.meta.env.
const BACKEND = ((import.meta as any).env?.VITE_BACKEND_URL as string) || '';
const DM_BACKEND = ((import.meta as any).env?.VITE_DM_BACKEND_URL as string) || '';

const getDiscordAvatarUrl = (discordId: string | null, avatarHash: string | null) => {
  if (!discordId || !avatarHash) return null;
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.png?size=1024`;
};

const extractAvatarFromPayload = (payload: any): string => {
  if (typeof payload === 'string') {
    return payload.trim();
  }

  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const candidateKeys = ['avatarUrl', 'avatar_url', 'avatar', 'userAvatar', 'useravatar', 'useravater', 'userAvatarUrl', 'useravatarurl', 'profileImage', 'profile_image', 'imageUrl', 'image_url', 'url'];
  for (const key of candidateKeys) {
    const value = (payload as Record<string, unknown>)[key];
    const normalized = extractAvatarFromPayload(value);
    if (normalized) return normalized;
  }

  if (payload.data) {
    const nested = extractAvatarFromPayload(payload.data);
    if (nested) return nested;
  }

  return '';
};

const getFriendAvatarUrl = (person: any, avatarCache?: Record<string, string | null>) => {
  const explicitAvatar = person?.avatarUrl || person?.avatar_url || person?.avatar || person?.profileImage || person?.profile_image || person?.imageUrl || person?.image_url || null;
  if (explicitAvatar) return explicitAvatar;
  if (person?.username && avatarCache && avatarCache[person.username] !== undefined) {
    return avatarCache[person.username];
  }
  return getDiscordAvatarUrl(person?.discordId, person?.avatarHash);
};

const invokeProxy = async (method: string, path: string, query?: string, body?: any) => {
  try {
    return await invoke('backend_proxy', { method, path, query, body });
  } catch (e) {
    if (!BACKEND) {
      throw new Error('Backend endpoint is not configured.');
    }
    console.warn('backend_proxy failed, falling back to direct fetch', e);
    const url = `${BACKEND}${path}${query ? `?${query}` : ''}`;
    if (method === 'GET') {
      const res = await fetch(url);
      return await res.json();
    }
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return await res.json();
  }
};

const invokeDm = async (method: string, path: string, query?: string, body?: any) => {
  if (!DM_BACKEND) {
    throw new Error('DM backend endpoint is not configured.');
  }
  const url = `${DM_BACKEND}${path}${query ? `?${query}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : (body ? JSON.stringify(body) : undefined),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error || `DM server error (${res.status})`);
  }
  return await res.json();
};

type DmMessage = {
  id: string;
  senderId: string;
  body: string;
  createdAt: number;
};

export default function Friends({ user }: { user: any }) {
  const [accepted, setAccepted] = useState<any[]>([]);
  const [incoming, setIncoming] = useState<any[]>([]);
  const [outgoing, setOutgoing] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [targetUsername, setTargetUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = React.useRef<number | null>(null);
  const [avatarCache, setAvatarCache] = useState<Record<string, string | null>>({});

  const [view, setView] = useState<'list' | 'dm'>('list');
  const [dmTarget, setDmTarget] = useState<any | null>(null);
  const [dmThreads, setDmThreads] = useState<Record<string, DmMessage[]>>({});
  const [dmDraft, setDmDraft] = useState('');
  const [dmLoading, setDmLoading] = useState(false);
  const [dmError, setDmError] = useState<string | null>(null);
  const dmScrollRef = useRef<HTMLDivElement | null>(null);
  const dmPollRef = useRef<number | null>(null);
  const myAccountIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (user?.accountId) {
      myAccountIdRef.current = user.accountId;
    }
  }, [user]);

  const showToast = (message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3000);
  };

  const fetchFriendAvatar = async (username: string) => {
    if (!username) return null;
    if (avatarCache[username] !== undefined) return avatarCache[username];

    try {
      const path = '/api/account/friendavater';
      const query = `username=${encodeURIComponent(username)}`;
      const response = await invokeProxy('GET', path, query);
      const avatarUrl = extractAvatarFromPayload(response);
      if (avatarUrl) {
        setAvatarCache((prev) => ({ ...prev, [username]: avatarUrl }));
        return avatarUrl;
      }
    } catch (e) {
      console.warn(`failed to fetch friend avatar for ${username}`, e);
    }

    return null;
  };

  const loadFriendAvatars = async (friends: any[]) => {
    const usernames = Array.from(new Set((friends || []).map((friend) => friend?.username).filter(Boolean) as string[]));
    if (!user || !usernames.length) return;

    const missingUsernames = usernames.filter((username) => avatarCache[username] === undefined);
    if (!missingUsernames.length) return;

    await Promise.all(
      missingUsernames.map(async (username) => {
        await fetchFriendAvatar(username);
      })
    );
  };

  const fetchFriends = async () => {
    if (!user) return;
    if (!BACKEND) {
      setAccepted([]);
      setIncoming([]);
      setOutgoing([]);
      setError(null);
      setLoading(false);
      initialLoadedRef.current = true;
      return;
    }
    // Only show the global loading indicator for the very first fetch to avoid UI flicker on polls
    if (!initialLoadedRef.current) setLoading(true);
    try {
      const path = `/api/launcher/friends`;
      const query = `email=${encodeURIComponent(user.email)}&password=${encodeURIComponent(user.password)}`;
      console.debug('fetchFriends -> backend_proxy GET', path, query);
      const data = await invokeProxy('GET', path, query);
      const nextAccepted = data.accepted || [];
      const nextIncoming = data.incoming || [];
      const nextOutgoing = data.outgoing || [];
      setAccepted(nextAccepted);
      setIncoming(nextIncoming);
      setOutgoing(nextOutgoing);
      setError(null);
      await loadFriendAvatars([...nextAccepted, ...nextIncoming, ...nextOutgoing]);
    } catch (e: any) {
      console.error('fetchFriends failed for user', user?.email, e);
      setAccepted([]);
      setIncoming([]);
      setOutgoing([]);
      setError(null);
    } finally {
      setLoading(false);
      initialLoadedRef.current = true;
    }
  };

  const initialLoadedRef = useRef(false);

  useEffect(() => {
    let timer: number | null = null;
    if (user) {
      // reset initial flag when user changes so initial loading shows again
      initialLoadedRef.current = false;
      // initial fetch
      fetchFriends();
      // poll every 5 seconds
      timer = window.setInterval(fetchFriends, 5000);
    }
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [user]);

  const sendRequest = async () => {
    setError(null);
    try {
      const path = `/api/launcher/friends/add`;
      console.debug('sendRequest -> backend_proxy POST', path, targetUsername);
      await invokeProxy('POST', path, undefined, { email: user.email, password: user.password, username: targetUsername });
      showToast(`${targetUsername || 'User'} ${t('friendRequestSent')}`);
      await fetchFriends();
      setTargetUsername('');
    } catch (e: any) {
      console.error('sendRequest failed', e);
      setError(`Failed to send request: ${e?.message || String(e)}`);
    }
  };

  const acceptRequest = async (accountId: string) => {
    setError(null);
    try {
      const path = `/api/launcher/friends/accept`;
      console.debug('acceptRequest -> backend_proxy POST', path, accountId);
      await invokeProxy('POST', path, undefined, { email: user.email, password: user.password, accountId });
      await fetchFriends();
    } catch (e: any) {
      console.error('acceptRequest failed', e);
      setError(`Failed to accept request: ${e?.message || String(e)}`);
    }
  };

  const removeFriend = async (accountId: string, username: string, isRequest?: boolean) => {
    setError(null);
    try {
      const path = `/api/launcher/friends/remove`;
      console.debug('removeFriend -> backend_proxy POST', path, accountId);
      await invokeProxy('POST', path, undefined, { email: user.email, password: user.password, accountId });
      showToast(`${username} was ${isRequest ? 'canceled' : 'removed from Friends'}!`);
      await fetchFriends();
    } catch (e: any) {
      console.error('removeFriend failed', e);
      setError(`Failed to remove friend: ${e?.message || String(e)}`);
    }
  };

  const fetchDmMessages = async (accountId: string, showLoadingState: boolean) => {
    if (!user) return;
    if (showLoadingState) setDmLoading(true);
    try {
      const query = `email=${encodeURIComponent(user.email)}&password=${encodeURIComponent(user.password)}&accountId=${encodeURIComponent(accountId)}`;
      const data: DmMessage[] = await invokeDm('GET', '/api/launcher/dm/messages', query);
      setDmThreads((prev) => ({ ...prev, [accountId]: data }));
      setDmError(null);
    } catch (e: any) {
      console.error('fetchDmMessages failed', e);
      setDmError(`${e?.message || String(e)}`);
    } finally {
      if (showLoadingState) setDmLoading(false);
    }
  };

  const openDm = (friend: any) => {
    setDmTarget(friend);
    setView('dm');
    setDmError(null);
    fetchDmMessages(friend.accountId, true);

    if (dmPollRef.current) window.clearInterval(dmPollRef.current);
    dmPollRef.current = window.setInterval(() => {
      fetchDmMessages(friend.accountId, false);
    }, 5000);
  };

  const closeDm = () => {
    if (dmPollRef.current) {
      window.clearInterval(dmPollRef.current);
      dmPollRef.current = null;
    }
    setView('list');
    setDmTarget(null);
    setDmDraft('');
    setDmError(null);
  };

  useEffect(() => {
    return () => {
      if (dmPollRef.current) window.clearInterval(dmPollRef.current);
    };
  }, []);

  const sendDmMessage = async () => {
    const text = dmDraft.trim();
    if (!text || !dmTarget || !user) return;
    const accountId = dmTarget.accountId;
    setDmDraft('');
    setDmError(null);
    try {
      const sent: DmMessage = await invokeDm('POST', '/api/launcher/dm/send', undefined, {
        email: user.email,
        password: user.password,
        accountId,
        body: text,
      });
      if (!myAccountIdRef.current) {
        myAccountIdRef.current = sent.senderId;
      }
      setDmThreads((prev) => ({
        ...prev,
        [accountId]: [...(prev[accountId] || []), sent],
      }));
    } catch (e: any) {
      console.error('sendDmMessage failed', e);
      setDmError(`${t('failedToSendMessage') || 'メッセージの送信に失敗しました'}: ${e?.message || String(e)}`);
      setDmDraft(text);
    }
  };

  const handleDmKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendDmMessage();
    }
  };

  useEffect(() => {
    if (view === 'dm' && dmScrollRef.current) {
      dmScrollRef.current.scrollTop = dmScrollRef.current.scrollHeight;
    }
  }, [view, dmTarget, dmThreads]);

  const dmMessages = dmTarget ? dmThreads[dmTarget.accountId] || [] : [];
  const dmAvatarUrl = dmTarget ? getFriendAvatarUrl(dmTarget, avatarCache) : null;
  const myAccountId = myAccountIdRef.current;

  if (view === 'dm' && dmTarget) {
    return (
      <div className="p-6 relative z-20 pointer-events-auto">
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={closeDm}
            className="pointer-events-auto relative z-20 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded text-white text-sm"
          >
            ← {t('back') || '戻る'}
          </button>
          <div className="flex items-center gap-2">
            {dmAvatarUrl ? (
              <img src={dmAvatarUrl} alt="avatar" className="w-8 h-8 rounded-full border border-white/10" />
            ) : (
              <img src="/assets/default-avatar.svg" alt="default avatar" className="w-8 h-8 rounded-full bg-white/10 object-cover" />
            )}
            <h2 className="text-white text-xl font-bold">{dmTarget.username}</h2>
          </div>
        </div>

        {dmError && <div className="bg-red-600 text-white p-2 rounded mb-4 text-sm">{dmError}</div>}

        <div className="bg-[#111] rounded flex flex-col h-[60vh] max-h-[72vh]">
          <div ref={dmScrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
            {dmLoading ? (
              <p className="text-white/40 text-sm text-center mt-8">読み込み中...</p>
            ) : dmMessages.length === 0 ? (
              <p className="text-white/40 text-sm text-center mt-8">{dmTarget.username} とのDMを始めましょう</p>
            ) : (
              dmMessages.map((m) => {
                const fromMe = myAccountId ? m.senderId === myAccountId : m.senderId !== dmTarget.accountId;
                return (
                  <div key={m.id} className={`max-w-[70%] px-3 py-2 rounded-lg text-sm ${fromMe ? 'self-end bg-blue-600 text-white' : 'self-start bg-white/10 text-white/90'}`}>
                    {m.body}
                  </div>
                );
              })
            )}
          </div>
          <div className="flex gap-2 p-3 border-t border-white/[0.06]">
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={dmDraft}
              onChange={(e) => setDmDraft(e.target.value)}
              onKeyDown={handleDmKeyDown}
              className="relative z-10 pointer-events-auto p-2 rounded bg-black/40 text-white flex-grow"
              placeholder="メッセージを入力"
            />
            <button
              type="button"
              onClick={sendDmMessage}
              className="pointer-events-auto relative z-20 px-4 py-2 bg-blue-600 rounded text-white"
            >
              {t('send')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 relative z-20 pointer-events-auto">
      <h2 className="text-white text-2xl font-bold mb-4">{t('friends')}</h2>
      <div className="mb-4">
        <label className="text-white/70">{t('addFriend')}</label>
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            name="friendUsername"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            tabIndex={0}
            value={targetUsername}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setTargetUsername(e.target.value)}
            className="relative z-10 pointer-events-auto p-2 rounded bg-[#111] text-white flex-grow"
            placeholder={t('enterUsername')}
          />
          <button type="button" onClick={sendRequest} className="pointer-events-auto relative z-20 px-4 py-2 bg-blue-600 rounded text-white">{t('send')}</button>
        </div>
      </div>

      {error && <div className="bg-red-600 text-white p-2 rounded mb-4">{error}</div>}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 max-w-xs rounded-xl bg-white/10 border border-white/20 p-4 text-sm text-white backdrop-blur-md shadow-lg">
          <strong className="block text-white font-semibold">送信完了</strong>
          <p className="mt-1 text-white/80">{toastMessage}</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#111] p-4 rounded">
          <h3 className="text-white font-bold mb-2">{t('friends')}</h3>
          {loading ? <p className="text-white/60">Loading...</p> : (
            accepted.length ? accepted.map(a=> {
              const avatarUrl = getFriendAvatarUrl(a, avatarCache);
              return (
                <div key={a.accountId} className="flex items-center justify-between text-white/80 py-3 border-b border-white/[0.03]">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="avatar" className="w-10 h-10 rounded-full border border-white/10" />
                      ) : (
                        <img src="/assets/default-avatar.svg" alt="default avatar" className="w-10 h-10 rounded-full bg-white/10 object-cover" />
                      )}
                      {a.online && (
                        <span className="absolute right-0 bottom-0 w-3 h-3 rounded-full border-2 border-[#0f0f0f] bg-green-500" />
                      )}
                    </div>
                    <div>
                      <div className="text-white">{a.username}</div>
                      <div className="text-xs text-white/60">{a.status ? a.status : (a.online ? 'Online' : 'Offline')}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={()=>openDm(a)} className="pointer-events-auto relative z-20 px-2 py-1 bg-blue-600 rounded text-white text-xs">DM</button>
                    <button type="button" onClick={()=>removeFriend(a.accountId, a.username)} className="pointer-events-auto relative z-20 px-2 py-1 bg-red-600 rounded text-white text-xs">{t('remove')}</button>
                  </div>
                </div>
              );
            }) : <p className="text-white/60">No accepted friends.</p>
          )}
        </div>
        <div className="bg-[#111] p-4 rounded">
          <h3 className="text-white font-bold mb-2">{t('incoming')}</h3>
          {loading ? <p className="text-white/60">Loading...</p> : (
            incoming.length ? incoming.map(i=> {
              const avatarUrl = getFriendAvatarUrl(i, avatarCache);
              return (
                <div key={i.accountId} className="flex items-center justify-between py-3 border-b border-white/[0.03]">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="avatar" className="w-10 h-10 rounded-full border border-white/10" />
                      ) : (
                        <img src="/assets/default-avatar.svg" alt="default avatar" className="w-10 h-10 rounded-full bg-white/10 object-cover" />
                      )}
                      {i.online && (
                        <span className="absolute right-0 bottom-0 w-3 h-3 rounded-full border-2 border-[#0f0f0f] bg-green-500" />
                      )}
                    </div>
                    <div>
                      <div className="text-white">{i.username}</div>
                      <div className="text-xs text-white/60">{i.status ? i.status : (i.online ? 'Online' : 'Offline')}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={()=>acceptRequest(i.accountId)} className="pointer-events-auto relative z-20 px-3 py-1 bg-green-600 rounded text-white">Accept</button>
                    <button type="button" onClick={()=>removeFriend(i.accountId, i.username, true)} className="pointer-events-auto relative z-20 px-3 py-1 bg-red-600 rounded text-white">Cancel</button>
                  </div>
                </div>
              );
            }) : <p className="text-white/60">No incoming requests.</p>
          )}
        </div>
        <div className="bg-[#111] p-4 rounded">
          <h3 className="text-white font-bold mb-2">Sent Requests</h3>
          {loading ? <p className="text-white/60">Loading...</p> : (
            outgoing.length ? outgoing.map(o=> {
              const avatarUrl = getFriendAvatarUrl(o, avatarCache);
              return (
                <div key={o.accountId} className="flex items-center justify-between text-white/80 py-3 border-b border-white/[0.03]">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="avatar" className="w-10 h-10 rounded-full border border-white/10" />
                      ) : (
                        <img src="/assets/default-avatar.svg" alt="default avatar" className="w-10 h-10 rounded-full bg-white/10 object-cover" />
                      )}
                      {o.online && (
                        <span className="absolute right-0 bottom-0 w-3 h-3 rounded-full border-2 border-[#0f0f0f] bg-green-500" />
                      )}
                    </div>
                    <div>
                      <div className="text-white">{o.username}</div>
                      <div className="text-xs text-white/60">{o.status ? o.status : (o.online ? 'Online' : 'Offline')}</div>
                    </div>
                  </div>
                  <button type="button" onClick={()=>removeFriend(o.accountId, o.username, true)} className="pointer-events-auto relative z-20 px-2 py-1 bg-red-600 rounded text-white text-xs">Cancel</button>
                </div>
              );
            }) : <p className="text-white/60">No outgoing requests.</p>
          )}
        </div>
      </div>
    </div>
  );
}