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
    
    const name = doc.querySelector('.tgme_channel_info_header_title')?.textContent?.trim();
    if (!name) {
      throw new Error('Canale non trovato');
    }
    const imageUrl = doc.querySelector('.tgme_page_photo_image img')?.getAttribute('src') || 
                     doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || undefined;

    return { name, imageUrl };
  } catch (error) {
    console.error('Error fetching Telegram channel info:', error);
    throw error;
  }
};

export const fetchTelegramMessages = async (channelUsername: string, sinceDate?: number): Promise<TelegramMessage[]> => {
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

    if (!htmlData || htmlData.includes('tgme_page_error') || htmlData.includes('Channel not found')) {
      throw new Error('Channel not found or unavailable');
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlData, 'text/html');
    const messages: TelegramMessage[] = [];

    const messageElements = doc.querySelectorAll('.tgme_widget_message_wrap, .tgme_widget_message');
    
    messageElements.forEach((el) => {
      // Skip if it's a service message or doesn't have a date
      const dateEl = el.querySelector('time, .tgme_widget_message_date time');
      const dateStr = dateEl?.getAttribute('datetime');
      if (!dateStr) return;
      
      const date = new Date(dateStr).getTime();
      
      if (sinceDate && date <= sinceDate) return;

      const id = el.querySelector('.tgme_widget_message')?.getAttribute('data-post') || 
                 el.getAttribute('data-post') || 
                 uuidv4();
                 
      const textEl = el.querySelector('.tgme_widget_message_text, .js-message_text');
      const text = textEl ? textEl.innerHTML : ''; 
      
      // Improved image URL parsing
      let imageUrl = undefined;
      const photoWrap = el.querySelector('.tgme_widget_message_photo_wrap, .tgme_widget_message_video_player');
      if (photoWrap) {
        const style = photoWrap.getAttribute('style');
        if (style) {
          const match = style.match(/url\(['"]?(.*?)['"]?\)/);
          if (match) imageUrl = match[1];
        }
      }

      if (!imageUrl) {
        // Try video thumbnail
        const videoWrap = el.querySelector('.tgme_widget_message_video_wrap');
        if (videoWrap) {
          const style = videoWrap.getAttribute('style');
          if (style) {
            const match = style.match(/url\(['"]?(.*?)['"]?\)/);
            if (match) imageUrl = match[1];
          }
        }
      }

      messages.push({
        id,
        channelId: channelUsername,
        text: text || '',
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
