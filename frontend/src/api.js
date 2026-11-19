import { io } from 'socket.io-client';

export const API_URL = 'http://localhost:4000';
export const socket = io(API_URL);

export async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('bolido_token');
  const headers = { ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error en la petición');
  return data;
}

export function notificarPushLocal(titulo, cuerpo) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(titulo, { body: cuerpo });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') new Notification(titulo, { body: cuerpo });
    });
  }
}
