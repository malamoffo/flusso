import React, { useState, useEffect, memo } from 'react';
import { Sun, Cloud, CloudRain, CloudLightning, CloudSnow, CloudFog, Wind } from 'lucide-react';
import { fetchWithProxy } from '../utils/proxy';
import { Browser } from '@capacitor/browser';

interface WeatherData {
  temp: number;
  condition: string;
  lat: number;
  lon: number;
}

const WeatherWidget = memo(({ loading, weather }: { loading: boolean, weather: WeatherData | null }) => {
  const getWeatherIcon = (condition: string) => {
    switch (condition) {
      case 'clear': return <Sun className="w-4 h-4 text-amber-500" />;
      case 'cloudy': return <Cloud className="w-4 h-4 text-gray-400" />;
      case 'fog': return <CloudFog className="w-4 h-4 text-gray-300" />;
      case 'rain': return <CloudRain className="w-4 h-4 text-blue-400" />;
      case 'snow': return <CloudSnow className="w-4 h-4 text-blue-200" />;
      case 'thunderstorm': return <CloudLightning className="w-4 h-4 text-yellow-500" />;
      default: return <Sun className="w-4 h-4 text-amber-500" />;
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <span className="opacity-50">...</span>
      </div>
    );
  }

  if (!weather) return null;

  const handleClick = async () => {
    // Open Meteo forecast page URL structure: https://open-meteo.com/en/forecast?latitude=41.90&longitude=12.50
    const url = `https://open-meteo.com/en/forecast?latitude=${weather.lat.toFixed(2)}&longitude=${weather.lon.toFixed(2)}`;
    try {
      await Browser.open({ url });
    } catch (err) {
      console.error('Failed to open weather link:', err);
      window.open(url, '_blank');
    }
  };

  return (
    <div 
      className="flex items-center gap-1.5 cursor-pointer hover:text-gray-700 transition-colors"
      onClick={handleClick}
      title="Vedi previsioni meteo"
    >
      {getWeatherIcon(weather.condition)}
      <span>{weather.temp}°C</span>
    </div>
  );
});

export const HeaderWidgets = memo(function HeaderWidgets() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWeather = async (lat: number, lon: number) => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
        const text = await fetchWithProxy(url, false);
        if (!text) {
          console.log('Weather fetch returned empty (304 or no data)');
          return;
        }
        const data = JSON.parse(text);
        
        if (data.current_weather) {
          setWeather({
            temp: Math.round(data.current_weather.temperature),
            condition: getWeatherCondition(data.current_weather.weathercode),
            lat,
            lon
          });
        }
      } catch (error) {
        console.error('Failed to fetch weather:', error);
      } finally {
        setLoading(false);
      }
    };

    const handleGeolocation = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            fetchWeather(position.coords.latitude, position.coords.longitude);
          },
          (error) => {
            console.error('Geolocation error:', error);
            // Fallback to a default location (e.g., Rome) if user denies or it fails
            fetchWeather(41.9028, 12.4964);
          },
          { timeout: 10000 }
        );
      } else {
        // Fallback to Rome
        fetchWeather(41.9028, 12.4964);
      }
    };

    handleGeolocation();
  }, []);

  const getWeatherCondition = (code: number): string => {
    if (code === 0) return 'clear';
    if (code >= 1 && code <= 3) return 'cloudy';
    if (code >= 45 && code <= 48) return 'fog';
    if (code >= 51 && code <= 67) return 'rain';
    if (code >= 71 && code <= 77) return 'snow';
    if (code >= 80 && code <= 82) return 'rain';
    if (code >= 85 && code <= 86) return 'snow';
    if (code >= 95) return 'thunderstorm';
    return 'clear';
  };

  return (
    <div className="flex items-baseline gap-3 text-xl font-bold text-gray-500 tracking-tight">
      <WeatherWidget loading={loading} weather={weather} />
    </div>
  );
});
