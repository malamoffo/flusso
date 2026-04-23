import { CapacitorHttp, Capacitor } from '@capacitor/core';
import { TelegramMessage } from '../types';
import { fetchWithProxy } from '../utils/proxy';

export const fetchTelegramChannelInfo = async (channelUsername: string): Promise<{ name: string; imageUrl?: string }> => {
  try {
    let htmlData: string;
    
    // Always use proxy for Telegram to avoid CORS and regional blocks
    // and to ensure consistency across platforms
    const res = await fetchWithProxy(`https://t.me/s/${channelUsername}`, false);
    htmlData = res.data;

    if (!htmlData) {
      throw new Error('No data received from Telegram');
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlData, 'text/html');
    
    // DEBUG: Log the HTML content to see why images are missing
    // console.log('Telegram HTML Sample:', htmlData.substring(0, 1000));
    
    const name = doc.querySelector('.tgme_channel_info_header_title')?.textContent?.trim() || 
                 doc.querySelector('.tgme_page_title')?.textContent?.trim();
                 
    if (!name) {
      // Check if it's an error page
      if (htmlData.includes('tgme_page_error') || htmlData.includes('Channel not found')) {
        throw new Error('Canale non trovato o non accessibile pubblicamente');
      }
      throw new Error('Impossibile recuperare le informazioni del canale');
    }
    const imageUrl = doc.querySelector('.tgme_page_photo_image img')?.getAttribute('src') || 
                     doc.querySelector('.tgme_page_photo_image')?.getAttribute('src') ||
                     doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || undefined;

    return { name, imageUrl };
  } catch (error) {
    if (!Capacitor.isNativePlatform()) {
      return { name: channelUsername };
    }
    console.error('Error fetching Telegram channel info:', error);
    throw error;
  }
};

export const fetchTelegramMessages = async (channelUsername: string, sinceDate?: number, before?: string, channelId?: string): Promise<TelegramMessage[]> => {
  try {
    let htmlData: string;
    let url = `https://t.me/s/${channelUsername}`;
    if (before) {
      url += `?before=${before}`;
    }
    
    // Always use proxy for Telegram to avoid CORS and regional blocks
    // and to ensure consistency across platforms
    const res = await fetchWithProxy(url, false);
    htmlData = res.data;

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
                 crypto.randomUUID();
                 
      const textEl = el.querySelector('.tgme_widget_message_text, .js-message_text');
      const text = textEl ? textEl.innerHTML : ''; 
      
      // Improved image URL parsing
      let imageUrl = undefined;
      const photoWrap = el.querySelector('.tgme_widget_message_photo_wrap, .tgme_widget_message_video_player, .tgme_widget_message_roundvideo_player');
      if (photoWrap) {
        const style = photoWrap.getAttribute('style');
        if (style) {
          const match = style.match(/url\(['"]?(.*?)['"]?\)/);
          if (match) imageUrl = match[1];
        }
      }

      if (!imageUrl) {
        // Try background image directly on wrap or children
        const bgEl = el.querySelector('[style*="background-image"]');
        if (bgEl) {
          const style = bgEl.getAttribute('style');
          if (style) {
            const match = style.match(/url\(['"]?(.*?)['"]?\)/);
            if (match) imageUrl = match[1];
          }
        }
      }

      if (!imageUrl) {
        // Try video thumbnail
        const videoWrap = el.querySelector('.tgme_widget_message_video_wrap, .tgme_widget_message_roundvideo_wrap');
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
        channelId: channelId || channelUsername,
        text: text || '',
        date,
        imageUrl,
      });
    });

    return messages;
  } catch (error) {
    if (!Capacitor.isNativePlatform()) {
      console.warn(`[Telegram] Fetch failed for ${channelUsername}, generating mock messages for preview.`);
      return [{
        id: `${channelUsername}/mock-${crypto.randomUUID()}`,
        channelId: channelId || channelUsername,
        text: `Questo è un messaggio di test generato perché il caricamento di Telegram per @${channelUsername} è fallito o andato in timeout.`,
        date: Date.now(),
      }];
    }
    console.error('Error fetching Telegram messages:', error);
    throw error;
  }
};
