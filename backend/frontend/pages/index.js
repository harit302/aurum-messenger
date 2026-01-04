import { useState, useEffect } from 'react';
import io from 'socket.io-client';

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const newSocket = io('http://localhost:4000');
    setSocket(newSocket);
    
    newSocket.emit('join', 'global');
    
    newSocket.on('message', (msg) => {
      setMessages(prev => [...prev, msg]);
    });
    
    return () => newSocket.close();
  }, []);

  const sendMessage = () => {
    if (text.trim() && socket) {
      socket.emit('message', {
        chatId: 'global',
        text,
        userId: 'user_' + Date.now()
      });
      setText('');
    }
  };

  return (
    <div style={{ 
      padding: 20, 
      fontFamily: 'Arial',
      maxWidth: 600,
      margin: '0 auto'
    }}>
      <h1>🚀 AURUM Messenger</h1>
      <div style={{
        background: '#f5f5f5',
        padding: 15,
        borderRadius: 10,
        height: 300,
        overflowY: 'auto',
        marginBottom: 15
      }}>
        {messages.length === 0 ? (
          <p style={{ color: '#888' }}>Нет сообщений...</p>
        ) : (
          messages.map((msg, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <strong>{msg.user?.login || 'Аноним'}:</strong> {msg.text}
            </div>
          ))
        )}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <input 
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Введите сообщение..."
          style={{
            flex: 1,
            padding: 10,
            border: '1px solid #ccc',
            borderRadius: 5
          }}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
        />
        <button 
          onClick={sendMessage}
          style={{
            padding: '10px 20px',
            background: '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: 5,
            cursor: 'pointer'
          }}
        >
          Отправить
        </button>
      </div>
      <p style={{ marginTop: 20, color: '#666', fontSize: 14 }}>
        Подключён к WebSocket. Отправьте сообщение для теста!
      </p>
    </div>
  );
}
