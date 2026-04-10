import { CapacitorHttp, Capacitor } from '@capacitor/core';
import { TelegramMessage } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { fetchWithProxy } from '../utils/proxy';

export const fetchTelegramChannelInfo = async (channelUsername: string): Promise<{ name: string; imageUrl?: string }> => {
  try {
    let htmlData: string;
    
    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.get({
        url: `https://t.me/s/${channelUsername}`,
      });
      if (response.status !== 200) {
        throw new Error('Channel not found');
      }
      htmlData = response.data;
    } else {
      htmlData = await fetchWithProxy(`https://t.me/s/${channelUsername}`, false);
    }

    if (!htmlData) {
      throw new Error('No data received from Telegram');
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlData, 'text/html');
    
    const name = doc.querySelector('.tgme_channel_info_header_title')?.textContent?.trim() || channelUsername;
    const imageUrl = doc.querySelector('.tgme_page_photo_image img')?.getAttribute('src') || 
                     doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || undefined;

    return { name, imageUrl };
  } catch (error) {
    console.error('Error fetching Telegram channel info:', error);
    return { name: channelUsername };
  }
};

export const fetchTelegramMessages = async (channelUsername: string): Promise<TelegramMessage[]> => {
  try {
    let htmlData: string;
    
    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.get({
        url: `https://t.me/s/${channelUsername}`,
      });
      if (response.status !== 200) {
        throw new Error('Channel not found');
      }
      htmlData = response.data;
    } else {
      // Use proxy for web preview to avoid CORS
      htmlData = await fetchWithProxy(`https://t.me/s/${channelUsername}`, false);
    }

    if (!htmlData) {
      throw new Error('No data received from Telegram');
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlData, 'text/html');
    const messages: TelegramMessage[] = [];

    const messageElements = doc.querySelectorAll('.tgme_widget_message_wrap');
    
    messageElements.forEach((el) => {
      const id = el.querySelector('.tgme_widget_message')?.getAttribute('data-post') || uuidv4();
      const text = el.querySelector('.tgme_widget_message_text')?.textContent || '';
      const dateStr = el.querySelector('time')?.getAttribute('datetime');
      const date = dateStr ? new Date(dateStr).getTime() : Date.now();
      const imageUrl = el.querySelector('.tgme_widget_message_photo_wrap')?.getAttribute('style')?.match(/url\('(.*)'\)/)?.[1];

      messages.push({
        id,
        channelId: channelUsername,
        text,
        date,
        imageUrl,
      });
    });

    return messages;
  } catch (error) {
    console.error('Error fetching Telegram messages:', error);
    throw error;
  }
};
