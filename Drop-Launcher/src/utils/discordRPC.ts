import { invoke } from '@tauri-apps/api/core';
import t from './i18n';

const DROP_ASSET_BASE = 'https://pub-b3ee689799f143a7968146e63124b471.r2.dev';
const DROP_LOGO_URL = `${DROP_ASSET_BASE}/DropLogo.png`;
const DROP_DISCORD_URL = 'https://discord.gg/dropfn';

const loggedInAsText = (username?: string): string => {
  if (!username) return t('loggedInAs');
  return `${t('loggedInAs')} ${username}`;
};

const buildDiscordActivity = (config: {
  details: string;
  state: string;
  largeText: string;
  userAvatarUrl?: string;
  username?: string;
  smallText?: string;
  largeImage?: string;
  startTimestamp?: number;
  endTimestamp?: number;
}) => ({
  details: config.details,
  state: config.state,
  large_image: config.largeImage || DROP_LOGO_URL,
  large_text: config.largeText,
  small_image: config.userAvatarUrl || undefined,
  small_text: config.smallText || config.username ? loggedInAsText(config.username) : undefined,
  start_timestamp: config.startTimestamp ?? Math.floor(Date.now() / 1000),
  end_timestamp: config.endTimestamp,
  buttons: [
    {
      label: 'Drop',
      url: DROP_DISCORD_URL,
    },
  ],
});

export const discordRPC = {
  async init(clientId: string = '1486280903473893478') {
    try {
      await invoke('discord_rpc_init', { clientId });
      console.log('Discord RPC initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize Discord RPC:', error);
      return false;
    }
  },

  async setLauncherActivity(userAvatarUrl?: string, username?: string) {
    try {
      await invoke('discord_rpc_set_activity', {
        activity: buildDiscordActivity({
          details: loggedInAsText(username),
          state: t('inLauncher'),
          largeText: 'Drop Launcher',
          userAvatarUrl,
          username,
        }),
      });
    } catch (error) {
      console.error('Failed to set Launcher activity:', error);
    }
  },

  async setLibraryActivity(userAvatarUrl?: string, username?: string) {
    try {
      await invoke('discord_rpc_set_activity', {
        activity: buildDiscordActivity({
          details: loggedInAsText(username),
          state: t('library'),
          largeText: 'Drop Library',
          userAvatarUrl,
          username,
        }),
      });
    } catch (error) {
      console.error('Failed to set Library activity:', error);
    }
  },

  async setPlayingActivity(version: string, userAvatarUrl?: string, username?: string) {
    try {
      const playingState = t('playing') ? `${t('playing')} ${version}` : `Playing ${version}`;
      await invoke('discord_rpc_set_activity', {
        activity: buildDiscordActivity({
          details: loggedInAsText(username),
          state: playingState,
          largeText: 'Playing Drop',
          userAvatarUrl,
          username,
        }),
      });
    } catch (error) {
      console.error('Failed to set playing activity:', error);
    }
  },

  async setShopActivity(userAvatarUrl?: string, username?: string) {
    try {
      await invoke('discord_rpc_set_activity', {
        activity: buildDiscordActivity({
          details: loggedInAsText(username),
          state: t('browsingItemShop'),
          largeText: 'Drop Shop',
          userAvatarUrl,
          username,
        }),
      });
    } catch (error) {
      console.error('Failed to set shop activity:', error);
    }
  },

  async setSettingsActivity(userAvatarUrl?: string, username?: string) {
    try {
      await invoke('discord_rpc_set_activity', {
        activity: buildDiscordActivity({
          details: loggedInAsText(username),
          state: t('configuringSettings'),
          largeText: 'Drop Settings',
          userAvatarUrl,
          username,
        }),
      });
    } catch (error) {
      console.error('Failed to set settings activity:', error);
    }
  },

  async setListeningActivity(
    userAvatarUrl?: string,
    username?: string,
    albumCover?: string,
    songName?: string,
    songInformation?: string,
    duration?: number,
  ) {
    try {
      const startTime = Math.floor(Date.now() / 1000);
      const endTime = duration ? startTime + duration : undefined;

      await invoke('discord_rpc_set_activity', {
        activity: buildDiscordActivity({
          details: songName || t('music'),
          state: songInformation || t('music'),
          largeText: songName || 'Drop Music',
          largeImage: albumCover || DROP_LOGO_URL,
          userAvatarUrl,
          username,
          smallText: loggedInAsText(username),
          startTimestamp: startTime,
          endTimestamp: endTime,
        }),
      });
    } catch (error) {
      console.error('Failed to set Listening activity:', error);
    }
  },

  async setHome(userAvatarUrl?: string, username?: string) {
    try {
      await invoke('discord_rpc_set_activity', {
        activity: buildDiscordActivity({
          details: loggedInAsText(username),
          state: t('home'),
          largeText: 'Drop Home',
          userAvatarUrl,
          username,
        }),
      });
    } catch (error) {
      console.error('Failed to set home activity:', error);
    }
  },

  async clearActivity() {
    try {
      await invoke('discord_rpc_clear_activity');
    } catch (error) {
      console.error('Failed to clear activity:', error);
    }
  },

  async disconnect() {
    try {
      await invoke('discord_rpc_disconnect');
    } catch (error) {
      console.error('Failed to disconnect Discord RPC:', error);
    }
  },
};
